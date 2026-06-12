"""Microphone capture with simple energy-based VAD.

Replaces the Node ``node-record-lpcm16`` + sox ``endOnSilence`` behaviour:
wait for speech to rise above a threshold, keep recording until the speaker
goes quiet for ``silence_hang_seconds``, then return the utterance as a
float32 mono numpy array at the configured sample rate (16 kHz by default,
which is exactly what faster-whisper wants).

Pure Python, CPU-only, no GPU - friendly to a potato laptop.
"""

from __future__ import annotations

import queue
from typing import Optional

import numpy as np

try:
    import sounddevice as sd
except Exception as exc:  # pragma: no cover - import guard
    sd = None
    _SD_ERROR = exc
else:
    _SD_ERROR = None

from ..logutil import log


class MicRecorder:
    def __init__(self, cfg: dict):
        if sd is None:
            raise RuntimeError(
                f"sounddevice is unavailable ({_SD_ERROR}). "
                "Install it with: pip install sounddevice"
            )
        self.sample_rate = int(cfg.get("sample_rate", 16000))
        self.block_ms = int(cfg.get("block_ms", 30))
        self.block_size = max(1, int(self.sample_rate * self.block_ms / 1000))
        self.silence_threshold = float(cfg.get("silence_threshold", 0.012))
        self.silence_hang = float(cfg.get("silence_hang_seconds", 1.0))
        self.min_speech = float(cfg.get("min_speech_seconds", 0.4))
        self.max_utterance = float(cfg.get("max_utterance_seconds", 20.0))
        from . import coerce_device

        self.input_device = coerce_device(cfg.get("input_device"))
        self._stop = False

    def stop(self) -> None:
        self._stop = True

    @staticmethod
    def _rms(block: np.ndarray) -> float:
        if block.size == 0:
            return 0.0
        return float(np.sqrt(np.mean(np.square(block, dtype=np.float64))))

    def listen(self) -> Optional[np.ndarray]:
        """Block until one utterance is captured. Returns float32 mono audio.

        Returns ``None`` if recording was stopped or nothing usable was heard.
        """
        self._stop = False
        audio_q: "queue.Queue[np.ndarray]" = queue.Queue()

        def callback(indata, frames, time_info, status):  # noqa: ANN001
            if status:
                # Overflows are common on weak hardware; just note them.
                log("[Mic] status:", status)
            audio_q.put(indata[:, 0].copy())

        collected: list[np.ndarray] = []
        speaking = False
        silence_blocks = 0
        speech_blocks = 0
        silence_block_limit = max(1, int(self.silence_hang * 1000 / self.block_ms))
        min_speech_blocks = max(1, int(self.min_speech * 1000 / self.block_ms))
        max_blocks = max(1, int(self.max_utterance * 1000 / self.block_ms))

        try:
            with sd.InputStream(
                samplerate=self.sample_rate,
                blocksize=self.block_size,
                channels=1,
                dtype="float32",
                device=self.input_device,
                callback=callback,
            ):
                total_blocks = 0
                while not self._stop:
                    try:
                        block = audio_q.get(timeout=1.0)
                    except queue.Empty:
                        continue
                    level = self._rms(block)
                    is_speech = level >= self.silence_threshold

                    if not speaking:
                        if is_speech:
                            speaking = True
                            speech_blocks = 1
                            silence_blocks = 0
                            collected = [block]
                        # else: keep waiting silently
                        continue

                    # Currently capturing an utterance.
                    collected.append(block)
                    total_blocks += 1
                    if is_speech:
                        speech_blocks += 1
                        silence_blocks = 0
                    else:
                        silence_blocks += 1

                    done = silence_blocks >= silence_block_limit
                    too_long = total_blocks >= max_blocks
                    if done or too_long:
                        if speech_blocks >= min_speech_blocks:
                            return np.concatenate(collected).astype(np.float32)
                        # Too short -> treat as noise, reset and keep listening.
                        speaking = False
                        collected = []
                        speech_blocks = 0
                        silence_blocks = 0
        except Exception as exc:  # pragma: no cover - hardware dependent
            log("[Mic] capture error:", exc)
            return None
        return None
