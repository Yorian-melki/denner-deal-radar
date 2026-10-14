"""BRACK.ch — rubriques « Aktion » (trade) et « Occasion » des grandes catégories.

Pages catégories publiques (robots.txt : catégories + filtres autorisés ; NE PAS
ajouter sortProducts, /api, /json). Données dans le JSON ``productDataMap``
embarqué. EAN disponible (sauf occasions) -> rapprochement inter-sources.
Référence = standardPrice BRACK (prix habituel du marchand).
"""
from __future__ import annotations

import json
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register

CATEGORIES = ["it-multimedia", "haushalt-wohnen", "supermarkt-familie", "sport-freizeit", "baumarkt-hobby"]
FILTERS = {"trade": "Aktion", "occassion": "Occasion"}


def extract(raw: str) -> dict | None:
    for m in re.finditer(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', raw, re.S):
        if m.group(1).startswith('{"productDataMap"'):
            return json.loads(m.group(1))
    return None


@register
class Brack(Connector):
    id = "brack"
    name = "BRACK Aktion & Occasion"
    family = "tech"
    tier = "SLOW"
    interval_minutes = 480
    base_url = "https://www.brack.ch"
    expected_min_items = 20

    def fetch(self, ctx):
        items, errors = [], []
        for cat in CATEGORIES:
            for f in FILTERS:
                url = f"{self.base_url}/{cat}?filter%5BArt%5D%5B%5D={f}"
                try:
                    data = extract(ctx.get(url).text)
                except Exception as e:  # noqa: BLE001
                    errors.append(f"{cat}/{f}: {e}")
                    continue
                if data is None:
                    errors.append(f"{cat}/{f}: productDataMap absent")
                    continue
                for x in data["productDataMap"].values():
                    items.append({**x, "_filter": f})
        if not items:
            return FetchResult(error="; ".join(errors) or "aucun produit")
        res = FetchResult(items=items, complete=not errors, warnings=errors)
        return res

    def normalize(self, x, ctx):
        pr = x.get("price") or {}
        price = pr.get("priceWithVat")
        if price is None:
            return None
        price /= 100
        std = (pr.get("standardPrice") or {}).get("priceWithVat")
        ref = std / 100 if std else None
        img = None
        if x.get("images"):
            img = "https://cdn.competec.ch" + x["images"][0]["sizes"][0]["src"]
        occasion = x["_filter"] == "occassion" or "occasion" in (x.get("labelsAll") or [])
        ean = (x.get("itemNumbers") or {}).get("ean")
        stock = (x.get("inventory") or {}).get("current")
        return make_deal(
            deal_id=f"brack:{x['sku']}", source_id=self.id, source_type="merchant", source_offer_id=x["sku"],
            source_url=self.base_url + x["url"], merchant="BRACK",
            title=f"{(x.get('manufacturer') or {}).get('name', '')} {x['description']['nameWithoutManufacturer']}".strip(),
            brand=(x.get("manufacturer") or {}).get("name"),
            category=" > ".join(b["name"] for b in x.get("breadcrumbs", [])) or None,
            family="refurbished" if occasion else "tech", offer_type="occasion" if occasion else "sale",
            condition="used" if occasion else "new", gtin=ean or None, merchant_sku=str(x["sku"]),
            canonical_entity_id=None if ean else f"sku:brack:{x['sku']}",
            image_url=img, current_price=price,
            reference_price=ref if ref and ref > price else None,
            reference_price_type="merchant_previous" if ref and ref > price else None,
            stock_remaining=stock if isinstance(stock, (int, float)) and stock >= 0 else None,
            geographic_scope="ONLINE", delivery_scope="CH", access="PUBLIC")
