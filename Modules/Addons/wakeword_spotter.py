import argparse
import json
import sys
import wave

import numpy as np

import sherpa_onnx


def read_wav(path):
    with wave.open(path, "rb") as wf:
        sample_rate = wf.getframerate()
        num_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        frames = wf.readframes(wf.getnframes())

    if sampwidth != 2:
        raise ValueError("Expected 16-bit PCM WAV audio.")
    audio = np.frombuffer(frames, dtype=np.int16)
    if num_channels > 1:
        audio = audio.reshape(-1, num_channels).mean(axis=1).astype(np.int16)
    audio = audio.astype(np.float32) / 32768.0
    return sample_rate, audio


def run_keyword_spotter(args):
    spotter = sherpa_onnx.KeywordSpotter(
        tokens=args.tokens,
        encoder=args.encoder,
        decoder=args.decoder,
        joiner=args.joiner,
        keywords_file=args.keywords_file,
        num_threads=args.num_threads,
        sample_rate=args.sample_rate,
        feature_dim=args.feature_dim,
        max_active_paths=args.max_active_paths,
        keywords_score=args.keywords_score,
        keywords_threshold=args.keywords_threshold,
        num_trailing_blanks=args.num_trailing_blanks,
        provider=args.provider,
        device=args.device,
    )

    sample_rate, audio = read_wav(args.wav)
    if sample_rate != args.sample_rate:
        # Resampling is not performed; warn but proceed.
        pass

    stream = spotter.create_stream()
    chunk_size = int(args.sample_rate * args.chunk_seconds)
    if chunk_size <= 0:
        chunk_size = int(args.sample_rate * 0.2)

    triggered = False
    keyword = ""
    for i in range(0, len(audio), chunk_size):
        chunk = audio[i : i + chunk_size]
        if len(chunk) == 0:
            continue
        stream.accept_waveform(args.sample_rate, chunk)
        while spotter.is_ready(stream):
            spotter.decode_stream(stream)
            result = spotter.get_result(stream)
            if result:
                triggered = True
                keyword = result
                break
        if triggered:
            break

    stream.input_finished()
    while spotter.is_ready(stream) and not triggered:
        spotter.decode_stream(stream)
        result = spotter.get_result(stream)
        if result:
            triggered = True
            keyword = result
            break

    return {"triggered": triggered, "keyword": keyword}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wav", required=True)
    parser.add_argument("--tokens", required=True)
    parser.add_argument("--encoder", required=True)
    parser.add_argument("--decoder", required=True)
    parser.add_argument("--joiner", required=True)
    parser.add_argument("--keywords-file", required=True)
    parser.add_argument("--provider", default="cpu")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--num-threads", type=int, default=2)
    parser.add_argument("--sample-rate", type=int, default=16000)
    parser.add_argument("--feature-dim", type=int, default=80)
    parser.add_argument("--max-active-paths", type=int, default=4)
    parser.add_argument("--keywords-score", type=float, default=1.0)
    parser.add_argument("--keywords-threshold", type=float, default=0.25)
    parser.add_argument("--num-trailing-blanks", type=int, default=1)
    parser.add_argument("--chunk-seconds", type=float, default=0.2)
    args = parser.parse_args()

    result = run_keyword_spotter(args)
    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
