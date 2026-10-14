"""Volg — « Wochenaktionen » (page TYPO3 unique, 1 requête).

Trois sections : Frische-Aktionen (mer.–sam.), Volg-Aktionen et Weitere
Aktionen* (lun.–sam.). Validité lue dans l'en-tête de section
(« Mi. 14.10. bis Sa. 17.10. », année implicite résolue autour de la date de
collecte). Référence = prix Volg habituel (« statt ») -> ``merchant_previous``.
robots.txt : page autorisée pour ``*`` (seul GPTBot est exclu).
"""
from __future__ import annotations

import datetime as dt
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal, short_hash
from ..parse import clean, parse_chf
from . import register
from ._grocery import NATIONAL_NOTE, iso_day_end, iso_day_start, quantity_fields, resolve_day_month, stated_unit_price

BASE = "https://www.volg.ch"
URL = f"{BASE}/sortiment/wochenaktionen/"
_SECTION = re.compile(r'<h2 class="c-section__subtitle">(.*?)</h2>(.*?)(?=<h2 class="c-section__subtitle">|</main>|$)', re.S)
_PRODUCT = re.compile(r'<div class="c-product">(.*?)(?=<div class="c-product">|$)', re.S)
_VALID = re.compile(r"(\d{1,2})\.(\d{1,2})\.\s*bis\s*\w+\.?\s*(\d{1,2})\.(\d{1,2})\.")


def _field(block: str, cls: str) -> str:
    m = re.search(rf'class="{cls}[^"]*"[^>]*>(.*?)</(?:div|span|h3)>', block, re.S)
    return clean(m.group(1)) if m else ""


def parse(html_text: str, today: dt.date) -> list[dict]:
    out = []
    for head, body in _SECTION.findall(html_text):
        if 'class="c-product"' not in body:
            continue
        span = re.search(r"<span>(.*?)</span>", head, re.S)
        validity = clean(span.group(1)) if span else ""
        section = clean(re.sub(r"<span>.*?</span>", "", head, flags=re.S))
        start = end = None
        m = _VALID.search(validity)
        if m:
            start = resolve_day_month(int(m.group(1)), int(m.group(2)), today)
            end = resolve_day_month(int(m.group(3)), int(m.group(4)), start)
            if end < start:
                end = None
        foot = re.search(r"\*\s*([^<*]{5,200})", body)
        for blk in _PRODUCT.findall(body):
            desc_m = re.search(r'class="c-product__description">(.*?)</div>', blk, re.S)
            desc_html = desc_m.group(1) if desc_m else ""
            small = re.search(r"<small>(.*?)</small>", desc_html, re.S)
            img = re.search(r'<img[^>]+src="([^"]+)"', blk)
            pid = re.search(r"promo_(\d+)", img.group(1)) if img else None
            out.append({
                "section": section.rstrip("*").strip(), "validity": validity,
                "start": start.isoformat() if start else None, "end": end.isoformat() if end else None,
                "footnote": clean(foot.group(1)) if foot and section.endswith("*") else None,
                "title": _field(blk, "c-product__title"),
                "size": clean(re.sub(r"<small>.*?</small>", "", desc_html, flags=re.S)),
                "unit_text": clean(small.group(1)) if small else "",
                "price": _field(blk, "c-product__price-main"),
                "was": _field(blk, "u-text-nowrap"),
                "reduction": _field(blk, "c-product__reduction"),
                "image": BASE + img.group(1) if img and img.group(1).startswith("/") else (img.group(1) if img else None),
                "promo_id": pid.group(1) if pid else None,
            })
    return out


@register
class Volg(Connector):
    id = "volg"
    name = "Volg (actions de la semaine)"
    family = "grocery"
    tier = "DAILY"
    interval_minutes = 480
    base_url = BASE
    expected_min_items = 5
    documentation = "Page /sortiment/wochenaktionen/ (3 sections, 1 requête)"

    def fetch(self, ctx):
        r = ctx.get(URL, headers={"Accept": "text/html"}, conditional=True)
        if r.status_code == 304:
            return FetchResult(not_modified=True, complete=True)
        items = parse(r.text, ctx.now.date())
        if not items:
            return FetchResult(error="aucun produit c-product (structure changée ?)")
        return FetchResult(items=items, complete=True, raw=items)

    def normalize(self, x, ctx):
        price = parse_chf(x["price"])
        if not price or not x["title"]:
            return None
        was = parse_chf(re.sub(r"(?i)statt", "", x["was"] or ""))
        ref = was if was and was > price else None
        pct = re.search(r"(\d+)\s*%", x.get("reduction") or "")
        sid = x["promo_id"] or short_hash(x["title"], x["size"], x["start"])
        conds = [x["footnote"]] if x.get("footnote") else []
        if not x.get("end"):
            conds.append("date de fin non publiée")
        if re.search(r"z\.\s?B\.", x["size"] or ""):
            # « div. Sorten, z.B. … 2 x 250 g » : contenance d'un exemple seulement.
            qf = {"package_size": x["size"]}
            conds.append("plusieurs sortes : contenance et prix unitaire selon l'article")
        else:
            qf = quantity_fields(price, x["size"], stated_unit_price(x["unit_text"]))
        return make_deal(
            deal_id=f"{self.id}:{sid}", source_id=self.id, source_type="merchant", source_offer_id=sid,
            source_url=URL, merchant="Volg", title=x["title"], description=x["size"] or None,
            category=x["section"], family="grocery", offer_type="weekly_promotion", condition="new",
            image_url=x.get("image"), current_price=price, reference_price=ref,
            regular_price=ref, reference_price_type="merchant_previous" if ref else None,
            discount_percentage=float(pct.group(1)) if pct and ref else None,
            discount_badge=x.get("reduction") or None, conditions=conds,
            starts_at=iso_day_start(x["start"]), ends_at=iso_day_end(x["end"]),
            geographic_scope="NATIONAL", geographic_note=NATIONAL_NOTE, **qf)
