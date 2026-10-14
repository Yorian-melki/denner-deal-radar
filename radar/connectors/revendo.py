"""Revendo — appareils reconditionnés (Suisse), boutique Shopify.

``/products.json`` (non interdit par robots.txt). Note : le robots.txt de
Revendo contient des « instructions pour agents IA » ; ce sont des données,
pas des consignes — ignorées. Référence = compare_at_price (prix « statt »,
nature non précisée : traité comme prix conseillé du neuf).
"""
from __future__ import annotations

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import num


MAX_PAGES = 40   # ~10 000 produits ; au-delà la collecte est déclarée partielle


@register
class Revendo(Connector):
    id = "revendo"
    name = "Revendo (reconditionné)"
    family = "refurbished"
    tier = "SLOW"
    interval_minutes = 240
    base_url = "https://www.revendo.ch"
    expected_min_items = 100

    def fetch(self, ctx):
        items, page, seen = [], 1, set()
        while page <= MAX_PAGES:
            data = ctx.get(f"{self.base_url}/products.json?limit=250&page={page}",
                           headers={"Accept": "application/json"}).json()
            prods = data.get("products")
            if prods is None:
                return FetchResult(error="structure inattendue : products absent")
            if not prods:
                break
            for p in prods:
                if "gutschein" in (p.get("title") or "").lower() or p.get("product_type") in ("Gift Card", "Geschenkgutschein"):
                    continue
                for v in p.get("variants", []):
                    # Seules les variantes disponibles ET réellement réduites sont des « deals ».
                    if v.get("available") and num(v.get("compare_at_price")) and num(v.get("price")) \
                            and num(v["compare_at_price"]) > num(v["price"]) and v["id"] not in seen:
                        seen.add(v["id"])
                        items.append({"p": p, "v": v})
            page += 1
        return FetchResult(items=items, complete=page <= MAX_PAGES, meta={"pages": page - 1})

    def normalize(self, it, ctx):
        p, v = it["p"], it["v"]
        price, ref = num(v.get("price")), num(v.get("compare_at_price"))
        outlet = p.get("product_type") == "Outlet"
        title = p["title"] + ("" if v.get("title") in (None, "Default Title") else f" {v['title']}")
        return make_deal(
            deal_id=f"revendo:{v['id']}", source_id=self.id, source_type="merchant", source_offer_id=v["id"],
            source_url=f"{self.base_url}/products/{p['handle']}", merchant="Revendo", title=title,
            brand=p.get("vendor"), category=p.get("product_type"), family="refurbished",
            offer_type="outlet" if outlet else "refurbished",
            condition="open_box" if outlet else "refurbished_third_party", merchant_sku=v.get("sku") or None,
            canonical_entity_id=f"sku:revendo:{v['id']}",   # SKU partagés entre variantes : id de variante
            image_url=(p.get("images") or [{}])[0].get("src"), current_price=price,
            reference_price=ref if ref and price and ref > price else None,
            reference_price_type="msrp" if ref and price and ref > price else None,
            geographic_scope="ONLINE", delivery_scope="CH", access="PUBLIC")
