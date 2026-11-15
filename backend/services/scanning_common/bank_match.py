"""Bank matching engine over the directory (banks.sqlite, ~75k profiles).

Given a bank as read off a cheque or a card's BIN row (bank name, country, branch, address, a BIC
if the code line carried one), find the single best bank profile, handling:
  * the same brand across many countries (Access Bank in NG/GH/RW/GB/...),
  * branch-level rows (Access Bank Plc Kaduna, ...),
  * a cheque whose (brand, country) is simply not in the DB -> no forced match.

The match is on the DISTINCTIVE brand, not on generic ("bank") or geographic
("uganda") words: those are stripped, so "Stanbic Bank Uganda" never collapses
onto "Bank of Uganda". Scoring is multi-field and weighted (rapidfuzz, a C++
core): brand name/alias (token_sort, plus a shared-brand-token gate), city/branch,
address, and the BIC (brand = chars 1-4, country = chars 5-6). Country is a gate:
candidates are the brand IN that country (plus any exact-BIC hit); if none clear
the bar, the brand found in OTHER countries is returned only as alternatives.

The index is built once from the DB and cached (pickle keyed by the DB mtime).
"""
from __future__ import annotations

import json
import os
import pickle
import re
import sqlite3

from rapidfuzz import fuzz

_VERSION = 3
_STOP = {"bank", "banque", "banco", "limited", "ltd", "plc", "inc", "sa", "co", "company",
         "the", "of", "and", "group", "holdings", "corporation", "corp", "nv", "ag", "gmbh",
         "pvt", "private", "public", "national", "international", "intl", "savings", "credit",
         "union", "trust", "financial", "finance", "microfinance", "commercial", "cooperative",
         "coop", "s", "a", "l", "p", "c"}
_IDX: dict | None = None


def _norm(s: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", (s or "").lower()).split())


def _distinctive(name: str, country_words: set) -> tuple[str, frozenset]:
    toks = [t for t in _norm(name).split() if t not in _STOP and t not in country_words]
    return " ".join(toks), frozenset(toks)


def _plist(x):
    try:
        v = json.loads(x) if x else []
        return v if isinstance(v, list) else [v]
    except Exception:
        return [t for t in re.split(r"[\s|]+", x or "") if t]


def _build(db_path: str) -> dict:
    con = sqlite3.connect(db_path)
    rows = con.execute(
        "select profile_id,name,aliases,country_code,country,city,state,address,bics,"
        "routing_numbers,parent_name,status from profiles").fetchall()
    # Country words (to strip from brands): every token of every country name, plus
    # a few common demonyms/qualifiers. "uganda", "ghana", ... become non-brand.
    country_words = set()
    for r in rows:
        for t in _norm(r[4] or "").split():
            if len(t) > 2:
                country_words.add(t)
    country_words -= {"first", "united", "development", "central"}  # keep these: real brand words
    recs: list[dict] = []
    by_country: dict[str, list] = {}
    brand4: dict[str, list] = {}
    for r in rows:
        bics = _plist(r[8])
        bic4 = {b[:4].upper() for b in bics if len(b) >= 6}
        dist, dset = _distinctive(r[1], country_words)
        alias_dists = []
        for a in (r[2] or "").split(" | "):
            if a:
                ad, _ = _distinctive(a, country_words)
                if ad:
                    alias_dists.append(ad)
        rec = {
            "profile_id": r[0], "name": r[1], "country_code": (r[3] or "").upper(),
            "country": r[4], "city": r[5] or "", "address": r[7] or "",
            "bics": bics, "routing": _plist(r[9]), "parent": r[10] or "", "status": r[11] or "",
            "city_norm": _norm(r[5] or ""), "addr_norm": _norm(r[7] or ""),
            "dist": dist, "dist_set": dset, "alias_dists": alias_dists,
            "bic4": bic4, "has_bic": bool(bics),
        }
        i = len(recs)
        recs.append(rec)
        by_country.setdefault(rec["country_code"], []).append(i)
        for b4 in bic4:
            brand4.setdefault(b4, []).append(i)
    return {"version": _VERSION, "recs": recs, "by_country": by_country,
            "brand4": brand4, "country_words": country_words}


def _load(db_path: str) -> dict:
    global _IDX
    if _IDX is not None:
        return _IDX
    cache = db_path + ".matchidx.pkl"
    try:
        if os.path.exists(cache) and os.path.getmtime(cache) >= os.path.getmtime(db_path):
            with open(cache, "rb") as f:
                got = pickle.load(f)
                if got.get("version") == _VERSION:
                    _IDX = got
                    return _IDX
    except Exception:
        pass
    _IDX = _build(db_path)
    try:
        with open(cache, "wb") as f:
            pickle.dump(_IDX, f)
    except Exception:
        pass
    return _IDX


def _name_score(q_dist: str, q_set: frozenset, rec: dict) -> float:
    cands = [rec["dist"], *rec["alias_dists"]]
    best = 0.0
    best_set = rec["dist_set"]
    for c in cands:
        if c:
            best = max(best, fuzz.token_sort_ratio(q_dist, c) / 100.0)
    # A high score needs a shared distinctive (brand) token; otherwise it is two
    # different banks that merely share generic words.
    if not (q_set & best_set) and best < 0.90:
        best *= 0.45
    return best


def _richness(rec: dict) -> int:
    return (1 if rec["has_bic"] else 0) + (1 if rec["city"] else 0) + (1 if rec["address"] else 0)


def _score(rec, q_dist, q_set, place, addr_norm, bic, bic4) -> tuple[float, float]:
    name = _name_score(q_dist, q_set, rec)
    score = name
    if place and rec["city_norm"]:
        score += 0.10 * (fuzz.token_set_ratio(place, rec["city_norm"]) / 100.0)
    if addr_norm and rec["addr_norm"]:
        score += 0.05 * (fuzz.partial_ratio(addr_norm, rec["addr_norm"]) / 100.0)
    if bic and bic in rec["bics"]:
        score += 0.08
    elif bic4 and bic4 in rec["bic4"]:
        score += 0.03
    if not place and rec["dist"] == q_dist:
        score += 0.02  # a clean HQ beats a branch row for a brand-only query
    return min(1.0, score), name


def _shape(rec: dict) -> dict:
    return {"profile_id": rec["profile_id"], "name": rec["name"], "country": rec["country"],
            "country_code": rec["country_code"] or None,
            "city": rec["city"] or None, "address": rec["address"] or None,
            "bic": rec["bics"][0] if rec["bics"] else None,
            "routing": rec["routing"][0] if rec["routing"] else None,
            "parent": rec["parent"] or None, "status": rec["status"] or None}


_NAME_FLOOR = 0.60  # below this name score it is not called a match


def resolve(name, country=None, branch=None, address=None, bic=None, topk=4, db_path=None) -> dict:
    db_path = db_path or os.environ.get("BANKS_DB", "")
    out = {"read": {"name": name, "country": country, "branch": branch, "address": address},
           "resolved": None, "match_confidence": 0.0, "alternatives": []}
    if not (name and db_path and os.path.exists(db_path)):
        return out
    idx = _load(db_path)
    cw = idx["country_words"]
    q_dist, q_set = _distinctive(name, cw)
    if not q_dist:  # name was all generic/country words: fall back to the plain name
        q_dist, q_set = _norm(name), frozenset(_norm(name).split())
    place = _norm(branch or "") or (_norm((address or "").split(",")[0]) if address else "")
    addr_norm = _norm(address or "")
    bic = (bic or "").upper() or None
    bic4 = bic[:4] if bic and len(bic) >= 6 else None
    cc = (country or "").upper()

    cand = set(idx["by_country"].get(cc, [])) if cc else set(range(len(idx["recs"])))
    if bic4:
        cand |= set(idx["brand4"].get(bic4, []))
    scored = []
    for i in cand:
        rec = idx["recs"][i]
        s, nm = _score(rec, q_dist, q_set, place, addr_norm, bic, bic4)
        scored.append((s, nm, -_richness(rec), i))
    scored.sort(key=lambda x: (-x[0], -x[1], x[2]))

    good = [t for t in scored if t[1] >= _NAME_FLOOR]
    if good:
        best = good[0]
        out["resolved"] = _shape(idx["recs"][best[3]])
        out["match_confidence"] = round(best[0], 3)
        out["alternatives"] = [_shape(idx["recs"][t[3]]) for t in good[1:topk]]
        return out

    # Not in this country: surface the same brand from other countries as
    # alternatives only (never resolve to a wrong country).
    hits = list(idx["brand4"].get(bic4, [])) if bic4 else []
    if not hits:
        for i, rec in enumerate(idx["recs"]):
            if rec["dist_set"] & q_set:
                hits.append(i)
                if len(hits) > 400:
                    break
    alt = sorted(hits, key=lambda i: -_name_score(q_dist, q_set, idx["recs"][i]))[:topk]
    out["alternatives"] = [_shape(idx["recs"][i]) for i in alt]
    return out


def selftest(db_path=None):
    db_path = db_path or os.environ.get("BANKS_DB", "")
    cases = [
        ("STANBIC BANK UGANDA LIMITED", "UG", "Forest Mall Branch"),
        ("Access Bank", "GH", None),
        ("Access Bank Uganda", "UG", None),
        ("Bank of Kigali", "RW", None),
        ("Equity Bank", "KE", None),
    ]
    for name, cc, br in cases:
        r = resolve(name, cc, br, db_path=db_path)
        rv = r["resolved"]
        print(f"{name!r:34} {cc} -> " + (f"{rv['name']} ({rv['country']}, {rv.get('bic')})" if rv else "NO MATCH")
              + f"  conf {r['match_confidence']} | alts {len(r['alternatives'])}")


if __name__ == "__main__":
    selftest()
