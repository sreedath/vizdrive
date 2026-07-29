"""Load shared/track.json, generating it first if missing."""

import json

from racing import constants as C


def load_track() -> dict:
    path = C.SHARED_DIR / "track.json"
    if not path.exists():
        from racing.track.build_track import main as build_main

        build_main()
    with open(path) as f:
        return json.load(f)
