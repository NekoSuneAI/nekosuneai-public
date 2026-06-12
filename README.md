# NekoSuneAI - Python (potato edition)

A lightweight Python rebuild of the NekoSuneAI **VRChat voice AI**, designed to
run on a low-end ("potato") laptop, fully local if you want.

It listens to your microphone, transcribes speech, asks a local LLM for a
reply, speaks it out loud, and shows it in the VRChat chatbox over OSC.

```
mic ──▶ STT (faster-whisper) ──▶ moderation + router ──▶ LLM (Ollama)
                                                            │
        VRChat chatbox  ◀── OSC ◀── TTS (Piper) ◀──────────┘
                                     │
                       audio out ──▶ (route to VRChat mic via VB-CABLE)
```

This is a focused port of the **core loop** plus the spoken helper commands.
Discord, Twitch, VTuber mode, and the friends system from the Node version are
**not** included - see [TODO.md](TODO.md). RVC voice conversion is also deferred
to TODO; the default voice is plain Piper, with gTTS and XTTS available.

### ⚡ Easiest start: the setup GUI
Don't want to edit JSON by hand? Launch the **web setup UI** (modern, dark +
green themed):
```bash
gui.bat            # Windows  (or: ./gui.sh  on Linux/macOS)
# then open http://127.0.0.1:8730
```
From there you can pick audio devices, choose models and **download them with a
click**, set your LLM, toggle skills, and **start/stop the bot** — no terminal
needed after that.

### Spoken commands (skills)
Say any of these and the bot handles them directly (otherwise it just chats):
**time in <place>**, **weather in <place>**, **tell me a joke**, **wiki <topic>**,
**fandom <topic>**, **search <query>**, **play <song>**, **new year in <place>**,
**reset memory**. Music uses `yt-dlp` (`pip install yt-dlp` + ffmpeg).

### Waiting music + timer
While the bot thinks, the chatbox shows a progress bar with an **estimated wait
time**, and it randomly plays a track from **`data/wait_music/`** (drop your own
`.wav`/`.mp3` files there).

### Models auto-install
On first run the bot **auto-downloads** the Piper voice and faster-whisper
weights into `models/` (toggle with `auto_install_models`). The GUI has manual
download buttons too.

## The stack (defaults)

| Stage | Default | Why |
|-------|---------|-----|
| STT | `faster-whisper` (`base`, int8, CPU) | Good accuracy, no GPU needed |
| TTS | `piper` | Fast neural voice, fully local |
| LLM | OpenAI-compatible endpoint (Ollama) | Local + offline; swap to remote anytime |
| OSC | `python-osc` | VRChat chatbox + avatar params |

**Speech-to-text is switchable** between `faster-whisper` (more accurate) and
**`vosk`** (ultra-light, offline, ~40 MB — the lightest choice for a potato).
Set `stt.provider` to `vosk` and pick a `stt.vosk.model`; both engines and their
models are selectable + downloadable from the GUI.

Alternative TTS providers: **gTTS** (online, tiny) and **XTTS** (voice
cloning, heavy - not for potatoes). Set `tts.provider` to `gtts` or `xtts`.

## Quick start

### 1. Install
```bash
cd python
# Windows: run.bat will make a venv and install for you. Or manually:
python -m venv .venv
.venv\Scripts\activate           # Windows
# source .venv/bin/activate      # Linux/macOS
pip install -r requirements.txt
```

### 2. Get a Piper voice
Download a voice (e.g. `en_US-lessac-medium`) `.onnx` **and** `.onnx.json` from
<https://huggingface.co/rhasspy/piper-voices> into `models/piper/`.
Then `pip install piper-tts` (provides the `piper` command).

### 3. Get an LLM (local, offline)
Install [Ollama](https://ollama.com), then pull a small model that fits a
potato:
```bash
ollama pull qwen2.5:3b-instruct   # ~2 GB, snappy on CPU
```
Ollama serves an OpenAI-compatible API at `http://127.0.0.1:11434/v1`, which is
the default in the config.

### 4. Configure
```bash
cp config/config.example.json config/config.json
```
Edit `config/config.json`:
- `audio.input_device` / `audio.output_device` - run
  `python -m nekosuneai --list-devices` to see indices/names. Set
  `output_device` to your **VB-CABLE** so VRChat can hear the bot.
- `stt.model` - use `tiny` on a very weak machine, `base` otherwise.
- `llm.model` - whatever you pulled in Ollama.

### 5. Enable OSC in VRChat
In VRChat: **Action Menu → Options → OSC → Enabled**. The bot sends to port
`9000` and reads from `9001` (VRChat's defaults).

### 6. Run
```bash
python -m nekosuneai            # or: run.bat  /  ./run.sh
```
Speak into your mic. The bot transcribes, thinks, and replies in chatbox +
voice.

## Hearing the bot inside VRChat
VRChat transmits whatever your **microphone** picks up. To make the bot's TTS
audible to others:
1. Install [VB-CABLE](https://vb-audio.com/Cable/).
2. Set `audio.output_device` to **"CABLE Input"** in the config.
3. In VRChat, set your microphone to **"CABLE Output"**.

Now the synthesized voice flows into VRChat as if it were your mic.

## GPU acceleration (NVIDIA)
faster-whisper can run on an NVIDIA GPU (Maxwell or newer, e.g. **GTX 980 Ti**+).
It needs the CUDA 12 runtime libraries:

```bash
pip install -r requirements-cuda.txt
```

Then set `stt.device: "auto"` (or `"cuda"`). That's it — NekoSuneAI adds the
CUDA DLL folders to the search path for you. If the GPU can't be used it falls
back to CPU automatically.

- Without these libs you'd see `Library cublas64_12.dll is not found or cannot
  be loaded` — that just means the CUDA runtime isn't installed.
- Older cards (Maxwell/Pascal) have no fast FP16, so the engine uses `float32`
  on GPU automatically. That's expected and still much faster than CPU.

## Potato tips
- For the lightest STT, use `stt.provider: "vosk"` with
  `vosk-model-small-en-us-0.15` (~40 MB, instant, offline).
- Or `stt.provider: "faster-whisper"` with `stt.model: "tiny"` + `int8`.
- No NVIDIA GPU? Leave `stt.device: "auto"` — it just uses the CPU.
- Use a 1.5B-3B LLM in Ollama (`qwen2.5:1.5b-instruct`, `llama3.2:3b`).
- Keep `tts.provider: "piper"` (XTTS will crawl on CPU).
- Lower `audio.silence_hang_seconds` for snappier turn-taking.

## Layout
```
python/
├── config/            config.example.json, badwords.json, timezone.json
├── data/wait_music/   drop waiting-music here (auto-created)
├── models/            auto-downloaded Piper voices + whisper weights
├── nekosuneai/
│   ├── app.py         orchestrator (the loop)
│   ├── audio/         mic recorder (VAD) + device-routable player
│   ├── stt/           faster-whisper
│   ├── tts/           piper / gtts / xtts providers
│   ├── osc/           chatbox sender + avatar-param receiver
│   ├── skills/        time/weather/jokes/wiki/fandom/search/music/newyear
│   ├── llm.py         OpenAI-compatible brain
│   ├── memory.py      sqlite conversation memory
│   ├── moderation.py  bad-word filter
│   ├── models.py      Piper + whisper auto-installer
│   ├── commands/      intent router
│   ├── text_utils.py  chunking / cleanup / number spelling
│   ├── thinking.py    "thinking..." bar + waiting music
│   └── gui/           Flask + Tailwind setup UI
├── requirements.txt
├── run.bat / run.sh   run the bot
├── gui.bat / gui.sh   run the setup GUI
└── TODO.md            RVC + remaining-parity roadmap
```
