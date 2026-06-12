"""LLM brain - talks to any OpenAI-compatible chat endpoint.

Works out of the box with a local Ollama server (``http://127.0.0.1:11434/v1``)
which keeps everything offline and potato-friendly, but the same code points at
LM Studio, llama.cpp's server, or a remote API just by changing ``llm.base_url``
and ``llm.api_key``.

Replaces the Node GPTNODE/RESPGPT + askGPT chain.
"""

from __future__ import annotations

import requests

from .logutil import log
from .memory import MemoryStore
from .text_utils import split_into_chunks


class Brain:
    def __init__(self, cfg: dict, memory: MemoryStore):
        self.base_url = str(cfg.get("base_url", "http://127.0.0.1:11434/v1")).rstrip("/")
        self.api_key = cfg.get("api_key", "")
        self.model = cfg.get("model", "qwen2.5:3b-instruct")
        self.system_message = cfg.get("system_message", "")
        self.timeout = int(cfg.get("request_timeout", 120))
        self.max_tokens = int(cfg.get("max_tokens", 220))
        self.temperature = float(cfg.get("temperature", 0.8))
        self.memory = memory

    def respond(self, prompt: str) -> dict:
        """Send the prompt (with memory) and return a normalized result dict.

        Returns ``{"status": 200, "content": str, "chunks": [str, ...]}`` on
        success, or ``{"status": <code>, "content": str}`` on failure.
        """
        self.memory.add("user", prompt)
        messages = []
        if self.system_message:
            messages.append({"role": "system", "content": self.system_message})
        messages.extend(self.memory.history())

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            resp = requests.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            log("[LLM] request failed:", exc)
            return {"status": 504, "content": "Request timed out or failed."}

        if resp.status_code == 429:
            return {"status": 429, "content": "Too many requests - try again in a few minutes."}
        if resp.status_code != 200:
            log("[LLM] endpoint error:", resp.status_code, resp.text[:200])
            return {"status": resp.status_code, "content": "Unexpected error from the LLM endpoint."}

        try:
            data = resp.json()
            text = data["choices"][0]["message"]["content"] or ""
        except Exception as exc:
            log("[LLM] bad response shape:", exc)
            return {"status": 502, "content": "The LLM returned an unexpected response."}

        text = text.strip()
        # Drop a leading "Assistant:" the model sometimes adds.
        for prefix in ("### Assistant:", "Assistant:"):
            if text.lower().startswith(prefix.lower()):
                text = text[len(prefix):].strip()
        self.memory.add("assistant", text)
        return {"status": 200, "content": text, "chunks": split_into_chunks(text)}
