"""Normalize pet action frames so every pose renders at the same visual scale.

The 20-action reference cut-outs share a 238x260 canvas but the character's
drawn extent varies per pose (standing ~246px tall vs lying ~167px), which
makes the pet appear to change size whenever the companion switches clips.
This script rescales each frame's alpha bounding box so its longest edge is
TARGET px, then re-centers it on the original canvas. Requires Pillow.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

DEFAULT_ROOT = Path(__file__).resolve().parent.parent / "assets" / "pet"
CANVAS_W, CANVAS_H = 238, 260


def normalize(image: Image.Image, target: int) -> Image.Image:
    bbox = image.getbbox()
    if bbox is None:
        raise ValueError("frame has no content")
    crop = image.crop(bbox)
    longest = max(crop.width, crop.height)
    scale = target / longest
    if crop.width * scale > CANVAS_W or crop.height * scale > CANVAS_H:
        scale = min(CANVAS_W / crop.width, CANVAS_H / crop.height)
    new_size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    resized = crop.resize(new_size, Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    canvas.paste(resized, ((CANVAS_W - new_size[0]) // 2, (CANVAS_H - new_size[1]) // 2), resized)
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--target", type=int, default=234, help="longest edge of the normalized character box")
    args = parser.parse_args()
    for path in sorted(args.root.glob("*.png")):
        image = Image.open(path).convert("RGBA")
        normalized = normalize(image, args.target)
        normalized.save(path)
        box = normalized.getbbox()
        size = (box[2] - box[0], box[3] - box[1]) if box else (0, 0)
        print(f"{path.name}: char box {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()
