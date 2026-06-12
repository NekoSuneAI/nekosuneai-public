"""Entry point: ``python -m nekosuneai`` (optionally ``--config path``)."""

from __future__ import annotations

import argparse

from .app import run_app


def main() -> None:
    parser = argparse.ArgumentParser(description="NekoSuneAI - VRChat voice AI (Python)")
    parser.add_argument("--config", "-c", default=None, help="Path to a config JSON file")
    parser.add_argument(
        "--list-devices", action="store_true", help="List audio input/output devices and exit"
    )
    args = parser.parse_args()

    if args.list_devices:
        import sounddevice as sd

        print(sd.query_devices())
        return

    run_app(args.config)


if __name__ == "__main__":
    main()
