"""Audio playback to a chosen output device.

To make the bot's voice come out *inside* VRChat, set ``audio.output_device``
to a virtual audio cable (e.g. VB-CABLE "CABLE Input") and select that same
cable as your VRChat microphone. Then everything this player emits is heard by
others in the instance.

Decodes wav/flac/ogg via soundfile; mp3 (gTTS) via the optional ``miniaudio``
package, falling back to the OS default player if neither can decode it.
"""

from __future__ import annotations

import os
import threading
from typing import Optional

import numpy as np

try:
    import sounddevice as sd
except Exception as exc:  # pragma: no cover
    sd = None
    _SD_ERROR = exc
else:
    _SD_ERROR = None

try:
    import soundfile as sf
except Exception:  # pragma: no cover
    sf = None

from ..logutil import log


class AudioPlayer:
    def __init__(self, cfg: dict):
        from . import coerce_device

        self.output_device = coerce_device(cfg.get("output_device"))
        self.target_rate = int(cfg.get("sample_rate", 16000))
        self._lock = threading.Lock()
        self._stop_flag = threading.Event()
        self._playing = threading.Event()
        self._validate_output_device()

    def _validate_output_device(self) -> None:
        """Warn + reset to default if the configured output device is unusable."""
        if sd is None or self.output_device is None:
            return
        try:
            info = sd.query_devices(self.output_device)
            if info.get("max_output_channels", 0) < 1:
                log(f"[Audio] WARNING: device {self.output_device} "
                    f"'{info.get('name')}' has no output channels; using system default.")
                self.output_device = None
            else:
                log(f"[Audio] Output device: [{self.output_device}] {info.get('name')}")
        except Exception as exc:
            log(f"[Audio] WARNING: output_device {self.output_device!r} is invalid ({exc}); "
                "using system default. Pick a valid output in the GUI (Audio tab).")
            self.output_device = None

    # ------------------------------------------------------------------ decode
    def _decode(self, path: str) -> Optional[tuple[np.ndarray, int]]:
        ext = os.path.splitext(path)[1].lower()
        if sf is not None and ext != ".mp3":
            try:
                data, rate = sf.read(path, dtype="float32", always_2d=False)
                return data, rate
            except Exception as exc:
                log("[Audio] soundfile decode failed:", exc)
        # mp3 (gTTS) or soundfile miss -> try miniaudio.
        try:
            import miniaudio  # type: ignore

            decoded = miniaudio.decode_file(
                path, output_format=miniaudio.SampleFormat.FLOAT32
            )
            data = np.frombuffer(bytes(decoded.samples), dtype=np.float32)
            if decoded.nchannels > 1:
                data = data.reshape(-1, decoded.nchannels)
            return data, decoded.sample_rate
        except Exception as exc:
            log("[Audio] miniaudio decode failed:", exc)
        return None

    @staticmethod
    def _to_mono(data: np.ndarray) -> np.ndarray:
        if data.ndim == 2:
            return data.mean(axis=1)
        return data

    # -------------------------------------------------------------------- play
    def play_file(self, path: str, volume: float = 1.0) -> None:
        """Play a sound file synchronously (blocks until finished)."""
        if not path or not os.path.isfile(path):
            return
        if sd is None:
            self._system_play(path)
            return

        decoded = self._decode(path)
        if decoded is None:
            self._system_play(path)
            return

        data, rate = decoded
        data = self._to_mono(data)
        if volume != 1.0:
            data = np.clip(data * float(volume), -1.0, 1.0)

        # Try the configured device first, then the system default, then the OS
        # player. A stale/disconnected output device (PaErrorCode -9996) should
        # degrade gracefully instead of dropping the reply.
        devices = [self.output_device]
        if self.output_device is not None:
            devices.append(None)

        with self._lock:
            self._stop_flag.clear()
            self._playing.set()
            try:
                last_err = None
                for dev in devices:
                    try:
                        self._play_array(data, rate, dev)
                        if dev != self.output_device:
                            log(f"[Audio] output device {self.output_device!r} unavailable; "
                                "played on system default. Pick a valid output in the GUI.")
                        last_err = None
                        break
                    except Exception as exc:
                        last_err = exc
                if last_err is not None:
                    log("[Audio] playback failed on all devices:", last_err, "- using OS player.")
                    self._system_play(path)
            finally:
                self._playing.clear()

    def _play_array(self, data, rate, device) -> None:
        sd.play(data, samplerate=rate, device=device)
        while sd.get_stream().active:
            if self._stop_flag.is_set():
                sd.stop()
                break
            sd.sleep(50)

    def is_playing(self) -> bool:
        return self._playing.is_set()

    def stop(self) -> None:
        self._stop_flag.set()
        if sd is not None:
            try:
                sd.stop()
            except Exception:
                pass

    # --------------------------------------------------------------- fallback
    @staticmethod
    def _system_play(path: str) -> None:
        """Last-resort playback via the OS (cannot target a device)."""
        try:
            if os.name == "nt":
                import winsound

                if path.lower().endswith(".wav"):
                    winsound.PlaySound(path, winsound.SND_FILENAME)
                    return
                os.startfile(path)  # type: ignore[attr-defined]
            else:
                import subprocess

                for player in ("aplay", "paplay", "ffplay", "afplay"):
                    if subprocess.call(["which", player], stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL) == 0:
                        subprocess.call([player, path])
                        return
        except Exception as exc:  # pragma: no cover
            log("[Audio] system playback failed:", exc)
