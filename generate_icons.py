#!/usr/bin/env python3
"""
Utility script to generate simple icons for the Social Media to Raindrop.io
Chrome extension. The icons use a coloured background and a white
raindrop silhouette drawn as a polygon. The same design is rendered
at multiple sizes (16×16, 48×48 and 128×128 pixels) to satisfy Chrome
extension icon requirements. If new sizes are needed in future they
can easily be added to the `sizes` list below.
"""
import os
from PIL import Image, ImageDraw


def draw_raindrop(size: int, bg_color: str = "#4A90E2", fg_color: str = "#FFFFFF") -> Image.Image:
    """Create a square image of the given size with a simple raindrop.

    Args:
        size: Width and height of the image in pixels.
        bg_color: Background colour for the square (any Pillow‐compatible
            colour specification, default is a muted blue).
        fg_color: Foreground colour used for the raindrop shape (default
            is white).

    Returns:
        A Pillow Image object containing the rendered icon.
    """
    img = Image.new("RGBA", (size, size), bg_color)
    draw = ImageDraw.Draw(img)
    # Define points for a simple droplet. The points are normalized
    # relative to the size of the image so that the shape scales
    # gracefully. The shape roughly approximates a teardrop.
    w = size
    h = size
    # The droplet shape is defined as a six‑point polygon. The
    # coordinates are chosen to give the impression of a raindrop:
    # narrower at the top, bulging in the middle, then tapering to
    # a point at the bottom. Adjust these values as needed to refine
    # the appearance.
    points = [
        (w * 0.50, h * 0.05),  # top centre
        (w * 0.30, h * 0.50),  # upper left bulge
        (w * 0.22, h * 0.75),  # lower left bulge
        (w * 0.50, h * 0.95),  # bottom point
        (w * 0.78, h * 0.75),  # lower right bulge
        (w * 0.70, h * 0.50),  # upper right bulge
    ]
    draw.polygon(points, fill=fg_color)
    return img


def main():
    sizes = [16, 48, 128]
    output_dir = os.path.join(os.path.dirname(__file__), "icons")
    os.makedirs(output_dir, exist_ok=True)
    for sz in sizes:
        img = draw_raindrop(sz)
        out_path = os.path.join(output_dir, f"icon{sz}.png")
        img.save(out_path)
        print(f"Generated {out_path}")


if __name__ == "__main__":
    main()