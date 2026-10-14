"""Petits utilitaires partagés par les connecteurs (aucune logique métier)."""
from __future__ import annotations

import datetime as dt
import html as _html
import json
import re


def num(x) -> float | None:
    try:
        return None if x in (None, "", "$undefined") else float(x)
    except (TypeError, ValueError):
        return None


def text(s) -> str:
    s = re.sub(r"<[^>]+>", " ", str(s or ""))
    return re.sub(r"\s+", " ", _html.unescape(s)).strip()


def next_data(raw: str) -> dict:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', raw, re.S)
    if not m:
        raise ValueError("__NEXT_DATA__ absent (structure de page changée ?)")
    return json.loads(m.group(1))


def iso_local(s: str | None, tz) -> str | None:
    """ISO 8601 (Z ou offset) -> ISO avec fuseau Europe/Zurich."""
    if not s:
        return None
    d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=tz)
    return d.astimezone(tz).replace(microsecond=0).isoformat()
