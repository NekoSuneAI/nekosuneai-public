# Waiting music

Drop audio files here (`.wav`, `.mp3`, `.ogg`, `.flac`). While the bot is
thinking about a reply, it randomly plays one of these so the VRChat room isn't
sitting in silence — and the chatbox shows a progress bar with an estimated
wait time.

- `.wav` plays with no extra dependencies.
- `.mp3` needs the optional `miniaudio` package (`pip install miniaudio`).
- Volume is controlled by `audio.wait_sound_volume` in your config.

This folder's audio files are git-ignored; only this README is tracked.
