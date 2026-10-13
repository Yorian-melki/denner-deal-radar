#!/usr/bin/env python3
"""Génère les icônes PWA (PNG) en Python pur : radar blanc sur fond rouge."""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "icons"
RED, WHITE = (200, 16, 46), (255, 255, 255)


def png(w, h, px):
    raw = b"".join(b"\x00" + bytes(c for x in range(w) for c in px(x, y)) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + \
        chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def icon(size, maskable=False):
    c = size / 2
    scale = 0.36 if maskable else 0.42

    def px(x, y):
        dx, dy = (x + 0.5 - c) / size, (y + 0.5 - c) / size
        r = math.hypot(dx, dy)
        ang = math.degrees(math.atan2(-dy, dx)) % 360
        R = scale
        on = False
        for k in (1.0, 0.68, 0.36):                       # anneaux
            if abs(r - R * k) < 0.018:
                on = True
        if r < R and 30 <= ang <= 75 and r > 0.02:        # faisceau
            on = on or (ang - 30) / 45 > 0.15
        if r < 0.035:                                     # centre
            on = True
        bx, by = dx - R * 0.55 * math.cos(math.radians(52)), dy + R * 0.55 * math.sin(math.radians(52))
        if math.hypot(bx, by) < 0.045:                    # écho « deal »
            return (255, 214, 0)
        return WHITE if on else RED
    return png(size, size, px)


OUT.mkdir(parents=True, exist_ok=True)
for s in (180, 192, 512):
    (OUT / f"icon-{s}.png").write_bytes(icon(s))
(OUT / "maskable-512.png").write_bytes(icon(512, maskable=True))
print("icônes écrites dans", OUT)
