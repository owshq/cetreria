from collections import deque

from PIL import Image
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'scripts', 'assets', 'icon-logo-source.jpeg')
out_dir = os.path.join(root, 'frontend', 'public')


def remove_white_background(image, threshold=245):
    rgba = image.convert('RGBA')
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (255, 255, 255, 0)
    bbox = rgba.getbbox()
    return rgba.crop(bbox) if bbox else rgba


def is_perch_pixel(r, g, b, a):
    if a < 20:
        return False
    # Rama amarilla/naranja del logo
    return r > 130 and g > 95 and b < 155 and (r - b) > 30


def is_bird_body_pixel(r, g, b, a):
    if a < 20:
        return False
    # Verde oliva del halcon (cuerpo, alas, garras)
    return g > 40 and g >= r - 5 and g > b + 4


def is_bird_highlight_pixel(r, g, b, a):
    if a < 20:
        return False
    # Detalle blanco del plumaje
    return r > 175 and g > 175 and b > 175


def column_has_body(pixels, x, top_y, bottom_y, width):
    for y in range(top_y, bottom_y + 1):
        px = pixels[x, y]
        if is_bird_body_pixel(*px) or is_bird_highlight_pixel(*px):
            return True
    return False


def column_has_bird_mass(pixels, x, min_y, body_max_y):
    """Masa del halcon (no el palo vertical de la H)."""
    torso_top = min_y + int((body_max_y - min_y) * 0.1)
    torso_bottom = min_y + int((body_max_y - min_y) * 0.9)
    count = 0
    for y in range(torso_top, torso_bottom + 1):
        px = pixels[x, y]
        if is_bird_body_pixel(*px) or is_bird_highlight_pixel(*px):
            count += 1
    return count >= 3


def keep_largest_component(image):
    """Conserva solo el halcon; elimina la H u otros restos desconectados."""
    pixels = image.load()
    w, h = image.size
    visited = [[False] * w for _ in range(h)]
    best: list[tuple[int, int]] = []

    for sy in range(h):
        for sx in range(w):
            if visited[sy][sx] or pixels[sx, sy][3] <= 20:
                continue
            queue = deque([(sx, sy)])
            visited[sy][sx] = True
            component: list[tuple[int, int]] = []
            while queue:
                x, y = queue.popleft()
                component.append((x, y))
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if (
                        0 <= nx < w
                        and 0 <= ny < h
                        and not visited[ny][nx]
                        and pixels[nx, ny][3] > 20
                    ):
                        visited[ny][nx] = True
                        queue.append((nx, ny))
            if len(component) > len(best):
                best = component

    if not best:
        return image

    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    for x, y in best:
        op[x, y] = pixels[x, y]
    tight = out.getbbox()
    return out.crop(tight) if tight else out


def find_bird_left_edge(pixels, w, h):
    torso_top = int(h * 0.18)
    torso_bottom = int(h * 0.74)
    proj = [
        sum(1 for y in range(torso_top, torso_bottom) if pixels[x, y][3] > 20)
        for x in range(w)
    ]
    if not any(proj):
        return 0

    peak = max(proj)
    peak_x = proj.index(peak)
    threshold = max(8, int(peak * 0.34))
    bird_left = peak_x
    for x in range(peak_x, -1, -1):
        if proj[x] >= threshold:
            bird_left = x
        else:
            break
    return bird_left


def remove_chest_spike(image):
    """Elimina la linea recta del pecho (resto de la H o franja)."""
    pixels = image.load()
    w, h = image.size
    zone_top = int(h * 0.28)
    zone_bottom = int(h * 0.62)

    for y in range(zone_top, zone_bottom):
        reference_lefts: list[int] = []
        for wy in range(max(0, y - 24), y - 3):
            xs = [x for x in range(w) if pixels[x, wy][3] > 20]
            if xs:
                reference_lefts.append(xs[0])
        if len(reference_lefts) < 5:
            continue

        reference_lefts.sort()
        reference = reference_lefts[len(reference_lefts) // 4]
        row_xs = [x for x in range(w) if pixels[x, y][3] > 20]
        if not row_xs:
            continue
        if row_xs[0] < reference - 10:
            cutoff = max(0, reference - 3)
            for x in range(cutoff):
                pixels[x, y] = (0, 0, 0, 0)

    tight = image.getbbox()
    return image.crop(tight) if tight else image


def remove_left_branch_bridge(image):
    """Quita la franja inferior que conecta la H con la rama del halcon."""
    pixels = image.load()
    w, h = image.size
    bird_left = find_bird_left_edge(pixels, w, h)

    bridge_top = int(h * 0.68)
    for y in range(bridge_top, h):
        for x in range(0, bird_left):
            pixels[x, y] = (0, 0, 0, 0)

    for x in range(0, bird_left):
        if sum(1 for y in range(int(h * 0.18), int(h * 0.74)) if pixels[x, y][3] > 20) <= 2:
            for y in range(h):
                pixels[x, y] = (0, 0, 0, 0)

    tight = image.getbbox()
    return image.crop(tight) if tight else image


def extract_bird(source_rgba):
    w, h = source_rgba.size
    upper_h = int(h * 0.58)
    split_x = int(w * 0.57)
    region = source_rgba.crop((split_x, 0, w, upper_h))
    pixels = region.load()
    rw, rh = region.size

    min_x, min_y, max_x, max_y = rw, rh, 0, 0
    found = False
    for y in range(rh):
        for x in range(rw):
            px = pixels[x, y]
            if is_bird_body_pixel(*px) or is_bird_highlight_pixel(*px):
                found = True
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if not found:
        tight = region.getbbox()
        return region.crop(tight) if tight else region

    body_max_y = max_y
    bottom_y = body_max_y
    for y in range(body_max_y, rh):
        row_hit = False
        for x in range(min_x, max_x + 1):
            px = pixels[x, y]
            if is_bird_body_pixel(*px) or (
                is_perch_pixel(*px) and column_has_bird_mass(pixels, x, min_y, body_max_y)
            ):
                bottom_y = y
                row_hit = True
        if not row_hit and y > bottom_y + 8:
            break

    pad = 4
    crop_box = (
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(rw, max_x + pad + 1),
        min(rh, bottom_y + pad + 1),
    )
    crop = region.crop(crop_box)
    cpixels = crop.load()
    cw, ch = crop.size
    offset_x, offset_y = crop_box[0], crop_box[1]

    for y in range(ch):
        for x in range(cw):
            src_x = x + offset_x
            src_y = y + offset_y
            px = pixels[src_x, src_y]
            keep_body = is_bird_body_pixel(*px) or is_bird_highlight_pixel(*px)
            keep_branch = (
                src_y > body_max_y
                and is_perch_pixel(*px)
                and column_has_bird_mass(pixels, src_x, min_y, body_max_y)
            )
            if not (keep_body or keep_branch):
                cpixels[x, y] = (0, 0, 0, 0)

    tight = crop.getbbox()
    result = crop.crop(tight) if tight else crop
    cleaned = remove_left_branch_bridge(result)
    cleaned = keep_largest_component(cleaned)
    return remove_chest_spike(cleaned)


def is_bird_pixel(r, g, b, a):
    if a < 20:
        return False
    if r < 40 and g < 40 and b < 40:
        return False
    return True


def prune_isolated_pixels(image, passes=3):
    """Elimina puntos sueltos (restos de 1px)."""
    pixels = image.load()
    w, h = image.size
    for _ in range(passes):
        to_clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = pixels[x, y]
                if not is_bird_pixel(r, g, b, a):
                    continue
                neighbors = sum(
                    1
                    for dx, dy in (
                        (-1, 0), (1, 0), (0, -1), (0, 1),
                        (-1, -1), (-1, 1), (1, -1), (1, 1),
                    )
                    if 0 <= x + dx < w
                    and 0 <= y + dy < h
                    and is_bird_pixel(*pixels[x + dx, y + dy])
                )
                if neighbors <= 1:
                    to_clear.append((x, y))
        for x, y in to_clear:
            pixels[x, y] = (0, 0, 0, 0)
    return image


def remove_left_antialias_specks(image):
    """Quita motas de antialiasing sueltas a la izquierda del halcon."""
    pixels = image.load()
    w, h = image.size
    row_lefts: list[int] = []
    for y in range(h):
        xs = [x for x in range(w) if is_bird_pixel(*pixels[x, y])]
        if len(xs) >= 4:
            row_lefts.append(xs[0])
    if not row_lefts:
        return image

    row_lefts.sort()
    guard = row_lefts[max(0, len(row_lefts) // 8)]

    for y in range(h):
        for x in range(0, min(w, guard + 1)):
            if not is_bird_pixel(*pixels[x, y]):
                continue
            neighbors = sum(
                1
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))
                if 0 <= x + dx < w
                and 0 <= y + dy < h
                and is_bird_pixel(*pixels[x + dx, y + dy])
            )
            if neighbors <= 2:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def fit_bird_on_square(bird, size, background, pad=14):
    avail = size - pad * 2
    scale = min(avail / bird.width, avail / bird.height)
    target_w = max(1, round(bird.width * scale))
    target_h = max(1, round(bird.height * scale))
    resized = bird.resize((target_w, target_h), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size), background)
    offset_x = (size - target_w) // 2
    offset_y = (size - target_h) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)
    return canvas


def is_detail_pixel(r, g, b, a):
    if a < 20:
        return False
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    if luminance < 118:
        return True
    if max(r, g, b) < 95:
        return True
    if g > 40 and g > r and luminance < 145 and (r + b) < g * 1.1:
        return True
    return False


def to_white_bird(bird, *, solid=False):
    """Silueta blanca; en favicon (solid) todo blanco para verse sobre fondo negro."""
    white = bird.copy()
    wp = white.load()
    orig = bird.load()
    for y in range(white.height):
        for x in range(white.width):
            r, g, b, a = orig[x, y]
            if a < 20:
                wp[x, y] = (0, 0, 0, 0)
                continue
            if solid:
                wp[x, y] = (255, 255, 255, a)
                continue
            if is_detail_pixel(r, g, b, a):
                wp[x, y] = (0, 0, 0, 255)
            else:
                wp[x, y] = (255, 255, 255, a)
    return white


def scale_bird(bird, max_dim):
    scale = min(max_dim / bird.width, max_dim / bird.height)
    target_w = max(1, round(bird.width * scale))
    target_h = max(1, round(bird.height * scale))
    return bird.resize((target_w, target_h), Image.Resampling.LANCZOS)


source = remove_white_background(Image.open(src))
bird = extract_bird(source)

img = source.copy()
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

logo_white = to_white_bird(bird, solid=False)
favicon_bird = prune_isolated_pixels(
    keep_largest_component(
        remove_chest_spike(to_white_bird(bird, solid=True))
    )
)

logo_path = os.path.join(out_dir, 'logo.png')
scale_bird(bird, 256).save(logo_path, 'PNG', optimize=True)

logo_white_path = os.path.join(out_dir, 'logo_white.png')
scale_bird(logo_white, 256).save(logo_white_path, 'PNG', optimize=True)

# Favicon: pajaro blanco solido centrado sobre fondo negro
favicon_path = os.path.join(out_dir, 'favicon.png')
favicon = remove_left_antialias_specks(
    prune_isolated_pixels(
        fit_bird_on_square(favicon_bird, 128, (0, 0, 0, 255), pad=10),
        passes=8,
    )
)
favicon.save(favicon_path, 'PNG', optimize=True)

print('bird:', bird.size)
print('light:', light_path, img.size, os.path.getsize(light_path))
print('dark:', dark_path, dark.size, os.path.getsize(dark_path))
print('logo:', logo_path, scale_bird(bird, 256).size, os.path.getsize(logo_path))
print('logo_white:', logo_white_path, os.path.getsize(logo_white_path))
print('favicon:', favicon_path, favicon.size, os.path.getsize(favicon_path))
