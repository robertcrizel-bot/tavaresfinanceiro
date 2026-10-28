from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1] / "public"
# Keep existing visual language while enlarging the shield within the square.
def amplify(img, scale=1.45):
    img=img.convert("RGBA")
    w,h=img.size
    crop_w=round(w/scale); crop_h=round(h/scale)
    left=(w-crop_w)//2; top=(h-crop_h)//2
    return img.crop((left,top,left+crop_w,top+crop_h)).resize((w,h),Image.Resampling.LANCZOS)
for size in (192,512):
    path=ROOT / f"icon-{size}.png"
    with Image.open(path) as source: enlarged=amplify(source)
    enlarged.save(ROOT / f"icon-{size}-v2.png","PNG",optimize=True)
with Image.open(ROOT / "icon-512-v2.png") as img:
    img.save(ROOT / "favicon-v2.ico",format="ICO",sizes=[(16,16),(32,32),(48,48),(64,64)])
print("PWA and favicon symbols enlarged")
