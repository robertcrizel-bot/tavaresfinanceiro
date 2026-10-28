"""Enlarge the existing FinanceControl mark inside its app icon assets.

Runs only in an isolated GitHub Actions job, never against production data.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public"
ZOOM = 1.22

def enlarge(src: Image.Image) -> Image.Image:
    img = src.convert("RGBA")
    w, h = img.size
    cw, ch = round(w / ZOOM), round(h / ZOOM)
    x, y = (w - cw) // 2, (h - ch) // 2
    return img.crop((x, y, x + cw, y + ch)).resize((w, h), Image.Resampling.LANCZOS)

if __name__ == "__main__":
    icons = []
    for size in (192, 512):
        path = ROOT / f"icon-{size}.png"
        with Image.open(path) as img:
            result = enlarge(img)
        result.save(path, "PNG", optimize=True)
        icons.append(result)
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    icons[-1].convert("RGBA").save(ROOT / "favicon.ico", format="ICO", sizes=sizes)
    print("Updated PNG PWA icons and Windows/browser favicon from existing artwork.")
