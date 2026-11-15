"""SQLite store for one scanning service: its scans and its request log.

Each service (MICR, card) owns its own database file. Nothing is shared
between them, so either can be deployed, scaled or wiped on its own.

`payload` is the scan's API response exactly as later GETs return it. For
cards that response has ALREADY been masked by the caller: this layer never
sees a full card number, so it cannot leak one.

Organisations: behind the VeriSec gateway every request carries the signed-in
organisation (X-VeriSec-Org, set by the gateway from the one sign-in, never by
the browser). `current_org` holds it for the request; every scan and logged
call is filed under it, and every read only returns that organisation's rows.
With no organisation (a local run without the gateway) nothing is filtered.
"""

from __future__ import annotations

import contextvars
import json
import secrets
import sqlite3
import string
import threading
import time
from pathlib import Path
from typing import Any

_ALPHABET = string.ascii_letters + string.digits

#: The organisation of the request being served (see the module note).
current_org: contextvars.ContextVar[str | None] = contextvars.ContextVar("verisec_org", default=None)


def _org() -> str | None:
    return current_org.get()


def new_id(prefix: str) -> str:
    return f"{prefix}_{''.join(secrets.choice(_ALPHABET) for _ in range(16))}"


class Store:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS scans (
                  id          TEXT PRIMARY KEY,
                  created_at  REAL NOT NULL,
                  status      TEXT NOT NULL,
                  source      TEXT NOT NULL,
                  env         TEXT NOT NULL,
                  latency_ms  INTEGER NOT NULL,
                  payload     TEXT NOT NULL,
                  image_path  TEXT
                );
                CREATE INDEX IF NOT EXISTS scans_created ON scans(created_at DESC);
                CREATE TABLE IF NOT EXISTS calls (
                  id      INTEGER PRIMARY KEY AUTOINCREMENT,
                  ts      REAL NOT NULL,
                  method  TEXT NOT NULL,
                  path    TEXT NOT NULL,
                  status  INTEGER NOT NULL,
                  ms      INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS calls_ts ON calls(ts DESC);
                """
            )
            # the organisation each row belongs to (added to older databases in place)
            for table in ("scans", "calls"):
                cols = {r[1] for r in self._db.execute(f"PRAGMA table_info({table})")}
                if "org" not in cols:
                    self._db.execute(f"ALTER TABLE {table} ADD COLUMN org TEXT")
            self._db.execute("CREATE INDEX IF NOT EXISTS scans_org ON scans(org, created_at DESC)")
            self._db.execute("CREATE INDEX IF NOT EXISTS calls_org ON calls(org, ts DESC)")
            self._db.commit()

    # ---- scans -------------------------------------------------------------

    def add_scan(
        self,
        scan_id: str,
        created_at: float,
        status: str,
        source: str,
        env: str,
        latency_ms: int,
        payload: dict[str, Any],
        image_path: str | None,
    ) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO scans (id, created_at, status, source, env, latency_ms, payload, image_path, org)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (scan_id, created_at, status, source, env, latency_ms, json.dumps(payload), image_path, _org()),
            )
            self._db.commit()

    def get_scan(self, scan_id: str) -> tuple[dict[str, Any], str | None] | None:
        org = _org()
        with self._lock:
            if org is None:
                row = self._db.execute("SELECT payload, image_path FROM scans WHERE id = ?", (scan_id,)).fetchone()
            else:
                row = self._db.execute(
                    "SELECT payload, image_path FROM scans WHERE id = ? AND org = ?", (scan_id, org)
                ).fetchone()
        if row is None:
            return None
        return json.loads(row["payload"]), row["image_path"]

    def list_scans(self, limit: int, offset: int) -> tuple[list[dict[str, Any]], int]:
        org = _org()
        where, args = ("", ()) if org is None else (" WHERE org = ?", (org,))
        with self._lock:
            rows = self._db.execute(
                f"SELECT payload FROM scans{where} ORDER BY created_at DESC LIMIT ? OFFSET ?", (*args, limit, offset)
            ).fetchall()
            total = self._db.execute(f"SELECT COUNT(*) FROM scans{where}", args).fetchone()[0]
        return [json.loads(r["payload"]) for r in rows], int(total)

    def scans_since(self, since: float) -> list[dict[str, Any]]:
        org = _org()
        extra, args = ("", (since,)) if org is None else (" AND org = ?", (since, org))
        with self._lock:
            rows = self._db.execute(
                f"SELECT created_at, status, latency_ms, payload FROM scans WHERE created_at >= ?{extra} ORDER BY created_at",
                args,
            ).fetchall()
        # The payload carries an ISO `created_at`; the numeric column wins here
        # because callers bucket and compare by time.
        return [
            {**json.loads(r["payload"]), "created_at": r["created_at"], "status": r["status"], "latency_ms": r["latency_ms"]}
            for r in rows
        ]

    # ---- request log -------------------------------------------------------

    def add_call(self, method: str, path: str, status: int, ms: int) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO calls (ts, method, path, status, ms, org) VALUES (?,?,?,?,?,?)",
                (time.time(), method, path, status, ms, _org()),
            )
            self._db.commit()

    def recent_calls(self, limit: int) -> list[dict[str, Any]]:
        org = _org()
        where, args = ("", ()) if org is None else (" WHERE org = ?", (org,))
        with self._lock:
            rows = self._db.execute(
                f"SELECT ts, method, path, status, ms FROM calls{where} ORDER BY ts DESC LIMIT ?", (*args, limit)
            ).fetchall()
        return [dict(r) for r in rows]

    def call_counts_since(self, since: float) -> list[dict[str, Any]]:
        with self._lock:
            org = _org()
            extra, args = ("", (since,)) if org is None else (" AND org = ?", (since, org))
            rows = self._db.execute(
                f"SELECT method, path, status, ms FROM calls WHERE ts >= ?{extra}", args
            ).fetchall()
        return [dict(r) for r in rows]
