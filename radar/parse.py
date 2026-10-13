"""Normalisation des données brutes Denner.

Fonctions pures (aucun accès réseau) : faciles à tester sur des cas réels.
Règle d'or : ne jamais inventer une valeur. Ce qui ne peut pas être déduit
de façon fiable reste ``None``.
"""
from __future__ import annotations

import datetime as dt
import html
import re
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Zurich")

# --------------------------------------------------------------------------
# Texte & prix
# --------------------------------------------------------------------------

def clean(s) -> str:
    if s is None:
        return ""
    s = re.sub(r"<[^>]+>", " ", str(s))
    s = html.unescape(s).replace("\xa0", " ").replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()


def parse_chf(raw) -> float | None:
    """Montant CHF au format suisse : '4.95', '4,95', '15.–', '–.99', "1'299.–"."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return round(float(raw), 2) if raw > 0 else None
    s = clean(raw).replace("CHF", "").replace("Fr.", "")
    s = s.replace("—", "–").replace("−", "–")
    s = re.sub(r"(?<=\d)'(?=\d)", "", s)
    s = re.sub(r"(?<![\d.])[–-]\.(\d{2})", r"0.\1", s)      # –.99 -> 0.99
    s = re.sub(r"(\d)\.[–-]", r"\1.00", s)                    # 15.– -> 15.00
    m = re.search(r"\d+(?:[.,]\d{1,2})?", s)
    if not m:
        return None
    v = round(float(m.group(0).replace(",", ".")), 2)
    return v if v > 0 else None


def attrs(item: dict) -> dict[str, str]:
    """Aplatit ``attributeInfo`` en {nom: première valeur}."""
    out: dict[str, str] = {}
    for a in item.get("attributeInfo") or []:
        vals = a.get("vals") or []
        if a.get("attributeName") and vals:
            out[a["attributeName"]] = "" if vals[0].get("value") is None else str(vals[0]["value"])
    return out


# --------------------------------------------------------------------------
# Dates de validité
# --------------------------------------------------------------------------

_RANGE = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})?\s*[–\-]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})")
_UNTIL = re.compile(r"bis\s+(\d{1,2})\.(\d{1,2})\.(\d{4})", re.I)
_FROM = re.compile(r"ab\s+(\d{1,2})\.(\d{1,2})\.(\d{4})", re.I)


def _ts_local_date(raw) -> dt.date | None:
    try:
        return dt.datetime.fromtimestamp(int(raw), TZ).date()
    except (TypeError, ValueError, OSError):
        return None


def parse_validity(label: str, from_ts=None, to_ts=None) -> tuple[dt.date | None, dt.date | None]:
    """Retourne (premier jour, dernier jour) inclus.

    Le libellé affiché (« 08.10.–14.10.2026 ») fait autorité. Les horodatages
    servent de repli : ``promotionTo`` vaut minuit au début du dernier jour,
    ``promotionFrom`` est l'heure de publication (date fiable, heure non).
    """
    label = clean(label)
    m = _RANGE.search(label)
    if m:
        d1, m1, y1, d2, m2, y2 = m.groups()
        y2 = int(y2)
        y1 = int(y1) if y1 else (y2 - 1 if int(m1) > int(m2) else y2)
        return dt.date(y1, int(m1), int(d1)), dt.date(y2, int(m2), int(d2))
    start = end = None
    m = _UNTIL.search(label)
    if m:
        end = dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    m = _FROM.search(label)
    if m:
        start = dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    start = start or _ts_local_date(from_ts)
    end = end or _ts_local_date(to_ts)
    if start and end and start > end:
        start = None
    return start, end


def day_start(d: dt.date) -> dt.datetime:
    return dt.datetime.combine(d, dt.time(0, 0), TZ)


def day_end(d: dt.date) -> dt.datetime:
    return dt.datetime.combine(d, dt.time(23, 59, 59), TZ)


# --------------------------------------------------------------------------
# Réduction affichée & conditions
# --------------------------------------------------------------------------

@dataclass
class DiscountInfo:
    stated_pct: float | None = None
    min_qty: int = 1
    special: bool = False
    multibuy: str | None = None     # « 3 für 2 », « 1+1 »


def parse_discount_text(text: str, extra: str = "") -> DiscountInfo:
    t = clean(text)
    both = f"{t} {clean(extra)}"
    info = DiscountInfo()
    if re.search(r"½|1/2\s*PREIS|HALBER\s*PREIS", t, re.I):
        info.stated_pct = 50.0
    m = re.search(r"(\d{1,2}(?:[.,]\d)?)\s*%", t)
    if m and info.stated_pct is None:
        info.stated_pct = float(m.group(1).replace(",", "."))
    m = re.search(r"(\d+)\s*für\s*(\d+)", both, re.I)          # 3 für 2
    if m and int(m.group(1)) > int(m.group(2)) > 0:
        n, p = int(m.group(1)), int(m.group(2))
        info.multibuy, info.min_qty = f"{n} für {p}", n
        info.stated_pct = info.stated_pct or round((n - p) / n * 100, 1)
    m = re.search(r"(\d+)\s*\+\s*(\d+)\s*(gratis)?", both, re.I)  # 1+1 gratis
    if m and m.group(3):
        n, f = int(m.group(1)), int(m.group(2))
        info.multibuy, info.min_qty = f"{n}+{f} gratis", n + f
        info.stated_pct = info.stated_pct or round(f / (n + f) * 100, 1)
    m = re.search(r"ab\s+(\d+)\s*(?:Stück|Stk|Packungen|Flaschen|Dosen)", both, re.I)
    if m:
        info.min_qty = max(info.min_qty, int(m.group(1)))
    if "SPECIAL" in t.upper():
        info.special = True
    return info


_REGION_WORDS = {"deutsch": "de", "französ": "fr", "franzos": "fr", "italien": "it", "romand": "fr", "tessin": "it"}


def parse_regions(footnote: str) -> list[str] | None:
    """« Nur in der deutschen und italienischen Schweiz erhältlich » -> ['de','it'].

    ``None`` = aucune restriction publiée (offre nationale).
    """
    f = clean(footnote).lower()
    m = re.search(r"nur\s+(?:in|im)\s+(?:der\s+)?([^.|\n]*?)(?:schweiz|tessin|romandie)?\s+erhältlich", f)
    if not m:
        return None
    zone = m.group(0)
    regions = sorted({code for word, code in _REGION_WORDS.items() if word in zone})
    return regions or None


def is_competitor_reference(footnote: str) -> bool:
    return "konkurrenzvergleich" in clean(footnote).lower()


# --------------------------------------------------------------------------
# Quantités & prix unitaires
# --------------------------------------------------------------------------

_UNIT = {"kg": ("kg", 1.0), "g": ("kg", 0.001), "mg": ("kg", 1e-6),
         "l": ("l", 1.0), "liter": ("l", 1.0), "lt": ("l", 1.0), "dl": ("l", 0.1),
         "cl": ("l", 0.01), "ml": ("l", 0.001)}
_NUM = r"\d+(?:[.,]\d+)?"
_UNITS_RE = r"(kg|g|mg|liter|lt|l|dl|cl|ml)\b"
_PIECES_RE = r"(Stück|Stk\.?|Eier|Rollen|Beutel|Kapseln|Caps|Ersatzklingen|Tabs|Tabletten|Waschgänge|Portionen|Packungen|Paar|Blatt|Windeln|Tücher|Sticks|Riegel|Pads)"


def _f(x: str) -> float:
    return float(x.replace(",", "."))


@dataclass
class Quantity:
    total: float | None = None        # quantité totale dans l'unité de base
    unit: str | None = None           # 'kg' | 'l' | 'pc'
    pack_count: int | None = None     # 6 dans « 6 x 75 cl »
    price_basis: str = "package"      # 'package' | 'per_100g' | 'per_kg' | 'per_piece'
    approximate: bool = False
    text: str = ""
    notes: list[str] = field(default_factory=list)


def parse_quantity(subline: str, content_size_text: str = "") -> Quantity:
    s = clean(subline)
    s = re.sub(r"(?<=\d)'(?=\d)", "", s)
    q = Quantity(text=s)
    low = s.lower()

    if re.search(r"\b(per|pro|je)\s+100\s*g\b", low):
        q.price_basis = "per_100g"
    elif re.search(r"\b(per|pro|je)\s+kg\b", low):
        q.price_basis = "per_kg"
    elif re.search(r"\b(per|pro|je)\s+(stück|stk)", low):
        q.price_basis = "per_piece"

    m = re.search(rf"(\d+)\s*[x×]\s*({_NUM})\s*{_UNITS_RE}", s, re.I)
    if m:
        n, amount, u = int(m.group(1)), _f(m.group(2)), m.group(3).lower()
        base, factor = _UNIT[u]
        q.total, q.unit, q.pack_count = round(n * amount * factor, 6), base, n
    else:
        m = None
        for cand in re.finditer(rf"(ca\.?\s*)?({_NUM})\s*{_UNITS_RE}", s, re.I):
            # « per 100 g » est une base de prix, pas une contenance.
            if not re.search(r"\b(per|pro|je)\s*$", s[:cand.start()], re.I):
                m = cand
                break
        if m:
            base, factor = _UNIT[m.group(3).lower()]
            q.total, q.unit = round(_f(m.group(2)) * factor, 6), base
            q.approximate = bool(m.group(1))
        if q.total is None:
            m = re.search(rf"(\d+)\s*[x×]?\s*{_PIECES_RE}", s, re.I)
            if m:
                q.total, q.unit = float(m.group(1)), "pc"
                q.pack_count = int(m.group(1))

    if q.total is None and content_size_text:
        q = _from_content_size(content_size_text, q)

    if q.price_basis == "per_piece" and q.total is None:
        q.total, q.unit = 1.0, "pc"
    return q


def _from_content_size(cst: str, q: Quantity) -> Quantity:
    """Repli sur ``content_size_text``. Denner y expose des clés i18n non
    résolues : '0.185 unit.g' = 0,185 kg ; '0.75 unit.ml' = 0,75 l (vérifié sur
    des produits dont la contenance est connue : Pringles 185 g, Dettol 750 ml).
    """
    c = clean(cst)
    m = re.match(rf"({_NUM})\s*unit\.(g|kg|ml|l|pack|stück)", c, re.I)
    if m:
        v, u = _f(m.group(1)), m.group(2).lower()
        if u in ("g", "kg") and q.price_basis == "package":
            # 'unit.kg' sur un fruit vendu à la pièce est ambigu : ignoré.
            if u == "g":
                q.total, q.unit = v, "kg"
                q.notes.append("contenance déduite de content_size_text")
        elif u in ("ml", "l"):
            if u == "ml":
                q.total, q.unit = v, "l"
                q.notes.append("contenance déduite de content_size_text")
        elif u in ("pack", "stück"):
            q.total, q.unit = v, "pc"
        return q
    m = re.match(rf"({_NUM})\s*{_UNITS_RE}", c, re.I)
    if m:
        base, factor = _UNIT[m.group(2).lower()]
        q.total, q.unit = round(_f(m.group(1)) * factor, 6), base
    elif re.match(r"1\s*Stück", c, re.I):
        q.total, q.unit = 1.0, "pc"
    return q


def unit_price(price: float | None, q: Quantity) -> tuple[float | None, str | None]:
    """Prix unitaire normalisé : CHF/kg, CHF/l ou CHF/pièce."""
    if price is None:
        return None, None
    if q.price_basis == "per_100g":
        return round(price * 10, 2), "CHF/kg"
    if q.price_basis == "per_kg":
        return round(price, 2), "CHF/kg"
    if q.price_basis == "per_piece":
        return round(price, 2), "CHF/pièce"
    if not q.total or q.total <= 0 or not q.unit:
        return None, None
    label = {"kg": "CHF/kg", "l": "CHF/l", "pc": "CHF/pièce"}[q.unit]
    return round(price / q.total, 2), label


def fmt_qty(q: Quantity) -> str:
    if not q.total or not q.unit:
        return ""
    if q.unit == "kg":
        return f"{q.total * 1000:g} g" if q.total < 1 else f"{q.total:g} kg"
    if q.unit == "l":
        return f"{q.total * 100:g} cl" if q.total < 1 else f"{q.total:g} l"
    return f"{q.total:g} pièce(s)"
