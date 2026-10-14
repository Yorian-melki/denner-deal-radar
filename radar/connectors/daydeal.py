"""DayDeal.ch — deal du jour (09:00→09:00) et « Wochendeals » par catégorie.

Endpoint public appelé anonymement par le site ; robots.txt de
broadcast.daydeal.ch : ``Disallow: / Allow: /get_latest_data`` (autorisé
explicitement). 1 requête = tous les deals actifs + % de stock restant.
Référence : « Self-comparison Brack.ch » = prix catalogue BRACK (même groupe).
"""
from __future__ import annotations

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import iso_local, num, text

URL = "https://broadcast.daydeal.ch/get_latest_data?tenant=Daydeal&lang=de"


@register
class DayDeal(Connector):
    id = "daydeal"
    name = "DayDeal"
    family = "flash"
    tier = "FAST"
    interval_minutes = 30
    base_url = "https://www.daydeal.ch"
    documentation = "broadcast.daydeal.ch/get_latest_data ; nouveau deal du jour à 09:00"

    def fetch(self, ctx):
        r = ctx.get(URL, headers={"Accept": "application/json"})
        payload = r.json()
        ev = {e["event"]: e["payload"] for e in payload}
        if "deals_update" not in ev:
            return FetchResult(error="structure inattendue : deals_update absent")
        avail = {a["id"]: a for a in ev.get("availability_update", [])}
        items = [{**d, "_avail": avail.get(d["id"], {})} for d in ev["deals_update"]]
        return FetchResult(items=items, complete=True, empty_valid=not items, raw=payload)

    def normalize(self, d, ctx):
        tz = ctx.cfg.tz
        a = d.get("_avail", {})
        cat = d.get("category") or {}
        slug = cat.get("slug")
        url = f"{self.base_url}/de/deal/{d['slug']}" if slug == "tagesdeal" else f"{self.base_url}/de/category/{slug}"
        sold = 100 - a["availablePercentage"] if a.get("availablePercentage") is not None else None
        if a.get("isSoldOut"):
            sold = 100
        return make_deal(
            deal_id=f"daydeal:{d['id']}", source_id=self.id, source_type="merchant", source_offer_id=d["id"],
            source_url=url, merchant="DayDeal", title=f"{d.get('title', '')} {d.get('subtitle', '')}".strip(),
            description=text(d.get("scopeOfDelivery"))[:300] or None, category=cat.get("name"),
            family="flash", offer_type="daily_deal" if slug == "tagesdeal" else "weekly_deal", condition="new",
            merchant_sku=str(d.get("sku")) if d.get("sku") else None,
            canonical_entity_id=f"sku:brack:{d['sku']}" if d.get("sku") else None,
            image_url=f"https://images.daydeal.ch/files/{d['mainImage']}" if d.get("mainImage") else None,
            current_price=num(d.get("specialPrice")), reference_price=num(d.get("originalPrice")),
            reference_price_type="catalog" if num(d.get("originalPrice")) else None,
            reference_note=d.get("comparison"), stock_percent_sold=sold,
            starts_at=iso_local(d.get("startDate"), tz), ends_at=iso_local(d.get("endDate"), tz),
            geographic_scope="ONLINE", delivery_scope="CH", access="PUBLIC",
            sold_out=bool(a.get("isSoldOut")))
