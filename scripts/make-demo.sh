#!/usr/bin/env bash
#
# Build the README demo animation.
#
# `make-demo.mjs` writes SVG frames from the application's own data — the tree
# layout, the route through it, and real Morse timing. This turns them into a
# GIF, which is ImageMagick's job rather than Node's.
#
#   npm run demo
#
# Requires ImageMagick. The font has to be passed explicitly: ImageMagick has no
# font configuration on macOS and fails with "UnableToReadFont ''" otherwise,
# silently producing frames with no text at all.

set -euo pipefail

cd "$(dirname "$0")/.."

FRAMES=.demo-frames
OUT=docs/demo.gif
FONT="${DEMO_FONT:-/System/Library/Fonts/Supplemental/Arial.ttf}"

if ! command -v magick >/dev/null 2>&1; then
  echo "!! ImageMagick is not installed (brew install imagemagick)" >&2
  exit 1
fi

if [ ! -f "$FONT" ]; then
  echo "!! Font not found: $FONT — set DEMO_FONT to one that exists" >&2
  exit 1
fi

echo "==> Rendering frames"
node scripts/make-demo.mjs

echo "==> Converting to PNG"
for svg in "$FRAMES"/f*.svg; do
  magick -font "$FONT" "$svg" "${svg%.svg}.png"
done

# 256 colours, not fewer. The tree's connecting lines are a very dark blue
# against a near-black background, and quantising harder merges them into it —
# which leaves the nodes floating with no structure between them, losing the
# one thing the picture is meant to show.
echo "==> Assembling"
mkdir -p docs
magick -delay 10 -loop 0 "$FRAMES"/f\*.png -colors 256 -layers Optimize "$OUT"

rm -rf "$FRAMES"

printf "==> %s — %s frames, %s\n" \
  "$OUT" \
  "$(magick identify "$OUT" | wc -l | tr -d ' ')" \
  "$(ls -lh "$OUT" | awk '{print $5}')"
