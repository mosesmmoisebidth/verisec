"""Pure card derivations: Luhn, network, scheme validation, expiry, BIN
enrichment and a privacy-safe fingerprint. No I/O, so it is unit-testable and
identical whether called from the API or a test."""

from __future__ import annotations

import hashlib
import hmac
import os
from datetime import date

# Keyed so a fingerprint cannot be reversed to a PAN by brute force without the
# key. Set CARD_FINGERPRINT_KEY in production; the default is dev-only.
_FP_KEY = os.environ.get("CARD_FINGERPRINT_KEY", "verisec-dev-fingerprint-key-change-me").encode()

# Valid total lengths per network (ISO/IEC 7812 + scheme rules).
_LENGTHS: dict[str, set[int]] = {
    "Visa": {13, 16, 19},
    "Mastercard": {16},
    "American Express": {15},
    "Discover": {16, 17, 18, 19},
    "UnionPay": {16, 17, 18, 19},
    "JCB": {16, 17, 18, 19},
    "Diners Club": {14, 16, 19},
    "Maestro": {12, 13, 14, 15, 16, 17, 18, 19},
}


def luhn(number: str) -> bool:
    if not number.isdigit() or len(number) < 12:
        return False
    total = 0
    for i, ch in enumerate(reversed(number)):
        n = int(ch)
        if i % 2 == 1:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
    return total % 10 == 0


def network_from_prefix(pan: str) -> str | None:
    """Card network from the IIN prefix alone (a fallback / cross-check)."""
    p = "".join(c for c in pan if c.isdigit())
    if len(p) < 2:
        return None

    def n(k: int) -> int:
        return int(p[:k]) if len(p) >= k else -1

    if p[0] == "4":
        return "Visa"
    if (51 <= n(2) <= 55) or (2221 <= n(4) <= 2720):
        return "Mastercard"
    if p[:2] in ("34", "37"):
        return "American Express"
    if p[:4] == "6011" or p[:2] == "65" or (644 <= n(3) <= 649):
        return "Discover"
    if p[:2] == "62":
        return "UnionPay"
    if 3528 <= n(4) <= 3589:
        return "JCB"
    if p[:2] in ("36", "38", "39") or (300 <= n(3) <= 305):
        return "Diners Club"
    if p[:2] == "50" or (56 <= n(2) <= 69):
        return "Maestro"
    return None


def scheme(number: str, bin_known: bool) -> dict:
    """Validate the number against its scheme: Luhn, length-for-network, and
    whether the IIN is one we recognise. `valid` requires Luhn and a length
    that fits the detected network."""
    net = network_from_prefix(number)
    allowed = _LENGTHS.get(net or "")
    length_ok = allowed is None or len(number) in allowed
    luhn_ok = luhn(number)
    return {
        "network_from_prefix": net,
        "checks": {"luhn": luhn_ok, "length": length_ok, "iin_known": bin_known},
        "valid": luhn_ok and length_ok,
    }


def fingerprint(number: str) -> str | None:
    """A stable, privacy-safe id for a PAN: keyed HMAC-SHA256, truncated. Safe
    to store and compare (dedup, "seen before"); the PAN itself is never kept."""
    digits = "".join(c for c in number if c.isdigit())
    if len(digits) < 12:
        return None
    return "cf_" + hmac.new(_FP_KEY, digits.encode(), hashlib.sha256).hexdigest()[:24]


def _month_end(year: int, month: int) -> date:
    if month == 12:
        return date(year, 12, 31)
    from datetime import timedelta

    return date(year, month + 1, 1) - timedelta(days=1)


def expiry(mmyy: str | None, soon_days: int = 60, today: date | None = None) -> dict:
    """Expiry breakdown from an MM/YY string: expired flag, days remaining, and
    a status of valid / expiring_soon / expired / unknown."""
    out = {"expired": None, "days_left": None, "status": "unknown"}
    if not mmyy or len(mmyy) != 5 or mmyy[2] != "/":
        return out
    try:
        month, year = int(mmyy[:2]), 2000 + int(mmyy[3:])
    except ValueError:
        return out
    if not 1 <= month <= 12:
        return out
    today = today or date.today()
    end = _month_end(year, month)
    days_left = (end - today).days
    expired = today > end
    out["expired"] = expired
    out["days_left"] = days_left
    out["status"] = "expired" if expired else ("expiring_soon" if days_left <= soon_days else "valid")
    return out


_COMMERCIAL = ("business", "corporate", "commercial", "purchasing", "fleet", "signia", "infinite business", "corporate t&e")


def enrich_bin(row: dict | None) -> dict | None:
    """Add funding, prepaid/commercial flags and a consumer/commercial category
    to a BIN row, derived from its type and level."""
    if not row:
        return None
    t = (row.get("type") or "").lower()
    level = (row.get("level") or "").lower()
    is_prepaid = "prepaid" in t or "prepaid" in level
    if is_prepaid:
        funding = "prepaid"
    elif "debit" in t:
        funding = "debit"
    elif "credit" in t:
        funding = "credit"
    elif "charge" in t:
        funding = "charge"
    else:
        funding = "unknown"
    is_commercial = any(w in level for w in _COMMERCIAL)
    return {
        **row,
        "funding": funding,
        "is_prepaid": is_prepaid,
        "is_commercial": is_commercial,
        "category": "commercial" if is_commercial else "consumer",
        "issuer_country": row.get("country"),
    }


def selftest() -> None:
    assert luhn("4713768012956464")
    assert not luhn("4713768012956465")
    assert network_from_prefix("4713768012956464") == "Visa"
    assert network_from_prefix("5391232061279498") == "Mastercard"
    assert network_from_prefix("340000000000009") == "American Express"
    s = scheme("4713768012956464", True)
    assert s["valid"] and s["checks"]["length"] and s["network_from_prefix"] == "Visa", s
    assert scheme("411111111111", False)["valid"] is False  # 12-digit Visa: bad length
    assert fingerprint("4713768012956464").startswith("cf_")
    assert fingerprint("4713768012956464") == fingerprint("4713 7680 1295 6464")  # spaces ignored
    e = expiry("02/29", today=date(2026, 9, 28))
    assert e["expired"] is False and e["status"] == "valid", e
    assert expiry("05/19", today=date(2026, 9, 28))["status"] == "expired"
    b = enrich_bin({"type": "Debit", "level": "Business", "country": "ZA"})
    assert b["funding"] == "debit" and b["is_commercial"] and b["category"] == "commercial", b
    p = enrich_bin({"type": "Debit", "level": "Prepaid platinum travel", "country": "IE"})
    assert p["is_prepaid"] and p["funding"] == "prepaid", p
    print("cardlib selftest ok")


if __name__ == "__main__":
    selftest()
