"""In-process MICR via the Doubango SWIG binding: load the engine ONCE (deep-learning
models load at startup, not on every request). Drop-in for scanning_common.engine
.Recognizer -- same async run(jpeg, extra_args) -> (result_dict, wall_ms).

Requires the binding importable (ultimateMicrSdk.py + _ultimateMicrSdk.so on sys.path)
and LD_LIBRARY_PATH covering Doubango's TF + the SDK libs; run.sh sets both before
launch. The result dict matches the subprocess recognizer's, so _shape is unchanged.
"""
from __future__ import annotations

import asyncio
import io
import json
import threading
import time
from pathlib import Path

from scanning_common.engine import EngineError


class InProcMicr:
    name = "micr"

    def __init__(self, assets_folder: str, fmt: str = "e13b+cmc7",
                 backprop: bool = True, ielcd: bool = True) -> None:
        import ultimateMicrSdk as sdk  # raises if the binding is not built/available
        self.sdk = sdk
        cfg = {
            "debug_level": "warn",
            "num_threads": -1,
            "gpgpu_enabled": True,
            "backprop": backprop,
            "interpolation": "bilinear",
            "roi": [0, 0, 0, 0],
            "min_score": 0.4,
            "score_type": "min",
            "assets_folder": str(assets_folder),
            "format": fmt,
            "ielcd": ielcd,
        }
        r = sdk.UltMicrSdkEngine_init(json.dumps(cfg))
        if not r.isOK():
            raise EngineError("micr init failed: " + r.phrase())
        self._lock = threading.Lock()  # the engine is single-threaded; serialize calls
        self._warm(Path(assets_folder) / "images")

    def _warm(self, images: Path) -> None:
        """First process() loads all models (~3s); do it once now so real requests are
        fast. A blank image never reaches the recognizer, so warm on the SDK's own
        E-13B and CMC-7 samples through the same path real requests take."""
        samples = [p for p in (images / "e13b_1280x720.jpg", images / "cmc7_1280x720.jpg") if p.exists()]
        for p in samples:
            try:
                self._run_sync(p.read_bytes())
            except Exception:
                pass
        if samples:
            return
        try:
            from PIL import Image
            blank = Image.new("L", (128, 64), 255)
            with self._lock:
                self.sdk.UltMicrSdkEngine_process(
                    self.sdk.ULTMICR_SDK_IMAGE_TYPE_Y, blank.tobytes(), 128, 64, 0, 1)
        except Exception:
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
        except Exception:
            pass
        if im.mode == "L":
            itype = self.sdk.ULTMICR_SDK_IMAGE_TYPE_Y
        else:
            if im.mode != "RGB":
                im = im.convert("RGB")
            itype = self.sdk.ULTMICR_SDK_IMAGE_TYPE_RGB24
        w, h = im.size
        data = im.tobytes()
        t = time.perf_counter()
        with self._lock:
            res = self.sdk.UltMicrSdkEngine_process(itype, data, w, h, 0, 1)
        ms = int((time.perf_counter() - t) * 1000)
        if not res.isOK():
            raise EngineError("micr process failed: " + res.phrase())
        try:
            return json.loads(res.json()), ms
        except Exception as exc:  # noqa: BLE001
            raise EngineError("micr result not JSON") from exc
