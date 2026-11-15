"""Beam serverless endpoint: Qwen3-VL-30B-A3B (AWQ) cheque reader.

Accuracy-first (full 30B reasoning model), with fast cold starts and $0 idle:
  * model cached on a Volume (no re-download),
  * loaded ONCE in on_start,
  * checkpoint_enabled=True -> Beam snapshots the container with the model already
    on the GPU and restores it in seconds on a cold request,
  * keep_warm_seconds=90 -> after 90s with no traffic it scales to zero (no charge),
  * a {"warm": true} ping wakes it ahead of a read (the UI sends one when a deep read
    becomes likely), so the restore overlaps the user picking a file.

Reads the FACE fields only; it is told never to touch the MICR code line (another
engine owns that, and its JSON is merged in separately).
"""
import os

from beta9 import Image, Volume, GpuType, endpoint

MODEL = "QuantTrio/Qwen3-VL-30B-A3B-Instruct-AWQ"
# Identical repeatability: the same image must give byte-identical output every
# time. Two things break that on a GPU:
#   * prefix caching: a repeat read reuses cached KV and takes a different
#     arithmetic path. Off by default (CHEQUE_PREFIX_CACHE=1 turns it back on).
#   * kernels whose summation order depends on the batch: fixed by vLLM's
#     batch-invariant mode (CHEQUE_BATCH_INVARIANT=1). On this AWQ MoE model that
#     mode JIT-compiles its kernels with nvcc, so it also switches the image to a
#     CUDA devel base that ships the compiler.
# Both values are baked into the endpoint env, so the container sees the same ones.
PREFIX_CACHE = os.environ.get("CHEQUE_PREFIX_CACHE", "0") == "1"
BATCH_INVARIANT = os.environ.get("CHEQUE_BATCH_INVARIANT", "0") == "1"

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
    Image(python_version="python3.11",
          base_image="nvidia/cuda:12.9.1-devel-ubuntu22.04" if BATCH_INVARIANT else None)
    .add_python_packages(["vllm==0.30.0", "pillow"])
    # flashinfer JIT-compiles its sampling/MoE kernels at runtime and needs nvcc
    # (absent) -> "sampling.so: cannot open shared object file". Remove it so vLLM
    # falls back to flash-attn + native sampler + triton MoE, none of which need nvcc.
    .run_commands(["pip uninstall -y flashinfer-python flashinfer || true"])
)
cache = Volume(name="vllm-cache", mount_path="/cache")


def load_model():
    import contextlib
    # Beam's worker has std fds that vLLM's suppress_stdout() can't dup (it does
    # os.dup(sys.stdout.fileno()) -> "Bad file descriptor" during distributed init).
    # Neutralize it (it only hides a little init noise) WITHOUT redirecting streams,
    # so vLLM's real logs stay visible.
    import vllm.utils.system_utils as _su
    _su.suppress_stdout = contextlib.nullcontext
    try:
        import vllm.distributed.parallel_state as _ps
        _ps.suppress_stdout = contextlib.nullcontext
    except Exception:
        pass
    from vllm import LLM, SamplingParams
    llm = LLM(
        model=MODEL,
        quantization="awq",
        dtype="float16",
        max_model_len=4096,
        # One cheque at a time: reserve KV for 2 sequences, not ~8. Less pre-allocated
        # VRAM means a smaller GPU snapshot and a faster restore.
        max_num_seqs=2,
        gpu_memory_utilization=0.86,
        limit_mm_per_prompt={"image": 1},
        trust_remote_code=True,
        enable_prefix_caching=PREFIX_CACHE,
        # CUDA graphs ON (eager mode was the main cause of ~11s reads). Capture only
        # tiny batch sizes: little VRAM, quick capture, frozen into the snapshot.
        compilation_config={"cudagraph_capture_sizes": [1, 2], "max_cudagraph_capture_size": 2},
    )
    _warm(llm, SamplingParams)
    return llm


def _warm(llm, SamplingParams):
    """Run one real image read before Beam takes the snapshot, so the vision
    encoder, MoE and sampler kernels are all compiled and frozen into it. A cold
    restore then answers right away instead of compiling on the first cheque."""
    import base64
    import io
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (1024, 480), "white")
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
    """Everything left in GPU and CPU memory goes into the snapshot, and restore
    time scales with snapshot size. After the warm read PyTorch still holds ~1.6 GiB
    of freed activation blocks in its cache, and glibc keeps freed heap pages. Hand
    both back so the snapshot holds only the weights, KV cache and CUDA graphs."""
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
    name="cheque-vlm",
    gpu=GpuType.RTX4090,
    gpu_count=1,
    # Beam bills CPU cores and RAM per second on top of the GPU, so size them to
    # what the model actually uses: the engine runs in-process (CPU is light) and
    # the process holds ~1 GiB of normal RAM. RAM still has to exceed the ~19.4 GiB
    # snapshot, because a restore stages the GPU contents in host memory first.
    cpu=2,
    memory="24Gi",
    image=image,
    volumes=[cache],
    on_start=load_model,
    # After a wake-up ping or a read, stay up 90s so the user's upload lands on a
    # loaded model. Billed only during that window, $0 once it scales down.
    keep_warm_seconds=90,
    checkpoint_enabled=True,
    timeout=600,
    env={
        "HF_HOME": "/cache/hf",
        "VLLM_CACHE_ROOT": "/cache/vllm",
        # Run vLLM's engine core in-process. In Beam's worker the child process's
        # stdout fd is closed, which makes vLLM's suppress_stdout() crash with
        # "Bad file descriptor"; in-process avoids that and keeps logs working.
        "VLLM_ENABLE_V1_MULTIPROCESSING": "0",
        # Belt-and-suspenders: never route sampling through flashinfer (no nvcc JIT).
        "VLLM_USE_FLASHINFER_SAMPLER": "0",
        "CHEQUE_PREFIX_CACHE": "1" if PREFIX_CACHE else "0",
        "CHEQUE_BATCH_INVARIANT": "1" if BATCH_INVARIANT else "0",
        **({"VLLM_BATCH_INVARIANT": "1", "CUDA_HOME": "/usr/local/cuda"} if BATCH_INVARIANT else {}),
    },
)
def read_cheque(context, image_b64: str = "", system: str = "", prompt: str = "", max_tokens: int = 320,
                warm: bool = False):
    # A warm ping only wakes the container (restoring the snapshot); it does no read.
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
