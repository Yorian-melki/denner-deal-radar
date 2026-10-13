"""Collecte des promotions Denner via l'API publique du site.

    POST https://www.denner.ch/nuxt-api/promotions
    {"lang":"de","promoFlag":<flag>,"page":n,"hitsPerPage":100,...}

Audit du 13.10.2026 (voir docs/AUDIT.md) :
* ``promo_current_week`` / ``promo_next_week`` : offres hebdomadaires
  (jeudi -> mercredi) et multi-semaines.
* ``weekend_highlight[_next_week]`` (« Wochenend-Knaller », jeu.–dim.) et
  ``start_of_the_week_highlight`` (« Wochenstart-Knaller », lun.–mer.) ne sont
  PAS inclus dans les flux hebdomadaires : collectés séparément.
* Aucun paramètre de magasin n'existe : le catalogue est national. Les
  restrictions régionales sont publiées dans ``footnote``.

Une collecte = ~7 requêtes pour toute la Suisse, jamais une par magasin.
Base de départ : scrapers/denner.py de github.com/LYL010-ADELA/grocery-discount
(MIT, © 2026 Yilin Lin), entièrement réécrit (flux highlight, unités, dates,
régions, références concurrentes).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from . import parse as P
from .categories import classify
from .http import Http

log = logging.getLogger("radar.denner")

FLAG_KIND = {
    "promo_current_week": "week",
    "promo_next_week": "week",
    "weekend_highlight": "weekend",
    "weekend_highlight_next_week": "weekend",
    "start_of_the_week_highlight": "weekstart",
}
KIND_LABEL = {"week": "Hebdomadaire", "weekend": "Week-end", "weekstart": "Début de semaine",
              "highlight": "Mise en avant", "manual": "Saisie manuelle"}
REQUIRED_ATTRS = ("articleId", "name", "price", "promotionLabel")


@dataclass
class FlagResult:
    flag: str
    ok: bool = False
    complete: bool = False
    total: int | None = None
    items: list = field(default_factory=list)
    pages: int = 0
    error: str | None = None
    structure_warnings: list = field(default_factory=list)
    highlight_flags: set = field(default_factory=set)


def fetch_flag(http: Http, cfg, flag: str, discover: bool = False) -> FlagResult:
    base = cfg.s("collect", "base_url")
    hpp = int(cfg.s("collect", "hits_per_page", 100))
    res = FlagResult(flag)
    page = 1
    try:
        while True:
            body = {"lang": cfg.s("collect", "lang", "de"), "promoFlag": flag, "facetName": None,
                    "facetValue": None, "page": page, "hitsPerPage": hpp, "sort": None,
                    "includeHighlights": bool(discover and page == 1)}
            d = http.post_json(f"{base}/nuxt-api/promotions", body,
                               referer=f"{base}/de/aktionen/aktuelle-aktionen")
            if not isinstance(d, dict) or "items" not in d or "stats" not in d:
                raise ValueError(f"structure inattendue: clés={list(d)[:8] if isinstance(d, dict) else type(d)}")
            stats = d["stats"]
            res.total = int(stats.get("totalResults", 0))
            items = d.get("items") or []
            res.items.extend(items)
            res.pages = page
            for h in d.get("highlights") or []:
                if h.get("flag"):
                    res.highlight_flags.add(h["flag"])
            total_pages = int(stats.get("totalPages") or 0)
            if not items or page >= total_pages or page >= 50:
                break
            page += 1
        refs = {i.get("sku") for i in res.items}
        res.ok = True
        res.complete = len(res.items) == res.total and len(refs) == len(res.items)
        if not res.complete:
            res.structure_warnings.append(
                f"pagination incomplète: {len(res.items)} reçus / {res.total} annoncés")
        if res.items:
            for key in REQUIRED_ATTRS:
                miss = sum(1 for i in res.items if not P.attrs(i).get(key))
                if miss > 0.05 * len(res.items) and key != "price":
                    res.structure_warnings.append(f"attribut '{key}' manquant sur {miss} offres")
    except Exception as e:  # noqa: BLE001 — toute erreur rend le flux non fiable
        res.ok, res.complete, res.error = False, False, f"{type(e).__name__}: {e}"
        log.error("flux %s en échec: %s", flag, res.error)
    return res


def collect(http: Http, cfg) -> dict[str, FlagResult]:
    flags = list(cfg.s("collect", "flags"))
    discover = bool(cfg.s("collect", "auto_discover_flags", True))
    results: dict[str, FlagResult] = {}
    for flag in flags:
        results[flag] = fetch_flag(http, cfg, flag, discover=discover and flag.startswith("promo_"))
    if discover:
        extra = set().union(*(r.highlight_flags for r in results.values())) - set(results)
        for flag in sorted(extra):
            log.warning("nouveau flux découvert automatiquement: %s", flag)
            results[flag] = fetch_flag(http, cfg, flag)
            results[flag].structure_warnings.append("flux non configuré, découvert automatiquement")
    return results


# --------------------------------------------------------------------------
# Normalisation
# --------------------------------------------------------------------------

def normalize_item(item: dict, flag: str, cfg, home_region: str = "de",
                   enabled_store_ids: list[str] | None = None) -> dict | None:
    a = P.attrs(item)
    article = a.get("articleId") or item.get("sku")
    name = P.clean(a.get("name") or a.get("_tracking_item_name"))
    if not article or not name:
        return None
    kind = FLAG_KIND.get(flag, "highlight")
    start, end = P.parse_validity(a.get("promotionLabel", ""), a.get("promotionFrom"), a.get("promotionTo"))
    anchor = start or end
    offer_id = f"dn-{article}-{kind}-{anchor:%Y%m%d}" if anchor else f"dn-{article}-{kind}-{item.get('sku')}"

    subline = P.clean(a.get("nameSubline"))
    footnote = P.clean(a.get("footnote"))
    stopper = a.get("stopperType", "")
    assortment = a.get("isAssortmentPromotion") == "true"

    price = P.parse_chf(a.get("price")) if not assortment else None
    if price is None and not assortment:
        price = P.parse_chf(item.get("price"))
    ref = P.parse_chf(a.get("insteadPriceText"))
    if ref is not None and price is not None and ref <= price:
        ref = None   # un « statt » inférieur au prix n'est pas une réduction
    competitor = P.is_competitor_reference(footnote)
    disc = P.parse_discount_text(a.get("discount_text", ""),
                                 " ".join([a.get("priceFormatted", ""), name]))

    if ref is not None:
        ref_type = "competitor_comparison" if competitor else "denner_previous"
    elif disc.stated_pct:
        ref_type = "competitor_comparison" if competitor else "stated_percent_only"
    else:
        ref_type = "none"

    discount_pct = round((1 - price / ref) * 100, 1) if (price and ref) else None

    q = P.parse_quantity(subline, a.get("content_size_text", ""))
    up, up_unit = P.unit_price(price, q)
    if q.price_basis == "per_100g" and price and price >= 10:
        # Ex. « Le Gruyère AOP, per 100 g » à 14.60 : 146 CHF/kg, incohérent.
        up, up_unit = None, None
        q.notes.append("prix affiché « per 100 g » improbable : prix unitaire non calculé")
    ref_up, _ = P.unit_price(ref, q)

    regions = P.parse_regions(footnote)
    eligible = regions is None or home_region in regions
    online_only = "online" in footnote.lower() and "nur" in footnote.lower()
    if online_only:
        eligible = False

    conditions: list[str] = []
    if disc.min_qty > 1:
        conditions.append(f"Achat minimum {disc.min_qty} unités (« ab {disc.min_qty} Stück »)")
    if disc.multibuy:
        conditions.append(f"Offre multiple « {disc.multibuy} »")
    if assortment:
        conditions.append("Rabais sur tout un assortiment (prix individuels non publiés)")
    for line in footnote.split("|") if footnote else []:
        line = line.strip()
        if line and "konkurrenzvergleich" not in line.lower():
            conditions.append(line)
    if a.get("priceSubText"):
        conditions.append(P.clean(a["priceSubText"]))
    if q.approximate:
        conditions.append("Poids approximatif (prix au poids)")
    conditions += [n for n in q.notes if "improbable" in n]

    native = a.get("_tracking_item_category2", "")
    group, tags = classify(name, subline, native)

    url = a.get("itemUrl") or ""
    if url.startswith("/"):
        url = cfg.s("collect", "base_url") + url

    return {
        "offer_id": offer_id,
        "article_id": str(article),
        "sku": item.get("sku") or a.get("refCode"),
        "product_name": name,
        "subline": subline,
        "brand": P.clean(a.get("_tracking_item_brand")) or None,
        "category": native or None,
        "group": group,
        "tags": tags,
        "kind": kind,
        "source": "denner_api",
        "sources": [flag],
        "source_url": url or f"{cfg.s('collect', 'base_url')}/de/aktionen",
        "image_url": a.get("imageUrl") or a.get("thumbnailUrl") or None,
        "regions": regions,
        "geographic_scope": "national" if regions is None else "regional:" + ",".join(regions),
        "eligible_home": eligible,
        "online_only": online_only,
        "store_ids": list(enabled_store_ids or []) if eligible else [],
        "availability_confidence": "national_eligible" if eligible else "not_eligible_region",
        "stock": "unknown",
        "regular_price": ref,
        "reference_price_type": ref_type,
        "discounted_price": price,
        "discount_percentage": discount_pct,
        "stated_discount_pct": disc.stated_pct,
        "discount_text": P.clean(a.get("discount_text")),
        "offer_type": "assortment" if assortment else {
            "x_percent": "percent", "x_percent_from_y": "percent_min_qty",
            "special_offer": "special", "custom_text": "custom", "promotion": "promotion"}.get(stopper, stopper or "unknown"),
        "package_size": subline or P.clean(a.get("content_size_text")) or None,
        "total_quantity": q.total,
        "quantity_unit": q.unit,
        "pack_count": q.pack_count,
        "price_basis": q.price_basis,
        "unit_price": up,
        "unit_price_unit": up_unit,
        "regular_unit_price": ref_up,
        "min_purchase_quantity": disc.min_qty,
        "conditions": conditions,
        "validity_label": P.clean(a.get("promotionLabel")),
        "starts_at": P.day_start(start).isoformat() if start else None,
        "ends_at": P.day_end(end).isoformat() if end else None,
        "raw": {k: a.get(k) for k in ("stopperType", "discount_text", "insteadPriceText", "priceSubText",
                                      "footnote", "content_size_text", "unit_price", "salesQuantity",
                                      "promotionFrom", "promotionTo", "priceFormatted")},
    }


def normalize_all(results: dict[str, FlagResult], cfg, enabled_store_ids: list[str]) -> dict[str, dict]:
    """Fusionne les flux : une même offre (même article, type, début) vue dans
    plusieurs flux n'est enregistrée qu'une fois avec la liste des sources."""
    home = cfg.s("general", "home_region", "de")
    out: dict[str, dict] = {}
    for flag, r in results.items():
        for item in r.items:
            o = normalize_item(item, flag, cfg, home, enabled_store_ids)
            if not o:
                continue
            if o["offer_id"] in out:
                prev = out[o["offer_id"]]
                prev["sources"] = sorted(set(prev["sources"]) | {flag})
                if prev.get("discounted_price") != o.get("discounted_price"):
                    log.warning("prix divergent entre flux pour %s: %s vs %s", o["offer_id"],
                                prev.get("discounted_price"), o.get("discounted_price"))
            else:
                out[o["offer_id"]] = o
    return out
