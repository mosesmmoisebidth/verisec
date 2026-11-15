"""BIN lookup with a three-tier, self-updating mechanism.

    1. C++ index   the merged local DB (mmap, ~0.7us), longest-prefix match.
    2. Overlay     a small SQLite table of BINs we learned from the online API,
                   so a BIN fetched once is local forever after.
    3. Online      a credit-based fallback (Neutrino / bincodes), used ONLY when
                   the first two miss. Whatever it returns is written into the
                   overlay, so we never pay to look up the same BIN twice.

`lookup()` always returns the same enriched dict shape (or None), whichever
tier answered, with a `source` telling you where it came from.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable

# The compiled module sits next to this file.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import binlookup  # type: ignore  # noqa: E402
from geodata import (  # noqa: E402
    country_iso3,
    country_name,
    currency_for_country,
    currency_name,
)

# Field order the C++ blob stores (matches merge_sources.COLS minus `prefix`).
COLS = ["network", "type", "level", "funding", "issuer", "country", "currency",
        "is_commercial", "is_prepaid", "phone", "url", "source"]

_COMMERCIAL = ("business", "corporate", "commercial", "purchasing", "fleet", "signia")

# An online fetcher: digits -> normalized row dict (see `_normalize`) or None.
OnlineFn = Callable[[str], "dict[str, Any] | None"]


def _to_bool(v: Any) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes", "y")


def _finish(row: dict[str, Any]) -> dict[str, Any]:
    """Fill every derived field so all three tiers return one rich, identical
    shape: funding, commercial/prepaid/category, full country name + ISO3 +
    flag code, and the issuing currency (code + name) even for local rows."""
    t = (row.get("type") or "").lower()
    level = (row.get("level") or "").lower()
    if not row.get("funding"):
        row["funding"] = (
            "prepaid" if ("prepaid" in t or "prepaid" in level)
            else "debit" if "debit" in t
            else "credit" if "credit" in t
            else "charge" if "charge" in t
            else "unknown"
        )
    row["is_prepaid"] = _to_bool(row.get("is_prepaid")) or "prepaid" in t or "prepaid" in level
    row["is_commercial"] = _to_bool(row.get("is_commercial")) or any(w in level for w in _COMMERCIAL)
    row["category"] = "commercial" if row["is_commercial"] else "consumer"
    # is_reloadable: only known from the online tier; normalize to bool/None.
    row["is_reloadable"] = _to_bool(row["is_reloadable"]) if row.get("is_reloadable") not in (None, "") else None

    # Blank strings -> None for the optional text fields, so JSON reads cleanly.
    for k in ("currency", "phone", "url", "issuer", "network", "type", "level"):
        if row.get(k) == "":
            row[k] = None

    # Geo/currency enrichment from the ISO2 code (offline, every row).
    iso2 = (row.get("country") or "").upper() or None
    row["country"] = iso2
    row["country_name"] = country_name(iso2)
    row["country_code3"] = country_iso3(iso2)
    row["issuer_country"] = iso2
    # Flag emoji from the ISO2 code (the web UI also renders an SVG flag).
    row["flag"] = _flag_emoji(iso2)
    if not row.get("currency"):
        row["currency"] = currency_for_country(iso2)
    row["currency_name"] = currency_name(row.get("currency"))
    return row


def _flag_emoji(iso2: str | None) -> str | None:
    """Regional-indicator flag emoji for an ISO2 code (e.g. RW -> 🇷🇼)."""
    if not iso2 or len(iso2) != 2 or not iso2.isalpha():
        return None
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in iso2.upper())


class BinService:
    def __init__(self, index_path: str, overlay_db: str, online: OnlineFn | None = None):
        self.index = binlookup.Index(index_path)
        self.online = online
        # Merge the provider into local hits to fill gaps (once per BIN, then
        # cached). Set BIN_ENRICH_ON_HIT=0 to only call the provider on a total
        # local miss (saves credits, but local-only rows keep their gaps).
        self._merge_on_hit = os.environ.get("BIN_ENRICH_ON_HIT", "1").strip().lower() not in ("0", "false", "no")
        self._lock = threading.Lock()
        Path(overlay_db).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(overlay_db, check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS bin_overlay ("
            " prefix TEXT PRIMARY KEY, row TEXT NOT NULL, added_at REAL NOT NULL)"
        )
        self._db.commit()

    @property
    def count(self) -> int:
        return int(self.index.size)

    @property
    def overlay_count(self) -> int:
        with self._lock:
            return int(self._db.execute("SELECT COUNT(*) FROM bin_overlay").fetchone()[0])

    # ---- the three tiers ---------------------------------------------------

    def _from_index(self, digits: str) -> dict[str, Any] | None:
        rec = self.index.lookup(digits)
        if rec is None:
            return None
        row = dict(zip(COLS, rec.split("\t")))
        # The C++ record has no explicit prefix; use the first 6 for display.
        row["bin"] = digits[:6]
        return _finish(row)

    def _from_overlay(self, digits: str) -> dict[str, Any] | None:
        with self._lock:
            for n in (8, 6):
                if len(digits) >= n:
                    hit = self._db.execute("SELECT row FROM bin_overlay WHERE prefix = ?", (digits[:n],)).fetchone()
                    if hit:
                        # Keep the stored (merged) source, e.g. "master+neutrino".
                        return _finish(json.loads(hit[0]))
        return None

    def _remember(self, prefix: str, row: dict[str, Any]) -> None:
        with self._lock:
            self._db.execute(
                "INSERT OR REPLACE INTO bin_overlay (prefix, row, added_at) VALUES (?,?,?)",
                (prefix, json.dumps(row), time.time()),
            )
            self._db.commit()

    # Fields the online provider knows that our local data never carries; if any
    # is missing on a local hit, one merge call from the provider completes it.
    _ONLINE_ONLY = ("is_reloadable", "phone", "url")

    def _needs_merge(self, row: dict[str, Any]) -> bool:
        for k in self._ONLINE_ONLY:
            if row.get(k) in (None, ""):
                return True
        return not row.get("issuer") or not row.get("currency")

    @staticmethod
    def _merge(local: dict[str, Any], online: dict[str, Any]) -> dict[str, Any]:
        """Combine both into one record: keep every real local value, fill the
        gaps from the provider, and always take the provider's online-only
        fields (reloadable, phone, website). Re-finish to recompute derived bits."""
        m = dict(local)
        for k, v in online.items():
            if v in (None, ""):
                continue
            if k in BinService._ONLINE_ONLY or m.get(k) in (None, ""):
                m[k] = v
        ls = local.get("source") or ""
        m["source"] = ls if "neutrino" in ls else (f"{ls}+neutrino" if ls else online.get("source", "neutrino"))
        return _finish(m)

    def lookup(self, digits: str) -> dict[str, Any] | None:
        digits = "".join(c for c in digits if c.isdigit())
        if len(digits) < 6:
            return None

        # An already-merged/enriched record wins: it is the most complete and
        # costs nothing (we paid for it once, it lives in our own DB now).
        overlay = self._from_overlay(digits)
        if overlay:
            return overlay

        local = self._from_index(digits)
        if local:
            # Merge the provider into the local row to fill the gaps, ONCE, then
            # cache the merged record so this BIN is complete and free forever.
            if self.online and self._merge_on_hit and self._needs_merge(local):
                fetched = self.online(digits)
                if fetched:
                    merged = self._merge(local, fetched)
                    self._remember(merged.get("bin", digits[:6]), merged)
                    return merged
            return local

        # No local row at all: the provider is the only source.
        if self.online:
            fetched = self.online(digits)
            if fetched:
                fetched.setdefault("bin", digits[:6])
                fetched["source"] = fetched.get("source") or "neutrino"
                row = _finish(fetched)
                self._remember(row["bin"], row)
                return row
        return None
