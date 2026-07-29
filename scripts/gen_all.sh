#!/usr/bin/env bash
# Regenerate all shared JSON artifacts (constants + track).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m racing.constants
python3 -m racing.track.build_track
echo "shared/ artifacts regenerated"
