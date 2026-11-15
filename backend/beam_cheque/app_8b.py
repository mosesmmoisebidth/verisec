"""Beam serverless endpoint: Qwen3-VL-8B cheque reader (smaller sibling of app.py).

Same request/response shape, prompt and snapshot approach as the 30B endpoint in
app.py; the point of the 8B is a much smaller GPU snapshot, so a cold restore is
faster. Which 8B build to serve is chosen at deploy time:

    CHEQUE_8B_MODEL=cyankiwi/Qwen3-VL-8B-Instruct-AWQ-4bit CHEQUE_8B_NAME=cheque-vlm-8b \
        beam deploy app_8b.py:read_cheque
    CHEQUE_8B_MODEL=Qwen/Qwen3-VL-8B-Instruct-FP8 CHEQUE_8B_NAME=cheque-vlm-8b-fp8 CHEQUE_8B_MEM=20Gi \
        beam deploy app_8b.py:read_cheque

Both values are baked into the endpoint's env, so the container reads the same ones.
"""
import os

from beta9 import GpuType, Image, Volume, endpoint

MODEL = os.environ.get("CHEQUE_8B_MODEL", "cyankiwi/Qwen3-VL-8B-Instruct-AWQ-4bit")
NAME = os.environ.get("CHEQUE_8B_NAME", "cheque-vlm-8b")
# RAM must exceed the snapshot (a restore stages the GPU contents in host memory).
MEM = os.environ.get("CHEQUE_8B_MEM", "16Gi")

SYS = (
    "You read bank cheques from ANY country. You are given the FACE image of a cheque. Read ONLY the "
    "fields on the face. NEVER read, output, copy or alter the MICR code line (the band of stylised "
    "digits and symbols along the BOTTOM edge) - another system owns it. Read handwriting carefully; "
    "read the amount in words and in figures INDEPENDENTLY and set amount_agree to whether they match. "
    "If a field is absent or illegible use null; NEVER invent a value. Output ONLY a single-line MINIFIED "
    "JSON (no spaces, no newlines) with EXACTLY these keys: bank_name, bank_country (ISO 3166-1 alpha-2), "
    "branch, bank_address, payee, drawer, amount_words, amount_figures, amount_numeric, amount_agree, "
    "currency (ISO 4217), date_raw, date_iso (YYYY-MM-DD), cheque_number, account_number, crossing, "
    "signature_present."
)

image = (
    Image(python_version="python3.11")
    .add_python_packages(["vllm==0.30.0", "pillow"])
    # No nvcc in the image: drop flashinfer so vLLM uses kernels that need no JIT.
    .run_commands(["pip uninstall -y flashinfer-python flashinfer || true"])
)
cache = Volume(name="vllm-cache", mount_path="/cache")


def load_model():
    import contextlib

    # Beam's worker stdout fd can't be dup'ed; vLLM's suppress_stdout() would crash.
    import vllm.utils.system_utils as _su
    _su.suppress_stdout = contextlib.nullcontext
    try:
        import vllm.distributed.parallel_state as _ps
        _ps.suppress_stdout = contextlib.nullcontext
    except Exception:
        pass
    from vllm import LLM, SamplingParams

    llm = LLM(
        model=os.environ.get("CHEQUE_8B_MODEL", MODEL),
        max_model_len=4096,
        max_num_seqs=2,
        # Size the KV cache explicitly. Left to gpu_memory_utilization, an 8B on a
        # 24 GB card would reserve ~10 GB of empty KV that ends up in the snapshot
        # and slows every cold restore. 1 GiB holds two full cheque requests.
        kv_cache_memory_bytes=1 << 30,
        limit_mm_per_prompt={"image": 1},
        trust_remote_code=True,
        compilation_config={"cudagraph_capture_sizes": [1, 2], "max_cudagraph_capture_size": 2},
    )
    _warm(llm, SamplingParams)
    return llm


def _warm(llm, SamplingParams):
    """One image read before the snapshot so every kernel is compiled into it."""
    import base64
    import io

    from PIL import Image as PILImage, ImageDraw

    img = PILImage.new("RGB", (1024, 480), "white")
    ImageDraw.Draw(img).text((40, 40), "PAY Example Name   1,000,000", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    msgs = [
        {"role": "system", "content": SYS},
        {"role": "user", "content": [
            {"type": "text", "text": "Read this cheque. Minified JSON only."},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}},
        ]},
    ]
    try:
        llm.chat(msgs, SamplingParams(max_tokens=32, temperature=0))
    except Exception:
        pass
    _shrink_for_snapshot()


def _shrink_for_snapshot():
    """Free cached activation blocks and heap pages so they stay out of the snapshot."""
    import ctypes
    import gc

    import torch

    gc.collect()
    torch.cuda.synchronize()
    torch.cuda.empty_cache()
    try:
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass
    print(f"[snapshot] GPU reserved after trim: {torch.cuda.memory_reserved() / 2**30:.2f} GiB", flush=True)


@endpoint(
    name=NAME,
    gpu=GpuType.RTX4090,
    gpu_count=1,
    cpu=2,
    memory=MEM,
    image=image,
    volumes=[cache],
    on_start=load_model,
    keep_warm_seconds=15,
    checkpoint_enabled=True,
    timeout=600,
    env={
        "HF_HOME": "/cache/hf",
        "VLLM_CACHE_ROOT": "/cache/vllm",
        "VLLM_ENABLE_V1_MULTIPROCESSING": "0",
        "VLLM_USE_FLASHINFER_SAMPLER": "0",
        "CHEQUE_8B_MODEL": MODEL,
    },
)
def read_cheque(context, image_b64: str = "", system: str = "", prompt: str = "", max_tokens: int = 320,
                warm: bool = False):
    if warm or not image_b64:
        return {"ok": True, "warm": True}

    from vllm import SamplingParams

    llm = context.on_start_value
    messages = [
        {"role": "system", "content": system or SYS},
        {"role": "user", "content": [
            {"type": "text", "text": prompt or "Read this cheque. Minified JSON only."},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + image_b64}},
        ]},
    ]
    out = llm.chat(messages, SamplingParams(max_tokens=max_tokens, temperature=0))
    return {"content": out[0].outputs[0].text}
