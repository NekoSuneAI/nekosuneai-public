import argparse
import json
import os
import platform
import subprocess
import sys

from faster_whisper import WhisperModel


def detect_cpu_vendor() -> str:
    vendor = ""
    proc = platform.processor() or ""
    uname = platform.uname().processor or ""
    env_proc = os.environ.get("PROCESSOR_IDENTIFIER", "")
    combined = " ".join([proc, uname, env_proc]).strip().lower()
    if "intel" in combined:
        vendor = "intel"
    elif "amd" in combined:
        vendor = "amd"
    elif combined:
        vendor = "other"
    else:
        vendor = "unknown"
    return vendor


def detect_nvidia_gpus() -> list:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name",
                "--format=csv,noheader",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        return names
    except Exception:
        return []


def detect_cuda_available() -> bool:
    try:
        result = subprocess.run(
            ["nvidia-smi"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.returncode == 0
    except Exception:
        return False


def resolve_device(device: str, cuda_available: bool) -> str:
    if not device:
        return "cpu"
    device = device.lower()
    if device in ("auto", "cuda_if_available", "auto_cuda"):
        return "cuda" if cuda_available else "cpu"
    if device in ("gpu", "cuda"):
        return "cuda" if cuda_available else "cpu"
    if device in ("cpu",):
        return "cpu"
    return device


def resolve_compute_type(compute_type: str, device: str) -> str:
    if not compute_type:
        return "int8" if device == "cpu" else "float16"
    compute_type = compute_type.lower()
    if compute_type in ("auto", "default"):
        return "int8" if device == "cpu" else "float16"
    return compute_type


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="base")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute_type", default="int8")
    parser.add_argument("--models_dir", default="")
    args = parser.parse_args()

    cpu_vendor = detect_cpu_vendor()
    gpus = detect_nvidia_gpus()
    cuda_available = detect_cuda_available()

    device = resolve_device(args.device, cuda_available)
    compute_type = resolve_compute_type(args.compute_type, device)

    download_root = args.models_dir or None
    try:
        model = WhisperModel(
            args.model,
            device=device,
            compute_type=compute_type,
            download_root=download_root,
        )
    except Exception as exc:
        if device == "cuda":
            # Fallback to CPU if CUDA is not available in the environment.
            device = "cpu"
            compute_type = resolve_compute_type("auto", device)
            model = WhisperModel(
                args.model,
                device=device,
                compute_type=compute_type,
                download_root=download_root,
            )
        else:
            raise exc

    segments, _ = model.transcribe(args.audio)
    text = " ".join(segment.text.strip() for segment in segments).strip()

    sys.stdout.write(
        json.dumps(
            {
                "text": text,
                "device": device,
                "compute_type": compute_type,
                "cpu_vendor": cpu_vendor,
                "cuda_available": cuda_available,
                "nvidia_gpus": gpus,
                "supported_gpus": gpus if cuda_available else [],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
