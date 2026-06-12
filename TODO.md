# NekoSuneAI (Python) - TODO / roadmap

This Python rebuild ports the **core VRChat voice loop** from the Node.js
project, optimized to run on a potato laptop. The items below are features the
Node version had that were intentionally left out of the first cut.

## RVC voice conversion (requested)
The Node build piped Piper output through an RVC API for character voices
(Neko, Paimon, Gordon Ramsay, etc.). It is **not** ported yet.

Plan:
- [ ] Add `nekosuneai/tts/rvc.py` as a *post-processor* that wraps any base
      provider: `base_provider.synthesize(text)` -> wav -> POST to RVC server ->
      converted wav.
- [ ] Config block under `tts.rvc`: `enabled`, `api_url`, `model`, `pitch`,
      and a `voice -> {model, base_voice, pitch}` map (mirror the table in the
      Node `Speak.js runTTSRVC`).
- [ ] Make it optional and **off by default** (needs a separate GPU server;
      too heavy for a potato).
- [ ] Fall back to the raw Piper/XTTS audio if the RVC server is unreachable
      (the Node version did this too).

## Helper commands (from Node `Commands/Main.js`) — DONE
Implemented in `nekosuneai/skills/` and wired through `commands/router.py`:
- [x] Time / timezone lookup (`skills/timezones.py`, bundled `config/timezone.json`)
- [x] Weather (`skills/weather.py`, OpenWeather — needs `skills.weather.api_key`)
- [x] Jokes (`skills/jokes.py`, jokeapi.dev)
- [x] Wikipedia / Fandom lookup (`skills/wiki.py`)
- [x] Web search (SearxNG) with the safety blocklist (`skills/search.py`)
- [x] Music queue play/queue (`skills/music.py`, uses **yt-dlp** instead of the
      Node remote music-job API; needs `pip install yt-dlp` + ffmpeg)
- [x] New Year countdown (`skills/newyear.py`)

Still TODO for parity:
- [ ] Soundboard matching before the LLM (Node `playSound`).
- [ ] Per-language replies + romaji/pinyin for JA/ZH.

## Done in this round
- [x] Waiting music — drop audio in `data/wait_music/`, played at random while
      the bot thinks; chatbox shows a progress bar + estimated wait time
      (rolling average of past replies). See `thinking.py`.
- [x] Auto-install models — Piper voices from HuggingFace + faster-whisper
      weights into `models/` (`models.py`, `auto_install_models` config flag).
- [x] Modern web setup GUI — Tailwind dark/green theme, `python -m nekosuneai.gui`
      (`gui/`): edit config, list devices, download models, start/stop the bot.

## TTS niceties
- [ ] Per-language voice selection + romaji/pinyin for JA/ZH (Node had this).
- [ ] Streaming/partial chatbox updates while the LLM generates.

## Nice-to-have
- [ ] Wake-word gating (only respond after "hey neko").
- [ ] Soundboard matching before hitting the LLM.
- [ ] Discord / Twitch / VTuber modes (explicitly out of scope for the potato build).

## Setup notes
- Piper voices: download `<voice>.onnx` + `<voice>.onnx.json` into
  `models/piper/` from https://huggingface.co/rhasspy/piper-voices
- For the bot to be *heard in VRChat*, route `audio.output_device` to a virtual
  audio cable (VB-CABLE) and select that cable as your VRChat mic.
