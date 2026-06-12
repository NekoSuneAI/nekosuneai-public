"""Conversation memory backed by SQLite (stdlib).

Mirrors the Node memoryStore: append user/assistant turns, fetch the last N,
reset on command, and auto-clear after an idle timeout.
"""

from __future__ import annotations

import os
import sqlite3
import threading
import time

PKG_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(PKG_DIR)
DB_DIR = os.path.join(ROOT_DIR, "data")
DB_PATH = os.path.join(DB_DIR, "memory.sqlite")


class MemoryStore:
    def __init__(self, limit: int = 50, idle_clear_minutes: float = 10.0):
        self.limit = int(limit)
        self.idle_clear_seconds = float(idle_clear_minutes) * 60.0
        self._lock = threading.Lock()
        os.makedirs(DB_DIR, exist_ok=True)
        self._conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS messages ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "role TEXT NOT NULL, content TEXT NOT NULL, "
            "created_at REAL NOT NULL)"
        )
        self._conn.commit()
        self._last_activity = time.time()

    def add(self, role: str, content: str) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO messages(role, content, created_at) VALUES (?, ?, ?)",
                (role, content, time.time()),
            )
            self._conn.commit()
        self.mark_activity()

    def history(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT role, content FROM messages ORDER BY id ASC LIMIT ?",
                (self.limit,),
            ).fetchall()
        return [{"role": r, "content": c} for r, c in rows]

    def reset(self) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM messages")
            self._conn.commit()

    def mark_activity(self) -> None:
        self._last_activity = time.time()

    def maybe_idle_clear(self) -> None:
        """Clear memory if idle longer than the configured timeout."""
        if self.idle_clear_seconds <= 0:
            return
        if time.time() - self._last_activity >= self.idle_clear_seconds:
            self.reset()
            self.mark_activity()

    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:
            pass
