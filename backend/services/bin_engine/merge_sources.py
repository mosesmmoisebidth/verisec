#!/usr/bin/env python3
"""Merge every local BIN source into one normalized CSV for the C++ index.

Output columns (col 0 is the lookup key):
    prefix,network,type,level,funding,issuer,country,currency,
    is_commercial,is_prepaid,phone,url,source

Sources are emitted in PRIORITY ORDER (best first). The C++ builder keeps the
first occurrence of each (prefix,length), so higher-priority sources win a tie.
Every row is tagged with its `source`, and `--cc-by-only` drops the sources we
cannot ship in a commercial product (GPL / paid-sample), leaving a clean,
attribution-only index.

Priority:
    1. master        our curated 458k (CC-BY blend) — 6-digit
    2. ultimate2026  8-digit precision + currency/commercial (PAID SAMPLE)
    3. openbiin      fresh community 6-digit (GPL-3.0)
Different BIN lengths never collide, so ultimate's 8-digit rows and master's
6-digit rows coexist; only same-length dupes are dropped.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys

REPO = os.environ.get("VERISEC_REPO", "/mnt/c/Users/Moses/Videos/RE_Hackathon_task")
BS = os.path.join(REPO, "BIN_Sourcing")

COLS = [
    "prefix", "network", "type", "level", "funding", "issuer", "country",
    "currency", "is_commercial", "is_prepaid", "phone", "url", "source",
]

# Licences: which sources are safe to ship embedded (attribution) vs not.
CC_BY_SAFE = {"master"}          # our merged CC-BY blend
RESTRICTED = {"openbiin": "GPL-3.0", "ultimate2026": "paid-sample"}


def clean(s: str | None) -> str:
    """One field, comma/tab/newline-free (the C++ splitter uses comma->tab)."""
    if not s:
        return ""
    return " ".join(str(s).replace(",", " ").replace("\t", " ").split()).strip()


def _currency_from_numeric(numeric: str) -> str:
    """ISO 4217 numeric -> alpha, via geodata (pycountry). Blank on failure."""
    try:
        from geodata import currency_from_numeric
        return currency_from_numeric(numeric) or ""
    except Exception:
        return ""


NETWORK = {
    "VISA": "Visa", "MASTERCARD": "Mastercard", "AMERICAN EXPRESS": "American Express",
    "DISCOVER": "Discover", "DINERS CLUB INTERNATIONAL": "Diners Club", "DINERS CLUB": "Diners Club",
    "JCB": "JCB", "UNIONPAY": "UnionPay", "CHINA UNION PAY": "UnionPay", "MAESTRO": "Maestro",
    "RUPAY": "RuPay", "EBT": "EBT", "PRIVATE LABEL": "Private label", "UATP": "UATP",
    "LOCAL BRAND": "Local brand",
}


def net(v: str) -> str:
    v = clean(v)
    return NETWORK.get(v.upper(), v.title() if v else "")


def sentence(v: str) -> str:
    v = clean(v)
    return (v[:1].upper() + v[1:].lower()) if v else ""


def funding_of(type_str: str, level_str: str) -> str:
    t, lv = type_str.lower(), level_str.lower()
    if "prepaid" in t or "prepaid" in lv:
        return "prepaid"
    if "debit" in t:
        return "debit"
    if "credit" in t:
        return "credit"
    if "charge" in t:
        return "charge"
    return ""


_COMMERCIAL = ("business", "corporate", "commercial", "purchasing", "fleet", "signia")


def flags(type_str: str, level_str: str, commercial_col: str = "") -> tuple[str, str]:
    lv = level_str.lower()
    t = type_str.lower()
    is_prepaid = "1" if ("prepaid" in t or "prepaid" in lv) else "0"
    if commercial_col:
        is_comm = "1" if commercial_col.strip().upper() in ("COMMERCIAL", "Y", "YES", "1", "TRUE") else "0"
    else:
        is_comm = "1" if any(w in lv for w in _COMMERCIAL) else "0"
    return is_comm, is_prepaid


def row(prefix, network, type_, level, funding, issuer, country, currency, is_comm, is_prepaid, phone, url, source):
    return [prefix, network, type_, level, funding, issuer, country, currency, is_comm, is_prepaid, phone, url, source]


def read_master(path):
    with open(path, encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            bin_ = clean(r.get("bin"))
            if not bin_.isdigit() or len(bin_) < 6:
                continue
            type_ = sentence(r.get("type"))
            level = clean(r.get("level"))
            is_comm, is_prepaid = flags(type_, level)
            yield row(bin_[:6], net(r.get("brand")), type_, level.title() if level else "",
                      funding_of(type_, level), clean(r.get("bank_name")), (clean(r.get("country")) or "").upper(),
                      "", is_comm, is_prepaid, "", "", "master")


def read_ultimate(path):
    # Semicolon-delimited, headerless. Columns observed:
    # 0 BIN;1 Brand;2 Issuer;3 Type;4 (blank/subbrand);5 Country;6 ISO2;7 ISO3;
    # 8 numeric-currency;9 URL;10 Phone;11 Length;12 PERSONAL/COMMERCIAL; then flags.
    with open(path, encoding="utf-8", newline="") as fh:
        for parts in csv.reader(fh, delimiter=";"):
            if len(parts) < 13:
                continue
            bin_ = clean(parts[0])
            if not bin_.isdigit() or len(bin_) < 6 or len(bin_) > 11:
                continue
            type_ = sentence(parts[3])
            level = clean(parts[4])
            is_comm, is_prepaid = flags(type_, level, parts[12])
            # Column 8 is the ISO 4217 numeric currency; map it to the alpha code.
            currency = _currency_from_numeric(clean(parts[8]))
            yield row(bin_, net(parts[1]), type_, level.title() if level else "",
                      funding_of(type_, level), clean(parts[2]), clean(parts[6]).upper(),
                      currency, is_comm, is_prepaid, clean(parts[10]), clean(parts[9]), "ultimate2026")


def read_openbiin(data_dir):
    for fn in sorted(os.listdir(data_dir)):
        if not fn.endswith(".csv"):
            continue
        with open(os.path.join(data_dir, fn), encoding="utf-8", newline="") as fh:
            for r in csv.DictReader(fh):
                bin_ = clean(r.get("BIN6"))
                if not bin_.isdigit() or len(bin_) < 6:
                    continue
                type_ = sentence(r.get("Type"))
                is_comm, is_prepaid = flags(type_, "")
                yield row(bin_[:6], net(r.get("Brand")), type_, "", funding_of(type_, ""),
                          clean(r.get("Issuer")), (clean(r.get("Country")) or "").upper(),
                          "", is_comm, is_prepaid, "", "", "openbiin")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(BS, "aggregate", "bin_normalized.csv"))
    ap.add_argument("--cc-by-only", action="store_true", help="ship-safe: only CC-BY sources")
    args = ap.parse_args()

    master = os.path.join(BS, "aggregate", "bin_master_candidate.csv")
    ultimate = os.path.join(BS, "github", "ultimate-bin-2026", "bin_database_sample_2026.csv")
    openbiin = os.path.join(BS, "github", "openbiin", "functions", "data")

    sources = [("master", read_master, master)]
    if not args.cc_by_only:
        if os.path.exists(ultimate):
            sources.append(("ultimate2026", read_ultimate, ultimate))
        if os.path.isdir(openbiin):
            sources.append(("openbiin", read_openbiin, openbiin))

    n = 0
    counts: dict[str, int] = {}
    with open(args.out, "w", encoding="utf-8", newline="") as out:
        out.write(",".join(COLS) + "\n")
        for name, reader, path in sources:
            c = 0
            for rec in reader(path):
                out.write(",".join(rec) + "\n")
                c += 1
                n += 1
            counts[name] = c
            note = "CC-BY (ship-safe)" if name in CC_BY_SAFE else RESTRICTED.get(name, "")
            print(f"  {name:12} {c:>8,}  {note}", file=sys.stderr)

    print(f"wrote {n:,} rows -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
