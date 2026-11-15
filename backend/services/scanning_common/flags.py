"""Country flags (one SVG per ISO 3166-1 alpha-2 code), served by the MICR and Card
APIs at /v2/flags/{cc}.svg so any country in a response can carry a `flag_url`."""
from __future__ import annotations

import os
import re
from pathlib import Path

FLAGS_DIR = Path(os.environ.get("FLAGS_DIR", str(Path(__file__).resolve().parents[3] / "frontend" / "public" / "flags")))


def flag_url(code: str | None) -> str | None:
    """The flag route for a country code, or None when there is no flag for it."""
    cc = (code or "").strip().lower()
    return f"/v2/flags/{cc}.svg" if re.fullmatch(r"[a-z]{2}", cc) and (FLAGS_DIR / f"{cc}.svg").exists() else None


def flag_path(name: str) -> Path | None:
    """The file behind /v2/flags/{name}, only for a well-formed "cc.svg" that exists."""
    if not re.fullmatch(r"[a-z]{2}\.svg", name or ""):
        return None
    p = FLAGS_DIR / name
    return p if p.exists() else None
