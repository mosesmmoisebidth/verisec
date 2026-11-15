"""VeriSec Card API: read a payment card from a photo, and look up BINs.

    POST /v2/cards/read            multipart `image`
    GET  /v2/cards                 newest first, ?limit=&offset=
    GET  /v2/cards/{id}            one stored read (masked)
    GET  /v2/cards/stats           dashboard numbers, ?days=
    GET  /v2/bin/{digits}          network, type, level, issuer, country (+ the issuer's bank record)
    GET  /v2/banks/{id}/logo       a matched bank's logo
    GET  /v2/flags/{cc}.svg        a country's flag (each BIN row carries its `flag_url`)
    GET  /v2/logs                  this service's request log
    GET  /health

PCI rules this service keeps:
  * The full card number is returned ONCE, in the response to the read that
    produced it. What is stored is the first six and last four digits.
  * Card images are never written to disk. There is no image endpoint.

Its own process, port and database; the MICR API is a separate service.
"""

from __future__ import annotations

import os
import sys
import threading
import time
from collections import Counter

from pathlib import Path

from fastapi import File, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scanning_common.engine import EngineError, Recognizer  # noqa: E402
from scanning_common.store import Store, new_id  # noqa: E402
from scanning_common.web import (  # noqa: E402
    ApiError,
    base_stats,
    build_app,
    endpoint_stats,
    env_of,
    iso,
    prune,
    read_image,
    source_of,
)

from scanning_common import bank_directory, flags, keepwarm  # noqa: E402  (bank profiles + logos + flags, shared with the MICR API)

import cardlib  # noqa: E402
from bin_engine.bin_service import BinService  # noqa: E402
from bin_engine.online_bin import make_online  # noqa: E402

REPO = Path(os.environ.get("VERISEC_REPO", "/mnt/c/Users/Moses/Videos/RE_Hackathon_task"))
SDK = Path(os.environ.get("CARD_SDK_DIR", str(REPO / "ultimateCreditCard-SDK")))
TF = Path(os.environ.get("DOUBANGO_TF_DIR", str(Path.home() / "doubango_tf")))
DATA = Path(os.environ.get("CARD_DATA_DIR", str(Path.home() / "verisec_fin_data" / "card")))
# Which prebuilt index to serve: full (all sources) or ccby (ship-safe only).
BIN_INDEX = Path(os.environ.get("BIN_INDEX", str(DATA / "bins.binidx")))

def _build_engine():
    """Prefer the in-process engine (models load ONCE at startup, ~0.5 s a read);
    fall back to the subprocess recognizer (reloads TensorFlow every call, ~5 s)
    if the binding is missing."""
    if os.environ.get("CARD_INPROC", "1") == "1":
        try:
            from card_inproc import InProcCard  # noqa: E402
            eng = InProcCard(str(SDK / "assets"))
            print("[card] in-process engine ready (load-once)", flush=True)
            return eng
        except Exception as exc:  # noqa: BLE001 -- degrade to subprocess, never fail startup
            print(f"[card] in-process unavailable ({str(exc)[:160]}); using subprocess", flush=True)
    return Recognizer(
        name="card",
        bin_dir=SDK / "binaries" / "linux" / "x86_64",
        assets_dir=SDK / "assets",
        lib_dirs=[TF],
    )


engine = _build_engine()
store = Store(DATA / "card.sqlite")
# C++ index (local) + SQLite overlay (learned) + optional online fallback.
bins = BinService(str(BIN_INDEX), str(DATA / "bin_overlay.sqlite"), online=make_online())

app = build_app(
    "VeriSec Card API",
    "2.0.0",
    store,
    [(r"crd_[A-Za-z0-9]+", "{id}"), (r"(?<=/v2/bin/)\d+", "{bin}"), (r"(?<=/v2/banks/)[^/]+", "{id}"),
     (r"(?<=/v2/flags/)[^/]+", "{flag}")],
    quiet={"/v2/cards", "/v2/cards/stats", "/v2/cards/warm", "/v2/logs"},
)
# Load the bank match index and logo directory now, so the first read doesn't pay ~2s.
threading.Thread(target=bank_directory.preload, daemon=True).start()

_WARM_SAMPLE = SDK / "assets" / "images" / "Credit_Card.jpeg"


def _warm_all() -> None:
    """Touch every part a card read uses: one sample through the engine, the local
    BIN index (never the online lookup), and the bank directory."""
    if _WARM_SAMPLE.exists() and hasattr(engine, "_run_sync"):
        engine._run_sync(_WARM_SAMPLE.read_bytes())
    bins.index.lookup("471376")
    bank_directory.resolve("Bank of Kigali", "RW", exact_name=True)


keepwarm.start("card", _warm_all)


@app.post("/v2/cards/warm")
def warm_card():
    """Bring the card engine and lookups back into memory if the service has been idle."""
    return {"ok": True, "state": "waking" if keepwarm.kick("card") else "warm"}


# Where a BIN answer came from, in public words: our own tables ("local"), the
# online lookup ("online"), or both merged. The internal tier and supplier names
# never leave the service.
_SOURCE = {"master": "local", "ultimate2026": "local", "overlay": "local", "neutrino": "online", "bincodes": "online"}


def _public_source(source: str | None) -> str | None:
    if not source:
        return source
    parts: list[str] = []
    for p in str(source).split("+"):
        word = _SOURCE.get(p.strip(), "local")
        if word not in parts:
            parts.append(word)
    return "+".join(parts)


def _with_flag(bin_row: dict | None) -> dict | None:
    """The BIN row as the API shows it: plus `flag_url`, the issuing country's flag
    image (next to the emoji `flag` it already carries), and `source` in public
    words. Nothing else in the row changes."""
    if not bin_row:
        return bin_row
    row = {**bin_row, "source": _public_source(bin_row.get("source"))}
    if flags.flag_url(row.get("country")):
        row["flag_url"] = flags.flag_url(row.get("country"))
    return row


def _public_scan(body: dict) -> dict:
    """A stored card read as the API shows it today (BIN rows in public words)."""
    if isinstance(body.get("bin"), dict):
        body["bin"] = _with_flag(body["bin"])
    bank_directory.public_match(body.get("bank"))
    for c in body.get("cards") or []:
        if isinstance(c, dict) and isinstance(c.get("bin"), dict):
            c["bin"] = _with_flag(c["bin"])
        if isinstance(c, dict):
            bank_directory.public_match(c.get("bank"))
    return body


def _bank_for(bin_row: dict | None) -> dict | None:
    """The card issuer's record in our bank directory: the BIN row's issuer name and
    country matched to one bank profile (with its logo). A BIN issuer is a full legal
    name, so the match is kept only when both names name the same bank (exact_name);
    otherwise the near misses come back as alternatives. None when the BIN names no issuer."""
    if not bin_row or not bin_row.get("issuer"):
        return None
    return bank_directory.resolve(bin_row["issuer"], bin_row.get("country") or bin_row.get("issuer_country"),
                                  exact_name=True)


def _field(card: dict, name: str) -> dict | None:
    return next((f for f in card.get("fields") or [] if f.get("name") == name and f.get("value")), None)


def _val(card: dict, name: str) -> str | None:
    f = _field(card, name)
    return f["value"] if f else None


def _conf(card: dict, name: str) -> float | None:
    f = _field(card, name)
    return round(float(f["confidence"]), 1) if f else None


def _one_card(index: int, raw_card: dict) -> dict:
    """One card, built dynamically from what the engine emits.

    The ENGINE side is dynamic: every field the engine returned for this card is
    kept verbatim -- its whole `fields` list ({name, value, confidence}, whatever
    names it emits), plus description, confidence and warpedBox. We never pick a
    fixed set of field names, so a card that carries other fields loses nothing.

    What is NOT from the engine keeps its fixed, known shape: the number-derived
    checks (Luhn, scheme, expiry breakdown, fingerprint) and the enriched BIN row
    (local index + online fallback, both the same shape). Those are left as they
    are -- only the engine output is made dynamic."""
    number = "".join(ch for ch in (_val(raw_card, "number") or "") if ch.isdigit())
    expiry_str = _val(raw_card, "valid_thru")
    bin_row = _with_flag(bins.lookup(number)) if len(number) >= 6 else None
    sch = cardlib.scheme(number, bin_row is not None) if number else {
        "network_from_prefix": None,
        "checks": {"luhn": False, "length": False, "iin_known": False},
        "valid": False,
    }
    exp = cardlib.expiry(expiry_str)
    out: dict = {"index": index}
    out.update(raw_card)  # engine output verbatim: description, confidence, fields[], warpedBox
    out["box"] = [round(float(v), 1) for v in raw_card.get("warpedBox") or []]
    # Convenience + PCI handles, derived from the engine's own number field.
    out["number"] = number or None
    out["first6"] = number[:6] or None
    out["last4"] = number[-4:] or None
    out["length"] = len(number)
    # Enrichment that does NOT come from the engine -- fixed shape, unchanged.
    out["fingerprint"] = cardlib.fingerprint(number)
    out["luhn_valid"] = sch["checks"]["luhn"]
    out["scheme_valid"] = sch["valid"]
    out["scheme_checks"] = sch["checks"]
    out["network_from_prefix"] = sch["network_from_prefix"]
    out["expired"] = exp["expired"]
    out["expires_in_days"] = exp["days_left"]
    out["expiry_status"] = exp["status"]
    # BIN row from BinService (local index, learned overlay, or online fallback),
    # all tiers already normalised to the same shape. Left exactly as-is.
    out["bin"] = bin_row
    # The issuer's bank record from our bank directory (+ logo), matched from the BIN row.
    out["bank"] = _bank_for(bin_row)
    return out


def _shape(scan_id: str, created: float, source: str, env: str, ms: int, w: int, h: int, raw: dict) -> dict:
    body = {
        "id": scan_id,
        "object": "card",
        "created_at": iso(created),
        "source": source,
        "env": env,
        "processing_ms": ms,
        # Dimensions only, so a client can place the box on its own copy.
        "image": {"width": w, "height": h},
    }
    raw_cards = raw.get("cards") or []
    if not raw_cards:
        return {
            **body,
            "status": "unreadable",
            "issue_code": "no_card",
            "issue": "No card found. Lay the card flat, fill most of the frame and keep the number in view.",
            "cards_detected": 0,
            "cards": [],
            "card": None,
            "bin": None,
            "bank": None,
        }

    # All cards in the image, strongest first. The engine can find several.
    ordered = sorted(raw_cards, key=lambda c: c.get("confidence", 0), reverse=True)
    cards = [_one_card(i, rc) for i, rc in enumerate(ordered)]
    primary = cards[0]

    # Status is judged on the primary card.
    status, code, issue = "read", None, None
    if not primary["number"]:
        status, code = "partial", "number_unreadable"
        issue = "The card was found but its number couldn't be read. Reduce glare and try again."
    elif not primary["luhn_valid"]:
        status, code = "partial", "luhn_failed"
        issue = "The number failed its checksum, so a digit was probably misread. Try again with less glare."

    return {
        **body,
        "status": status,
        "issue_code": code,
        "issue": issue,
        "cards_detected": len(cards),
        "cards": cards,
        # Primary card promoted to the top level, so a caller that expects a
        # single card keeps working unchanged.
        "card": {k: v for k, v in primary.items() if k not in ("bin", "bank")},
        "bin": primary["bin"],
        "bank": primary["bank"],
    }


def masked(body: dict) -> dict:
    """The stored form: the full PAN removed everywhere it can appear -- the flat
    `number` and the engine `fields` entry named "number" -- while first6/last4
    and the fingerprint are kept (both safe to store)."""
    def strip(card: dict | None) -> dict | None:
        if not card:
            return card
        c = {**card, "number": None}
        if c.get("fields"):
            c["fields"] = [{**f, "value": None} if f.get("name") == "number" else f for f in c["fields"]]
        return c

    out = {**body}
    if body.get("cards"):
        out["cards"] = [strip(c) for c in body["cards"]]
    if body.get("card"):
        out["card"] = strip(body["card"])
    return out


@app.get("/health")
async def health():
    missing = engine.missing()
    return {
        "status": "ok" if not missing else "degraded",
        "engine": "ready" if not missing else "unavailable",
        "bins": bins.count,
        "bins_learned": bins.overlay_count,
        "online_fallback": bins.online is not None,
    }


@app.post("/v2/cards/read")
async def read_card(request: Request, image: UploadFile = File(...)):
    jpeg, w, h = await read_image(image)
    try:
        raw, ms = await engine.run(jpeg)
    except EngineError as exc:
        print(f"[card] engine error: {exc}", flush=True)
        raise ApiError(503, "engine_unavailable", "Card reading is unavailable right now. Try again shortly.")

    created = time.time()
    scan_id = new_id("crd")
    body = _shape(scan_id, created, source_of(request), env_of(request), ms, w, h, raw)
    store.add_scan(scan_id, created, body["status"], body["source"], body["env"], ms, masked(body), None)
    return prune(body)


# ---------------------------------------------------------------------------
# Focused APIs: each answers one question about a card, in its own small shape.
# Photo ones run the same engine and checks as the full read; typed ones run the
# same checks on the number you send. None of them stores anything, and the full
# number is only ever returned by /v2/cards/number, to the caller who sent the photo.
# ---------------------------------------------------------------------------
async def _primary_card(request: Request, image: UploadFile) -> tuple[dict, dict | None, int]:
    """The full read's body and its strongest card, for a photo. 503 if the engine fails."""
    jpeg, w, h = await read_image(image)
    try:
        raw, ms = await engine.run(jpeg)
    except EngineError as exc:
        print(f"[card] engine error: {exc}", flush=True)
        raise ApiError(503, "engine_unavailable", "Card reading is unavailable right now. Try again shortly.")
    body = _shape(new_id("crd"), time.time(), source_of(request), env_of(request), ms, w, h, raw)
    return body, (body.get("cards") or [None])[0], ms


@app.post("/v2/cards/number")
async def card_number(request: Request, image: UploadFile = File(...)):
    """The card number from a photo, with its network and checks."""
    body, card, ms = await _primary_card(request, image)
    out = {"object": "card_number", "status": body["status"], "issue_code": body.get("issue_code"),
           "issue": body.get("issue"), "processing_ms": ms}
    if card and card.get("number"):
        out.update({
            "number": card["number"],
            "first6": card.get("first6"),
            "last4": card.get("last4"),
            "length": card.get("length"),
            "network": (card.get("bin") or {}).get("network") or card.get("network_from_prefix"),
            "luhn_valid": card.get("luhn_valid"),
            "scheme_valid": card.get("scheme_valid"),
            "confidence": _conf(card, "number"),
        })
    return prune(out)


@app.post("/v2/cards/expiry")
async def card_expiry(request: Request, image: UploadFile = File(...)):
    """The expiry date from a photo: valid thru (and from, if printed), expired or not, days left."""
    body, card, ms = await _primary_card(request, image)
    thru = _val(card, "valid_thru") if card else None
    if thru:
        status, code, issue = "read", None, None
    elif card:
        status, code, issue = "partial", "expiry_unreadable", "The card was found but its expiry date couldn't be read."
    else:
        status, code, issue = body["status"], body.get("issue_code"), body.get("issue")
    return prune({
        "object": "card_expiry",
        "status": status,
        "issue_code": code,
        "issue": issue,
        "valid_thru": thru,
        "valid_from": _val(card, "valid_from") if card else None,
        "expired": card.get("expired") if thru else None,
        "expires_in_days": card.get("expires_in_days") if thru else None,
        "expiry_status": card.get("expiry_status") if thru else None,
        "confidence": _conf(card, "valid_thru") if thru else None,
        "processing_ms": ms,
    })


class CardNumberIn(BaseModel):
    number: str
    expiry: str | None = None


def _digits(number: str) -> str:
    d = "".join(ch for ch in number or "" if ch.isdigit())
    if not 12 <= len(d) <= 19:
        raise ApiError(400, "bad_number", "Send the card number: 12 to 19 digits.")
    return d


@app.post("/v2/cards/check")
async def card_check(body: CardNumberIn):
    """Checks a typed card number (and expiry): Luhn, length for its network, the
    network, expiry, and who issued it. Returns first six and last four only."""
    number = _digits(body.number)
    exp = cardlib.expiry(body.expiry) if body.expiry else None
    if exp and exp["status"] == "unknown":
        raise ApiError(400, "bad_expiry", "Send the expiry as MM/YY.")
    row = _with_flag(bins.lookup(number))
    sch = cardlib.scheme(number, row is not None)
    brief = {k: row.get(k) for k in ("bin", "network", "type", "level", "funding", "issuer", "country", "country_name",
                                     "flag", "flag_url", "currency", "is_prepaid", "is_commercial")} if row else None
    return prune({
        "object": "card_check",
        "first6": number[:6],
        "last4": number[-4:],
        "length": len(number),
        "network": (row or {}).get("network") or sch["network_from_prefix"],
        "luhn_valid": sch["checks"]["luhn"],
        "length_valid": sch["checks"]["length"],
        "scheme_valid": sch["valid"],
        "expired": exp["expired"] if exp else None,
        "expires_in_days": exp["days_left"] if exp else None,
        "expiry_status": exp["status"] if exp else None,
        "bin": brief,
    })


@app.post("/v2/cards/fingerprint")
async def card_fingerprint(body: CardNumberIn):
    """A stable, privacy-safe id for a card number: the same card always gives the
    same fingerprint, so cards can be matched without storing the number."""
    number = _digits(body.number)
    return {"object": "card_fingerprint", "fingerprint": cardlib.fingerprint(number),
            "first6": number[:6], "last4": number[-4:]}


@app.get("/v2/cards")
async def list_cards(limit: int = 50, offset: int = 0):
    rows, total = store.list_scans(max(1, min(limit, 200)), max(0, offset))
    return prune({"data": [_public_scan(r) for r in rows], "total": total})


@app.get("/v2/cards/stats")
async def card_stats(days: int = 30):
    days = max(1, min(days, 90))
    rows = store.scans_since(time.time() - 2 * days * 86400)
    stats = base_stats(rows, days)
    current = [r for r in rows if r["created_at"] >= time.time() - days * 86400]
    # Count across every card found, not just the primary (multi-card images).
    all_cards = [c for r in current for c in (r.get("cards") or ([r["card"]] if r.get("card") else []))]
    networks = Counter(c["bin"]["network"] for c in all_cards if c.get("bin") and c["bin"].get("network"))
    issuers = Counter(c["bin"]["issuer"] for c in all_cards if c.get("bin") and c["bin"].get("issuer"))
    funding = Counter(c["bin"]["funding"] for c in all_cards if c.get("bin") and c["bin"].get("funding"))
    issues = Counter(r["issue_code"] for r in current if r.get("issue_code"))
    return prune({
        **stats,
        "cards_detected": len(all_cards),
        "networks": [{"name": k, "count": v} for k, v in networks.most_common(6)],
        "issuers": [{"name": k, "count": v} for k, v in issuers.most_common(6)],
        "funding": [{"name": k, "count": v} for k, v in funding.most_common()],
        "commercial": sum(1 for c in all_cards if c.get("bin") and c["bin"].get("is_commercial")),
        "prepaid": sum(1 for c in all_cards if c.get("bin") and c["bin"].get("is_prepaid")),
        "expired": sum(1 for c in all_cards if c.get("expired")),
        "scheme_invalid": sum(1 for c in all_cards if c.get("first6") and not c.get("scheme_valid")),
        "issues": [{"code": k, "count": v} for k, v in issues.most_common(6)],
        "endpoints": endpoint_stats(store.call_counts_since(time.time() - days * 86400)),
    })


@app.get("/v2/cards/{scan_id}")
async def get_card(scan_id: str):
    found = store.get_scan(scan_id)
    if found is None:
        raise ApiError(404, "not_found", "No card read with that id.")
    return prune(_public_scan(found[0]))


@app.get("/v2/bin/{digits}")
async def bin_lookup(digits: str):
    d = "".join(ch for ch in digits if ch.isdigit())
    if len(d) < 6:
        raise ApiError(400, "bin_too_short", "Send at least the first 6 digits.")
    row = bins.lookup(d)
    if row is None:
        raise ApiError(404, "bin_not_found", "That BIN isn't in the table.")
    return prune({**_with_flag(row), "bank": _bank_for(row)})


@app.get("/v2/flags/{name}")
async def flag_file(name: str):
    """A country's flag, by ISO 3166-1 alpha-2 code: /v2/flags/rw.svg."""
    p = flags.flag_path(name)
    if p is None:
        raise ApiError(404, "no_flag", "No flag for that country code.")
    return FileResponse(str(p), media_type="image/svg+xml")


@app.get("/v2/banks/{profile_id}/logo")
async def bank_logo_file(profile_id: str):
    """A matched bank's logo image (from the logo directory)."""
    p = bank_directory.logo_file(profile_id)
    if p is None:
        raise ApiError(404, "no_logo", "No logo for that bank.")
    return FileResponse(str(p))
