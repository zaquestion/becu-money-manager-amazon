#!/usr/bin/env python3
"""Draws the extension icons: a receipt torn in two on a navy rounded square,
the top half white and the bottom half orange (a charge split by item).

public/icon/{16,32,48,128}.png fill the square; store/icon-128.png is the
Chrome Web Store icon, 96x96 of artwork with 16px of transparent padding.
Supersampled for smooth edges. Run from the repo root: python3 scripts/make-icons.py
"""
import struct
import zlib

NAVY = (11, 83, 148)  # the panel's accent colour
WHITE = (255, 255, 255)
ORANGE = (240, 135, 30)
SS = 8  # samples per pixel, per axis

LEFT, RIGHT, TOP = 0.27, 0.73, 0.17
TEETH = 3
SHIFT = (0.05, 0.04)  # how far the bottom half is pulled away
GAP = 0.05


def bottom(u):
    """The receipt's zigzag bottom edge."""
    t = (u - LEFT) / (RIGHT - LEFT) * TEETH % 1
    return 0.80 - 0.06 * (1 - abs(2 * t - 1))


def cut(u):
    """Where the receipt is torn: a line rising to the right."""
    return 0.53 - 0.18 * (u - 0.5)


def on_receipt(u, v):
    return LEFT <= u <= RIGHT and TOP <= v <= bottom(u)


def line(u, v, at, n):
    # Printed lines; left out at 16px, where they'd only be noise.
    return n >= 32 and abs(v - at) < 0.022 and LEFT + 0.08 < u < RIGHT - 0.08


def shade(cx, cy, n):
    """Colour at (cx, cy) in artwork of size n, or None outside the shape."""
    r = n * 0.22
    dx = max(r - cx, cx - (n - r), 0)
    dy = max(r - cy, cy - (n - r), 0)
    if not (0 <= cx <= n and 0 <= cy <= n) or dx * dx + dy * dy > r * r:
        return None
    u, v = cx / n, cy / n
    if on_receipt(u, v) and v < cut(u) - GAP / 2:
        return NAVY if line(u, v, 0.28, n) or line(u, v, 0.37, n) else WHITE
    lu, lv = u - SHIFT[0], v - SHIFT[1]
    if on_receipt(lu, lv) and lv > cut(lu) + GAP / 2:
        return WHITE if line(lu, lv, 0.66, n) else ORANGE
    return NAVY


def render(size, art):
    off = (size - art) / 2
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc, cover = [0, 0, 0], 0
            for sy in range(SS):
                for sx in range(SS):
                    c = shade(x + (sx + 0.5) / SS - off, y + (sy + 0.5) / SS - off, art)
                    if c:
                        cover += 1
                        for i in range(3):
                            acc[i] += c[i]
            row += bytes([round(a / cover) for a in acc] + [round(255 * cover / SS / SS)]) if cover else bytes(4)
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    size = len(rows)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(b''.join(rows), 9)))
        f.write(chunk(b'IEND', b''))


for size in (16, 32, 48, 128):
    write_png(f'public/icon/{size}.png', render(size, size))
write_png('store/icon-128.png', render(128, 96))
