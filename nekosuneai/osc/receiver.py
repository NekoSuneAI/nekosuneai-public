"""Receive OSC from VRChat (avatar parameters).

VRChat streams avatar parameters to ``osc_read_port``. We expose a small
dispatcher; the app registers handlers for the parameters it cares about
(e.g. the ``Chest_Hit`` contact the Node version reacted to). Runs on a
background thread.
"""

from __future__ import annotations

import threading
from typing import Callable

from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import ThreadingOSCUDPServer

from ..logutil import log


class OscReceiver:
    def __init__(self, cfg: dict):
        self.address = cfg.get("osc_target_address", "127.0.0.1")
        self.port = int(cfg.get("osc_read_port", 9001))
        self._dispatcher = Dispatcher()
        self._dispatcher.set_default_handler(self._default)
        self._server: ThreadingOSCUDPServer | None = None
        self._thread: threading.Thread | None = None
        self._handlers: dict[str, Callable] = {}

    def on(self, address: str, handler: Callable) -> None:
        """Register ``handler(value)`` for a specific OSC address."""
        self._handlers[address] = handler

    def _default(self, address: str, *args) -> None:
        handler = self._handlers.get(address)
        if handler:
            try:
                handler(args[0] if args else None)
            except Exception as exc:
                log("[OSC] handler error for", address, ":", exc)

    def start(self) -> None:
        try:
            self._server = ThreadingOSCUDPServer((self.address, self.port), self._dispatcher)
        except Exception as exc:  # pragma: no cover - port/bind dependent
            log("[OSC] could not bind read port", self.port, ":", exc)
            return
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        log(f"[OSC] Listening for VRChat params on {self.address}:{self.port}")

    def stop(self) -> None:
        if self._server is not None:
            try:
                self._server.shutdown()
            except Exception:
                pass
