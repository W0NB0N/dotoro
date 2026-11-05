"""One-time port: read the prototype's bitmap fonts/icons from core/graphics.py and
emit them as TypeScript source in packages/kernel/src/fonts/.

After the port the TS files are the source of truth; this script is kept only so
the conversion is reproducible / auditable.

Usage (from repo root):
    <proto>/backend/.venv/Scripts/python.exe -I tools/parity/extract_fonts.py <proto>/backend
"""
import json
import os
import sys

proto_backend = os.path.abspath(sys.argv[1])
sys.path.insert(0, proto_backend)

from core import graphics  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "kernel", "src", "fonts")

FONTS = {
    "FONT_3X4": "font3x4",
    "FONT_3X5": "font3x5",
    "FONT_4X6": "font4x6",
    "FONT_5X7": "font5x7",
    "ICONS": "icons",
}


def rows_of(bitmap):
    width = len(bitmap[0])
    out = []
    for row in bitmap:
        padded = list(row) + [0] * (width - len(row))
        out.append("".join("1" if v else "0" for v in padded[:width]))
    return out


for attr, filename in FONTS.items():
    data = getattr(graphics, attr)
    is_icons = attr == "ICONS"
    lines = [
        "// Ported from dotoro-proto backend/core/graphics.py by tools/parity/extract_fonts.py.",
        "// This file is now the source of truth; edit it directly.",
    ]
    if is_icons:
        lines.append("import { defineBitmaps } from '../bitmap';")
        lines.append("")
        lines.append("export const ICONS = defineBitmaps({")
    else:
        lines.append("import { defineFont } from '../font';")
        lines.append("")
        lines.append(f"export const {attr} = defineFont('{attr[5:].lower()}', {{")
    for key, bitmap in data.items():
        lines.append(f"  {json.dumps(key)}: {json.dumps(rows_of(bitmap))},")
    lines.append("});")
    lines.append("")
    with open(os.path.join(OUT_DIR, f"{filename}.ts"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print(f"wrote {filename}.ts ({len(data)} glyphs)")
