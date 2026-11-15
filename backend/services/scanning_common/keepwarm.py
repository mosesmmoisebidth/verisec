"""Keep an idle service fast.

After a long idle spell the OS can page an engine's models and our lookup tables
out of memory (seen locally: 3 idle hours, then one cheque read took 22 s instead
of 3 s and a card read 5 s instead of 1 s). `start()` runs the service's own
`warm` function (one sample through the engine, a touch of each lookup) every
`KEEP_WARM_S` seconds while no real request has come in, so the pages stay
resident. `kick()` runs it at once, in the background, when the portal opens a
page that is about to read; that call does nothing while the service is busy or
was just warmed.

    KEEP_WARM_S   seconds between warm-ups while idle (default 240; 0 = off)
"""

from __future__ import annotations

import os
import threading
import time
from typing import Callable

_EVERY = float(os.environ.get("KEEP_WARM_S", "240") or 0)
_state = {"used": time.time(), "warmed": time.time(), "busy": False}
_lock = threading.Lock()
_warm: dict[str, Callable[[], None]] = {}


def touch() -> None:
    """A real request came in: the service is in use, no warm-up needed."""
    _state["used"] = time.time()


def _run(name: str) -> None:
    fn = _warm.get(name)
    if fn is None:
        return
    t = time.perf_counter()
    try:
        fn()
    except Exception as exc:  # noqa: BLE001 -- a failed warm-up only means the next read starts colder
        print(f"[{name}] warm-up failed: {str(exc)[:160]}", flush=True)
    finally:
        ms = int((time.perf_counter() - t) * 1000)
        _state["warmed"] = time.time()
        _state["busy"] = False
        if ms > 3000:  # a slow warm-up means memory had been paged out: worth knowing
            print(f"[{name}] warm-up took {ms} ms (was paged out)", flush=True)


def kick(name: str, min_idle_s: float = 60) -> bool:
    """Warm now in the background, unless in use or warmed in the last `min_idle_s`."""
    now = time.time()
    with _lock:
        if _state["busy"] or now - max(_state["used"], _state["warmed"]) < min_idle_s:
            return False
        _state["busy"] = True
    threading.Thread(target=_run, args=(name,), daemon=True, name=f"{name}-warm").start()
    return True


def start(name: str, warm: Callable[[], None]) -> None:
    """Register the service's warm-up and keep it warm while idle."""
    _warm[name] = warm
    if _EVERY <= 0:
        return

    def loop() -> None:
        while True:
            time.sleep(_EVERY / 4)
            if time.time() - max(_state["used"], _state["warmed"]) >= _EVERY:
                kick(name, min_idle_s=_EVERY)

    threading.Thread(target=loop, daemon=True, name=f"{name}-keepwarm").start()
