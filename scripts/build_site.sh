#!/usr/bin/env bash
# Assemble dist/ for static deployment (Vercel). Mirrors the local layout
# (game at /web/, data at /shared/) so all relative fetches keep working.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"

rm -rf "$DIST"
mkdir -p "$DIST/shared"

cp -r "$ROOT/web" "$DIST/web"
cp "$ROOT/shared/physics_constants.json" "$ROOT/shared/track.json" "$DIST/shared/"
cp "$ROOT/shared/policy.json" "$DIST/shared/" 2>/dev/null || true
cp -r "$ROOT/shared/policies" "$DIST/shared/policies"
cp -r "$ROOT/shared/tracks" "$DIST/shared/tracks"

# Root redirect to the game.
cat > "$DIST/index.html" <<'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0; url=/web/" />
  <title>City Grand Prix</title>
</head>
<body><a href="/web/">City Grand Prix</a></body>
</html>
EOF

echo "built $DIST:"
du -sh "$DIST"
