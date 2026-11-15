"""VeriSec MICR API: read the MICR line on a bank cheque.

    POST /v2/cheques/micr          multipart `image` (+ optional `format`)
    GET  /v2/cheques               newest first, ?limit=&offset=
    GET  /v2/cheques/{id}          one stored read
    GET  /v2/cheques/{id}/image    the image the engine read
    GET  /v2/cheques/stats         dashboard numbers, ?days=
    GET  /v2/logs                  this service's request log
    GET  /health

Its own process, port, database and image folder; the Card API is a
separate service. Run with `run.sh` (Linux, needs the engine + Doubango TF).
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import re
import sqlite3
import sys
import threading
import time
from collections import Counter
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from concurrent.futures import TimeoutError as FutureTimeout
from pathlib import Path
from urllib.parse import urlsplit

import requests
from fastapi import BackgroundTasks, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scanning_common.engine import EngineError, Recognizer  # noqa: E402
from scanning_common.store import Store, new_id  # noqa: E402
from scanning_common.web import (  # noqa: E402
    ACCEPTED,
    MAX_BYTES,
    MAX_SIDE,
    REF_SIDE,
    ApiError,
    base_stats,
    build_app,
    endpoint_stats,
    env_of,
    iso,
    prune,
    source_of,
)

from scanning_common import bank_directory, flags, keepwarm  # noqa: E402  (bank profiles + logos + flags, shared with the Card API)
try:
    import chequeprep  # noqa: E402  (C++ cheque normaliser, see cpp/chequeprep.cpp)
    # OFF by default: both MICR and the vision model read the upload exactly as
    # received. The normaliser stays here for later; CHEQUE_NORMALISE=1 turns it on.
    _NORMALISE = os.environ.get("CHEQUE_NORMALISE", "0") == "1" and chequeprep.available()
except Exception:  # noqa: BLE001 -- without it the model reads the original upload
    chequeprep = None
    _NORMALISE = False
from micr_parse import FONT_FIELDS, aba_check, doubango_fields, field_list, printed, segments, standard_layout  # noqa: E402

REPO = Path(os.environ.get("VERISEC_REPO", "/mnt/c/Users/Moses/Videos/RE_Hackathon_task"))
SDK = Path(os.environ.get("MICR_SDK_DIR", str(REPO / "ultimateMICR-SDK")))
TF = Path(os.environ.get("DOUBANGO_TF_DIR", str(Path.home() / "doubango_tf")))
DATA = Path(os.environ.get("MICR_DATA_DIR", str(Path.home() / "verisec_fin_data" / "micr")))

FORMATS = {"auto": "e13b+cmc7", "e13b": "e13b", "cmc7": "cmc7"}

def _build_engine():
    """Prefer the in-process engine (models load ONCE at startup); fall back to the
    subprocess recognizer (reloads TensorFlow every call) if the binding is missing."""
    if os.environ.get("MICR_INPROC", "1") == "1":
        try:
            from micr_inproc import InProcMicr  # noqa: E402
            eng = InProcMicr(str(SDK / "assets"))
            print("[micr] in-process engine ready (load-once)", flush=True)
            return eng
        except Exception as exc:  # noqa: BLE001 -- degrade to subprocess, never fail startup
            print(f"[micr] in-process unavailable ({str(exc)[:160]}); using subprocess", flush=True)
    return Recognizer(
        name="micr",
        bin_dir=SDK / "binaries" / "linux" / "x86_64",
        assets_dir=SDK / "assets",
        lib_dirs=[TF],
        extra_args=["--backprop", "true", "--ielcd", "true"],
    )


engine = _build_engine()
store = Store(DATA / "micr.sqlite")
IMAGES = DATA / "images"
IMAGES.mkdir(parents=True, exist_ok=True)

# Deep read: the cheque vision reader (PP-OCR + Qwen) and the bank directory used
# to resolve the bank the LLM reads. All optional; /v2/cheques/read degrades
# gracefully when a piece is missing.
READER_URL = os.environ.get("CHEQUE_READER_URL", "")
READER_KEY = os.environ.get("CHEQUE_READER_KEY", "")
# World currencies (ISO 4217 + CLDR), used to enrich what the reader returns. Optional.
CURRENCIES_JSON = os.environ.get("CURRENCIES_JSON", "")
# Our OWNED reasoning model, called DIRECTLY from here so there is no extra reader
# hop. Two hosts are supported: a Beam endpoint (scale-to-zero, snapshot restore,
# takes {"image_b64": ...}) or any OpenAI-compatible server such as RunPod. If
# CHEQUE_MODEL_URL is unset we fall back to the Contabo reader (CHEQUE_READER_URL).
# MICR stays separate and its JSON is never sent to this model.
MODEL_URL = os.environ.get("CHEQUE_MODEL_URL", "")
MODEL_KEY = os.environ.get("CHEQUE_MODEL_KEY", "")
MODEL_NAME = os.environ.get("CHEQUE_MODEL_NAME", "QuantTrio/Qwen3-VL-30B-A3B-Instruct-AWQ")
MODEL_KIND = os.environ.get("CHEQUE_MODEL_KIND", "beam" if ".beam.cloud" in MODEL_URL else "openai")
# On an OpenRouter-style API: the providers to use, in order, with no silent
# routing elsewhere (e.g. "alibaba,novita"). Empty = the API's own routing.
MODEL_PROVIDERS = [p.strip() for p in os.environ.get("CHEQUE_MODEL_PROVIDERS", "").split(",") if p.strip()]
# Optional second model, tried only if the first fails (e.g. our own Beam model
# behind a hosted API). Same request shapes as above.
FALLBACK_URL = os.environ.get("CHEQUE_FALLBACK_URL", "")
FALLBACK_KEY = os.environ.get("CHEQUE_FALLBACK_KEY", "")
FALLBACK_KIND = os.environ.get("CHEQUE_FALLBACK_KIND", "beam" if ".beam.cloud" in FALLBACK_URL else "openai")
FALLBACK_NAME = os.environ.get("CHEQUE_FALLBACK_NAME", MODEL_NAME)

app = build_app(
    "VeriSec MICR API",
    "2.0.0",
    store,
    [(r"chq_[A-Za-z0-9]+", "{id}"), (r"(?<=/v2/flags/)[^/]+", "{flag}"), (r"(?<=/v2/banks/)[^/]+(?=/logo)", "{id}")],
    quiet={"/v2/cheques", "/v2/cheques/stats", "/v2/cheques/warm", "/v2/logs"},
)

# Below this a character, or the whole line, is too uncertain to trust.
WEAK = 60.0


def _chars(zone: dict) -> list[float]:
    """Per-character confidences. The engine prefixes two zone-level values."""
    text, conf = zone["text"], zone.get("confidences") or []
    per = conf[len(conf) - len(text) :] if len(conf) >= len(text) else conf
    return [round(float(c), 1) for c in per]


def _one_zone(index: int, zone: dict) -> dict:
    """One MICR line, built dynamically from exactly what the engine emits.

    Core: every key the engine returned for this zone, kept verbatim (text, the
    confidence arrays, description, klass, skew, warpedBox). On top we add only
    what is derivable from the engine's own text: the glyph render, the
    per-character confidences, a confidence summary, a rounded box, and
    `segments` (the groups the engine's own control symbols delimit). Then two
    namings, each only when the line fits (never a guess):
      fields    -- the vendor demo's naming, same names and format ([] when none fits)
      standard  -- an official national layout the demo does not cover."""
    text = zone.get("text", "")
    font = "CMC-7" if "CMC" in (zone.get("description") or "").upper() else "E-13B"
    chars = _chars(zone)
    out: dict = {"index": index}
    out.update(zone)  # whatever the engine returned, kept verbatim
    out["font"] = font
    out["printed"] = printed(font, text)
    out["confidence"] = round(float((zone.get("confidences") or [0])[0]), 1)
    out["char_confidences"] = chars
    out["min_char_confidence"] = round(min(chars), 1) if chars else None
    out["box"] = [round(float(v), 1) for v in zone.get("warpedBox") or []]
    out["segments"] = segments(text)
    _name_zone(out)
    return out


def _name_zone(z: dict) -> dict:
    """(Re)name one line from its text with the current algorithm: demo-style
    `fields` + `template`, a national `standard`, and the ABA proof of a "Routing"
    (so one that is not a real US routing number shows as such). Any earlier
    naming on the zone is replaced."""
    text = z.get("text") or ""
    font = z.get("font") or ("CMC-7" if "CMC" in (z.get("description") or "").upper() else "E-13B")
    for key in ("fields", "field_list", "template", "standard", "routing"):
        z.pop(key, None)
    template, fields = doubango_fields(font, text)
    z["fields"] = fields
    # Every field the font's templates can give, "" where this line gave nothing.
    z["field_list"] = field_list(FONT_FIELDS.get(font, []), fields)
    if template:
        z["template"] = template
    standard = standard_layout(font, text)
    if standard:
        z["standard"] = standard
    routing = next((v for d in fields for k, v in d.items() if k == "Routing"), None)
    if routing:
        z["routing"] = aba_check(routing)
    return z


def _country(code: str | None, source: str) -> dict | None:
    """{code, name, flag, source} for an ISO 3166-1 alpha-2 code, or None if unknown.
    The flag is the emoji built from the code's regional-indicator letters."""
    code = (code or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", code):
        return None
    try:
        import pycountry  # noqa: PLC0415 -- optional; without it no country is shown
        c = pycountry.countries.get(alpha_2=code)
    except Exception:  # noqa: BLE001
        c = None
    if c is None:
        return None
    name = getattr(c, "common_name", None) or c.name
    return {"code": code, "name": name, "flag": "".join(chr(0x1F1E6 + ord(ch) - 65) for ch in code), "source": source}


def _micr_country(micr_body: dict) -> dict | None:
    """The country a national MICR layout proves (India, Canada), if any line has one."""
    code = next((z["standard"]["country"] for z in micr_body.get("zones") or [] if z.get("standard")), None)
    return _country(code, "micr_line")


_INTERNAL_TIMING = {"qwen_ms": "model_ms", "reader_wall_ms": None, "ppocr_ms": None}


def _public(scan: dict) -> dict:
    """A stored read as the API shows it today: every line re-named by the current
    algorithm, and nothing internal (records saved before carried the engine's raw
    output, component timings and the old reader's boxes under internal names)."""
    _current_naming(scan)
    for body in [scan, scan.get("micr"), *[c.get("micr") for c in scan.get("cheques") or [] if isinstance(c, dict)]]:
        if isinstance(body, dict):
            body.pop("raw", None)
    scan.pop("ppocr", None)
    bank_directory.public_match(scan.get("bank"))
    for c in scan.get("cheques") or []:
        if isinstance(c, dict):
            bank_directory.public_match(c.get("bank"))
    timing = scan.get("timing")
    if isinstance(timing, dict):
        for old, new in _INTERNAL_TIMING.items():
            if old in timing:
                v = timing.pop(old)
                if new and new not in timing:
                    timing[new] = v
    return scan


def _current_naming(scan: dict) -> dict:
    """A stored scan with every line re-named by the current algorithm, so history
    made with an older naming looks exactly like a new read (works for `cheque`
    and `cheque_read` records)."""
    bodies = [scan.get("micr") if scan.get("object") == "cheque_read" else scan]
    bodies += [c.get("micr") for c in scan.get("cheques") or [] if isinstance(c, dict)]
    for body in bodies:
        if isinstance(body, dict):
            for z in body.get("zones") or []:
                _name_zone(z)
            if isinstance(body.get("micr"), dict):
                _name_zone(body["micr"])
    return scan


def _line_status(zone: dict) -> tuple[str, str | None, str | None]:
    """(status, issue_code, issue) of one MICR line. Status is driven only by the
    engine's own confidence -- universal, no per-country logic. Any standard-specific
    signal (e.g. a US routing number failing its check digit) lives inside that
    zone's `routing` proof, not as a global status."""
    mcc = zone.get("min_char_confidence")
    if mcc is not None and mcc < WEAK:
        return "partial", "weak_characters", "Some characters were hard to read. Retake the photo in even light."
    return "read", None, None


def _shape(scan_id: str, created: float, source: str, env: str, ms: int, w: int, h: int, raw: dict) -> dict:
    body = {
        "id": scan_id,
        "object": "cheque",
        "created_at": iso(created),
        "source": source,
        "env": env,
        "processing_ms": ms,
        "image": {"width": w, "height": h, "url": f"/v2/cheques/{scan_id}/image"},
    }
    raw_zones = [z for z in raw.get("zones") or [] if z.get("text")]
    if not raw_zones:
        return {
            **body,
            "status": "unreadable",
            "issue_code": "no_micr_line",
            "issue": "No MICR line found. Include the bottom edge of the cheque and keep it in focus.",
            "zones_detected": 0,
            "zones": [],
            "micr": None,
            "quality": {"rotation": round(float(raw.get("rotation", 0.0)), 2), "skew": None, "min_char_confidence": None},
        }

    # All MICR lines, strongest first (longest line, then confidence). Some
    # cheques carry two lines.
    ordered = sorted(raw_zones, key=lambda z: (len(z["text"]), z.get("confidences", [0])[0]), reverse=True)
    zones = [_one_zone(i, z) for i, z in enumerate(ordered)]
    primary = zones[0]

    status, code, issue = _line_status(primary)
    mcc = primary.get("min_char_confidence")

    return {
        **body,
        "status": status,
        "issue_code": code,
        "issue": issue,
        "zones_detected": len(zones),
        "zones": zones,
        # The strongest line, promoted for single-line callers. It is the full
        # dynamic zone object: engine output verbatim plus the readable
        # interpretation.
        "micr": primary,
        # Only when a national MICR layout proves it (the line alone says nothing else).
        "country": _micr_country({"zones": zones}),
        "quality": {
            "rotation": round(float(raw.get("rotation", 0.0)), 2),
            "skew": primary.get("skew"),
            "min_char_confidence": mcc,
        },
    }


@app.get("/health")
async def health():
    missing = engine.missing()
    return {"status": "ok" if not missing else "degraded", "engine": "ready" if not missing else "unavailable"}


# ---------------------------------------------------------------------------
# Deep read: MICR engine + the Qwen vision reader + bank resolved from our DB.
# The MICR result is authoritative for the code line and is also passed to the
# reader so Qwen focuses on the fields MICR did not get and never alters them.
# ---------------------------------------------------------------------------
_CUR = None


def _currency_resolve(code, symbol, country=None):
    """Full currency record (ISO 4217 + CLDR) from the code the reader gave, or
    its symbol. Lets us show name/symbol/minor units/USD rate, not just a code."""
    global _CUR
    if _CUR is None:
        cur = {"code": {}, "sym": {}}
        if CURRENCIES_JSON and os.path.exists(CURRENCIES_JSON):
            try:
                for c in json.load(open(CURRENCIES_JSON, encoding="utf-8")).get("currencies", []):
                    cur["code"][(c.get("code") or "").upper()] = c
                    for s in (c.get("symbol"), c.get("local_symbol"), c.get("narrow_symbol")):
                        if s:
                            cur["sym"].setdefault(s, c)
            except Exception:
                pass
        _CUR = cur  # publish only when complete (it is also built from a startup thread)
    c = _CUR["code"].get((code or "").upper()) or (_CUR["sym"].get(symbol) if symbol else None)
    if not c:
        return None
    return {k: c.get(k) for k in ("code", "numeric_code", "name", "symbol", "local_symbol",
            "minor_units", "english_name_cldr", "usd_per_unit", "units_per_usd", "wikidata_id")}


def _preload_lookups() -> None:
    """Load the bank match index, currencies, logo directory and country list at
    startup. Left lazy, the first deep read after a restart paid ~5s for them."""
    t = time.perf_counter()
    try:
        bank_directory.preload()
        _currency_resolve("USD", None)
        _country("US", "bank_directory")  # the country list loads on first use (~1s)
        print(f"[micr] lookups preloaded in {time.perf_counter() - t:.1f}s", flush=True)
    except Exception as exc:  # noqa: BLE001 -- the first read just loads them instead
        print(f"[micr] lookup preload failed ({str(exc)[:160]})", flush=True)
    if _NORMALISE:  # its first call initialises OpenCV (~1s): pay that here, not on a read
        t = time.perf_counter()
        try:
            sample = SDK / "assets" / "images" / "e13b_1280x720.jpg"
            if sample.exists():
                chequeprep.normalize(sample.read_bytes(), keep_on_reject=True)
            print(f"[micr] image normaliser ready in {time.perf_counter() - t:.1f}s", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[micr] image normaliser warm-up failed ({str(exc)[:160]})", flush=True)


threading.Thread(target=_preload_lookups, daemon=True).start()


# Reuse one TLS connection to the reader (keep-alive) instead of a fresh handshake
# on every read — the handshake to the remote box was ~0.2-0.4s of dead time.
_SESSION = requests.Session()


# The model's instructions: read the FACE only, never touch the MICR line, report
# only what is visible, follow the same steps every time (consistency), read words
# and figures independently, abstain instead of guessing. Measured on 5 cheques x3
# reads vs the earlier prompt: 95% vs 90% of fields correct, same run-to-run spread.
_SYS_PROMPT = (
    "You read bank cheques from ANY country. You are given the FACE image of a cheque. Read ONLY the "
    "fields on the face. NEVER read, output, copy or alter the MICR code line (the band of stylised "
    "digits and symbols along the BOTTOM edge) - another system owns it.\n"
    "BE CONSISTENT: report only what is actually visible on THIS cheque, and follow the same steps in the "
    "same order every time, so the same image always gives the same answer. Copy text exactly as written "
    "(same spelling, letters and digits); do not correct, complete, translate or guess anything.\n"
    "1. The photo may show SEVERAL cheques (one, two, ten...). cheques_in_image = how many cheques you can "
    "see, whole or partly. Number them from the top down; cheques side by side in the same row count left to "
    "right. Read ONLY the cheque the request names. Every field, including the bank name, branch, address, "
    "bank_country and currency, must come from that same cheque (its own logo, printed details, currency "
    "code or symbol): another cheque's logo, printed details, currency or handwriting never belong to it. "
    "If that cheque does not exist, use null for every other field.\n"
    '2. payee = the name written after "Pay" (or "Pay to the order of"). drawer = the account holder\'s '
    "name PRINTED on the cheque, usually near the signature or the bottom-left. Never put an amount, a bank "
    "name or the payee in drawer.\n"
    "3. amount_figures = the amount box copied character by character. amount_words = the written amount "
    "copied word by word. Convert EACH of them to a number on its own, without looking at the other. "
    "amount_numeric = the number from the figures. amount_agree = true only if the two numbers are exactly "
    "equal, otherwise false.\n"
    "4. date_raw = the date exactly as written. date_iso = that same date as YYYY-MM-DD.\n"
    "5. bank_name, branch and bank_address = the bank's PRINTED details on the cheque.\n"
    "If a field is absent, or you cannot read it with certainty, use null. NEVER invent a value.\n"
    "Output ONLY a single-line MINIFIED JSON (no spaces, no newlines) with EXACTLY these keys: "
    "cheques_in_image, bank_name, "
    "bank_country (ISO 3166-1 alpha-2), branch, bank_address, payee, drawer, amount_words, amount_figures, "
    "amount_numeric, amount_agree, currency (ISO 4217), date_raw, date_iso (YYYY-MM-DD), cheque_number, "
    "account_number, crossing, signature_present."
)


def _vision_from_rich(r: dict) -> dict:
    """Map the model's rich flat JSON onto the vision shape the API/UI expect."""
    def s(x):
        return x if (x not in ("", None)) else None
    g = r.get
    fields = []
    for key, typ in (("payee", "payee"), ("drawer", "drawer"), ("amount_words", "legal_amount"),
                     ("amount_figures", "courtesy_amount"), ("date_raw", "date"), ("bank_name", "bank_name"),
                     ("branch", "branch"), ("bank_address", "bank_address"), ("currency", "currency"),
                     ("cheque_number", "cheque_number"), ("account_number", "account_number"),
                     ("crossing", "crossing")):
        v = s(g(key))
        if v is not None:
            fields.append({"type": typ, "value": v})
    cross = s(g("crossing"))
    sig = bool(g("signature_present"))
    return {
        "fields": fields,
        "amount": {"figures": s(g("amount_figures")), "words": s(g("amount_words")),
                   "numeric": g("amount_numeric"), "agreement": g("amount_agree")},
        "currency": {"code": s(g("currency")), "symbol": None},
        "date": {"raw": s(g("date_raw")), "iso": s(g("date_iso"))},
        "payee": s(g("payee")),
        "drawer": ({"name": s(g("drawer"))} if s(g("drawer")) else None),
        "bank": {"name": s(g("bank_name")), "country": s(g("bank_country")),
                 "branch": s(g("branch")), "address": s(g("bank_address"))},
        "cheque_number_printed": s(g("cheque_number")),
        "account_number_printed": s(g("account_number")),
        "crossing": {"present": bool(cross), "text": cross},
        "signature": {"present": sig, "count": 1 if sig else 0},
    }


_MODEL_FIELDS = ["cheques_in_image", "bank_name", "bank_country", "branch", "bank_address", "payee", "drawer", "amount_words",
                 "amount_figures", "amount_numeric", "amount_agree", "currency", "date_raw", "date_iso",
                 "cheque_number", "account_number", "crossing", "signature_present"]
# The answer's fixed shape, enforced by the provider while the model writes (structured
# outputs): the same keys in the same order with the same types every time.
_MODEL_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": _MODEL_FIELDS,
    "properties": {f: ({"type": ["integer", "null"]} if f == "cheques_in_image"
                       else {"type": ["number", "null"]} if f == "amount_numeric"
                       else {"type": ["boolean", "null"]} if f in ("amount_agree", "signature_present")
                       else {"type": ["string", "null"]}) for f in _MODEL_FIELDS},
}
# A hosted call that hasn't answered after this many seconds gets an identical twin;
# whichever answers first is used (measured: ~1 call in 30 can hang for a minute+).
_HEDGE_AFTER_S = float(os.environ.get("CHEQUE_HEDGE_AFTER_S", "4"))
_POOL = ThreadPoolExecutor(max_workers=32, thread_name_prefix="model")  # up to MAX_CHEQUES reads + twins
# The most cheques read from one photo (each gets its own model call, all at once).
MAX_CHEQUES = int(os.environ.get("CHEQUE_MAX_PER_IMAGE", "10"))


def _cheque_prompt(k: int, total: int | None) -> str:
    """The request naming which cheque of the photo to read (the system prompt says how)."""
    if total and total > 1:
        return (f"This photo shows {total} cheques. Read cheque {k} of {total}, counting from the top "
                "(left to right when side by side). Minified JSON only.")
    return "Read cheque 1 (the top one; the left one when cheques sit side by side). Minified JSON only."


def _post_json(url: str, headers: dict, body: dict, timeout: float) -> dict:
    r = _SESSION.post(url, headers=headers, json=body, timeout=timeout)
    r.raise_for_status()
    return r.json()


def _hedged_post(url: str, headers: dict, body: dict, timeout: float) -> dict:
    """POST; if no answer after _HEDGE_AFTER_S, send the identical request again and
    take whichever answers first. Same model, same settings, so it only trims the
    slow tail; it doesn't change what the model reads."""
    first = _POOL.submit(_post_json, url, headers, body, timeout)
    try:
        return first.result(timeout=_HEDGE_AFTER_S)
    except FutureTimeout:
        pass
    pending = {first, _POOL.submit(_post_json, url, headers, body, timeout)}
    deadline = time.monotonic() + timeout
    error: BaseException | None = None
    while pending:
        done, pending = wait(pending, timeout=max(0.0, deadline - time.monotonic()), return_when=FIRST_COMPLETED)
        if not done:
            break
        for f in done:
            if f.exception() is None:
                return f.result()
            error = f.exception()
    raise error or TimeoutError("the model did not answer in time")


def _model_call(url: str, key: str, kind: str, name: str, providers: list, b64: str, timeout: float,
                mime: str = "image/jpeg", prompt: str = "") -> dict:
    """One request to one model host; returns the parsed rich JSON or raises."""
    headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
    if kind == "beam":
        body = {"image_b64": b64, "system": _SYS_PROMPT, "prompt": prompt, "max_tokens": 320}
        out = _post_json(url, headers, body, timeout)
        txt = out.get("content") or ""
    else:
        # Measured on Alibaba (5 cheques x 6 reads): greedy (temperature 0 + top_k 1) with a
        # fixed JSON schema kept 80/85 fields identical across repeat reads (69/85 with
        # temperature 0 alone), with every key field (payee, drawer, amounts, date)
        # identical, at the same speed. require_parameters: a provider that would drop
        # any of these settings is never used.
        body = {"model": name, "max_tokens": 400, "temperature": 0, "top_k": 1, "seed": 7,
                "messages": [{"role": "system", "content": _SYS_PROMPT},
                             {"role": "user", "content": [
                                 {"type": "text", "text": prompt},
                                 {"type": "image_url", "image_url": {"url": f"data:{mime};base64," + b64}}]}]}
        if providers:  # an OpenRouter-style API: pin providers, enforce the settings, fix the shape
            body["provider"] = {"order": providers, "allow_fallbacks": False, "require_parameters": True}
            body["response_format"] = {"type": "json_schema",
                                       "json_schema": {"name": "cheque", "strict": True, "schema": _MODEL_SCHEMA}}
        out = _hedged_post(url, headers, body, timeout)
        u = out.get("usage") or {}
        print(f"[model] {out.get('provider')} id={out.get('id')} tokens in={u.get('prompt_tokens')} out={u.get('completion_tokens')}", flush=True)
        txt = out["choices"][0]["message"]["content"] or ""
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        raise ValueError("no JSON in the model's answer")
    return json.loads(m.group(0))


def _model_read(image: bytes, mime: str = "image/jpeg", prompt: str | None = None) -> dict:
    """Read the cheque face with the configured model, falling back to the second
    model if the first fails. A hosted API answers fast; a sleeping Beam model
    can take 12-20s to wake, so it gets the long timeout. `image` is sent as-is."""
    if not MODEL_URL:
        return {"error": "model_not_configured"}
    t = time.perf_counter()
    prompt = prompt or _cheque_prompt(1, None)
    b64 = base64.b64encode(image).decode()
    targets = [(MODEL_URL, MODEL_KEY, MODEL_KIND, MODEL_NAME, MODEL_PROVIDERS, 200 if MODEL_KIND == "beam" else 30)]
    if FALLBACK_URL:
        targets.append((FALLBACK_URL, FALLBACK_KEY, FALLBACK_KIND, FALLBACK_NAME, [], 200 if FALLBACK_KIND == "beam" else 30))
    errors = []
    for i, (url, key, kind, name, providers, timeout) in enumerate(targets):
        try:
            rich = _model_call(url, key, kind, name, providers, b64, timeout, mime, prompt)
        except Exception as exc:  # noqa: BLE001 -- try the next model, never 500 the whole read
            errors.append(f"{kind}: {str(exc)[:160]}")
            continue
        if kind == "beam":
            _WARM["touched"] = time.time()
        if i:
            print(f"[reader] primary model failed ({errors[0]}); answered by the fallback", flush=True)
        ms = int((time.perf_counter() - t) * 1000)
        return {"vision": _vision_from_rich(rich), "rich": rich, "timing": {"model_ms": ms}}
    return {"error": "model_unavailable", "detail": " | ".join(errors)[:400],
            "timing": {"model_ms": int((time.perf_counter() - t) * 1000)}}


# Wake-up pings. The Beam model scales to zero when idle ($0) and a cold restore
# takes several seconds, so the UI pings as soon as a user could be about to read
# (deep read switched on, page opened, file picked). The restore then overlaps the
# user picking a file, and the read itself lands on a loaded model. One ping in
# flight at a time; skipped while the model was touched recently (it stays up
# ~90s after its last request, and the playground re-pings every 60s while a user
# is active, so this window must stay under 60s).
_WARM = {"inflight": False, "touched": 0.0}
_WARM_LOCK = threading.Lock()
_WARM_FRESH_S = 45


def _warm_worker() -> None:
    try:
        if MODEL_KIND == "beam":
            r = _SESSION.post(MODEL_URL, headers={"Authorization": "Bearer " + MODEL_KEY,
                              "Content-Type": "application/json"}, json={"warm": True}, timeout=180)
        else:
            # A hosted model is always loaded; just open the TLS connection now so
            # the read doesn't pay the handshake. The session keeps it alive.
            p = urlsplit(MODEL_URL)
            r = _SESSION.head(f"{p.scheme}://{p.netloc}/", timeout=10)
        if r.status_code < 500:
            _WARM["touched"] = time.time()
    except Exception:  # noqa: BLE001 -- a failed wake-up only means the next read starts colder
        pass
    finally:
        _WARM["inflight"] = False


@app.post("/v2/cheques/warm")
def warm_model():
    """Wake the deep-read model (or open the connection to it) without blocking.
    Also brings the MICR engine, the box detector and the lookups back into memory
    if the service has been idle, so the read that follows runs at full speed."""
    keepwarm.kick("micr")
    if not MODEL_URL:
        return {"ok": True, "state": "n/a"}
    with _WARM_LOCK:
        if _WARM["inflight"]:
            return {"ok": True, "state": "waking"}
        if time.time() - _WARM["touched"] < _WARM_FRESH_S:
            return {"ok": True, "state": "warm"}
        _WARM["inflight"] = True
    threading.Thread(target=_warm_worker, daemon=True).start()
    return {"ok": True, "state": "waking"}


_WARM_SAMPLE = SDK / "assets" / "images" / "e13b_1280x720.jpg"


def _warm_all() -> None:
    """Touch every part a deep read uses: one sample through the MICR engine, the
    bank and currency lookups, the box detector, and the model's connection."""
    data = _WARM_SAMPLE.read_bytes() if _WARM_SAMPLE.exists() else None
    if data and hasattr(engine, "_run_sync"):
        engine._run_sync(data)
    bank_directory.resolve("Bank of Kigali", "RW")
    _currency_resolve("USD", None)
    if data and DETECT_URL:
        _text_boxes(data, "image/jpeg")
    if MODEL_URL and MODEL_KIND != "beam":
        p = urlsplit(MODEL_URL)
        _SESSION.head(f"{p.scheme}://{p.netloc}/", timeout=10)


def _reader_call(jpeg: bytes, micr_known: dict) -> dict:
    if not READER_URL:
        return {"error": "reader_not_configured"}
    t = time.perf_counter()
    try:
        r = _SESSION.post(READER_URL, headers={"X-Reader-Key": READER_KEY},
                          files={"image": ("cheque.jpg", jpeg, "image/jpeg")},
                          data={"micr": json.dumps(micr_known, ensure_ascii=False)}, timeout=200)
        r.raise_for_status()
        bundle = r.json()
    except Exception as exc:  # noqa: BLE001 -- degrade gracefully, never 500 the whole read
        return {"error": "reader_unavailable", "detail": str(exc)[:200],
                "timing": {"model_ms": int((time.perf_counter() - t) * 1000)}}
    # Only the whole wall time leaves this function: the reader's own step timings
    # are internal and named after its components.
    bundle["timing"] = {"model_ms": int((time.perf_counter() - t) * 1000)}
    bundle.pop("ppocr", None)
    return bundle


# The image types the Doubango engine accepts (its own demo takes .png .jpg .jpeg .bmp).
_FORMATS_IN = {"JPEG": ("image/jpeg", ".jpg"), "PNG": ("image/png", ".png"), "BMP": ("image/bmp", ".bmp")}


async def read_original(upload: UploadFile) -> tuple[bytes, int, int, str, str]:
    """The upload EXACTLY as received: (bytes, width, height, mime, extension).
    Checked (size, type, readable) but never changed: the MICR engine and the
    vision model both read these bytes, and they are what gets stored. No resize,
    no re-encode (an enlarged, re-saved copy made MICR drop a whole field on the
    Bank of Kigali cheque). Width/height are in the photo's own EXIF orientation,
    the frame the MICR engine's box coordinates are in."""
    data = await upload.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ApiError(413, "image_too_large", "The image is over 10 MB.")
    if upload.content_type and upload.content_type not in ACCEPTED and upload.content_type != "application/octet-stream":
        raise ApiError(415, "unsupported_image", "Use a JPG, PNG or BMP image.")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as exc:  # noqa: BLE001
        raise ApiError(415, "unsupported_image", "That file isn't a readable image.") from exc
    mime, ext = _FORMATS_IN.get(img.format or "", (None, None))
    if not mime:
        raise ApiError(415, "unsupported_image", "Use a JPG, PNG or BMP image.")
    w, h = img.size
    if img.getexif().get(0x0112, 1) in (5, 6, 7, 8):  # stored sideways; read upright
        w, h = h, w
    return data, w, h, mime, ext


def _resized_copy(original: bytes) -> tuple[bytes, float] | None:
    """The size-band resizer: the upload with its longest side brought into
    [REF_SIDE, MAX_SIDE] (LANCZOS), saved losslessly as PNG. None when the image is
    already inside the band, so a retry would read the same pixels."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(original)))
    longest = max(img.size)
    target = REF_SIDE if longest < REF_SIDE else (MAX_SIDE if longest > MAX_SIDE else None)
    if target is None:
        return None
    scale = target / longest
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS).convert("RGB")
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue(), scale


def _named(body: dict) -> bool:
    """True when any line got named fields (demo-style or a national standard)."""
    return any(z.get("fields") or z.get("standard") for z in body.get("zones") or [])


async def _micr_read(original: bytes, fmt: str, scan_id: str, created: float, source: str, env: str,
                     w: int, h: int, on_lines=None) -> tuple[dict, int]:
    """MICR pipeline: read the ORIGINAL upload first. Only when no line gets named
    fields, read a resized copy; keep that read only if it names fields, otherwise
    return the original read. Boxes of a resized read are mapped back to the
    original image; `raw` stays the engine's own output for the image it read.
    `on_lines(zones)` is told the lines found as soon as each kept read has them."""
    raw, ms = await engine.run(original, ["--format", fmt])
    body = _shape(scan_id, created, source, env, ms, w, h, raw)
    if on_lines:
        on_lines(body.get("zones") or [])
    if _named(body):
        return body, ms
    copy = await asyncio.to_thread(_resized_copy, original)
    if copy is None:
        return body, ms
    data, scale = copy
    raw2, ms2 = await engine.run(data, ["--format", fmt])
    total = ms + ms2
    retry = _shape(scan_id, created, source, env, total, w, h, raw2)
    if not _named(retry):
        body["processing_ms"] = total
        return body, total
    for z in retry.get("zones") or []:
        z["box"] = [round(v / scale, 1) for v in z.get("box") or []]
    retry["read_on"] = {"image": "resized", "scale": round(scale, 4),
                        "width": round(w * scale), "height": round(h * scale)}
    if on_lines:
        on_lines(retry.get("zones") or [])
    return retry, total


# Text boxes for "Show bounding boxes": PP-OCRv6 text DETECTION on the reader box
# (boxes only, no reading; every word shown comes from the vision model). It runs
# at the same time as the model, so the boxes arrive in the same response.
DETECT_URL = os.environ.get("CHEQUE_DETECT_URL") or (READER_URL.rsplit("/", 1)[0] + "/detect" if READER_URL else "")


_DETECT_MAX_SIDE = 1600


def _detect_copy(original: bytes, mime: str) -> tuple[bytes, str]:
    """What the box detector gets: the upload itself when it is already a small JPEG,
    otherwise an upright JPEG copy at most _DETECT_MAX_SIDE px. Boxes need no more,
    and a big BMP/PNG/photo would otherwise spend seconds uploading. Only the boxes
    use this copy; MICR and the vision model always read the original bytes."""
    img = Image.open(io.BytesIO(original))
    upright = img.getexif().get(0x0112, 1) in (None, 1)
    if img.format == "JPEG" and upright and max(img.size) <= _DETECT_MAX_SIDE:
        return original, mime
    img = ImageOps.exif_transpose(img).convert("RGB")
    if max(img.size) > _DETECT_MAX_SIDE:
        s = _DETECT_MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=90)
    return out.getvalue(), "image/jpeg"


def _text_boxes(original: bytes, mime: str) -> dict | None:
    """Every text box on the upright image ({width, height, boxes:[{box, score}]}, in
    the pixel space of `width` x `height`), or None when detection is unavailable
    (the read never fails over it)."""
    if not DETECT_URL:
        return None
    try:
        data, data_mime = _detect_copy(original, mime)
        r = _SESSION.post(DETECT_URL, headers={"X-Reader-Key": READER_KEY},
                          files={"image": ("cheque", data, data_mime)}, timeout=20)
        r.raise_for_status()
        d = r.json()
        return {"width": d["width"], "height": d["height"], "boxes": d["boxes"], "ms": d.get("ms")}
    except Exception as exc:  # noqa: BLE001 -- boxes are optional
        print(f"[micr] text boxes unavailable: {str(exc)[:160]}", flush=True)
        return None


_MODEL_MAX_SIDE = 2048


def _model_image(raw: bytes) -> bytes | None:
    """The image the vision model reads: the ORIGINAL upload, made upright, shrunk
    only if it is very large, and NEVER enlarged. read_image() scales every image
    into the MICR engine's band (small ones up to 1600px); enlarging smears the
    handwriting and multiplies the model's image tokens, which cost both accuracy
    and time. MICR still gets its own normalised image, unchanged."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception:  # noqa: BLE001 -- fall back to the normalised image
        return None
    rotated = img.getexif().get(0x0112, 1) not in (None, 1)  # EXIF Orientation tag
    big = max(img.size) > _MODEL_MAX_SIDE
    if img.format == "JPEG" and not rotated and not big and img.mode in ("RGB", "L"):
        return raw  # already a plain upright JPEG: send the original bytes untouched
    upright = ImageOps.exif_transpose(img)
    if big:
        s = _MODEL_MAX_SIDE / max(upright.size)
        upright = upright.resize((round(upright.width * s), round(upright.height * s)), Image.LANCZOS)
    if upright.mode != "RGB":
        upright = upright.convert("RGB")
    out = io.BytesIO()
    upright.save(out, format="JPEG", quality=95)
    return out.getvalue()


_QUALITY = {0: "ok", 1: "document_not_found", 2: "too_far", 3: "blurry", 4: "glare", 5: "unreadable"}


def _model_input(raw: bytes) -> tuple[bytes | None, dict | None]:
    """The image the vision model reads, plus a photo-quality note. The C++ normaliser
    (cpp/chequeprep.cpp) turns the photo into a flat, fixed-size, evenly lit cheque so
    the model sees the same framing whatever the angle, zoom or lighting. A failed
    quality check never blocks the read: the normalised image is still read and the
    result carries a warning. When no document edge can be found (or the library is
    missing) the original upload is read instead. MICR keeps its own image."""
    if not _NORMALISE:
        return _model_image(raw), None
    try:
        status, img, meta = chequeprep.normalize(raw, keep_on_reject=True)
    except Exception as exc:  # noqa: BLE001 -- fall back to the original upload
        print(f"[micr] image normaliser failed ({str(exc)[:120]}); reading the original", flush=True)
        status, img, meta = chequeprep.DECODE_ERROR, None, {}
    quality = {"status": _QUALITY.get(status, "unreadable"), "normalised": img is not None,
               "ms": round(float((meta.get("ms") or {}).get("total", 0)), 1)}
    return (img or _model_image(raw)), quality


def _reading_order(zones: list[dict]) -> list[dict]:
    """MICR lines in the order cheques are numbered: top to bottom, and left to right
    for lines side by side in one row (vertical gap under a quarter of the longer
    line; stacked cheques sit at least a cheque height, about half a line, apart)."""
    def geo(z):
        b = z.get("box") or []
        xs, ys = b[0::2], b[1::2]
        return (sum(xs) / len(xs), sum(ys) / len(ys), max(xs) - min(xs)) if xs else (0.0, 0.0, 0.0)

    rows: list[list[dict]] = []
    for z in sorted(zones, key=lambda z: geo(z)[1]):
        if rows:
            _, py, pl = geo(rows[-1][0])
            _, cy, ln = geo(z)
            if abs(cy - py) < 0.25 * max(ln, pl):
                rows[-1].append(z)
                continue
        rows.append([z])
    return [z for row in rows for z in sorted(row, key=lambda z: geo(z)[0])]


def _pair_lines(visions: list[dict], zones: list[dict]) -> list[dict | None]:
    """The MICR line printed on each cheque (None when there is none). A cheque's own
    numbers printed on its face (cheque and account number) also appear in its code
    line, so the line sharing the longest runs of 4+ digits with them is that
    cheque's (a stray line read from other printed digits shares fewer). Cheques
    with no such match take the remaining lines in reading order."""
    from difflib import SequenceMatcher  # noqa: PLC0415

    def digits(v) -> str:
        return re.sub(r"\D", "", str(v or ""))

    def common(a: str, b: str) -> int:
        m = SequenceMatcher(None, a, b, autojunk=False).find_longest_match(0, len(a), 0, len(b))
        return m.size if m.size >= 4 else 0

    lines = _reading_order(zones)
    scores = []
    for i, v in enumerate(visions):
        nums = [n for n in (digits(v.get("cheque_number_printed")), digits(v.get("account_number_printed"))) if len(n) >= 4]
        for j, z in enumerate(lines):
            score = sum(common(n, digits(z.get("text"))) for n in nums)
            if score:
                scores.append((score, -j, i, j))
    pair: dict[int, int] = {}
    for _, _, i, j in sorted(scores, reverse=True):
        if i not in pair and j not in pair.values():
            pair[i] = j
    free = [j for j in range(len(lines)) if j not in pair.values()]
    for i in range(len(visions)):
        if i not in pair and free:
            pair[i] = free.pop(0)
    return [lines[pair[i]] if i in pair else None for i in range(len(visions))]


def _micr_for(body: dict, zone: dict | None) -> dict:
    """One cheque's part of the MICR read: its own line (the engine's zone object,
    verbatim), with the same status rule as the whole read. The full engine output
    stays at the top of the response."""
    rotation = (body.get("quality") or {}).get("rotation", 0.0)
    if not zone:
        return {"status": "unreadable", "issue_code": "no_micr_line",
                "issue": "No MICR line found on this cheque.", "zones_detected": 0, "zones": [], "micr": None,
                "country": None, "quality": {"rotation": rotation, "skew": None, "min_char_confidence": None}}
    status, code, issue = _line_status(zone)
    return {"status": status, "issue_code": code, "issue": issue, "zones_detected": 1, "zones": [zone],
            "micr": zone, "country": _micr_country({"zones": [zone]}),
            "quality": {"rotation": rotation, "skew": zone.get("skew"),
                        "min_char_confidence": zone.get("min_char_confidence")}}


def _has_reading(bundle) -> bool:
    """True when the model found the cheque it was asked for (it read any field)."""
    return isinstance(bundle, dict) and bool(((bundle.get("vision") or {}).get("fields")))


async def _timed(name: str, wall: dict, aw):
    """Await `aw`, recording its wall time in ms under `name` (for the timing log)."""
    t = time.perf_counter()
    try:
        return await aw
    finally:
        wall[name] = int((time.perf_counter() - t) * 1000)


def _dedup(vision_bundle: dict, micr_body: dict) -> dict:
    """MICR owns the code-line identity; drop the reader's duplicates of it."""
    have: set[str] = set()
    for z in micr_body.get("zones") or []:
        have |= {k for d in z.get("fields") or [] for k in d}
        have |= {f["name"] for f in (z.get("standard") or {}).get("fields") or []}
    v = (vision_bundle or {}).get("vision") if isinstance(vision_bundle, dict) else None
    if isinstance(v, dict):
        if have & {"Check number", "Auxiliary On-Us", "Serial Number", "Cheque Number"}:
            v.pop("cheque_number_printed", None)
        if have & {"Account", "Short Account Number"}:
            v.pop("account_number_printed", None)
    return vision_bundle


@app.post("/v2/cheques/read")
async def read_cheque_full(request: Request, background: BackgroundTasks, image: UploadFile = File(...), format: str = Form("auto")):
    """Whole cheque read: MICR (code line) + Qwen vision (everything else) + the
    bank resolved from our directory, merged into one object."""
    t_start = time.time()
    fmt = FORMATS.get(format.lower())
    if fmt is None:
        raise ApiError(400, "bad_format", "format must be auto, e13b or cmc7.")
    # Both engines read the upload exactly as received. MICR retries on a resized
    # copy only when the original names no fields (see _micr_read).
    original, w, h, mime, ext = await read_original(image)
    wall = {"upload": int((time.time() - t_start) * 1000)}
    created = time.time()
    scan_id = new_id("chq")
    quality = None
    model_image, model_mime = original, mime
    if MODEL_URL and _NORMALISE:  # off by default; kept for later
        model_image, quality = await asyncio.to_thread(_model_input, original)
        model_mime = "image/jpeg"
    # MICR (code line) and the vision reader are independent; run them together and
    # let _dedup reconcile the code-line fields afterwards, so the total is
    # max(MICR, reader) + resolve, not the sum. Without an owned model configured,
    # the Contabo reader (PP-OCR + Qwen) takes the vision leg.
    # One photo can hold several cheques. Cheque 1 is read at once; the moment MICR
    # finds more lines, every other cheque is read too, all at the same time, each
    # call on the same original photo told which cheque to read.
    reads: dict[int, asyncio.Task] = {}

    def read_cheque_no(k: int, total: int | None) -> None:
        if k not in reads and k <= MAX_CHEQUES:
            reads[k] = asyncio.create_task(asyncio.to_thread(_model_read, model_image, model_mime, _cheque_prompt(k, total)))

    def on_lines(zones: list) -> None:
        if MODEL_URL and len(zones) > 1:
            for k in range(2, len(zones) + 1):
                read_cheque_no(k, len(zones))

    if MODEL_URL:
        read_cheque_no(1, None)
        model_task = reads[1]
    else:
        model_task = asyncio.create_task(asyncio.to_thread(_reader_call, original, {}))
    boxes_task = asyncio.create_task(asyncio.to_thread(_text_boxes, original, mime))
    micr_res, bundle, text_boxes = await asyncio.gather(
        _timed("micr", wall, _micr_read(original, fmt, scan_id, created, source_of(request), env_of(request), w, h,
                                        on_lines)),
        _timed("model", wall, model_task),
        _timed("boxes", wall, boxes_task),
        return_exceptions=True,
    )
    # Cheques the model counted beyond the MICR lines found get read now.
    seen = ((bundle or {}).get("rich") or {}).get("cheques_in_image") if isinstance(bundle, dict) else None
    if MODEL_URL and isinstance(seen, int) and seen > 1:
        for k in range(2, seen + 1):
            read_cheque_no(k, seen)
    more = {k: t for k, t in reads.items() if k > 1}
    extra = dict(zip(more, await _timed("others", wall, asyncio.gather(*more.values(), return_exceptions=True)))) if more else {}
    t_after = time.perf_counter()
    if isinstance(micr_res, EngineError):
        print(f"[micr] engine error: {micr_res}", flush=True)
        raise ApiError(503, "engine_unavailable", "Cheque reading is unavailable right now. Try again shortly.")
    if isinstance(micr_res, BaseException):
        raise micr_res
    if isinstance(bundle, BaseException):
        bundle = {"error": "reader_unavailable", "detail": str(bundle)[:200]}
    if isinstance(text_boxes, BaseException):
        text_boxes = None
    boxes_ms = (text_boxes or {}).pop("ms", None)
    micr_body, ms = micr_res

    async def resolve(bundle: dict, micr_part: dict) -> dict:
        """One cheque's reading merged with its MICR part: bank, currency, country."""
        bundle = _dedup(bundle, micr_part)
        vision = (bundle or {}).get("vision")
        bk = (vision or {}).get("bank") or {}
        cur = (vision or {}).get("currency") or {}
        bank, currency = await asyncio.gather(
            asyncio.to_thread(bank_directory.resolve, bk.get("name"), bk.get("country"), bk.get("branch"), bk.get("address")),
            asyncio.to_thread(_currency_resolve, cur.get("code"), cur.get("symbol"), bk.get("country")))
        # The cheque's country, from the most specific evidence available: the bank matched
        # in our directory, then the bank country read on the face, then a national MICR layout.
        country = (_country(((bank or {}).get("resolved") or {}).get("country_code"), "bank_directory")
                   or _country(bk.get("country"), "cheque_face")
                   or _micr_country(micr_part))
        return {"vision": vision, "bank": bank, "country": country, "currency": currency,
                "reader_error": (bundle or {}).get("error")}

    # Every cheque the model found (cheque 1 always; the others only when read), each
    # paired with the MICR line in the same place in the reading order.
    found = [1] + sorted(k for k, b in extra.items() if _has_reading(b))
    if isinstance(seen, int) and seen >= 1:  # the model's own count: a stray MICR line is not a cheque
        found = [k for k in found if k <= seen]
    cheques = []
    if len(found) > 1:
        readings = [bundle if k == 1 else extra[k] for k in found]
        lines = _pair_lines([((b or {}).get("vision") or {}) for b in readings], micr_body.get("zones") or [])
        parts = [_micr_for(micr_body, z) for z in lines]
        merged = await asyncio.gather(*(resolve(b, part) for b, part in zip(readings, parts)))
        cheques = [{"index": i + 1, "micr": part, **m} for i, (part, m) in enumerate(zip(parts, merged))]
        first = cheques[0]
    else:
        first = await resolve(bundle, micr_body)
    vision, bank, country, currency = first["vision"], first["bank"], first["country"], first["currency"]

    body = {
        "id": scan_id, "object": "cheque_read", "created_at": iso(created),
        "source": source_of(request), "env": env_of(request), "processing_ms": ms,
        "image": {"width": w, "height": h, "url": f"/v2/cheques/{scan_id}/image"},
        "status": micr_body["status"],
        "micr": micr_body,
        "vision": vision,
        # Every text box found on the image, for drawing only (no text).
        "text_boxes": text_boxes,
        "bank": bank,
        "country": country,
        "currency": currency,
        "reader_error": first["reader_error"],
        # Only when the photo holds more than one cheque: each cheque on its own (its
        # MICR line, what the model read, bank, country, currency). The fields above
        # are cheque 1 (the top one); `micr` above is the whole MICR read.
        **({"cheques": cheques} if cheques else {}),
        # Photo quality from the normaliser: never blocks the read, only warns.
        "image_quality": quality,
        # Where the time went: MICR engine, the vision read, text boxes, total.
        "timing": {"micr_ms": ms, **((bundle or {}).get("timing") or {}), "boxes_ms": boxes_ms,
                   "total_ms": int((time.time() - t_start) * 1000)},
    }
    wall["after"] = int((time.perf_counter() - t_after) * 1000)
    wall["total"] = body["timing"]["total_ms"]
    print(f"[micr] deep read {scan_id} ({len(original) // 1024} KB {mime}) wall ms: {wall}", flush=True)
    # Persist after the response is sent — the client gets its read without waiting
    # on the image write and the DB insert.
    def _persist():
        path = IMAGES / f"{scan_id}{ext}"  # the original upload, byte for byte
        path.write_bytes(original)
        store.add_scan(scan_id, created, body["status"], body["source"], body["env"], ms, body, str(path))
    background.add_task(_persist)
    return prune(body)


@app.get("/v2/banks/{profile_id}/logo")
async def bank_logo_file(profile_id: str):
    """Serve the resolved bank's logo image (from the logo directory)."""
    p = bank_directory.logo_file(profile_id)
    if p is None:
        raise ApiError(404, "no_logo", "No logo for that bank.")
    return FileResponse(str(p))


@app.post("/v2/cheques/micr")
async def read_cheque(request: Request, image: UploadFile = File(...), format: str = Form("auto")):
    fmt = FORMATS.get(format.lower())
    if fmt is None:
        raise ApiError(400, "bad_format", "format must be auto, e13b or cmc7.")
    original, w, h, _mime, ext = await read_original(image)  # read exactly as received
    created = time.time()
    scan_id = new_id("chq")
    try:
        body, ms = await _micr_read(original, fmt, scan_id, created, source_of(request), env_of(request), w, h)
    except EngineError as exc:
        print(f"[micr] engine error: {exc}", flush=True)
        raise ApiError(503, "engine_unavailable", "Cheque reading is unavailable right now. Try again shortly.")

    path = IMAGES / f"{scan_id}{ext}"  # the original upload, byte for byte
    path.write_bytes(original)
    store.add_scan(scan_id, created, body["status"], body["source"], body["env"], ms, body, str(path))
    return prune(body)


# ---------------------------------------------------------------------------
# Focused APIs: each answers one question about a cheque, in its own small shape.
# They read the upload exactly as the full reads do (same engines, same field
# naming, same model and prompt), return only their part, and store nothing.
# ---------------------------------------------------------------------------
def _with_flag(country: dict | None) -> dict | None:
    """A country as the focused APIs return it: code, name, emoji flag and flag image."""
    if not country:
        return None
    return {k: v for k, v in {**country, "flag_url": flags.flag_url(country.get("code"))}.items() if k != "source"}


@app.post("/v2/cheques/micr-line")
async def micr_line(request: Request, image: UploadFile = File(...), format: str = Form("auto")):
    """The cheque's MICR line and the fields it carries, named by the same algorithm
    as the full reads (vendor-style naming, a national layout when one proves it,
    the US routing proof when there is a routing number)."""
    fmt = FORMATS.get(format.lower())
    if fmt is None:
        raise ApiError(400, "bad_format", "format must be auto, e13b or cmc7.")
    original, w, h, _mime, _ext = await read_original(image)
    try:
        body, ms = await _micr_read(original, fmt, new_id("chq"), time.time(), source_of(request), env_of(request), w, h)
    except EngineError as exc:
        print(f"[micr] engine error: {exc}", flush=True)
        raise ApiError(503, "engine_unavailable", "Cheque reading is unavailable right now. Try again shortly.")
    line = body.get("micr") or {}
    out = {
        "object": "micr_line",
        "status": body["status"],
        "issue_code": body.get("issue_code"),
        "issue": body.get("issue"),
        "lines_found": body.get("zones_detected", 0),
        "processing_ms": ms,
    }
    if line:
        out["line"] = {k: line.get(k) for k in ("text", "printed", "font", "confidence", "min_char_confidence", "box")}
        out["fields"] = line.get("field_list") or [{"name": k, "value": v} for d in line.get("fields") or [] for k, v in d.items()]
        out["template"] = line.get("template")
        out["standard"] = line.get("standard")
        out["routing"] = line.get("routing")
        out["country"] = _with_flag(body.get("country"))
    return prune(out)


async def _face_read(image: UploadFile) -> tuple[dict, int]:
    """What is written on the cheque (cheque 1 of the photo), read by the vision model
    from the upload as received. 503 when it can't be read right now."""
    if not MODEL_URL:
        raise ApiError(503, "read_unavailable", "Reading the cheque face is unavailable right now.")
    original, _w, _h, mime, _ext = await read_original(image)
    t = time.perf_counter()
    bundle = await asyncio.to_thread(_model_read, original, mime)
    vision = (bundle or {}).get("vision")
    if not vision:
        raise ApiError(503, "read_unavailable", "The cheque couldn't be read right now. Try again shortly.")
    return vision, int((time.perf_counter() - t) * 1000)


@app.post("/v2/cheques/amount")
async def cheque_amount(image: UploadFile = File(...)):
    """The amount in figures and in words, the number, whether they agree, and the currency."""
    vision, ms = await _face_read(image)
    amount = vision.get("amount") or {}
    cur = vision.get("currency") or {}
    bank = vision.get("bank") or {}
    currency = await asyncio.to_thread(_currency_resolve, cur.get("code"), cur.get("symbol"), bank.get("country"))
    return prune({
        "object": "cheque_amount",
        "figures": amount.get("figures"),
        "words": amount.get("words"),
        "numeric": amount.get("numeric"),
        "agreement": amount.get("agreement"),
        "currency": {k: (currency or {}).get(k) for k in ("code", "name", "symbol")} if currency else None,
        "processing_ms": ms,
    })


@app.post("/v2/cheques/date")
async def cheque_date(image: UploadFile = File(...)):
    """The date as written and as YYYY-MM-DD, with its age in days (negative when post-dated)."""
    from datetime import date  # noqa: PLC0415

    vision, ms = await _face_read(image)
    d = vision.get("date") or {}
    age = None
    try:
        age = (date.today() - date.fromisoformat(d["iso"])).days if d.get("iso") else None
    except ValueError:
        age = None
    return prune({
        "object": "cheque_date",
        "raw": d.get("raw"),
        "iso": d.get("iso"),
        "age_days": age,
        "post_dated": (age < 0) if age is not None else None,
        "processing_ms": ms,
    })


@app.post("/v2/cheques/parties")
async def cheque_parties(image: UploadFile = File(...)):
    """Who the cheque is paid to (payee) and whose account pays it (drawer)."""
    vision, ms = await _face_read(image)
    return prune({
        "object": "cheque_parties",
        "payee": vision.get("payee"),
        "drawer": (vision.get("drawer") or {}).get("name"),
        "processing_ms": ms,
    })


@app.post("/v2/cheques/bank")
async def cheque_bank(image: UploadFile = File(...)):
    """The bank printed on the cheque, matched in our bank directory (logo, BIC, city, country)."""
    vision, ms = await _face_read(image)
    bk = vision.get("bank") or {}
    match = await asyncio.to_thread(bank_directory.resolve, bk.get("name"), bk.get("country"), bk.get("branch"), bk.get("address"))
    resolved = match.get("resolved")
    country = (_country((resolved or {}).get("country_code"), "bank_directory") if resolved else None) or _country(bk.get("country"), "cheque_face")
    return prune({
        "object": "cheque_bank",
        "read": {"name": bk.get("name"), "branch": bk.get("branch"), "address": bk.get("address"), "country": bk.get("country")},
        "bank": resolved,
        "match_confidence": match.get("match_confidence") if resolved else None,
        "country": _with_flag(country),
        "processing_ms": ms,
    })


@app.get("/v2/banks")
async def bank_lookup(name: str = "", country: str = "", bic: str = ""):
    """A bank in our directory, by BIC, or by name (and optionally country): the best
    match with its logo and flag, how surely the names agree, and close alternatives."""
    name, country, bic = name.strip(), country.strip().upper(), bic.strip()
    if not (name or bic):
        raise ApiError(400, "missing_query", "Send a bank name (and country), or a BIC.")
    query = {"name": name or None, "country": country or None, "bic": bic or None}
    if bic:
        bank = await asyncio.to_thread(bank_directory.by_bic, bic)
        return prune({"object": "bank_lookup", "query": query, "bank": bank, "verified": bank is not None})
    res = await asyncio.to_thread(bank_directory.resolve, name, country or None)
    bank = res.get("resolved")
    sim = await asyncio.to_thread(bank_directory.name_similarity, name, bank["name"], country or None) if bank else None
    return prune({
        "object": "bank_lookup",
        "query": query,
        "bank": bank,
        "name_match": sim,
        "verified": (sim >= bank_directory.SAME_NAME) if sim is not None else False,
        "alternatives": res.get("alternatives", []),
    })


@app.get("/v2/flags/{name}")
async def flag_file(name: str):
    """A country's flag, by ISO 3166-1 alpha-2 code: /v2/flags/ug.svg."""
    p = flags.flag_path(name)
    if p is None:
        raise ApiError(404, "no_flag", "No flag for that country code.")
    return FileResponse(str(p), media_type="image/svg+xml")


@app.get("/v2/cheques")
async def list_cheques(limit: int = 50, offset: int = 0):
    rows, total = store.list_scans(max(1, min(limit, 200)), max(0, offset))
    return prune({"data": [_public(r) for r in rows], "total": total})


@app.get("/v2/cheques/stats")
async def cheque_stats(days: int = 30):
    days = max(1, min(days, 90))
    since = time.time() - 2 * days * 86400
    rows = [_current_naming(r) for r in store.scans_since(since)]
    stats = base_stats(rows, days)
    current = [r for r in rows if r["created_at"] >= time.time() - days * 86400]

    def primary(r: dict) -> dict | None:
        """The primary MICR line of a record (a deep read nests the MICR body)."""
        m = r.get("micr")
        if isinstance(m, dict) and r.get("object") == "cheque_read":
            m = m.get("micr")
        return m if isinstance(m, dict) else None

    def layout(m: dict) -> str | None:
        return m.get("template") or (m.get("standard") or {}).get("id")

    read = [(r, primary(r)) for r in current if primary(r)]
    fonts = Counter(m.get("font") for _, m in read if m.get("font"))
    standards = Counter(layout(m) for _, m in read if layout(m))
    us = [m for _, m in read if m.get("template") in ("us_business", "us_personal")]
    issues = Counter(r["issue_code"] for r in current if r.get("issue_code"))
    zones_total = sum(r.get("zones_detected", 1 if r.get("micr") else 0) for r in current)
    return prune({
        **stats,
        "fonts": dict(fonts),
        "standards": dict(standards),
        "zones_detected": zones_total,
        # passed = the US ABA proof (checksum AND prefix) on the primary line.
        "routing": {"checked": len(us), "passed": sum(1 for m in us if (m.get("routing") or {}).get("valid"))},
        "issues": [{"code": k, "count": v} for k, v in issues.most_common(6)],
        "endpoints": endpoint_stats(store.call_counts_since(time.time() - days * 86400)),
    })


@app.get("/v2/cheques/{scan_id}")
async def get_cheque(scan_id: str):
    found = store.get_scan(scan_id)
    if found is None:
        raise ApiError(404, "not_found", "No cheque read with that id.")
    return prune(_public(found[0]))


@app.get("/v2/cheques/{scan_id}/image")
async def get_cheque_image(scan_id: str):
    found = store.get_scan(scan_id)
    if found is None or not found[1] or not Path(found[1]).exists():
        raise ApiError(404, "not_found", "No image for that id.")
    media = {".png": "image/png", ".webp": "image/webp", ".bmp": "image/bmp"}.get(Path(found[1]).suffix.lower(), "image/jpeg")
    return FileResponse(found[1], media_type=media)


# Keep the engine, detector and lookups resident while idle (see scanning_common/keepwarm).
keepwarm.start("micr", _warm_all)
