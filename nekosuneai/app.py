"""Main orchestrator for the VRChat voice-AI loop.

    mic -> STT -> moderation/router -> LLM -> TTS -> chatbox + audio out

Everything is wired here. The loop is single-threaded and sequential (the bot
listens, thinks, speaks, then listens again) which keeps it simple and light on
a potato laptop. OSC receive runs on its own thread for avatar reactions.
"""

from __future__ import annotations

import os
import signal
import time

from .audio.player import AudioPlayer
from .audio.recorder import MicRecorder
from .commands import CommandRouter, Intent
from .config import Config
from .llm import Brain
from .logutil import log
from .memory import MemoryStore
from .moderation import FORBIDDEN_MESSAGE, Moderation
from .osc.receiver import OscReceiver
from .osc.sender import OscSender
from .skills import jokes, newyear, search as search_skill, timezones, weather, wiki
from .skills.music import MusicQueue, extract_music_query
from .stt import build_stt
from .text_utils import clean_llm_output, prepare_tts_text, split_into_chunks
from .thinking import ThinkingIndicator
from .tts import build_tts


class NekoSuneApp:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.client_name = cfg.get("client_name", "NekoSuneAI")
        self.chatbox_cfg = cfg.section("chatbox")
        self.max_chars = int(self.chatbox_cfg.get("max_chars", 129))
        self.tts_gap = float(cfg.section("tts").get("gap_ms", 400)) / 1000.0
        self._running = True

        log(f"[{self.client_name}] starting up...")

        # Core components.
        self.osc = OscSender(cfg.section("vrchat"))
        self.osc_in = OscReceiver(cfg.section("vrchat"))
        self.player = AudioPlayer(cfg.section("audio"))
        self.recorder = MicRecorder(cfg.section("audio"))
        stt_cfg = {**cfg.section("stt"), "sample_rate": cfg.section("audio").get("sample_rate", 16000)}
        self.stt = build_stt(stt_cfg)
        self._auto_install_models()
        self.tts = build_tts(cfg.section("tts"))
        llm_cfg = cfg.section("llm")
        self.memory = MemoryStore(
            limit=llm_cfg.get("memory_limit", 50),
            idle_clear_minutes=llm_cfg.get("memory_idle_clear_minutes", 10),
        )
        self.brain = Brain(llm_cfg, self.memory)
        self.moderation = Moderation(cfg.section("moderation").get("enabled", True))
        self.router = CommandRouter()
        self.thinking = ThinkingIndicator(
            self.osc, self.player, self.chatbox_cfg, cfg.section("audio")
        )
        self.skills_cfg = cfg.section("skills")
        self.music = MusicQueue(self.player, self.speak)

        # Estimated wait shown in the thinking indicator. We never show less than
        # the configured floor (so a slow LLM doesn't surprise the room), and the
        # rolling average can push it higher if replies actually take longer.
        self._min_wait_seconds = float(self.chatbox_cfg.get("wait_seconds", 60))
        self._avg_response_seconds = self._min_wait_seconds

        self._register_osc_handlers()

    # ------------------------------------------------------------- model setup
    def _auto_install_models(self) -> None:
        """Download the Vosk model (if used) and the Piper voice."""
        if not self.cfg.get("auto_install_models", True):
            return
        stt_cfg = self.cfg.section("stt")
        if str(stt_cfg.get("provider", "")).lower() == "vosk":
            try:
                from .models import ensure_vosk_model

                vcfg = stt_cfg.get("vosk", {})
                models_dir = vcfg.get("models_dir", "models/vosk")
                if not os.path.isabs(models_dir):
                    models_dir = self.cfg.resolve(models_dir)
                ensure_vosk_model(vcfg.get("model", "vosk-model-small-en-us-0.15"), models_dir)
            except Exception as exc:
                log("[Models] Vosk model auto-install failed:", exc)
        tts_cfg = self.cfg.section("tts")
        if str(tts_cfg.get("provider", "piper")).lower() in ("piper", "piper_local"):
            try:
                from .models import ensure_piper_voice

                piper_cfg = tts_cfg.get("piper", {})
                models_dir = piper_cfg.get("models_dir", "models/piper")
                if not os.path.isabs(models_dir):
                    models_dir = self.cfg.resolve(models_dir)
                ensure_piper_voice(tts_cfg.get("voice", "en_US-lessac-medium"), models_dir)
            except Exception as exc:
                log("[Models] Piper voice auto-install failed:", exc)

    # ----------------------------------------------------------- OSC reactions
    def _register_osc_handlers(self) -> None:
        def on_chest_hit(value):
            if value:
                msg = (
                    "Please don't touch me there. That's private - "
                    "only my master is allowed."
                )
                self.speak([msg])

        self.osc_in.on("/avatar/parameters/Chest_Hit", on_chest_hit)

    # ------------------------------------------------------------------- speak
    def speak(self, sentences: list[str], lang: str = "en") -> None:
        """Synthesize + show + play each sentence, page by page."""
        cleaned = [clean_llm_output(s).strip() for s in sentences]
        cleaned = [s for s in cleaned if s]
        if not cleaned:
            return

        # Pre-render audio so playback is gapless-ish even on slow hardware.
        rendered: list[tuple[str, str]] = []  # (display_text, audio_path)
        for sentence in cleaned:
            tts_text = prepare_tts_text(sentence)
            try:
                audio_path = self.tts.synthesize(tts_text)
            except Exception as exc:
                log("[TTS] synth failed:", exc)
                audio_path = ""
            rendered.append((sentence, audio_path))

        # TTS files are now ready -> stop the wait music/bar (100%) and play.
        self.thinking.complete()

        total = len(rendered)
        for idx, (sentence, audio_path) in enumerate(rendered, start=1):
            pager = f"\n⏪{idx}/{total}⏩" if total > 1 else ""
            self.osc.chatbox(f"{sentence}{pager}")
            log(f"[Speak {idx}/{total}] {sentence}")
            if audio_path and os.path.isfile(audio_path):
                self.player.play_file(audio_path)
                try:
                    os.remove(audio_path)
                except OSError:
                    pass
            if self.tts_gap:
                time.sleep(self.tts_gap)

    # ----------------------------------------------------------------- respond
    def respond_with_llm(self, prompt: str, strip_links: bool = False) -> None:
        """Ask the LLM, show the estimated wait, then speak the reply."""
        estimate = max(self._min_wait_seconds, self._avg_response_seconds)
        self.thinking.start(total_seconds=estimate)
        start = time.time()
        result = self.brain.respond(prompt)
        elapsed = time.time() - start
        # Exponential moving average (matches the Node 0.7/0.3 weighting).
        self._avg_response_seconds = max(3.0, self._avg_response_seconds * 0.7 + elapsed * 0.3)
        # NOTE: do NOT stop the wait music/bar here. speak() keeps it running
        # through TTS synthesis and only stops it when audio is ready to play.

        if result["status"] != 200:
            self.speak([result.get("content", "Sorry, something went wrong.")])
            return

        content = clean_llm_output(result["content"])
        if self.moderation.contains_banned_word(content):
            log("[Moderation] banned word in LLM output.")
            self.speak([FORBIDDEN_MESSAGE])
            return

        # Split into chatbox-sized pieces (<= max_chars); each piece is shown in
        # the chatbox AND spoken as its own TTS utterance.
        self.speak(split_into_chunks(content, self.max_chars))

    def handle_text(self, text: str) -> None:
        if self.moderation.contains_banned_word(text):
            log("[Moderation] banned word in user input.")
            self.osc.chatbox("[FORBIDDEN ACCESS]")
            time.sleep(2)
            self.speak([FORBIDDEN_MESSAGE])
            return

        intent = self.router.detect(text)
        lower = text.lower()

        if intent is Intent.RESET:
            self.memory.reset()
            self.speak(["Memory has been reset."])

        elif intent is Intent.TIME:
            resp = timezones.time_lookup(text)
            if resp.get("error"):
                self.speak([resp["error"]])
            else:
                self.speak([f"The time in {resp['location']} is {resp['ampm']}."])

        elif intent is Intent.NEW_YEAR:
            resp = newyear.newyear_countdown(text)
            if resp.get("error"):
                self.speak([resp["error"]])
            else:
                days = resp["days"]
                prefix = f"There are {days} days, " if days else "There are "
                self.speak([
                    f"{prefix}{resp['hours']} hours, {resp['minutes']} minutes, and "
                    f"{resp['seconds']} seconds until New Year's in {resp['location']}."
                ])

        elif intent is Intent.WEATHER:
            wcfg = self.skills_cfg.get("weather", {})
            self.speak([weather.weather_lookup(text, wcfg.get("api_key", ""), wcfg.get("units", "metric"))])

        elif intent is Intent.JOKE:
            allow = bool(self.skills_cfg.get("jokes", {}).get("allow_explicit", False))
            self.speak(jokes.get_joke(allow))

        elif intent is Intent.WIKI:
            query = lower.replace("wiki", "").replace("search wikipedia", "").strip()
            self.speak(split_into_chunks(wiki.wikipedia(query), self.max_chars))

        elif intent is Intent.FANDOM:
            query = (lower.replace("fandom", "")
                          .replace("search vrchat legends", "")
                          .replace("search vr chat legends", "").strip())
            self.speak(split_into_chunks(wiki.fandom(query), self.max_chars))

        elif intent is Intent.SEARCH:
            self._handle_search(text)

        elif intent is Intent.MUSIC:
            if not self.skills_cfg.get("music", {}).get("enabled", True):
                self.speak(["Music is disabled on this bot."])
            else:
                query = extract_music_query(text)
                resp = self.music.enqueue(query)
                if resp.get("error"):
                    self.speak([resp["error"]])

        else:
            self.respond_with_llm(text)

    def _handle_search(self, text: str) -> None:
        scfg = self.skills_cfg.get("search", {})
        # Node-style cleanup: drop the command words to isolate the query.
        q = text.strip()
        q = q[: -1] if q.endswith(("?", ".", "!")) else q
        for word in ("search for", "search me", "search of", "search", "look up", "lookup", "find"):
            q = q.replace(word, " ")
        q = " ".join(q.split()).strip()
        if not q:
            self.speak(["What would you like me to search for?"])
            return
        data = search_skill.searxng(q, scfg)
        if data.get("blocked"):
            self.speak(["Sorry, I'm not allowed to search that - keeping the VRChat community safe."])
            return
        if data.get("error"):
            self.speak([data["error"]])
            return
        results = data.get("results", [])
        if not results:
            self.speak([f'I found no results for "{q}".'])
            return
        prompt = search_skill.build_search_prompt(q, results)
        self.respond_with_llm(prompt, strip_links=True)

    # -------------------------------------------------------------------- loop
    def run(self) -> None:
        self.osc_in.start()
        self.osc.chatbox(f"{self.client_name} is online and listening~")
        log(f"[{self.client_name}] ready. Speak into your microphone.")

        def shutdown(*_):
            self._running = False
            self.recorder.stop()

        try:
            signal.signal(signal.SIGINT, shutdown)
            signal.signal(signal.SIGTERM, shutdown)
        except Exception:
            pass

        while self._running:
            self.memory.maybe_idle_clear()
            audio = self.recorder.listen()
            if not self._running:
                break
            if audio is None:
                continue
            try:
                text = self.stt.transcribe(audio).strip()
            except Exception as exc:
                log("[STT] transcription failed:", exc)
                continue
            if not text:
                continue
            log(f"[STT] heard: {text}")
            try:
                self.handle_text(text)
            except Exception as exc:
                log("[App] error handling text:", exc)
            self.osc.chatbox(f"{self.client_name} is listening~")

        self.shutdown()

    def shutdown(self) -> None:
        log(f"[{self.client_name}] shutting down...")
        self.thinking.stop()
        self.music.stop()
        self.osc_in.stop()
        self.memory.close()


def run_app(config_path: str | None = None) -> None:
    from .config import load_config

    cfg = load_config(config_path)
    log(f"[Config] loaded from {cfg.path}")
    app = NekoSuneApp(cfg)
    app.run()
