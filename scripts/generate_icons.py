#!/usr/bin/env python3
"""Generate minimalist white-on-blue PNG icons for the extension (stdlib only).

Supports five candidate directions (A-E). Run with no args to emit preview
images (preview_A.png ... preview_E.png + preview_all.png). After the user
picks a letter, change FINAL below and call build_final().
"""
import struct
import zlib
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")
BG = (26, 115, 232)        # #1a73e8 brand blue
FG = (255, 255, 255)       # white glyph
WHITE = (255, 255, 255)    # white tile

# Which candidate becomes the shipped 16/48/128 icon (set after user picks).
FINAL = "F"


def tile_white(px, py):
    return in_rounded_rect(px, py, 0.0, 0.0, 1.0, 1.0, 0.20)


def gradient_bg(px, py):
    # brand blue (top) -> white (bottom)
    t = max(0.0, min(1.0, py))
    r = int(BG[0] + (WHITE[0] - BG[0]) * t)
    g = int(BG[1] + (WHITE[1] - BG[1]) * t)
    b = int(BG[2] + (WHITE[2] - BG[2]) * t)
    return (r, g, b)


def tile_gradient(px, py):
    return in_rounded_rect(px, py, 0.0, 0.0, 1.0, 1.0, 0.20)


def in_rounded_rect(px, py, x0, y0, x1, y1, r):
    if px < x0 or px > x1 or py < y0 or py > y1:
        return False
    if px < x0 + r and py < y0 + r:
        return (px - (x0 + r)) ** 2 + (py - (y0 + r)) ** 2 <= r * r
    if px > x1 - r and py < y0 + r:
        return (px - (x1 - r)) ** 2 + (py - (y0 + r)) ** 2 <= r * r
    if px < x0 + r and py > y1 - r:
        return (px - (x0 + r)) ** 2 + (py - (y1 - r)) ** 2 <= r * r
    if px > x1 - r and py > y1 - r:
        return (px - (x1 - r)) ** 2 + (py - (y1 - r)) ** 2 <= r * r
    return True


def circle(px, py, cx, cy, r):
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def ring(px, py, cx, cy, r_out, r_in):
    d2 = (px - cx) ** 2 + (py - cy) ** 2
    return r_in ** 2 <= d2 <= r_out ** 2


def thick_line(px, py, x1, y1, x2, y2, w):
    dx, dy = x2 - x1, y2 - y1
    L2 = dx * dx + dy * dy
    if L2 == 0:
        t = 0.0
    else:
        t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / L2))
    cx, cy = x1 + t * dx, y1 + t * dy
    return (px - cx) ** 2 + (py - cy) ** 2 <= (w / 2) ** 2


def _sign(p1, p2, p3):
    return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])


def point_in_triangle(px, py, a, b, c):
    d1 = _sign((px, py), a, b)
    d2 = _sign((px, py), b, c)
    d3 = _sign((px, py), c, a)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


def tile(px, py):
    return in_rounded_rect(px, py, 0.0, 0.0, 1.0, 1.0, 0.20)


# ---- Candidate A: minimalist camera -------------------------------------
def sample_A(px, py):
    if not tile(px, py):
        return (0, 0, 0), False
    body_out = in_rounded_rect(px, py, 0.20, 0.34, 0.80, 0.70, 0.10)
    body_in = in_rounded_rect(px, py, 0.28, 0.42, 0.72, 0.62, 0.06)
    frame = body_out and not body_in
    bump = in_rounded_rect(px, py, 0.40, 0.27, 0.60, 0.36, 0.02)
    lens_ring = ring(px, py, 0.50, 0.52, 0.13, 0.07)
    lens_core = circle(px, py, 0.50, 0.52, 0.07)
    if frame or bump or lens_ring:
        return FG, True
    if lens_core:
        return BG, True
    return BG, True


# ---- Candidate B: SM letter monogram -----------------------------------
def sample_B(px, py):
    if not tile(px, py):
        return (0, 0, 0), False
    w = 0.075
    segs = [
        # S (left half)
        (0.20, 0.32, 0.48, 0.32), (0.20, 0.32, 0.20, 0.48),
        (0.20, 0.48, 0.48, 0.48), (0.48, 0.48, 0.48, 0.64),
        (0.20, 0.64, 0.48, 0.64),
        # M (right half)
        (0.54, 0.32, 0.54, 0.66), (0.54, 0.32, 0.67, 0.54),
        (0.67, 0.54, 0.80, 0.32), (0.80, 0.32, 0.80, 0.66),
    ]
    for (x1, y1, x2, y2) in segs:
        if thick_line(px, py, x1, y1, x2, y2, w):
            return FG, True
    dot = circle(px, py, 0.80, 0.80, 0.045)
    if dot:
        return FG, True
    return BG, True


# ---- Candidate C: picture frame + mountain + tag dot -------------------
def sample_C(px, py):
    if not tile(px, py):
        return (0, 0, 0), False
    outer = in_rounded_rect(px, py, 0.26, 0.24, 0.74, 0.66, 0.05)
    inner = in_rounded_rect(px, py, 0.32, 0.30, 0.68, 0.60, 0.03)
    frame = outer and not inner
    mountain = point_in_triangle(px, py, (0.34, 0.58), (0.58, 0.40), (0.72, 0.58))
    dot = circle(px, py, 0.76, 0.76, 0.05)
    if frame or mountain or dot:
        return FG, True
    return BG, True


# ---- Candidate D: pure mountain polyline, transparent background -------
def sample_D(px, py):
    # White mountain polyline on transparent background (dark toolbars).
    m1 = thick_line(px, py, 0.22, 0.70, 0.40, 0.42, 0.085)
    m2 = thick_line(px, py, 0.40, 0.42, 0.56, 0.60, 0.085)
    m3 = thick_line(px, py, 0.56, 0.60, 0.78, 0.34, 0.085)
    if m1 or m2 or m3:
        return FG, True
    return (0, 0, 0), False


# ---- Candidate E: magnifier over a tiny picture ------------------------
def sample_E(px, py):
    if not tile(px, py):
        return (0, 0, 0), False
    ring1 = ring(px, py, 0.44, 0.44, 0.27, 0.19)
    handle = thick_line(px, py, 0.62, 0.62, 0.84, 0.84, 0.10)
    sun = circle(px, py, 0.57, 0.35, 0.04)
    m = point_in_triangle(px, py, (0.30, 0.56), (0.44, 0.42), (0.58, 0.56))
    if ring1 or handle or sun or m:
        return FG, True
    return BG, True


# ---- Candidate D variants (based on D, less "stock-chart" looking) -----
def sample_D1(px, py):
    # mountain polyline + small sun (classic "picture" cue)
    if not tile(px, py):
        return (0, 0, 0), False
    m1 = thick_line(px, py, 0.22, 0.70, 0.40, 0.42, 0.085)
    m2 = thick_line(px, py, 0.40, 0.42, 0.56, 0.60, 0.085)
    m3 = thick_line(px, py, 0.56, 0.60, 0.78, 0.34, 0.085)
    sun = circle(px, py, 0.32, 0.34, 0.07)
    if m1 or m2 or m3 or sun:
        return FG, True
    return BG, True


def sample_D2(px, py):
    # solid mountain triangle + sun (reads as a photo of hills)
    if not tile(px, py):
        return (0, 0, 0), False
    mountain = point_in_triangle(px, py, (0.24, 0.68), (0.50, 0.34), (0.76, 0.68))
    sun = circle(px, py, 0.66, 0.40, 0.07)
    if mountain or sun:
        return FG, True
    return BG, True


def sample_D3(px, py):
    # mountain polyline + horizon line (reads as a landscape frame)
    if not tile(px, py):
        return (0, 0, 0), False
    m1 = thick_line(px, py, 0.22, 0.66, 0.40, 0.42, 0.085)
    m2 = thick_line(px, py, 0.40, 0.42, 0.56, 0.58, 0.085)
    m3 = thick_line(px, py, 0.56, 0.58, 0.78, 0.36, 0.085)
    ground = thick_line(px, py, 0.20, 0.70, 0.80, 0.70, 0.06)
    if m1 or m2 or m3 or ground:
        return FG, True
    return BG, True


SAMPLES = {
    "A": sample_A,
    "B": sample_B,
    "C": sample_C,
    "D": sample_D,
    "E": sample_E,
}


def sample_Dblue(px, py):
    # Brand-blue mountain polyline on transparent background (light + dark).
    m1 = thick_line(px, py, 0.22, 0.70, 0.40, 0.42, 0.085)
    m2 = thick_line(px, py, 0.40, 0.42, 0.56, 0.60, 0.085)
    m3 = thick_line(px, py, 0.56, 0.60, 0.78, 0.34, 0.085)
    if m1 or m2 or m3:
        return BG, True
    return (0, 0, 0), False

VARIANTS = {
    "D1": sample_D1,
    "D2": sample_D2,
    "D3": sample_D3,
}


# ---- New white-on-blue candidates (F-J) --------------------------------
def sample_F(px, py):
    # white tile + solid blue mountain + sun (classic "picture" cue)
    if not tile_white(px, py):
        return (0, 0, 0), False
    mountain = point_in_triangle(px, py, (0.24, 0.70), (0.50, 0.34), (0.76, 0.70))
    sun = circle(px, py, 0.66, 0.36, 0.08)
    if mountain or sun:
        return BG, True
    return WHITE, True


def sample_G(px, py):
    # white tile + blue camera outline
    if not tile_white(px, py):
        return (0, 0, 0), False
    body_out = in_rounded_rect(px, py, 0.20, 0.34, 0.80, 0.70, 0.10)
    body_in = in_rounded_rect(px, py, 0.30, 0.44, 0.70, 0.62, 0.06)
    frame = body_out and not body_in
    bump = in_rounded_rect(px, py, 0.40, 0.27, 0.60, 0.36, 0.02)
    lens_ring = ring(px, py, 0.50, 0.53, 0.13, 0.07)
    if frame or bump or lens_ring:
        return BG, True
    return WHITE, True


def sample_H(px, py):
    # blue->white gradient tile + white picture frame + mountain + sun
    if not tile_gradient(px, py):
        return (0, 0, 0), False
    outer = in_rounded_rect(px, py, 0.26, 0.26, 0.74, 0.66, 0.05)
    inner = in_rounded_rect(px, py, 0.33, 0.33, 0.67, 0.59, 0.03)
    frame = outer and not inner
    mountain = point_in_triangle(px, py, (0.36, 0.57), (0.58, 0.40), (0.70, 0.57))
    sun = circle(px, py, 0.60, 0.40, 0.045)
    if frame or mountain or sun:
        return WHITE, True
    return gradient_bg(px, py), True


def sample_I(px, py):
    # white tile + blue SM monogram
    if not tile_white(px, py):
        return (0, 0, 0), False
    w = 0.075
    segs = [
        (0.20, 0.32, 0.48, 0.32), (0.20, 0.32, 0.20, 0.48),
        (0.20, 0.48, 0.48, 0.48), (0.48, 0.48, 0.48, 0.64),
        (0.20, 0.64, 0.48, 0.64),
        (0.54, 0.32, 0.54, 0.66), (0.54, 0.32, 0.67, 0.54),
        (0.67, 0.54, 0.80, 0.32), (0.80, 0.32, 0.80, 0.66),
    ]
    for (x1, y1, x2, y2) in segs:
        if thick_line(px, py, x1, y1, x2, y2, w):
            return BG, True
    dot = circle(px, py, 0.80, 0.80, 0.045)
    if dot:
        return BG, True
    return WHITE, True


def sample_J(px, py):
    # white tile + blue magnifier with tiny mountain inside
    if not tile_white(px, py):
        return (0, 0, 0), False
    ring1 = ring(px, py, 0.46, 0.46, 0.26, 0.18)
    handle = thick_line(px, py, 0.63, 0.63, 0.84, 0.84, 0.09)
    m = point_in_triangle(px, py, (0.32, 0.56), (0.46, 0.42), (0.60, 0.56))
    if ring1 or handle or m:
        return BG, True
    return WHITE, True


NEWS = {
    "F": sample_F,
    "G": sample_G,
    "H": sample_H,
    "I": sample_I,
    "J": sample_J,
}


def render_icon(size, sample_fn, ss=4):
    rows = []
    n = ss * ss
    for y in range(size):
        row = []
        for x in range(size):
            r_acc = g_acc = b_acc = a_acc = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = (x + (sx + 0.5) / ss) / size
                    py = (y + (sy + 0.5) / ss) / size
                    col, inside = sample_fn(px, py)
                    if inside:
                        r_acc += col[0]
                        g_acc += col[1]
                        b_acc += col[2]
                        a_acc += 255
            if a_acc == 0:
                row.append((0, 0, 0, 0))
            else:
                row.append((r_acc * 255 // a_acc, g_acc * 255 // a_acc,
                            b_acc * 255 // a_acc, a_acc // n))
        rows.append(row)
    return rows


def write_png(width, height, rows, path):
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type 0
        for (r, g, b, a) in row:
            raw += bytes((r, g, b, a))
    raw = zlib.compress(bytes(raw), 9)

    def chunk(tag_, data):
        c = tag_ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path)


def build_final():
    if not FINAL:
        print("FINAL is not set; nothing to build.")
        return
    fn = {**SAMPLES, **NEWS}.get(FINAL)
    if fn is None:
        print(f"FINAL={FINAL!r} not found in SAMPLES or NEWS.")
        return
    for s in (16, 48, 128):
        rows = render_icon(s, fn, ss=4 if s >= 48 else 3)
        write_png(s, s, rows, os.path.join(OUT_DIR, f"icon{s}.png"))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    S = 200
    icons = {k: render_icon(S, fn, ss=4) for k, fn in SAMPLES.items()}
    for k, rows in icons.items():
        write_png(S, S, rows, os.path.join(OUT_DIR, f"preview_{k}.png"))

    pad = 28
    cell = S
    gap = 28
    order = ["A", "B", "C", "D", "E"]
    W = pad * 2 + len(order) * cell + (len(order) - 1) * gap
    H = pad * 2 + cell
    strip = [[(0, 0, 0, 0) for _ in range(W)] for _ in range(H)]
    for idx, k in enumerate(order):
        ox = pad + idx * (cell + gap)
        oy = pad
        src = icons[k]
        for dy in range(cell):
            for dx in range(cell):
                strip[oy + dy][ox + dx] = src[dy][dx]
    write_png(W, H, strip, os.path.join(OUT_DIR, "preview_all.png"))

    # D variants strip
    vicons = {k: render_icon(S, fn, ss=4) for k, fn in VARIANTS.items()}
    for k, rows in vicons.items():
        write_png(S, S, rows, os.path.join(OUT_DIR, f"preview_{k}.png"))
    vorder = ["D1", "D2", "D3"]
    W2 = pad * 2 + len(vorder) * cell + (len(vorder) - 1) * gap
    strip2 = [[(0, 0, 0, 0) for _ in range(W2)] for _ in range(H)]
    for idx, k in enumerate(vorder):
        ox = pad + idx * (cell + gap)
        oy = pad
        src = vicons[k]
        for dy in range(cell):
            for dx in range(cell):
                strip2[oy + dy][ox + dx] = src[dy][dx]
    write_png(W2, H, strip2, os.path.join(OUT_DIR, "preview_D_variants.png"))

    # Transparent-background comparison: white vs blue mountain.
    for tag, fn in (("Dwhite", sample_D), ("Dblue", sample_Dblue)):
        rows = render_icon(S, fn, ss=4)
        write_png(S, S, rows, os.path.join(OUT_DIR, f"preview_{tag}.png"))

    # New white-on-blue candidates F-J
    nicons = {k: render_icon(S, fn, ss=4) for k, fn in NEWS.items()}
    for k, rows in nicons.items():
        write_png(S, S, rows, os.path.join(OUT_DIR, f"preview_{k}.png"))
    norder = ["F", "G", "H", "I", "J"]
    W3 = pad * 2 + len(norder) * cell + (len(norder) - 1) * gap
    strip3 = [[(0, 0, 0, 0) for _ in range(W3)] for _ in range(H)]
    for idx, k in enumerate(norder):
        ox = pad + idx * (cell + gap)
        oy = pad
        src = nicons[k]
        for dy in range(cell):
            for dx in range(cell):
                strip3[oy + dy][ox + dx] = src[dy][dx]
    write_png(W3, H, strip3, os.path.join(OUT_DIR, "preview_FGJ.png"))


if __name__ == "__main__":
    main()
