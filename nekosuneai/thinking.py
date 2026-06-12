"""'Thinking...' chatbox indicator + waiting music.

A faithful Python port of the Node ``startRenderProgress`` loop: while the
LLM/TTS works, one thread updates the VRChat chatbox with a progress bar +
estimated wait time (throttled to once every 3 s), and a second thread randomly
plays a track from the waiting-music folder (skipping if audio is already
playing) so the room isn't sitting in silence.

Drop ``.wav``/``.mp3``/``.ogg``/``.flac`` files into ``data/wait_music/``
(configurable via ``audio.wait_sounds_dir``).
"""

from __future__ import annotations

import os
import random
import threading
import time

from .config import ROOT_DIR

DEFAULT_WAIT_DIR = os.path.join(ROOT_DIR, "data", "wait_music")
_AUDIO_EXTS = (".wav", ".mp3", ".ogg", ".flac")
_BAR_LENGTH = 12
_MIN_SEND_INTERVAL = 3.0  # seconds (matches Node minSendIntervalMs = 3000)


def _format_duration(total_seconds: float) -> str:
    secs = max(0, round(total_seconds))
    if secs < 60:
        return f"{secs} second{'' if secs == 1 else 's'}"
    mins, rem = divmod(secs, 60)
    if mins < 60:
        tail = f" {rem} second{'' if rem == 1 else 's'}" if rem else ""
        return f"{mins} minute{'' if mins == 1 else 's'}{tail}"
    hours, rem_mins = divmod(mins, 60)
    tail = f" {rem_mins} minute{'' if rem_mins == 1 else 's'}" if rem_mins else ""
    return f"{hours} hour{'' if hours == 1 else 's'}{tail}"


class ThinkingIndicator:
    def __init__(self, sender, player, cfg: dict, audio_cfg: dict):
        self.sender = sender
        self.player = player
        self.enabled = bool(cfg.get("show_thinking", True))
        self.play_wait = bool(cfg.get("thinking_play_wait_sounds", True))
        wait_dir = audio_cfg.get("wait_sounds_dir") or ""
        if not wait_dir:
            wait_dir = DEFAULT_WAIT_DIR
        elif not os.path.isabs(wait_dir):
            wait_dir = os.path.normpath(os.path.join(ROOT_DIR, wait_dir))
        self.wait_dir = wait_dir
        self.wait_volume = float(audio_cfg.get("wait_sound_volume", 0.3))
        os.makedirs(self.wait_dir, exist_ok=True)
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []
        self._total = 30.0
        self._running = False

    def _wait_sounds(self) -> list[str]:
        if not os.path.isdir(self.wait_dir):
            return []
        return [
            os.path.join(self.wait_dir, f)
            for f in os.listdir(self.wait_dir)
            if f.lower().endswith(_AUDIO_EXTS)
        ]

    # ----------------------------------------------------------- progress loop
    def _format_msg(self, progress: float, total: float, remaining: float) -> str:
        progress = max(0.0, min(progress, 1.0))
        filled = round(progress * _BAR_LENGTH)
        bar = "★" * filled + "☆" * (_BAR_LENGTH - filled)
        percent = str(round(progress * 100)).zfill(3)
        return (
            f"[{bar}] {percent}% loaded.\n"
            f"Please wait up to {_format_duration(total)}...\n"
            f"I'm thinking of a response... Depends my Hardware\n"
            f"{_format_duration(remaining)} remaining"
        )

    def _progress_loop(self, total_seconds: float) -> None:
        total = max(1.0, total_seconds)
        start = time.monotonic()
        last_sent = 0.0

        def send_progress(force: bool = False) -> None:
            nonlocal last_sent
            now = time.monotonic()
            if not force and now - last_sent < _MIN_SEND_INTERVAL:
                return
            last_sent = now
            elapsed = now - start
            # Monotonic 0 -> 99%: never reset/loop. 100% is reserved for
            # complete() so the bar fills smoothly and finishes when done.
            progress = min(elapsed / total, 0.99)
            remaining = max(0.0, total - elapsed)
            self.sender.chatbox(self._format_msg(progress, total, remaining))

        send_progress(force=True)
        while not self._stop.is_set():
            if self._stop.wait(1.0):
                break
            send_progress()

    # --------------------------------------------------------- wait-sound loop
    def _wait_loop(self) -> None:
        sounds = self._wait_sounds()
        if not sounds:
            return
        while not self._stop.is_set():
            try:
                if not self.player.is_playing():
                    self.player.play_file(random.choice(sounds), self.wait_volume)
            except Exception:
                pass
            if self._stop.wait(0.5):
                break

    # -------------------------------------------------------------- public API
    def start(self, total_seconds: float = 30.0) -> None:
        if not self.enabled:
            return
        self.stop()
        self._total = max(1.0, total_seconds)
        self._stop.clear()
        self._running = True
        self._threads = [threading.Thread(target=self._progress_loop, args=(self._total,), daemon=True)]
        if self.play_wait:
            self._threads.append(threading.Thread(target=self._wait_loop, daemon=True))
        for t in self._threads:
            t.start()

    def is_running(self) -> bool:
        return self._running

    def complete(self) -> None:
        """Stop the loops and show a final 100% frame (the bar finishes).

        Only emits the 100% frame if it was actually running, so calling this
        on a non-LLM path (skills that never started the indicator) is a no-op.
        """
        was_running = self._running
        self.stop()
        if self.enabled and was_running:
            try:
                self.sender.chatbox(self._format_msg(1.0, self._total, 0.0))
            except Exception:
                pass

    def stop(self) -> None:
        self._stop.set()
        self._running = False
        try:
            self.player.stop()
        except Exception:
            pass
        for t in self._threads:
            if t.is_alive():
                t.join(timeout=1.0)
        self._threads = []
