from PIL import Image
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'scripts', 'assets', 'icon-logo-source.jpeg')
out_dir = os.path.join(root, 'frontend', 'public')

img = Image.open(src).convert('RGBA')
pixels = img.load()
w, h = img.size

threshold = 245
for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if r >= threshold and g >= threshold and b >= threshold:
            pixels[x, y] = (255, 255, 255, 0)

bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

max_w = 640
if img.width > max_w:
    ratio = max_w / img.width
    new_h = max(1, round(img.height * ratio))
    img = img.resize((max_w, new_h), Image.Resampling.LANCZOS)

light_path = os.path.join(out_dir, 'logo_login.png')
img.save(light_path, 'PNG', optimize=True)

dark = img.copy()
dp = dark.load()
dw, dh = dark.size
for y in range(dh):
    for x in range(dw):
        r, g, b, a = dp[x, y]
        if a > 20:
            dp[x, y] = (255, 255, 255, a)
        else:
            dp[x, y] = (255, 255, 255, 0)

dark_path = os.path.join(out_dir, 'logo_login_dark.png')
dark.save(dark_path, 'PNG', optimize=True)

print('light:', light_path, img.size, os.path.getsize(light_path))
print('dark:', dark_path, dark.size, os.path.getsize(dark_path))
