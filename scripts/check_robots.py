#!/usr/bin/env python3
"""Vérifie que robots.txt de denner.ch autorise chaque chemin utilisé.

Inspiré de scripts/check_robots.py de github.com/LYL010-ADELA/grocery-discount
(MIT, © 2026 Yilin Lin). Utilise protego (spécification Google) car
urllib.robotparser gère mal les jokers en tête de règle.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from radar import audit  # noqa: E402
from radar.cli import _http  # noqa: E402
from radar.config import load  # noqa: E402

cfg = load()
res = audit.robots(_http(cfg), cfg.s("collect", "base_url"))
for path, ok in res["paths"].items():
    print(f"{'ok     ' if ok else 'BLOQUÉ '} {path}")
print("crawl-delay:", res["crawl_delay"])
sys.exit(0 if res["ok"] else 1)
