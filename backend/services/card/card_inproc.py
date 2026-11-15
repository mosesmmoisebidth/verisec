"""In-process card reading via the Doubango SWIG binding: load the engine ONCE (the
deep-learning models load at startup, not on every request). Drop-in for
scanning_common.engine.Recognizer -- same async run(jpeg, extra_args) -> (result, ms).

Requires the binding importable (ultimateCreditCardSdk.py + _ultimateCreditCardSdk.so
on sys.path) and LD_LIBRARY_PATH covering Doubango's TF + the SDK libs; run.sh sets
both before launch. The settings are the ones the subprocess recognizer runs with
(its sample config, rectification and IELCD on), and the result dict is the same
JSON it prints, so the card shaping is unchanged.
"""
from __future__ import annotations

import asyncio
import io
import json
import threading
import time
from pathlib import Path

from scanning_common.engine import EngineError


class InProcCard:
    name = "card"

    def __init__(self, assets_folder: str, rectify: bool = True, ielcd: bool = True) -> None:
        import ultimateCreditCardSdk as sdk  # raises if the binding is not built/available
        self.sdk = sdk
        cfg = {
            "debug_level": "warn",
            "debug_write_input_image_enabled": False,
            "num_threads": -1,
            "gpgpu_enabled": True,
            "detect_roi": [0, 0, 0, 0],
            "detect_minscore": 0.5,
            "recogn_minscore": 0.2,
            "recogn_score_type": "min",
            "assets_folder": str(assets_folder),
            "recogn_rectify_enabled": rectify,
            "ielcd_enabled": ielcd,
        }
        r = sdk.UltCreditCardSdkEngine_init(json.dumps(cfg))
        if not r.isOK():
            raise EngineError("card init failed: " + r.phrase())
        self._lock = threading.Lock()  # the engine is single-threaded; serialize calls
        self._warm(Path(assets_folder) / "images")

    def _warm(self, images: Path) -> None:
        """The first process() loads every model; do it once now, on the SDK's own
        sample card, so real requests are fast."""
        for p in (images / "Credit_Card.jpeg", images / "revolut.jpg"):
            if p.exists():
                try:
                    self._run_sync(p.read_bytes())
                    return
                except Exception:  # noqa: BLE001 -- a failed warm-up only means the first read is slower
                    pass

    def missing(self):  # parity with Recognizer.missing()
        return []

    async def run(self, jpeg: bytes, extra_args=None):
        return await asyncio.to_thread(self._run_sync, jpeg)

    def _run_sync(self, jpeg: bytes):
        from PIL import Image, ImageOps
        im = Image.open(io.BytesIO(jpeg))
        try:
            im = ImageOps.exif_transpose(im)
        except Exception:  # noqa: BLE001
            pass
        if im.mode == "L":
            itype = self.sdk.ULTCCARD_SDK_IMAGE_TYPE_Y
        else:
            if im.mode != "RGB":
                im = im.convert("RGB")
            itype = self.sdk.ULTCCARD_SDK_IMAGE_TYPE_RGB24
        w, h = im.size
        data = im.tobytes()
        t = time.perf_counter()
        with self._lock:
            res = self.sdk.UltCreditCardSdkEngine_process(itype, data, w, h, 0, 1)
        ms = int((time.perf_counter() - t) * 1000)
        if not res.isOK():
            raise EngineError("card process failed: " + res.phrase())
        try:
            return json.loads(res.json() or "{}"), ms
        except Exception as exc:  # noqa: BLE001
            raise EngineError("card result not JSON") from exc
