from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(r"D:\!cvsroot\alorbach\AI-Video-Fact-Check\extension\icons")
OUT.mkdir(parents=True, exist_ok=True)

OUTER = (11, 110, 79, 255)  # #0b6e4f
INNER = (20, 130, 95, 255)
ORANGE = (232, 93, 4, 255)
WHITE = (255, 255, 255, 255)


def draw_camera(draw: ImageDraw.ImageDraw, cx: float, cy: float, s: float) -> None:
    """Single camera glyph centered in the icon (no separate badge)."""
    bw, bh = s * 1.7, s * 1.05
    left, top = cx - bw / 2, cy - bh / 2 + s * 0.08
    draw.rounded_rectangle(
        [left, top, left + bw, top + bh],
        radius=max(1, int(s * 0.18)),
        fill=WHITE,
    )
    # orange lens
    lr = s * 0.38
    draw.ellipse(
        [cx - lr, cy - lr + s * 0.08, cx + lr, cy + lr + s * 0.08],
        fill=ORANGE,
    )
    # inner lens ring
    ir = s * 0.18
    draw.ellipse(
        [cx - ir, cy - ir + s * 0.08, cx + ir, cy + ir + s * 0.08],
        fill=WHITE,
    )
    # viewfinder
    vw, vh = s * 0.42, s * 0.28
    draw.rounded_rectangle(
        [cx - bw * 0.28, top - vh * 0.75, cx - bw * 0.28 + vw, top + vh * 0.2],
        radius=max(1, int(s * 0.08)),
        fill=WHITE,
    )


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    margin = max(1, size // 18)
    d.rounded_rectangle(
        [margin, margin, size - 1 - margin, size - 1 - margin],
        radius=max(2, size // 5),
        fill=OUTER,
    )
    pad = max(2, size // 7)
    d.rounded_rectangle(
        [pad, pad, size - 1 - pad, size - 1 - pad],
        radius=max(1, size // 6),
        fill=INNER,
    )
    # One centered camera — reads as a single icon at every size
    scale = size * 0.22
    draw_camera(d, size / 2, size / 2, scale)
    return img


for size in (16, 48, 128):
    path = OUT / f"icon{size}.png"
    make_icon(size).save(path, "PNG")
    print(f"wrote {path} ({path.stat().st_size} bytes)")
