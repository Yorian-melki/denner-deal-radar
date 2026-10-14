"""Lidl Suisse — pages d'actions hebdomadaires (wochenaktion, super-wochenende…).

Les identifiants de pages (``/c/de-CH/<slug>/a<id>``) changent chaque semaine :
ils sont redécouverts sur la page d'accueil à chaque collecte (jamais codés en
dur). Chaque tuile produit porte un JSON ``data-grid-data`` (échappé HTML).
robots.txt : ``/`` et ``/c/de-CH/…`` autorisés. 1 + ≈8 requêtes.

Référence = ``oldPrice`` / ``deletedPrice`` (ancien prix Lidl, « statt ») ;
absent quand le badge vaut « Aktion » -> prix seul, aucune référence inventée.
Prix Lidl Plus (application requise) -> ``requires_membership``.
Offres limitées au Tessin / à la Suisse romande : ignorées (hors St-Gall).
"""
from __future__ import annotations

import html
import json
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from ..parse import clean
from . import register
from ._grocery import NATIONAL_NOTE, iso_epoch, quantity_fields, stated_unit_price

BASE = "https://www.lidl.ch"
# Pages d'actions retenues (alimentaire surtout) ; les pages thématiques non
# alimentaires (mode, bricolage, déco…) sont volontairement ignorées.
SLUGS = ("wochenaktion", "super-wochenende", "xxl-sparen", "lidl-plus-angebote",
         "unsere-kistenhighlights", "klein-aber-fein", "neu-in-unserem-sortiment")
MAX_PAGES = 12
_LINK = re.compile(r'href="(/c/de-CH/([a-z0-9-]+)/a\d+)"')
_GRID = re.compile(r'data-grid-data="([^"]+)"')
_EXCLUDED_REGION = re.compile(r"nur\s+(?:im|in\s+der)\s+(tessin|westschweiz|romandie|französischen\s+schweiz)", re.I)


def offer_pages(home_html: str) -> list[str]:
    seen, out = set(), []
    for path, slug in _LINK.findall(home_html):
        if slug in SLUGS and path not in seen:
            seen.add(path)
            out.append(path)
    return out[:MAX_PAGES]


def parse_page(page_html: str, page_path: str = "") -> list[dict]:
    out = []
    for blob in _GRID.findall(page_html):
        try:
            rec = json.loads(html.unescape(blob))
        except ValueError:
            continue
        if isinstance(rec, dict) and rec.get("productId"):
            rec["_page"] = page_path
            out.append(rec)
    return out


def dedupe(records: list[dict]) -> list[dict]:
    by_id: dict = {}
    for r in records:
        by_id.setdefault(r["productId"], r)
    return list(by_id.values())


def _keyfacts(r: dict) -> list[str]:
    desc = html.unescape((r.get("keyfacts") or {}).get("description") or "")
    parts = re.split(r"</?(?:li|ul|br|p|div)[^>]*>", desc)
    return [clean(p) for p in parts if clean(p)]


def _size_text(facts: list[str]) -> tuple[str, str]:
    """(texte de contenance pour parse_quantity, libellé affiché)."""
    for f in facts:
        m = re.match(r"pro\s+(.+)$", f, re.I)
        if not m:
            continue
        what = m.group(1).strip()
        if re.fullmatch(r"(1\s*)?kg", what, re.I):
            return "pro kg", f
        if re.fullmatch(r"100\s*g", what, re.I):
            return "per 100 g", f
        if re.fullmatch(r"(1\s*)?(stück|stk\.?)", what, re.I):
            return "pro Stück", f
        return what, what
    return "", ""


@register
class Lidl(Connector):
    id = "lidl"
    name = "Lidl Suisse (actions hebdomadaires)"
    family = "grocery"
    tier = "DAILY"
    interval_minutes = 360
    base_url = BASE
    expected_min_items = 30
    documentation = "Page d'accueil -> pages d'actions /c/de-CH/<slug>/a<id> -> tuiles data-grid-data"

    def fetch(self, ctx):
        home = ctx.get(BASE + "/", headers={"Accept": "text/html"}).text
        pages = offer_pages(home)
        if not pages:
            return FetchResult(error="aucune page d'actions trouvée sur la page d'accueil (structure changée ?)")
        recs, warnings = [], []
        for p in pages:
            try:
                got = parse_page(ctx.get(BASE + p, headers={"Accept": "text/html"}).text, p)
            except Exception as e:  # noqa: BLE001
                warnings.append(f"{p}: {type(e).__name__}: {e}"[:200])
                continue
            if not got:
                warnings.append(f"{p}: aucune tuile data-grid-data")
            recs += got
        items = dedupe(recs)
        if not items:
            return FetchResult(error="; ".join(warnings) or "aucun produit")
        return FetchResult(items=items, complete=not warnings, warnings=warnings,
                           raw={"pages": pages, "records": items}, meta={"pages": len(pages)})

    def normalize(self, r, ctx):
        if r.get("isLidlGiftCard"):
            return None                      # carte cadeau : pas une offre
        facts = _keyfacts(r)
        if any(_EXCLUDED_REGION.search(f) for f in facts):
            return None                      # offre valable seulement hors Suisse alémanique
        p = r.get("price") or {}
        member = False
        if p.get("price") is None and r.get("lidlPlus"):
            p = (r["lidlPlus"][0] or {}).get("price") or {}
            member = True
        price = p.get("price")
        if price is None or price <= 0:
            return None
        d = p.get("discount") or {}
        old = p.get("oldPrice") or d.get("deletedPrice") or None
        ref = old if old and old > price else None
        rtype = None
        if ref:
            rtype = "msrp" if d.get("fromRecommendedPrice") else "merchant_previous"
        badge = clean(d.get("discountText") or "").replace("﹪", "%") or None
        size_src, size_label = _size_text(facts)
        stated = None
        for f in facts:
            stated = stated_unit_price(f)
            if stated:
                break
        qf = quantity_fields(price, size_src, stated)
        if size_label:
            qf["package_size"] = size_label
        conds = []
        if member:
            conds.append("prix Lidl Plus : application Lidl Plus requise")
        if any("lidl plus" in f.lower() for f in facts) and not member:
            conds.append("prix encore plus bas avec Lidl Plus (voir l'offre)")
        if badge and "gratis" in badge.lower():
            conds.append(badge)
        start, end = iso_epoch(r.get("storeStartDate")), iso_epoch(r.get("storeEndDate"))
        if not end:
            conds.append("jusqu'à épuisement du stock (date de fin non publiée)")
        food = (r.get("category") or "").lower() == "food"
        brand = (r.get("brand") or {}).get("name") if isinstance(r.get("brand"), dict) else None
        cat = (r.get("keyfacts") or {}).get("wonCategoryPrimary") or r.get("category")
        return make_deal(
            deal_id=f"{self.id}:{r['productId']}", source_id=self.id, source_type="merchant",
            source_offer_id=str(r["productId"]), source_url=BASE + r["canonicalUrl"] if r.get("canonicalUrl") else BASE + (r.get("_page") or "/"),
            merchant="Lidl", title=clean(r.get("fullTitle") or r.get("title")), brand=brand,
            description=" · ".join(facts) or None, category=cat,
            family="grocery" if food else "retail", offer_type="weekly_promotion", condition="new",
            merchant_sku=str(r.get("erpNumber") or r["productId"]), image_url=r.get("image"),
            current_price=price, reference_price=ref, regular_price=ref if rtype == "merchant_previous" else None,
            reference_price_type=rtype,
            discount_percentage=d.get("percentageDiscount") if ref and d.get("percentageDiscount") else None,
            discount_badge=badge, requires_membership=member or None,
            access="MEMBER" if member else "PUBLIC", conditions=conds,
            extra_tags=["lidl_plus"] if member else None,
            starts_at=start, ends_at=end,
            geographic_scope="NATIONAL", geographic_note=NATIONAL_NOTE, **qf)
