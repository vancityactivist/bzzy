#!/usr/bin/env bash
# Regenerate everything in hardware/ from the two sources of truth:
#   led-ring/gen_led_ring.py  (board, schematic, BOM/CPL, board_dims.scad)
#   case/bzzy_case.scad       (case)
# Needs KiCad 7+ (its Python, for pcbnew) and OpenSCAD. On a headless Linux box,
# xvfb-run is used for the OpenSCAD images.
set -euo pipefail
cd "$(dirname "$0")"

PY=${KICAD_PYTHON:-python3}
(cd led-ring && "$PY" gen_led_ring.py)

mkdir -p img case/stl
kicad-cli sch export svg -o img led-ring/bzzy-led-ring.kicad_sch >/dev/null
mv img/bzzy-led-ring.svg img/schematic.svg
kicad-cli pcb export svg --layers F.Cu,F.Fab,Edge.Cuts --page-size-mode 2 --exclude-drawing-sheet \
  -o img/pcb-front.svg led-ring/bzzy-led-ring.kicad_pcb >/dev/null
kicad-cli pcb export svg --layers B.Cu,B.SilkS,Edge.Cuts --page-size-mode 2 --exclude-drawing-sheet \
  -o img/pcb-back.svg led-ring/bzzy-led-ring.kicad_pcb >/dev/null

# Gerbers + drill files, zipped for JLCPCB (gitignored: rebuild with this script)
G=$(mktemp -d)
kicad-cli pcb export gerbers --layers F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts \
  --subtract-soldermask --no-x2 -o "$G/" led-ring/bzzy-led-ring.kicad_pcb >/dev/null
kicad-cli pcb export drill --format excellon --excellon-separate-th --excellon-units mm \
  -o "$G/" led-ring/bzzy-led-ring.kicad_pcb >/dev/null
rm -f led-ring/fab/gerbers.zip
(cd "$G" && zip -q -r - .) > led-ring/fab/gerbers.zip
rm -rf "$G"

# The wordmark font (Geist SemiBold, SIL OFL), fetched from npm, not committed.
if [ ! -f case/fonts/Geist-SemiBold.ttf ]; then
  F=$(mktemp -d)
  (cd "$F" && npm pack -q geist@1.3.1 >/dev/null && tar xzf geist-1.3.1.tgz)
  mkdir -p case/fonts
  cp "$F/package/dist/fonts/geist-sans/Geist-SemiBold.ttf" "$F/package/LICENSE.TXT" case/fonts/
  rm -rf "$F"
fi

SCAD="openscad"
command -v xvfb-run >/dev/null && [ -z "${DISPLAY:-}" ] && SCAD="xvfb-run -a openscad"
for view in "noclip:75,0,-28:front:" "noclip:80,0,-12:busy:#ff3b30" "noclip:40,0,-25:top:" \
            "assembly:70,0,145:back:" "exploded:70,0,-55:exploded:"; do
  IFS=: read -r part cam name glow <<<"$view"
  $SCAD -q -D "PART=\"$part\"" -D "GLOW=\"$glow\"" -o "img/case-$name.png" --imgsize=1400,1050 \
    --camera=0,0,0,$cam,0 --viewall --autocenter --colorscheme=Tomorrow case/bzzy_case.scad
done
# One STL per printed part, already turned the way it prints best.
# Frosted white: light. Black: frame, back, trim, button, clip.
for part in light frame back trim button clip; do
  openscad -q -D "PART=\"$part\"" -o "case/stl/$part.stl" case/bzzy_case.scad
done
echo "done: img/, case/stl/, led-ring/fab/gerbers.zip"
