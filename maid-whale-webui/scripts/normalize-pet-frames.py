"""Register pet action frames around a stable character anchor.

The reference cut-outs share a 238x260 canvas, but their subject placement
varies because detached action effects and captured divider lines distort the
full alpha bounding box. The largest connected alpha component is the pet (and
any attached prop), so it supplies a stable horizontal centre and ground line.
Detached effects follow the same translation and are edge-clamped separately.
"""

from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

DEFAULT_ROOT = Path(__file__).resolve().parent.parent / "assets" / "pet"
CANVAS_W, CANVAS_H = 238, 260
TARGET_X = CANVAS_W // 2
TARGET_BOTTOM = 241
ALPHA_THRESHOLD = 32


@dataclass(frozen=True)
class Component:
    pixels: tuple[int, ...]
    bbox: tuple[int, int, int, int]

    @property
    def area(self) -> int:
        return len(self.pixels)


def connected_components(image: Image.Image, threshold: int = ALPHA_THRESHOLD) -> list[Component]:
    alpha = image.getchannel("A")
    width, height = image.size
    mask = bytearray(1 if value > threshold else 0 for value in alpha.tobytes())
    seen = bytearray(width * height)
    components: list[Component] = []

    for start, visible in enumerate(mask):
        if not visible or seen[start]:
            continue
        seen[start] = 1
        queue = deque([start])
        pixels: list[int] = []
        min_x = min_y = max(width, height)
        max_x = max_y = -1
        while queue:
            index = queue.popleft()
            y, x = divmod(index, width)
            pixels.append(index)
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
            for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                row = neighbor_y * width
                for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = row + neighbor_x
                    if mask[neighbor] and not seen[neighbor]:
                        seen[neighbor] = 1
                        queue.append(neighbor)
        components.append(Component(tuple(pixels), (min_x, min_y, max_x + 1, max_y + 1)))

    return sorted(components, key=lambda component: component.area, reverse=True)


def _is_divider_line(component: Component, width: int) -> bool:
    left, top, right, bottom = component.bbox
    return right - left >= round(width * 0.9) and bottom - top <= 2


def _clamped_shift(component: Component, dx: int, dy: int, size: tuple[int, int]) -> tuple[int, int]:
    width, height = size
    left, top, right, bottom = component.bbox
    return (
        min(max(dx, -left), width - right),
        min(max(dy, -top), height - bottom),
    )


def normalize(image: Image.Image, target: int = 234) -> Image.Image:
    """Translate the subject to the shared anchor without resampling its pixels.

    ``target`` remains accepted for compatibility with the previous scale-based
    command; registration deliberately preserves the source scale.
    """

    del target
    image = image.convert("RGBA")
    if image.size != (CANVAS_W, CANVAS_H):
        raise ValueError(f"expected {CANVAS_W}x{CANVAS_H} frame, got {image.size[0]}x{image.size[1]}")
    anchor_components = [
        component for component in connected_components(image) if not _is_divider_line(component, image.width)
    ]
    if not anchor_components:
        raise ValueError("frame has no content")

    subject = anchor_components[0]
    left, _, right, bottom = subject.bbox
    dx = round(TARGET_X - (left + right) / 2)
    dy = TARGET_BOTTOM - bottom
    source = image.load()
    output = Image.new("RGBA", image.size, (0, 0, 0, 0))
    artwork = [
        component
        for component in connected_components(image, threshold=0)
        if not _is_divider_line(component, image.width)
    ]

    for component in artwork:
        component_dx, component_dy = _clamped_shift(component, dx, dy, image.size)
        layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
        layer_pixels = layer.load()
        for index in component.pixels:
            y, x = divmod(index, image.width)
            layer_pixels[x + component_dx, y + component_dy] = source[x, y]
        output.alpha_composite(layer)

    return output


def normalize_file(path: Path, target: int = 234) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGBA")
        image.load()
    normalized = normalize(image, target)
    temporary = path.with_name(f".{path.stem}.tmp.png")
    try:
        normalized.save(temporary)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return normalized


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--target", type=int, default=234, help=argparse.SUPPRESS)
    args = parser.parse_args()
    for path in sorted(args.root.glob("*.png")):
        normalized = normalize_file(path, args.target)
        subject = connected_components(normalized)[0]
        left, top, right, bottom = subject.bbox
        print(
            f"{path.name}: subject centre {(left + right) / 2:.1f}, "
            f"baseline {bottom}, box {right - left}x{bottom - top}"
        )


if __name__ == "__main__":
    main()
