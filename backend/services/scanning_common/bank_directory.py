"""Our bank directory, shared by the MICR and Card APIs: the bank profiles
(banks.sqlite, ~75k, matched by bank_match) and the logo directory (one logo per
profile). A bank read off a cheque, or named by a card's BIN row, is resolved here
to one profile with its logo.

Name verification (for full legal names such as a card's BIN issuer) is an
order-aware soft TF-IDF (Cohen, Ravikumar & Fienberg, 2003). Each word's weight is
learned from the directory itself, nothing is hand-listed:
  * rarity: inverse document frequency over all ~75k bank names, so words that
    thousands of banks share count little and the rare, telling words decide;
  * staying power: how often the word survives between two names of the SAME bank
    (the directory's name/alias pairs), so words a bank's own names add or drop
    freely ("N.A.", "Co", "Ltd", "AG") count little.
Words are compared by Jaro-Winkler (spelling variants still meet), abbreviations
match the run of words they stand for, and only matched words in the same order
in both names score ("First Community" is not "Community First").

Env (from fin.env): BANKS_DB, BANK_LOGOS_CSV, PRIVATE_PII_DIR (logo files live under it).
"""
from __future__ import annotations

import csv
import json
import math
import sqlite3
import os
import re
import threading
import unicodedata
from collections import Counter
from pathlib import Path

from rapidfuzz.distance import JaroWinkler

from scanning_common import bank_match, flags

BANKS_DB = os.environ.get("BANKS_DB", "")
BANK_LOGOS_CSV = os.environ.get("BANK_LOGOS_CSV", "")
PRIVATE_PII_DIR = os.environ.get("PRIVATE_PII_DIR", str(Path(__file__).resolve().parents[4] / "_private_pii"))

# Two names name the same bank when their soft TF-IDF similarity, taken in BOTH
# directions, reaches this (calibrated on BIN issuers against the directory).
SAME_NAME = float(os.environ.get("BANK_SAME_NAME", "0.80"))
_CLOSE = 0.90  # Jaro-Winkler at or above this: the same word spelt a little differently
_CUT = 38      # card-network tables cut long names at about this length

_LOGOS: dict | None = None
_IDF: dict | None = None
_IDF_LOCK = threading.Lock()


def logo(profile_id: str) -> dict | None:
    """A profile's logo record ({path, status, source_url}), or None."""
    global _LOGOS
    if _LOGOS is None:
        logos = {}
        if BANK_LOGOS_CSV and os.path.exists(BANK_LOGOS_CSV):
            try:
                with open(BANK_LOGOS_CSV, encoding="utf-8-sig", newline="") as f:
                    for r in csv.DictReader(f):
                        if r.get("logo_path") and (r.get("logo_status") or "none") != "none":
                            logos[r["profile_id"]] = {"path": r["logo_path"], "status": r.get("logo_status"),
                                                      "source_url": r.get("logo_source_url")}
            except Exception:  # noqa: BLE001 -- no logos is a valid state
                pass
        _LOGOS = logos  # publish only when complete (it is also built from a startup thread)
    return _LOGOS.get(profile_id)


def logo_file(profile_id: str) -> Path | None:
    """The logo image file of a profile, when it exists on disk."""
    rec = logo(profile_id)
    if not rec:
        return None
    p = Path(PRIVATE_PII_DIR) / rec["path"]
    return p if p.exists() else None


def _tokens(name: str) -> list[str]:
    """Lower case ASCII words: accents and punctuation folded, dotted initials joined
    ("U.S." -> "us", "N.A." -> "na")."""
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower().replace("'", "")
    words: list[str] = []
    initials = False  # the last word is a run of single letters
    for w in re.split(r"[^a-z0-9]+", s):
        if not w:
            continue
        if len(w) == 1 and w.isalpha():
            if initials:
                words[-1] += w
            else:
                words.append(w)
            initials = True
        else:
            words.append(w)
            initials = False
    return words


_PRIOR = 5.0  # pseudo-count: a word seen in few alias pairs keeps most of its weight


def _alias_pairs(db_path: str) -> list[tuple[str, str]]:
    """(name, alias) pairs of the same bank from the directory."""
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute("select name, aliases from profiles").fetchall()
    finally:
        con.close()
    out = []
    for name, raw in rows:
        try:
            aliases = json.loads(raw or "[]")
        except ValueError:
            aliases = [raw]
        for a in aliases if isinstance(aliases, list) else [aliases]:
            if isinstance(a, str) and a.strip() and a.strip().lower() != (name or "").strip().lower():
                out.append((name or "", a))
    return out


def _idf() -> dict:
    """Word weights learned from the directory: rarity (IDF over all bank names) and
    staying power (the share of a bank's own name/alias pairs that keep the word)."""
    global _IDF
    with _IDF_LOCK:
        if _IDF is None:
            ok = bool(BANKS_DB) and os.path.exists(BANKS_DB)
            recs = bank_match._load(BANKS_DB)["recs"] if ok else []
            df = Counter(t for r in recs for t in set(_tokens(r["name"])))
            n = max(len(recs), 1)
            kept, changed = Counter(), Counter()
            for name, alias in (_alias_pairs(BANKS_DB) if ok else []):
                a, b = set(_tokens(name)), set(_tokens(alias))
                kept.update(a & b)
                changed.update(a ^ b)
            _IDF = {"n": n, "idf": {t: math.log((n + 1) / (c + 1)) + 1.0 for t, c in df.items()},
                    "unseen": math.log(n + 1) + 1.0,
                    "stay": {t: (kept[t] + _PRIOR) / (kept[t] + changed[t] + _PRIOR) for t in kept | changed}}
    return _IDF


def _weight(t: str) -> float:
    """One word's learned weight: rarity x staying power."""
    idx = _idf()
    return idx["idf"].get(t, idx["unseen"]) * idx["stay"].get(t, 1.0)


def _weights(tokens: list[str]) -> dict[str, float]:
    """A name's word weights, scaled to unit length."""
    tf = Counter(tokens)
    w = {t: c * _weight(t) for t, c in tf.items()}
    norm = math.sqrt(sum(v * v for v in w.values())) or 1.0
    return {t: v / norm for t, v in w.items()}


def _acronyms(tokens: list[str]) -> dict[str, list[str]]:
    """Every run of 2-5 words, keyed by its initials ("national association" -> "na")."""
    out: dict[str, list[str]] = {}
    for i in range(len(tokens)):
        for j in range(i + 2, min(i + 5, len(tokens)) + 1):
            out.setdefault("".join(t[0] for t in tokens[i:j]), tokens[i:j])
    return out


def _directed(a: list[str], b: list[str], a_cut: bool) -> float:
    """Order-aware soft TF-IDF of name a against name b: the share of a's weight whose
    words b also carries (the same word, a close spelling, an abbreviation of a run of
    b's words, or, when a was cut short, the start of one of b's words), counting only
    the matches that keep the same order in both names (heaviest rising chain)."""
    if not a or not b:
        return 0.0
    wa, wb = _weights(a), _weights(b)
    pos_b = {u: i for i, u in reversed(list(enumerate(b)))}
    acr = _acronyms(b)
    matches: list[tuple[int, float]] = []  # (position in b, score), in a's word order
    seen: set[str] = set()
    for t in a:
        if t in seen:
            continue
        seen.add(t)
        best, weight, at = 0.0, 0.0, -1
        for u in wb:
            s = 1.0 if t == u else (JaroWinkler.similarity(t, u) if min(len(t), len(u)) > 2 else 0.0)
            if s > best:
                best, weight, at = s, wb[u], pos_b[u]
        if best < _CLOSE and t in acr:  # "na" for "national association"
            run = acr[t]
            best, weight, at = 1.0, math.sqrt(sum(wb[u] ** 2 for u in set(run))), pos_b[run[0]]
        if best < _CLOSE and a_cut and t == a[-1] and len(t) >= 2:
            starts = [u for u in wb if u.startswith(t)]
            if starts:
                u = max(starts, key=lambda x: wb[x])
                best, weight, at = _CLOSE, wb[u], pos_b[u]
        if best >= _CLOSE:
            matches.append((at, wa[t] * weight * best))
    chain = [0.0] * len(matches)
    for i, (pi, si) in enumerate(matches):
        chain[i] = si + max((chain[j] for j in range(i) if matches[j][0] < pi), default=0.0)
    return max(chain, default=0.0)


def _country_words(code: str | None) -> set:
    """The words of the issuing country's own names (ISO short, common, official)."""
    try:
        import pycountry  # noqa: PLC0415
        c = pycountry.countries.get(alpha_2=(code or "").upper())
    except Exception:  # noqa: BLE001
        c = None
    if c is None:
        return set()
    return {t for k in ("name", "common_name", "official_name") for t in _tokens(getattr(c, k, "") or "") if len(t) > 3}


def _variants(read: str) -> list[str]:
    """The read name, plus the same name without the notes card-network tables add:
    a product note after " - " ("BANK OF AMERICA - CONSUMER CREDIT") and a bracketed
    aside ("UBS AG (UNION BANK OF SWITZERLAND)", or one cut short)."""
    out = [read]
    no_note = re.split(r"\s+-\s+", read, maxsplit=1)[0]
    no_aside = re.sub(r"\([^)]*\)?", " ", no_note)
    for v in (no_note, no_aside):
        if v.strip() and v not in out:
            out.append(v)
    return out


def name_similarity(read: str, profile: str, country: str | None = None) -> float:
    """How surely two names name the same bank, 0..1: soft TF-IDF taken in both
    directions (the lower one), with the issuing country's own name set aside (the
    country is already known). The best over the read name's variants."""
    cw = _country_words(country)

    def words(name: str) -> list[str]:
        ws = _tokens(name)
        kept = [t for t in ws if t not in cw]
        return kept or ws

    b = words(profile)
    b_cut = len((profile or "").strip()) >= _CUT
    best = 0.0
    for v in _variants(read or ""):
        a = words(v)
        a_cut = v is read and len(v.strip()) >= _CUT
        best = max(best, min(_directed(a, b, a_cut), _directed(b, a, b_cut)))
    return round(best, 3)


def same_bank_name(read: str, profile: str, country: str | None = None) -> bool:
    return name_similarity(read, profile, country) >= SAME_NAME


def resolve(name, country=None, branch=None, address=None, bic=None, exact_name=False) -> dict:
    """The best bank profile for a bank name (+ country, branch, address, BIC) via the
    matching engine (country-gated, distinctive brand + city/address/BIC), with each
    resolved bank's logo attached. Shape: {read, resolved, match_confidence, alternatives}.
    `logo_url` is the logo route each API serves (/v2/banks/{profile_id}/logo).
    exact_name: keep a match only when the two names name the same bank (soft TF-IDF,
    both ways, >= SAME_NAME); for full legal names such as a card's BIN issuer, where a
    near miss is another bank. The name similarity is returned as `name_match`."""
    res = bank_match.resolve(name, country, branch, address, bic=bic, db_path=BANKS_DB)
    if exact_name and res.get("resolved"):
        res["name_match"] = name_similarity(name, res["resolved"]["name"], country)
        if res["name_match"] < SAME_NAME:
            res["alternatives"] = [res["resolved"], *res.get("alternatives", [])][:4]
            res["resolved"], res["match_confidence"] = None, 0.0
    _enrich(res.get("resolved"))
    res["alternatives"] = [_enrich(a) for a in res.get("alternatives", [])]
    return res


# A profile's status in public words, only where its record states it plainly; the
# directory's own notes on where a record came from never leave the service.
_STATUS = {"active in FDIC snapshot": "active", "listed in ECB register": "active",
           "dissolved date recorded in Wikidata": "dissolved"}


def _enrich(rec: dict | None) -> dict | None:
    """A matched profile as the APIs return it: plus its logo and its country's flag,
    status as "active" / "dissolved" (or left out), no internal source notes."""
    if rec:
        lg = logo(rec["profile_id"])
        rec["logo_url"] = f"/v2/banks/{rec['profile_id']}/logo" if lg else None
        rec["flag_url"] = flags.flag_url(rec.get("country_code"))
        status = rec.get("status")
        rec["status"] = status if status in ("active", "dissolved") else _STATUS.get(status or "")
        rec.pop("logo_source_url", None)
    return rec


def public_match(match: dict | None) -> dict | None:
    """A stored bank match as the APIs show it today (records saved before carried
    the directory's source notes and the logo provider's address)."""
    if isinstance(match, dict):
        _enrich(match.get("resolved"))
        for a in match.get("alternatives") or []:
            _enrich(a)
    return match


def by_bic(bic: str) -> dict | None:
    """The bank profile that holds this BIC (8 or 11 characters), with logo and flag.
    An 11-character BIC matches its own branch row first, else the bank's head (first 8)."""
    b = re.sub(r"[^A-Z0-9]", "", (bic or "").upper())
    if len(b) not in (8, 11) or not (BANKS_DB and os.path.exists(BANKS_DB)):
        return None
    idx = bank_match._load(BANKS_DB)
    cands = [idx["recs"][i] for i in idx["brand4"].get(b[:4], [])]
    exact = [r for r in cands if any(x.upper() == b for x in r["bics"])]
    head = [r for r in cands if any(x.upper()[:8] == b[:8] for x in r["bics"])]
    pick = (exact or head or [None])[0]
    return _enrich(bank_match._shape(pick)) if pick else None


def preload() -> None:
    """Load the match index, word weights and logo directory now (left lazy, the first read pays ~2s)."""
    if BANKS_DB and os.path.exists(BANKS_DB):
        bank_match._load(BANKS_DB)
        _idf()
    logo("")
