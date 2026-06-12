"""Send messages to VRChat over OSC.

``/chatbox/input  <text> <send=True> <sfx=False>`` posts straight into the
in-game chatbox (no typing indicator). VRChat caps the chatbox at ~144 chars,
so callers chunk text to ``chatbox.max_chars`` (129 by default) first.
"""

from __future__ import annotations

from pythonosc.udp_client import SimpleUDPClient

from ..logutil import log


class OscSender:
    def __init__(self, cfg: dict):
        self.address = cfg.get("osc_target_address", "127.0.0.1")
        self.port = int(cfg.get("osc_target_port", 9000))
        self._client = SimpleUDPClient(self.address, self.port)

    def chatbox(self, message: str) -> None:
        """Display ``message`` in the VRChat chatbox immediately."""
        try:
            self._client.send_message("/chatbox/input", [str(message), True, False])
        except Exception as exc:  # pragma: no cover - network dependent
            log("[OSC] chatbox send failed:", exc)

    def chatbox_typing(self, is_typing: bool) -> None:
        try:
            self._client.send_message("/chatbox/typing", bool(is_typing))
        except Exception as exc:  # pragma: no cover
            log("[OSC] typing send failed:", exc)

    def send(self, address: str, *args) -> None:
        try:
            self._client.send_message(address, list(args))
        except Exception as exc:  # pragma: no cover
            log("[OSC] send failed:", exc)
