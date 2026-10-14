"""QoQa — ventes flash (Suisse). API REST publique documentée pour agents,
sans clé : https://api.qoqa.ch/v2/agents/openapi.json (déclarée dans
/.well-known/ard.json, référencée par robots.txt).

1 requête liste + 1 requête détail par NOUVELLE offre (prix de référence par
variante), mise en cache dans l'état de la source.
"""
from __future__ import annotations

import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import iso_local

API = "https://api.qoqa.ch/v2/agents/offers"
UNIVERSE_FAMILY = {"Wein": "retail", "Vin": "retail", "Food": "grocery"}


@register
class QoQa(Connector):
    id = "qoqa"
    name = "QoQa"
    family = "flash"
    tier = "FAST"
    interval_minutes = 30
    base_url = "https://www.qoqa.ch"
    documentation = "API agents QoQa ; lancements 10:00, 12:00, 20:00"

    def fetch(self, ctx):
        r = ctx.get(f"{API}?locale=de", headers={"Accept": "application/json"})
        data = r.json()
        offers = data.get("offers")
        if offers is None:
            return FetchResult(error="structure inattendue : offers absent")
        cache = ctx.source_state.setdefault("details", {})
        live_ids = {str(o["id"]) for o in offers}
        for o in offers:
            oid = str(o["id"])
            if oid not in cache:
                try:
                    det = ctx.get(f"{API}/{oid}?locale=de", headers={"Accept": "application/json"}).json()
                    variants = [v for p in det.get("products", []) for v in p.get("variants", [])]
                    cache[oid] = [{"price": v.get("price"), "regular": v.get("regular_price"),
                                   "stock": v.get("stock_status")} for v in variants]
                except Exception:  # noqa: BLE001 — le détail est facultatif
                    cache[oid] = []
        for k in [k for k in cache if k not in live_ids]:
            del cache[k]
        items = [{**o, "_variants": cache.get(str(o["id"]), [])} for o in offers]
        return FetchResult(items=items, complete=len(offers) == data.get("count", len(offers)),
                           empty_valid=data.get("count") == 0, raw=data)

    def normalize(self, o, ctx):
        tz = ctx.cfg.tz
        variants = [v for v in o.get("_variants", []) if v.get("price") is not None]
        best = min(variants, key=lambda v: v["price"]) if variants else None
        price = best["price"] if best else o.get("price_range_min")
        ref = best.get("regular") if best else None
        m = re.search(r"-(\d+)\s*%", o.get("discount") or "")
        return make_deal(
            deal_id=f"qoqa:{o['id']}", source_id=self.id, source_type="merchant", source_offer_id=o["id"],
            source_url=o.get("url_de") or o.get("url_fr"), merchant="QoQa", title=o["name"],
            category=o.get("universe"), subcategory=", ".join(o.get("sub_universes") or []) or None,
            family=UNIVERSE_FAMILY.get(o.get("universe"), "flash"), offer_type="flash_sale", condition="new",
            current_price=price, reference_price=ref if ref and price and ref > price else None,
            reference_price_type="msrp" if ref and price and ref > price else ("stated_percent_only" if m else None),
            discount_percentage=None if ref else (float(m.group(1)) if m else None),
            price_max=o.get("price_range_max") if o.get("price_range_max") != price else None,
            stock_percent_sold=100 - o["remaining_stock_percent"] if o.get("remaining_stock_percent") is not None else None,
            starts_at=iso_local(o.get("started_at"), tz), ends_at=iso_local(o.get("ends_at"), tz),
            geographic_scope="ONLINE", delivery_scope="CH", access="PUBLIC",
            reference_note="regular_price QoQa (prix public conseillé selon QoQa)" if ref else None)
