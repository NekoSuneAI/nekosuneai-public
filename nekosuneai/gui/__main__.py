"""Run the setup GUI: ``python -m nekosuneai.gui``."""

from __future__ import annotations

import argparse

from .server import main


def cli() -> None:
    parser = argparse.ArgumentParser(description="NekoSuneAI setup GUI")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8730)
    args = parser.parse_args()
    main(args.host, args.port)


if __name__ == "__main__":
    cli()
