"""Utilitaires partagés par les connecteurs supermarchés (fonctions pures).

Règle : une contenance ou un prix unitaire n'est renseigné que s'il est lu de
façon fiable ; sinon le champ est omis (jamais estimé).
"""
from __future__ import annotations

import datetime as dt
import re

from ..parse import TZ, Quantity, clean, day_end, day_start, parse_chf, parse_quantity, unit_price

NATIONAL_NOTE = "prix national de la chaîne ; stock du magasin local inconnu"
MAX_PLAUSIBLE_TOTAL = 50.0   # kg ou l : au-delà, contenance publiée probablement erronée


_ALTERNATIVES = re.compile(r"\d\s*(?:kg|g|l|dl|cl|ml)\s*(?:/|oder|bzw\.?)\s*\d", re.I)


def quantity_fields(price: float | None, size_text: str, stated_unit: tuple[float, str] | None = None) -> dict:
    """``package_size`` / ``quantity`` / ``unit_price`` / ``unit`` pour make_deal.

    ``stated_unit`` = prix unitaire publié par la source (valeur, libellé
    CHF/kg|CHF/l|CHF/pièce) : prioritaire sur le calcul.
    """
    size_text = clean(size_text)
    out: dict = {"package_size": size_text or None}
    if _ALTERNATIVES.search(size_text):
        # « 1000 g/ 750 g », « 500 g oder 1 kg » : plusieurs contenances -> aucune n'est sûre.
        out["quantity_note"] = "plusieurs contenances possibles : non retenue"
        return out
    q = parse_quantity(size_text) if size_text else Quantity()
    if q.total and q.unit in ("kg", "l") and q.total > MAX_PLAUSIBLE_TOTAL:
        q = Quantity(text=size_text)   # ex. « 675 kg » pour un paquet de biscuits
        out["quantity_note"] = "contenance publiée invraisemblable : ignorée"
    if q.total and q.unit and q.price_basis == "package":
        out["quantity"] = q.total
    if stated_unit:
        out["unit_price"], out["unit"] = stated_unit
    else:
        up, label = unit_price(price, q)
        if up:
            out["unit_price"], out["unit"] = up, label
    return out


_STATED = re.compile(r"(\d+(?:[.,]\d+)?)?\s*(kg|g|l|dl|cl|ml|stück|stk\.?|piece|pièce)\s*=\s*"
                     r"((?:CHF\s*)?(?:\d+(?:[.,]\d{1,2})?|[–-]\.\d{2})(?:\.[–-])?)", re.I)
_BASE = {"kg": ("CHF/kg", 1.0), "g": ("CHF/kg", 1000.0), "l": ("CHF/l", 1.0), "dl": ("CHF/l", 10.0),
         "cl": ("CHF/l", 100.0), "ml": ("CHF/l", 1000.0)}


def stated_unit_price(text: str) -> tuple[float, str] | None:
    """« 100 g = 2.55 » -> (25.5, 'CHF/kg') ; « 100 ml = -.87 » -> (8.7, 'CHF/l')."""
    m = _STATED.search(clean(text))
    if not m:
        return None
    amount = float((m.group(1) or "1").replace(",", "."))
    unit = m.group(2).lower().rstrip(".")
    val = parse_chf(m.group(3))
    if val is None or amount <= 0:
        return None
    if unit in ("stück", "stk", "piece", "pièce"):
        return round(val / amount, 2), "CHF/pièce"
    label, factor = _BASE[unit]
    return round(val / amount * factor, 2), label


def per_unit_display(value: float | None, unit: str | None) -> tuple[float, str] | None:
    """Prix unitaire structuré {value, unit:'100g'|'kg'|'100ml'|'l'|'piece'} -> (val, libellé)."""
    if value is None or not unit:
        return None
    m = re.fullmatch(r"(\d*(?:\.\d+)?)\s*(kg|g|l|dl|cl|ml|piece|stück)", unit.strip().lower())
    if not m:
        return None
    amount = float(m.group(1) or 1)
    u = m.group(2)
    if u in ("piece", "stück"):
        return round(value / amount, 2), "CHF/pièce"
    label, factor = _BASE[u]
    return round(value / amount * factor, 2), label


def iso_day_start(d: dt.date | str | None) -> str | None:
    if not d:
        return None
    d = dt.date.fromisoformat(d) if isinstance(d, str) else d
    return day_start(d).isoformat()


def iso_day_end(d: dt.date | str | None) -> str | None:
    if not d:
        return None
    d = dt.date.fromisoformat(d) if isinstance(d, str) else d
    return day_end(d).isoformat()


def iso_epoch(ts) -> str | None:
    try:
        return dt.datetime.fromtimestamp(int(ts), TZ).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def resolve_day_month(day: int, month: int, ref: dt.date) -> dt.date:
    """Date « JJ.MM. » sans année : l'année la plus proche de ``ref``."""
    cands = []
    for y in (ref.year - 1, ref.year, ref.year + 1):
        try:
            cands.append(dt.date(y, month, day))
        except ValueError:
            continue
    return min(cands, key=lambda d: abs((d - ref).days))
