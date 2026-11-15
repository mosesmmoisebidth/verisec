"""In-process wrapper for the C++ cheque normaliser (cpp/libchequeprep.so, see
cpp/chequeprep.cpp and cpp/build.sh).

normalize(image_bytes) turns any photo or scan of a cheque into the same flat,
fixed-size, evenly lit image (orientation, corners + perspective warp, quality gates,
lighting), so the vision model sees the same framing every time. Runs inside this
process (no subprocess, no temp files); ctypes releases the GIL during the call, so
other requests keep running.

    status, image, meta = normalize(raw)
    status 0 = ok; image = JPEG bytes (or PNG with jpeg_quality=0); meta = metrics + ms
"""
from __future__ import annotations

import ctypes
import json
import os
import threading
from pathlib import Path

LIB = Path(os.environ.get("CHEQUEPREP_LIB", str(Path(__file__).resolve().parent / "cpp" / "libchequeprep.so")))

OK, NOT_FOUND, TOO_FAR, BLURRY, GLARE, DECODE_ERROR = range(6)

_lib = None
_lock = threading.Lock()


def _load():
    global _lib
    with _lock:
        if _lib is None:
            lib = ctypes.CDLL(str(LIB))
            lib.cp_preprocess.argtypes = [
                ctypes.c_char_p, ctypes.c_size_t,                 # image bytes
                ctypes.c_int, ctypes.c_int,                       # out_w, out_h
                ctypes.c_double, ctypes.c_double, ctypes.c_double,  # min_doc_frac, blur_min_var, glare_max_frac
                ctypes.c_int, ctypes.c_int, ctypes.c_int,         # png_level, jpeg_quality, keep_on_reject
                ctypes.POINTER(ctypes.POINTER(ctypes.c_uint8)), ctypes.POINTER(ctypes.c_size_t),
                ctypes.c_char_p, ctypes.c_size_t,                 # meta json buffer
            ]
            lib.cp_preprocess.restype = ctypes.c_int
            lib.cp_free.argtypes = [ctypes.POINTER(ctypes.c_uint8)]
            lib.cp_free.restype = None
            _lib = lib
    return _lib


def available() -> bool:
    try:
        _load()
        return True
    except OSError:
        return False


def normalize(data: bytes, *, out_w: int = 1120, out_h: int = 672, min_doc_frac: float = 0.6,
              blur_min_var: float = 100.0, glare_max_frac: float = 0.05, jpeg_quality: int = 95,
              png_level: int = 1, keep_on_reject: bool = False) -> tuple[int, bytes | None, dict]:
    """Normalise one cheque image. Returns (status, image bytes or None, metadata)."""
    lib = _load()
    out = ctypes.POINTER(ctypes.c_uint8)()
    out_len = ctypes.c_size_t(0)
    meta = ctypes.create_string_buffer(2048)
    status = lib.cp_preprocess(data, len(data), out_w, out_h, min_doc_frac, blur_min_var, glare_max_frac,
                               png_level, jpeg_quality, int(keep_on_reject),
                               ctypes.byref(out), ctypes.byref(out_len), meta, len(meta))
    try:
        image = ctypes.string_at(out, out_len.value) if out_len.value else None
    finally:
        if out:
            lib.cp_free(out)
    return status, image, json.loads(meta.value.decode() or "{}")
