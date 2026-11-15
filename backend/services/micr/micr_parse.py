"""MICR: the engine's own output, plus two ways of naming the fields of a line.

1. The engine is the single source of truth. Its zones are returned verbatim; on top
   of them we add only values derivable from its own text (glyph render, segments).

2. `doubango_fields()` names fields exactly as the vendor's online demo does. It is a
   set of 4 fixed templates reconstructed from the demo's own answers (MICR_Research,
   doubango_naming_rules.py: 30 of 30 real answers reproduced, 12 blind predictions
   right). Output format is the demo's: a list of one-key dicts, empty when no
   template fits.

3. `standard_layout()` names fields for national layouts the demo does not cover,
   each written from that country's official standard (not fitted to any cheque).
   It returns None unless the WHOLE line matches the standard's structure.

The engine spells E-13B control symbols as the letters A-D (A transit U+2446,
B amount U+2447, C on-us U+2448, D dash U+2449) and CMC-7 control symbols as F-J.
This file is kept pure ASCII so no editor can corrupt it.
"""

from __future__ import annotations

import re
from typing import Any

# Built from Unicode code points (OCR block U+2446..U+2449) rather than glyph
# literals, so a Windows-side edit that misreads the file's encoding can never
# corrupt these into mojibake in the API's JSON output.
GLYPH = {"A": chr(0x2446), "B": chr(0x2447), "C": chr(0x2448), "D": chr(0x2449)}


def printed(font: str, line: str) -> str:
    """Human-readable render of the engine's text: E-13B control letters become
    their OCR glyphs; CMC-7 control letters become a plain separator."""
    if font == "E-13B":
        return "".join(GLYPH.get(ch, ch) for ch in line)
    return "".join(ch if ch.isdigit() else "|" for ch in line)


def segments(line: str) -> list[str]:
    """The digit groups the engine's OWN control symbols delimit. No country
    assumptions, just a split on the symbols the engine itself placed."""
    return [g for g in re.split(r"[A-Z]", line) if g]


# ---------------------------------------------------------------------------
# The vendor demo's naming: 4 fixed templates. Do NOT edit these to fit a cheque;
# they are validated as a whole against every saved demo answer.
# ---------------------------------------------------------------------------
_TEMPLATES: list[tuple[str, str, "re.Pattern[str]", list[str]]] = [
    # E-13B, US business cheque: line starts with a closed on-us run (serial).
    ("us_business", "E-13B", re.compile(r"^C(\d+)C(\d)?A(\d+)A([\dD]+)C"),
     ["Auxiliary On-Us", "EPC", "Routing", "Account"]),
    # E-13B, US personal cheque: first routing field followed by a non-empty account.
    ("us_personal", "E-13B", re.compile(r"(\d)?A(\d+)A([\dD]+)C(\d+)?(?:B(\d+)B)?"),
     ["EPC", "Routing", "Account", "Check number", "Amount"]),
    # CMC-7, Brazil (FEBRABAN): 8 / 10 / 12 digit groups.
    ("br_cmc7", "CMC-7", re.compile(r"^H(\d{3})(\d{4})(\d)H(\d{3})(\d{6})(\d)I(\d)(\d{10})(\d)F"),
     ["Bank", "Agency", "DV2", "Bank code", "Check number", "Typification", "DV1", "Account", "DV3"]),
    # CMC-7, France: 7 / 12 / (12) digit groups.
    ("fr_cmc7", "CMC-7", re.compile(r"^H(\d{7})H(\d{12})I(?:(\d{12})F)?"),
     ["Check number", "Bank code", "Account"]),
]


def _font_fields() -> dict[str, list[str]]:
    """Every field name the demo's templates can return, per font, in template order.
    Used to list the fields a line did NOT yield (blank), never to name anything."""
    out: dict[str, list[str]] = {}
    for _tid, font, _pattern, names in _TEMPLATES:
        for n in names:
            if n not in out.setdefault(font, []):
                out[font].append(n)
    return out


FONT_FIELDS = _font_fields()


def field_list(names: list[str], fields: list[dict[str, str]]) -> list[dict[str, str]]:
    """Every name in `names` with its value, or "" when the line did not yield it."""
    got = {k: v for d in fields for k, v in d.items()}
    return [{"name": n, "value": got.get(n, "")} for n in names]


def doubango_fields(font: str, line: str) -> tuple[str | None, list[dict[str, str]]]:
    """(template id, fields) exactly as the vendor demo names them. The first
    template of the line's font that matches wins; no match -> (None, [])."""
    for tid, tfont, pattern, names in _TEMPLATES:
        if tfont != font:
            continue
        m = pattern.search(line)
        if m:
            return tid, [{n: g} for n, g in zip(names, m.groups()) if g]
    return None, []


# ---------------------------------------------------------------------------
# National layouts the demo does not cover, each from its official standard.
# Whole-line match only; anything else -> None. Do NOT edit to fit a cheque.
# ---------------------------------------------------------------------------
_STANDARDS: list[dict[str, Any]] = [
    {
        "id": "ca_cpa_006",
        "name": "Canada (Payments Canada Standard 006)",
        "country": "CA",
        "font": "E-13B",
        "pattern": re.compile(r"^(?:C([\dD]{1,12})C)?A(\d{5})D(\d{3})A([\dD]+)C(\d{1,4})?(?:B(\d{10})B)?$"),
        "names": ["Serial Number", "Branch (Transit)", "Institution", "Account", "Transaction Code", "Amount"],
        "parts": {},
    },
    {
        "id": "in_cts_2010",
        "name": "India (RBI CTS-2010)",
        "country": "IN",
        "font": "E-13B",
        "pattern": re.compile(r"^C(\d{6})C(\d{9})A(?:(\d{6,7})C)?(\d{2,3})(?:B(\d{13})B)?$"),
        "names": ["Cheque Number", "MICR Code", "Short Account Number", "Transaction Code", "Amount"],
        # The 9-digit MICR code is city 3 + bank 3 + branch 3.
        "parts": {"MICR Code": [("City Code", 0, 3), ("Bank Code", 3, 6), ("Branch Code", 6, 9)]},
    },
]


def standard_layout(font: str, line: str) -> dict[str, Any] | None:
    """The official national layout this whole line follows, with its fields, or None."""
    for std in _STANDARDS:
        if std["font"] != font:
            continue
        m = std["pattern"].match(line)
        if not m:
            continue
        fields: list[dict[str, Any]] = []
        for name, value in zip(std["names"], m.groups()):
            if not value:
                continue
            field: dict[str, Any] = {"name": name, "value": value}
            parts = std["parts"].get(name)
            if parts:
                field["parts"] = [{"name": p, "value": value[a:b]} for p, a, b in parts]
            fields.append(field)
        listed = {f["name"]: f for f in fields}
        return {"id": std["id"], "name": std["name"], "country": std["country"], "fields": fields,
                "field_list": [listed.get(n, {"name": n, "value": ""}) for n in std["names"]]}
    return None


# ---------------------------------------------------------------------------
# ABA routing proof (US). Shown next to a "Routing" field so a routing number that
# is not a real US one (wrong length, failed check digit) is visible as such.
# ---------------------------------------------------------------------------
# The first two digits of an ABA routing number are the Federal Reserve routing
# symbol. Only these ranges are ever assigned:
#   00 US Government, 01-12 Bank (district), 21-32 Thrift (+20)
#   61-72 Electronic (+60), 80 Traveller's cheque
_FRB_DISTRICT = {
    1: "Boston", 2: "New York", 3: "Philadelphia", 4: "Cleveland",
    5: "Richmond", 6: "Atlanta", 7: "Chicago", 8: "St. Louis",
    9: "Minneapolis", 10: "Kansas City", 11: "Dallas", 12: "San Francisco",
}
_ABA_WEIGHTS = [3, 7, 1, 3, 7, 1, 3, 7, 1]


def _aba_prefix(prefix: int) -> tuple[bool, str | None, str | None]:
    """(prefix_valid, institution_type, federal_reserve_district) for the first
    two digits of a routing number."""
    if prefix == 0:
        return True, "government", None
    if prefix == 80:
        return True, "travellers_cheque", None
    if 1 <= prefix <= 12:
        return True, "bank", _FRB_DISTRICT[prefix]
    if 21 <= prefix <= 32:
        return True, "thrift", _FRB_DISTRICT[prefix - 20]
    if 61 <= prefix <= 72:
        return True, "electronic", _FRB_DISTRICT[prefix - 60]
    return False, None, None


def aba_check(routing: str) -> dict[str, Any]:
    """Full, deterministic validation of a US ABA routing/transit number.

    Proves two things, with no model and no guess: (1) the mod-10 checksum
    (weights 3,7,1) holds -- catches every single-digit error and all adjacent
    transpositions except where the two swapped digits differ by exactly 5; and
    (2) the Federal Reserve routing symbol (first two digits) is an assigned
    range. `valid` is true only when BOTH hold. It does not prove the bank or
    account exists; that needs a routing directory or the bank itself.
    """
    if not re.fullmatch(r"\d{9}", routing or ""):
        return {"valid": False, "checksum_pass": False, "prefix_valid": False, "reason": "not_nine_digits"}
    d = [int(c) for c in routing]
    checksum_pass = sum(di * wi for di, wi in zip(d, _ABA_WEIGHTS)) % 10 == 0
    head = sum(d[i] * _ABA_WEIGHTS[i] for i in range(8))
    expected = (10 - head % 10) % 10
    prefix_valid, inst_type, district = _aba_prefix(int(routing[:2]))
    return {
        "valid": bool(checksum_pass and prefix_valid),
        "checksum_pass": checksum_pass,
        "check_digit": d[8],
        "expected_check_digit": expected,
        "prefix_valid": prefix_valid,
        "institution_type": inst_type,
        "federal_reserve_district": district,
    }


def selftest() -> None:
    # Core helpers are engine-driven and country-agnostic.
    assert segments("H03345339H0180021545I701010000550F") == ["03345339", "0180021545", "701010000550"]
    assert printed("E-13B", "A12A") == f"{GLYPH['A']}12{GLYPH['A']}"

    # Vendor demo templates, on lines whose real demo answers are known.
    assert doubango_fields("E-13B", "C370694CA102000979A68008192429291C") == (
        "us_business", [{"Auxiliary On-Us": "370694"}, {"Routing": "102000979"}, {"Account": "68008192429291"}])
    assert doubango_fields("E-13B", "C26190941A400407A0064145426D11C") == (
        "us_personal", [{"EPC": "1"}, {"Routing": "400407"}, {"Account": "0064145426D11"}])
    assert doubango_fields("E-13B", "C179215C781116102A10") == (None, [])
    assert doubango_fields("CMC-7", "H8363057H452808334165I") == (
        "fr_cmc7", [{"Check number": "8363057"}, {"Bank code": "452808334165"}])

    # National layouts: whole-line only.
    ca = standard_layout("E-13B", "C243CA00005D123A123D456D7C")
    assert ca and ca["id"] == "ca_cpa_006" and [f["name"] for f in ca["fields"]] == [
        "Serial Number", "Branch (Transit)", "Institution", "Account"], ca
    ind = standard_layout("E-13B", "C179215C781116102A10")
    assert ind and ind["id"] == "in_cts_2010", ind
    assert ind["fields"][1]["parts"] == [{"name": "City Code", "value": "781"}, {"name": "Bank Code", "value": "116"},
                                         {"name": "Branch Code", "value": "102"}], ind
    assert standard_layout("E-13B", "C370694CA102000979A68008192429291C") is None
    assert standard_layout("CMC-7", "H8363057H452808334165I") is None

    # ABA guarantees (unchanged, still proven).
    for rn, district in (("021000021", "New York"), ("011000015", "Boston"), ("102000979", "Kansas City")):
        r = aba_check(rn)
        assert r["valid"] and r["checksum_pass"] and r["prefix_valid"] and r["institution_type"] == "bank", (rn, r)
        assert r["federal_reserve_district"] == district and r["check_digit"] == r["expected_check_digit"], (rn, r)
    for prefix, kind, district in ((0, "government", None), (80, "travellers_cheque", None),
                                   (21, "thrift", "Boston"), (32, "thrift", "San Francisco"),
                                   (61, "electronic", "Boston"), (72, "electronic", "San Francisco")):
        assert _aba_prefix(prefix) == (True, kind, district), prefix
    for prefix in (13, 20, 33, 60, 73, 79, 81, 99):
        assert _aba_prefix(prefix) == (False, None, None), prefix
    r = aba_check("021000020")
    assert not r["valid"] and not r["checksum_pass"] and r["expected_check_digit"] == 1, r
    r = aba_check("130000006")
    assert r["checksum_pass"] and not r["prefix_valid"] and not r["valid"], r
    for bad in ("", "12345678", "1234567890", "02100002A"):
        assert not aba_check(bad)["valid"], bad
    # 1) Every single-digit substitution in a valid number is caught.
    for rn in ("021000021", "011000015", "102000979"):
        for i in range(9):
            for digit in "0123456789":
                if digit != rn[i]:
                    assert not aba_check(rn[:i] + digit + rn[i + 1 :])["checksum_pass"], (rn, i, digit)
    # 2) An adjacent swap of a != b is caught unless |a - b| == 5.
    for i in range(8):
        free = next(j for j in range(9) if j not in (i, i + 1))
        for a in range(10):
            for b in range(10):
                if a == b:
                    continue
                d = [0] * 9
                d[i], d[i + 1] = a, b
                s = sum(x * w for x, w in zip(d, _ABA_WEIGHTS))
                d[free] = next(v for v in range(10) if (s + v * _ABA_WEIGHTS[free]) % 10 == 0)
                assert aba_check("".join(map(str, d)))["checksum_pass"], d
                d[i], d[i + 1] = b, a
                caught = not aba_check("".join(map(str, d)))["checksum_pass"]
                assert caught == (abs(a - b) != 5), (i, a, b)


if __name__ == "__main__":
    selftest()
    print("parse selftest ok")
