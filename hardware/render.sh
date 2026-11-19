#!/usr/bin/env bash
# Regenerate everything in hardware/ from the two sources of truth:
#   archive/led-ring-revC/gen_led_ring.py  (archived rev C ring board; still writes
#                                           case/board_dims.scad until the main board
#                                           generator replaces it)
#   case/bzzy_case.scad                    (case)
# Needs KiCad 7+ (its Python, for pcbnew) and OpenSCAD. On a headless Linux box,
# xvfb-run is used for the OpenSCAD images.
set -euo pipefail
cd "$(dirname "$0")"

PY=${KICAD_PYTHON:-python3}
RING=archive/led-ring-revC
(cd "$RING" && "$PY" gen_led_ring.py)

mkdir -p img "$RING/img" case/stl
kicad-cli sch export svg -o "$RING/img" "$RING/bzzy-led-ring.kicad_sch" >/dev/null
mv "$RING/img/bzzy-led-ring.svg" "$RING/img/schematic.svg"
kicad-cli pcb export svg --layers F.Cu,F.Fab,Edge.Cuts --page-size-mode 2 --exclude-drawing-sheet \
  -o "$RING/img/pcb-front.svg" "$RING/bzzy-led-ring.kicad_pcb" >/dev/null
kicad-cli pcb export svg --layers B.Cu,B.SilkS,Edge.Cuts --page-size-mode 2 --exclude-drawing-sheet \
  -o "$RING/img/pcb-back.svg" "$RING/bzzy-led-ring.kicad_pcb" >/dev/null

# Gerbers + drill files, zipped for JLCPCB (gitignored: rebuild with this script)
G=$(mktemp -d)
kicad-cli pcb export gerbers --layers F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts \
  --subtract-soldermask --no-x2 -o "$G/" "$RING/bzzy-led-ring.kicad_pcb" >/dev/null
kicad-cli pcb export drill --format excellon --excellon-separate-th --excellon-units mm \
  -o "$G/" "$RING/bzzy-led-ring.kicad_pcb" >/dev/null
rm -f "$RING/fab/gerbers.zip"
(cd "$G" && zip -q -r - .) > "$RING/fab/gerbers.zip"
rm -rf "$G"

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
echo "done: img/, case/stl/, $RING/img/, $RING/fab/gerbers.zip"
