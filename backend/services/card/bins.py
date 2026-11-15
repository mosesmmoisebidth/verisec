"""BIN table: first digits of a card → network, type, level, issuer, country.

Built once from our aggregated CSV (`BIN_Sourcing/aggregate/
bin_master_candidate.csv`, ~458k rows) into an indexed SQLite file, so a
lookup is one indexed read and the service holds no big dictionary in RAM.
The `source` column is dropped on import: where a row came from is ours to
know, not something the API reports.
"""

from __future__ import annotations

import csv
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any

# Words that stay upper case when an issuer name is re-cased for display.
_KEEP_UPPER = {
    "UK", "USA", "US", "UAE", "SA", "AG", "NV", "BV", "SPA", "SARL", "LLC", "PLC", "PJSC", "OJSC", "JSC",
    "CJSC", "PT", "TBK", "BHD", "NA", "SAL", "ATM", "BCP", "CIB", "BNP", "HSBC", "RBC", "TD", "BMO", "ICBC",
}
_SMALL = {"of", "and", "the", "de", "du", "des", "la", "le", "et", "for", "in", "da", "do", "y"}

_NETWORK = {
    "VISA": "Visa",
    "MASTERCARD": "Mastercard",
    "AMERICAN EXPRESS": "American Express",
    "DISCOVER": "Discover",
    "DINERS CLUB INTERNATIONAL": "Diners Club",
    "DINERS CLUB": "Diners Club",
    "JCB": "JCB",
    "UNIONPAY": "UnionPay",
    "CHINA UNION PAY": "UnionPay",
    "MAESTRO": "Maestro",
    "RUPAY": "RuPay",
    "EBT": "EBT",
    "PRIVATE LABEL": "Private label",
}


def _word(w: str, first: bool) -> str:
    bare = re.sub(r"[^A-Za-z]", "", w)
    if not bare:
        return w
    if bare.upper() == "LTD":
        return "Ltd." if w.endswith(".") else "Ltd"
    if "&" in w or "." in w.strip(".") or bare.upper() in _KEEP_UPPER or not re.search(r"[AEIOUY]", bare.upper()):
        return w.upper()
    lower = w.lower()
    if not first and lower in _SMALL:
        return lower
    return re.sub(r"[a-z]", lambda m: m.group(0).upper(), lower, count=1)


def issuer_name(raw: str) -> str:
    words = raw.split()
    return " ".join(_word(w, i == 0) for i, w in enumerate(words))


def _sentence(s: str) -> str:
    s = s.strip()
    return s[:1].upper() + s[1:].lower() if s else s


class BinTable:
    def __init__(self, db_path: Path, csv_path: Path) -> None:
        self._lock = threading.Lock()
        fresh = not db_path.exists()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(db_path), check_same_thread=False)
        if fresh:
            self._build(csv_path)
        self.count = self._db.execute("SELECT COUNT(*) FROM bins").fetchone()[0]

    def _build(self, csv_path: Path) -> None:
        self._db.execute(
            "CREATE TABLE bins (bin TEXT PRIMARY KEY, brand TEXT, type TEXT, level TEXT, bank TEXT, country TEXT)"
        )
        with csv_path.open(encoding="utf-8", newline="") as fh:
            rows = (
                (r["bin"], r["brand"], r["type"], r["level"], r["bank_name"], r["country"])
                for r in csv.DictReader(fh)
                if r.get("bin", "").isdigit()
            )
            self._db.executemany("INSERT OR IGNORE INTO bins VALUES (?,?,?,?,?,?)", rows)
        self._db.commit()

    def lookup(self, digits: str) -> dict[str, Any] | None:
        """Longest match first: 8 digits, then 6."""
        d = re.sub(r"\D", "", digits)
        with self._lock:
            for n in (8, 6):
                if len(d) >= n:
                    row = self._db.execute(
                        "SELECT bin, brand, type, level, bank, country FROM bins WHERE bin = ?", (d[:n],)
                    ).fetchone()
                    if row:
                        return self._shape(row)
        return None

    @staticmethod
    def _shape(row: tuple) -> dict[str, Any]:
        bin_, brand, type_, level, bank, country = row
        return {
            "bin": bin_,
            "network": _NETWORK.get((brand or "").upper(), (brand or "").title() or None),
            "type": _sentence(type_ or "") or None,
            "level": _sentence(level or "") or None,
            "issuer": issuer_name(bank) if bank else None,
            "country": (country or "").upper() or None,
        }
