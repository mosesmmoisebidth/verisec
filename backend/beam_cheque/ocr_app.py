"""Beam GPU endpoint: the cheque box detector (PP-OCRv6_medium_det).

The same model and the same settings as /detect in the box's reader service, on a GPU
instead of a shared CPU. Boxes only, no reading. POST {image_b64} -> {width, height, boxes, ms}.
A {"warm": true} ping keeps the container up.
"""
from beta9 import GpuType, Image, Volume, endpoint

DET_MIN_SCORE = 0.2  # the reader service's DET_MIN_SCORE

image = (
    Image(python_version="python3.11", base_image="nvidia/cuda:12.9.1-devel-ubuntu22.04")
    # One command on purpose: this Beam client keeps only the last entry of the list.
    .run_commands([
        "apt-get update && apt-get install -y libgl1 libglib2.0-0 libgomp1 aria2"
        # the 1.7 GB wheel sits in Beijing: many parallel connections instead of one slow one
        " && aria2c -x 16 -s 16 -k 20M --console-log-level=warn --summary-interval=20 -d /tmp"
        " -o paddlepaddle_gpu-3.1.0-cp311-cp311-linux_x86_64.whl"
        " https://paddle-whl.bj.bcebos.com/stable/cu126/paddlepaddle-gpu/paddlepaddle_gpu-3.1.0-cp311-cp311-linux_x86_64.whl"
        " && pip install /tmp/paddlepaddle_gpu-3.1.0-cp311-cp311-linux_x86_64.whl"
        " && rm -f /tmp/paddlepaddle_gpu-3.1.0-cp311-cp311-linux_x86_64.whl"
        " && pip install paddleocr==3.7.0 pillow numpy"
    ])
)
cache = Volume(name="ocr-cache", mount_path="/cache")


def load_model():
    import numpy as np
    from paddleocr import TextDetection

    det = TextDetection(model_name="PP-OCRv6_medium_det", device="gpu:0")
    # one real pass so the first cheque does not pay for graph setup
    blank = np.full((480, 1024, 3), 255, dtype=np.uint8)
    for _ in range(3):
        list(det.predict(blank, box_thresh=DET_MIN_SCORE))
    import paddle
    print(f"[ocr] ready, device={paddle.device.get_device()}", flush=True)
    return det


@endpoint(
    name="cheque-ocr",
    gpu=GpuType.RTX4090,
    gpu_count=1,
    cpu=2,
    memory="8Gi",
    image=image,
    volumes=[cache],
    on_start=load_model,
    keep_warm_seconds=120,
    timeout=60,
    env={"PADDLE_PDX_CACHE_HOME": "/cache/paddlex", "PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK": "True"},
)
def detect(context, image_b64: str = "", warm: bool = False):
    if warm or not image_b64:
        return {"ok": True, "warm": True}

    import base64
    import io
    import time

    import numpy as np
    from PIL import Image as PILImage, ImageOps

    t = time.perf_counter()
    img = ImageOps.exif_transpose(PILImage.open(io.BytesIO(base64.b64decode(image_b64)))).convert("RGB")
    res = list(context.on_start_value.predict(np.array(img)[:, :, ::-1].copy(), box_thresh=DET_MIN_SCORE))
    d = res[0].json["res"] if res else {}
    boxes = [{"box": [round(float(v), 1) for pt in poly for v in pt], "score": round(float(sc), 3)}
             for poly, sc in zip(d.get("dt_polys") or [], d.get("dt_scores") or [])]
    return {"width": img.width, "height": img.height, "boxes": boxes,
            "ms": int((time.perf_counter() - t) * 1000)}
