"""Run a Linux recognizer binary on one image and return its JSON result.

The MICR and card engines ship as a `recognizer` executable plus shared
libraries and model assets. Each call writes the image to a temp file, runs
the executable, and pulls the JSON document out of the SDK log line that
carries it (`... result: {...}`, printed on stderr).

Both engines need Doubango's own TensorFlow r1.14 build ahead of anything
else on `LD_LIBRARY_PATH`; the stock Google build crashes them. That path is
configuration (`lib_dirs`), not something this module guesses.

One call runs at a time per engine. Each spawn loads TensorFlow and the
models (roughly 1 to 2 s and a few hundred MB), so letting requests pile up
in parallel only thrashes memory. Callers queue on the semaphore instead.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

_RESULT = re.compile(r"result:\s*(\{.*\})")


class EngineError(RuntimeError):
    """The engine could not produce a result (missing files, crash, timeout)."""


class Recognizer:
    def __init__(
        self,
        name: str,
        bin_dir: Path,
        assets_dir: Path,
        lib_dirs: list[Path],
        extra_args: list[str] | None = None,
        timeout: float = 90.0,
    ) -> None:
        self.name = name
        self.bin_dir = bin_dir
        self.assets_dir = assets_dir
        self.lib_dirs = lib_dirs
        self.extra_args = extra_args or []
        self.timeout = timeout
        self._gate = asyncio.Semaphore(1)

    @property
    def executable(self) -> Path:
        return self.bin_dir / "recognizer"

    def missing(self) -> list[str]:
        """What is absent on this host. Empty means the engine can run."""
        out = []
        if not self.executable.exists():
            out.append(str(self.executable))
        if not self.assets_dir.exists():
            out.append(str(self.assets_dir))
        out += [str(d) for d in self.lib_dirs if not d.exists()]
        return out

    async def run(self, jpeg: bytes, extra_args: list[str] | None = None) -> tuple[dict[str, Any], int]:
        """Returns (engine JSON, wall-clock ms). Raises EngineError."""
        if self.missing():
            raise EngineError(f"{self.name}: engine files missing: {', '.join(self.missing())}")
        async with self._gate:
            return await asyncio.to_thread(self._run_sync, jpeg, extra_args or [])

    def _run_sync(self, jpeg: bytes, extra_args: list[str]) -> tuple[dict[str, Any], int]:
        tmp = Path(tempfile.mkdtemp(prefix=f"{self.name}_"))
        try:
            image = tmp / "in.jpg"
            image.write_bytes(jpeg)

            env = os.environ.copy()
            # Doubango's TF first, then the libraries beside the executable.
            env["LD_LIBRARY_PATH"] = ":".join(
                [*(str(d) for d in self.lib_dirs), str(self.bin_dir), env.get("LD_LIBRARY_PATH", "")]
            ).rstrip(":")

            args = [
                str(self.executable),
                "--image", str(image),
                "--assets", str(self.assets_dir),
                *self.extra_args,
                *extra_args,
            ]
            started = time.perf_counter()
            try:
                done = subprocess.run(
                    args,
                    cwd=str(self.bin_dir),
                    env=env,
                    # The recognizer reads stdin; without EOF it can block forever.
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=self.timeout,
                )
            except subprocess.TimeoutExpired as exc:
                raise EngineError(f"{self.name}: timed out after {self.timeout:.0f}s") from exc
            ms = int((time.perf_counter() - started) * 1000)

            text = (done.stdout or b"").decode("utf-8", "replace") + "\n" + (done.stderr or b"").decode(
                "utf-8", "replace"
            )
            matches = list(_RESULT.finditer(text))
            if not matches:
                tail = " | ".join(text.strip().splitlines()[-4:])
                raise EngineError(f"{self.name}: no result (exit {done.returncode}): {tail[:400]}")
            try:
                return json.loads(matches[-1].group(1)), ms
            except json.JSONDecodeError as exc:
                raise EngineError(f"{self.name}: unreadable result JSON") from exc
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
