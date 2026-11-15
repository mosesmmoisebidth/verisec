"""Credit-based online BIN fallback clients.

Selected by env, OFF by default (no key -> returns None -> local-only). When a
key is set, `make_online()` returns a fetcher that BinService calls on a miss;
its result is normalized to our row shape and cached in the overlay forever.

    VERISEC_BIN_API      neutrino | bincodes        (unset = disabled)
    NEUTRINO_USER_ID     Neutrino API user id
    NEUTRINO_API_KEY     Neutrino API key
    BINCODES_API_KEY     bincodes.com API key

Why these two: both sell CREDITS that do not expire (no monthly lock-in).
Neutrino additionally grants the right to store/cache results indefinitely, so
it is the recommended default for a self-updating local DB.
"""

from __future__ import annotations

import os
import time
from typing import Any
from urllib import parse, request

TIMEOUT = 8.0


def _get(url: str, data: dict | None = None, headers: dict | None = None) -> dict | None:
    body = parse.urlencode(data).encode() if data else None
    req = request.Request(url, data=body, headers=headers or {})
    try:
        with request.urlopen(req, timeout=TIMEOUT) as resp:
            import json
            return json.loads(resp.read().decode("utf-8", "replace"))
    except Exception as exc:  # network / quota / parse: treat as a miss
        print(f"[bin-online] {url.split('?')[0]}: {exc}", flush=True)
        return None


def _neutrino(digits: str) -> dict[str, Any] | None:
    uid, key = os.environ.get("NEUTRINO_USER_ID"), os.environ.get("NEUTRINO_API_KEY")
    if not uid or not key:
        return None
    # POST bin-number in the body; auth via headers (User-ID / API-Key), per docs.
    # bin-number accepts 6/8/10 digits; send 8 for co-brand precision.
    j = _get(
        "https://neutrinoapi.net/bin-lookup",
        data={"bin-number": digits[:8]},
        headers={
            "User-ID": uid,
            "API-Key": key,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    if not j or not j.get("valid"):
        return None
    return {
        "bin": digits[:6],
        "network": (j.get("card-brand") or "").title() or None,
        "type": (j.get("card-type") or "").title() or None,
        "level": (j.get("card-category") or "").title() or None,
        "issuer": j.get("issuer") or None,
        "country": (j.get("country-code") or None),  # ISO 3166-1 alpha-2
        "currency": j.get("currency-code") or None,
        "is_commercial": bool(j.get("is-commercial")),
        "is_prepaid": bool(j.get("is-prepaid")),
        "is_reloadable": bool(j.get("is-reloadable")),
        "phone": j.get("issuer-phone") or None,
        "url": j.get("issuer-website") or None,
        "source": "neutrino",
    }


def _bincodes(digits: str) -> dict[str, Any] | None:
    key = os.environ.get("BINCODES_API_KEY")
    if not key:
        return None
    j = _get(f"https://api.bincodes.com/bin/?format=json&api_key={key}&bin={digits[:6]}")
    if not j or j.get("valid") in ("false", False):
        return None
    return {
        "bin": digits[:6],
        "network": (j.get("card") or "").title() or None,
        "type": (j.get("type") or "").title() or None,
        "level": (j.get("level") or "").title() or None,
        "issuer": j.get("bank") or None,
        "country": j.get("countrycode") or None,
        "currency": None,
        "is_commercial": False,
        "is_prepaid": "prepaid" in (j.get("type") or "").lower(),
        "phone": j.get("phone") or None,
        "url": j.get("website") or None,
        "source": "bincodes",
    }


def make_online():
    """Return a fetcher for the configured provider, or None if disabled.

    Neutrino needs BOTH a User-ID and an API key, so we only report it ready
    when both are present (otherwise /health would claim a fallback that can't
    actually authenticate)."""
    which = (os.environ.get("VERISEC_BIN_API") or "").strip().lower()
    if which == "neutrino" and os.environ.get("NEUTRINO_API_KEY") and os.environ.get("NEUTRINO_USER_ID"):
        return _neutrino
    if which == "bincodes" and os.environ.get("BINCODES_API_KEY"):
        return _bincodes
    return None
