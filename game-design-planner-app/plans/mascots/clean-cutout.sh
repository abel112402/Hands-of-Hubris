#!/usr/bin/env bash
# Turns a Hubi picture on a white background into an app-ready cutout (see plans/mascots/POSE_PROMPTS.md).
#   bash plans/mascots/clean-cutout.sh <input.png> <output.webp> [--keep-holes]
# Needs ImageMagick 7 (`magick`) and Node (for picking flood-fill seeds).
# Steps: white background off from the corners; enclosed pure-white holes off (unless --keep-holes);
# grey-blue ground shadow off, flood-filled from the bottom rows so feet of a similar colour survive;
# alpha edge pulled in by 1 px and softened (no light fringe on dark themes); trim; max 600 px tall; WebP.
# Also writes <input>-check.png: the result on a dark and a light background, side by side.
set -euo pipefail

in="${1:?input image}"
out="${2:?output .webp}"
keep_holes="${3:-}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

magick "$in" -alpha set -background white -alpha remove -alpha set "$tmp/src.png"
w=$(magick identify -format %w "$tmp/src.png")
h=$(magick identify -format %h "$tmp/src.png")

# 1. Background: flood from all four corners.
magick "$tmp/src.png" -fuzz 6% -fill none \
  -draw "color 0,0 floodfill" -draw "color $((w-1)),0 floodfill" \
  -draw "color 0,$((h-1)) floodfill" -draw "color $((w-1)),$((h-1)) floodfill" "$tmp/a.png"

# 2. Enclosed holes (between an arm and the body…): large, pure-white, opaque areas.
if [ "$keep_holes" != "--keep-holes" ]; then
  magick "$tmp/a.png" -background black -alpha remove -colorspace gray -threshold 98% \
    -define connected-components:area-threshold=120 -define connected-components:mean-color=true \
    -connected-components 4 -threshold 50% "$tmp/holes.png"
  magick "$tmp/a.png" \( "$tmp/a.png" -alpha extract \( "$tmp/holes.png" -negate \) -compose multiply -composite \) \
    -alpha off -compose CopyOpacity -composite "$tmp/a.png"
fi

# 3. Ground shadow: seeds on the two bottom rows of the figure that have the shadow's grey-blue.
magick "$tmp/a.png" -trim +repage "$tmp/t.png"
tw=$(magick identify -format %w "$tmp/t.png")
th=$(magick identify -format %h "$tmp/t.png")
magick "$tmp/t.png" -crop "${tw}x7+0+$((th-7))" +repage -depth 8 txt:- > "$tmp/bottom.txt"
seeds=$(node -e "
const fs = require('fs'); const off = $((th-7)); const out = []
for (const l of fs.readFileSync(process.argv[1], 'utf8').split('\n')) {
  const m = l.match(/^(\d+),(\d+):\s*\((\d+),(\d+),(\d+),(\d+)\)/); if (!m) continue
  const [x, y, r, g, b, a] = m.slice(1).map(Number)
  if (a < 128 || x % 3 || (y !== 1 && y !== 5)) continue
  if (Math.abs(r - 176) < 25 && Math.abs(g - 197) < 25 && Math.abs(b - 198) < 25 && g - r > 8) out.push(x + ',' + (y + off))
}
console.log(out.join(' '))" "$tmp/bottom.txt")
args=()
for p in $seeds; do args+=(-draw "color $p floodfill"); done
if [ ${#args[@]} -gt 0 ]; then magick "$tmp/t.png" -fuzz 9% -fill none "${args[@]}" "$tmp/t.png"; fi

# 4. Soft edge, trim, size, WebP.
magick "$tmp/t.png" \( +clone -alpha extract -threshold 50% -morphology Erode Disk:1 -blur 0x0.7 \) \
  -alpha off -compose CopyOpacity -composite -trim +repage -resize 'x600>' "$tmp/final.png"
mkdir -p "$(dirname "$out")"
magick "$tmp/final.png" -quality 85 -define webp:alpha-quality=100 "$out"

# 5. Preview on dark and light.
magick \( "$tmp/final.png" -background '#16181d' -flatten \) \( "$tmp/final.png" -background white -flatten \) +append "${in%.*}-check.png"
echo "$out ($(magick identify -format '%wx%h' "$out")), preview: ${in%.*}-check.png, shadow seeds: ${#args[@]}"
