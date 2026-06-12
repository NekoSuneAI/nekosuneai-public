"""Music queue (reimagined from MusicQueue.js for a potato).

The Node build resolved songs with yt-search and downloaded them through a
remote music-job API. Here we use ``yt-dlp`` directly (one pip dependency,
fully local, no external CDN) to fetch audio for a query or URL, then play it
through the same device-routable AudioPlayer so it's heard in VRChat.

Runs on a background thread so queueing a song doesn't block the voice loop.
``yt-dlp`` is imported lazily; if it's missing the skill degrades gracefully.
"""

from __future__ import annotations

import os
import queue
import re
import threading
import time
from typing import Callable, Optional

from ..config import ROOT_DIR
from ..logutil import log

MUSIC_DIR = os.path.join(ROOT_DIR, "data", "music")


def _is_url(text: str) -> bool:
    return bool(re.match(r"^https?://", text or "", re.IGNORECASE))


def extract_music_query(text: str) -> str:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"[?.!]+$", "", cleaned).strip()
    cleaned = re.sub(r"^(please\s+)?(can you|could you|would you|do you|will you)\s+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^(play|queue|add|enqueue)\s+(music|song|a song)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^[,.\s-]+", "", cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


class MusicQueue:
    def __init__(self, player, speak: Callable[[list[str]], None]):
        self.player = player
        self.speak = speak
        self._queue: "queue.Queue[str]" = queue.Queue()
        self._worker: Optional[threading.Thread] = None
        self._stop = threading.Event()
        os.makedirs(MUSIC_DIR, exist_ok=True)

    # -------------------------------------------------------------- public API
    def enqueue(self, query_or_url: str) -> dict:
        q = (query_or_url or "").strip()
        if not q:
            return {"error": "Please tell me a song name or link."}
        self._queue.put(q)
        self._ensure_worker()
        return {"queued": True, "position": self._queue.qsize()}

    def stop(self) -> None:
        self._stop.set()
        try:
            self.player.stop()
        except Exception:
            pass

    # ------------------------------------------------------------------ worker
    def _ensure_worker(self) -> None:
        if self._worker and self._worker.is_alive():
            return
        self._stop.clear()
        self._worker = threading.Thread(target=self._run, daemon=True)
        self._worker.start()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                item = self._queue.get(timeout=1.0)
            except queue.Empty:
                return
            try:
                self._play_one(item)
            except Exception as exc:
                log("[Music] playback failed:", exc)
                self.speak([f"I couldn't play that: {exc}"])

    def _play_one(self, query_or_url: str) -> None:
        try:
            import yt_dlp  # type: ignore
        except Exception:
            self.speak(["Music needs yt-dlp installed. Run pip install yt-dlp."])
            return

        out_tmpl = os.path.join(MUSIC_DIR, f"{int(time.time()*1000)}.%(ext)s")
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": out_tmpl,
            "quiet": True,
            "noplaylist": True,
            "default_search": "ytsearch1",
            "postprocessors": [
                {"key": "FFmpegExtractAudio", "preferredcodec": "wav", "preferredquality": "192"}
            ],
        }
        target = query_or_url if _is_url(query_or_url) else f"ytsearch1:{query_or_url}"
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(target, download=True)
            if "entries" in info:
                info = info["entries"][0]
            title = info.get("title", "your song")
            wav_path = os.path.splitext(ydl.prepare_filename(info))[0] + ".wav"

        self.speak([f"Now playing: {title}"])
        if os.path.isfile(wav_path):
            try:
                self.player.play_file(wav_path)
            finally:
                try:
                    os.remove(wav_path)
                except OSError:
                    pass
        else:
            self.speak(["The download didn't produce audio I can play (is ffmpeg installed?)."])
