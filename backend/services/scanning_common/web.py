"""The HTTP plumbing both scanning services share.

`build_app` returns a FastAPI app with CORS, a request log (every call lands
in the service's own `calls` table, which is what the portal's Logs tab
reads) and a consistent error shape: `{"error": {"code", "message"}}`.
"""

from __future__ import annotations

import io
import os
import re
import statistics
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import FastAPI, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError

from . import keepwarm
from .store import Store, current_org

MAX_BYTES = 10 * 1024 * 1024
# The resolution band the recognizer reads best in, measured on the longest side.
# Smaller images are enlarged up to REF_SIDE (too few pixels per character hurts
# accuracy); larger ones are downscaled to MAX_SIDE; anything already inside the
# band is left untouched. This is the single fixed reference we normalise to.
REF_SIDE = 1600
MAX_SIDE = 1920
# The image types the Doubango engines accept (their own demo takes .png .jpg .jpeg .bmp).
ACCEPTED = {"image/jpeg", "image/png", "image/bmp"}
ACCEPTED_FORMATS = {"JPEG", "PNG", "BMP"}  # what PIL reports for those files
SOURCES = {"api", "sdk", "playground"}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


#: An organisation id as the identity provider writes it (digits, letters, - and _).
_ORG_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")


def build_app(
    title: str,
    version: str,
    store: Store,
    collapse: list[tuple[str, str]],
    quiet: set[str] | None = None,
) -> FastAPI:
    app = FastAPI(title=title, version=version)

    origins = [o.strip() for o in os.environ.get("FIN_CORS_ORIGINS", "*").split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],  # the Playground lets a developer add their own headers (X-Request-Id, ...)
    )

    # Ids and BINs are collapsed in the log so it groups by endpoint, not by record.
    rules = [(re.compile(p), r) for p, r in collapse]

    def shape(path: str) -> str:
        for rx, rep in rules:
            path = rx.sub(rep, path)
        return path

    @app.middleware("http")
    async def log_calls(request: Request, call_next: Callable):
        started = time.perf_counter()
        if request.method == "POST" and not request.url.path.endswith("/warm"):
            keepwarm.touch()
        response = await call_next(request)
        path = request.url.path
        # `quiet` paths are the portal reading its own views (lists, stats,
        # this log). They are not API usage and would drown the log.
        if request.method != "OPTIONS" and path.startswith("/v2/") and path not in (quiet or set()):
            ms = int((time.perf_counter() - started) * 1000)
            store.add_call(request.method, shape(path), response.status_code, ms)
        return response

    # Outermost (added last): the organisation the gateway signed this request in for, so the
    # scan it makes and the call logged for it are filed under that organisation.
    @app.middleware("http")
    async def org_scope(request: Request, call_next: Callable):
        raw = (request.headers.get("x-verisec-org") or "").strip()
        token = current_org.set(raw if _ORG_ID.fullmatch(raw) else None)
        try:
            return await call_next(request)
        finally:
            current_org.reset(token)

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})

    @app.get("/v2/logs")
    async def logs(limit: int = 50):
        rows = store.recent_calls(max(1, min(limit, 200)))
        return {"data": [{**r, "ts": iso(r["ts"])} for r in rows]}

    return app


def source_of(request: Request) -> str:
    s = (request.headers.get("x-verisec-source") or "api").lower()
    return s if s in SOURCES else "api"


def env_of(request: Request) -> str:
    return "live" if (request.headers.get("x-verisec-env") or "").lower() == "live" else "test"


async def read_image(upload: UploadFile) -> tuple[bytes, int, int]:
    """Validate and normalise an upload to an RGB JPEG whose longest side sits in
    the engine's best-read band [REF_SIDE, MAX_SIDE].

    Returns (jpeg bytes, width, height). The engine sees exactly these pixels,
    so box coordinates in the response are in this image's space.
    """
    data = await upload.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ApiError(413, "image_too_large", "The image is over 10 MB.")
    if upload.content_type and upload.content_type not in ACCEPTED and upload.content_type != "application/octet-stream":
        raise ApiError(415, "unsupported_image", "Use a JPG, PNG or BMP image.")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ApiError(415, "unsupported_image", "That file isn't a readable image.") from exc
    if img.format not in ACCEPTED_FORMATS:  # checked on the file itself, not just its label
        raise ApiError(415, "unsupported_image", "Use a JPG, PNG or BMP image.")
    img = ImageOps.exif_transpose(img)
    # Normalise resolution into the band the engine reads best in: enlarge a small
    # image UP to REF_SIDE (too few pixels per character is what makes a faint
    # line misread), downscale a very large image DOWN to MAX_SIDE (extra pixels
    # only cost time), and leave an image already inside the band exactly as it is.
    longest = max(img.size)
    target = REF_SIDE if longest < REF_SIDE else (MAX_SIDE if longest > MAX_SIDE else None)
    if target:
        scale = target / longest
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    if img.mode != "RGB":
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=92)
    return out.getvalue(), img.width, img.height


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def prune(obj):
    """Drop keys whose value is null so the JSON only carries real data.

    Absent means "we don't have it" (a field like is_reloadable appears only
    once the online provider fills it); false/0/"" are kept because they are
    real answers. Applied at every response boundary."""
    if isinstance(obj, dict):
        return {k: prune(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [prune(x) for x in obj]
    return obj


def pct(values: list[int], q: float) -> int:
    if not values:
        return 0
    if len(values) == 1:
        return int(values[0])
    return int(statistics.quantiles(values, n=100, method="inclusive")[int(q) - 1])


def thin(sorted_values: list[int], cap: int) -> list[int]:
    """At most `cap` values, evenly spaced, so the distribution survives."""
    n = len(sorted_values)
    if n <= cap:
        return list(sorted_values)
    return [sorted_values[int(i * (n - 1) / (cap - 1))] for i in range(cap)]


def base_stats(rows: list[dict[str, Any]], days: int, now: float | None = None) -> dict[str, Any]:
    """Totals, outcome split, latency and a per-day series over `days`,
    plus the same headline numbers for the `days` before (for deltas)."""
    now = now or time.time()
    start = now - days * 86400
    current = [r for r in rows if r["created_at"] >= start]
    previous = [r for r in rows if start - days * 86400 <= r["created_at"] < start]

    def headline(rs: list[dict[str, Any]]) -> dict[str, Any]:
        lat = sorted(r["latency_ms"] for r in rs)
        by = {s: sum(1 for r in rs if r["status"] == s) for s in ("read", "partial", "unreadable")}
        return {
            "total": len(rs),
            "by_status": by,
            "p50_ms": pct(lat, 50),
            "p95_ms": pct(lat, 95),
            "p99_ms": pct(lat, 99),
            # Raw values let a client merge services and take exact percentiles.
            "latencies_ms": thin(lat, 5000),
        }

    today = datetime.fromtimestamp(now, tz=timezone.utc).date()
    series = []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        rs = [r for r in current if datetime.fromtimestamp(r["created_at"], tz=timezone.utc).date() == day]
        lat = sorted(r["latency_ms"] for r in rs)
        series.append(
            {
                "date": day.isoformat(),
                "total": len(rs),
                "read": sum(1 for r in rs if r["status"] == "read"),
                "p50_ms": pct(lat, 50),
                "p95_ms": pct(lat, 95),
                "p99_ms": pct(lat, 99),
                "latencies_ms": thin(lat, 500),
            }
        )
    return {"days": days, "current": headline(current), "previous": headline(previous), "series": series}


def endpoint_stats(calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for c in calls:
        groups.setdefault((c["method"], c["path"]), []).append(c)
    out = []
    for (method, path), cs in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        ms = sorted(c["ms"] for c in cs)
        errors = sum(1 for c in cs if c["status"] >= 500)
        out.append(
            {
                "method": method,
                "path": path,
                "calls": len(cs),
                "p50_ms": pct(ms, 50),
                "p95_ms": pct(ms, 95),
                "error_rate": round(errors / len(cs) * 100, 2),
            }
        )
    return out
