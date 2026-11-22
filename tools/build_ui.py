"""Stitch the Tiny Swords UI pieces into contiguous 9-slice images.

The pack ships each panel as nine separated pieces laid out on a grid with
transparent gaps. CSS border-image (and canvas 9-slice drawing) needs the
pieces packed together, so this script crops the three columns and three rows
and pastes them edge to edge into assets/ui/.

Run from the repo root:  python3 tools/build_ui.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "assets/free/UI Elements/UI Elements"
OUT = ROOT / "assets/ui"
OUT.mkdir(parents=True, exist_ok=True)


def stitch(src, spans_x, spans_y, out_name):
    im = Image.open(src).convert("RGBA")
    w = sum(b - a for a, b in spans_x)
    h = sum(b - a for a, b in spans_y)
    out = Image.new("RGBA", (w, h))
    oy = 0
    for (y0, y1) in spans_y:
        ox = 0
        for (x0, x1) in spans_x:
            out.paste(im.crop((x0, y0, x1, y1)), (ox, oy))
            ox += x1 - x0
        oy += y1 - y0
    out.save(OUT / out_name)
    print(out_name, out.size)


S320 = [(0, 64), (128, 192), (256, 320)]
S448 = [(0, 128), (192, 256), (320, 448)]

stitch(UI / "Papers/RegularPaper.png", S320, S320, "paper.png")
stitch(UI / "Papers/SpecialPaper.png", S320, S320, "paper_dark.png")
for color in ("Blue", "Red"):
    for state in ("Regular", "Pressed"):
        stitch(UI / f"Buttons/Big{color}Button_{state}.png", S320, S320,
               f"btn_{color.lower()}_{state.lower()}.png")
stitch(UI / "Banners/Banner.png", S448, S448, "banner.png")
stitch(UI / "Wood Table/WoodTable.png", S448, S448, "wood.png")
stitch(UI / "Bars/BigBar_Base.png", S320, [(0, 64)], "bar_big.png")
stitch(UI / "Bars/SmallBar_Base.png", S320, [(0, 64)], "bar_small.png")

colors = ["blue", "red", "yellow", "purple", "black"]
for i, c in enumerate(colors):
    stitch(UI / "Ribbons/BigRibbons.png", S448, [(i * 128, i * 128 + 128)], f"ribbon_{c}.png")
    stitch(UI / "Ribbons/SmallRibbons.png", S320, [(i * 128, i * 128 + 64)], f"ribbon_small_{c}.png")
