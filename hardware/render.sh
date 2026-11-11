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

SCAD="openscad"
command -v xvfb-run >/dev/null && [ -z "${DISPLAY:-}" ] && SCAD="xvfb-run -a openscad"
for view in "assembly:75,0,-28:front" "assembly:70,0,145:back" "exploded:70,0,-55:exploded"; do
  IFS=: read -r part cam name <<<"$view"
  $SCAD -q -D "PART=\"$part\"" -o "img/case-$name.png" --imgsize=1400,1050 \
    --camera=0,0,0,$cam,0 --viewall --autocenter --colorscheme=Tomorrow case/bzzy_case.scad
done
for part in diffuser baffle shell clip; do
  openscad -q -D "PART=\"$part\"" -o "case/stl/$part.stl" case/bzzy_case.scad
done
echo "done: img/, case/stl/"
