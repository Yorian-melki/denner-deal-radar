"""Digitec & Galaxus — « Tagesangebot » (daily deal), lancé à 00:00.

Page publique /de/daily-deal autorisée par robots.txt ; données lues dans
``__NEXT_DATA__``. La page liste aussi les deals des jours précédents : ils
alimentent l'historique et sont marqués expirés. Fin non publiée : minuit
suivant (inférence documentée, ``ends_inferred``). Référence =
SALES_PRICE_BEFORE (ancien prix de vente du marchand). Unités vendues publiées.
"""
from __future__ import annotations

import datetime as dt

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import iso_local, next_data


class _DGDaily(Connector):
    host = ""
    merchant = ""
    family = "flash"
    tier = "DAILY"
    interval_minutes = 60

    def fetch(self, ctx):
        r = ctx.get(f"https://{self.host}/de/daily-deal", headers={"Accept": "text/html"})
        try:
            data = next_data(r.text)["props"]["pageProps"]["preloadedQuery"]["rawResponse"]["data"]["dailyDealProducts"]
        except (KeyError, TypeError, ValueError) as e:
            return FetchResult(error=f"structure inattendue : {e}")
        return FetchResult(items=data, complete=True, raw=data)

    def normalize(self, x, ctx):
        tz = ctx.cfg.tz
        p = x["product"]
        si = p.get("salesInformation") or {}
        iop = p.get("insteadOfPrice") or {}
        start = iso_local(si.get("validFrom"), tz)
        end = (dt.datetime.fromisoformat(start) + dt.timedelta(days=1)).isoformat() if start else None
        n, s = si.get("numberOfItems"), si.get("numberOfItemsSold")
        brand = (p.get("brand") or {}).get("name")
        ext = (p.get("nameExtensions") or {}).get("properties")
        ref = ((iop.get("price") or {}).get("amountInclusive"))
        img = (p.get("previewImage") or {}).get("relativeUrl")
        return make_deal(
            deal_id=f"{self.id}:{p['databaseId']}:{(si.get('validFrom') or '')[:10]}", source_id=self.id,
            source_type="merchant", source_offer_id=p["databaseId"], merchant=self.merchant,
            source_url=f"https://{self.host}{p['relativeUrl']}",
            title=" ".join(filter(None, [brand, p.get("name"), ext])), brand=brand,
            category=(p.get("productType") or {}).get("name"), family="flash", offer_type="daily_deal",
            condition="new", merchant_sku=str(p["databaseId"]),
            canonical_entity_id=f"sku:digitec-galaxus:{p['databaseId']}",
            image_url=f"https://{self.host}/im{img}" if img else None,
            current_price=(p.get("price") or {}).get("amountInclusive"), reference_price=ref,
            reference_price_type="merchant_previous" if ref and iop.get("type") == "SALES_PRICE_BEFORE" else ("catalog" if ref else None),
            stock_remaining=(n - s) if n is not None and s is not None else None,
            stock_percent_sold=round(100 * s / n, 1) if n else None, units_offered=n,
            starts_at=start, ends_at=end, ends_inferred=True,
            geographic_scope="ONLINE", delivery_scope="CH", access="PUBLIC")


@register
class DigitecDaily(_DGDaily):
    id, name, host, merchant = "digitec_daily", "Digitec Tagesangebot", "www.digitec.ch", "Digitec"
    base_url = "https://www.digitec.ch"


@register
class GalaxusDaily(_DGDaily):
    id, name, host, merchant = "galaxus_daily", "Galaxus Tagesangebot", "www.galaxus.ch", "Galaxus"
    base_url = "https://www.galaxus.ch"
