"""Epic Games Store — jeux gratuits de la semaine (actuels + à venir), prix CH.

Endpoint public de la vitrine (non documenté, sans clé) :
``store-site-backend-static.ak.epicgames.com/freeGamesPromotions?country=CH``
(robots.txt 404 -> autorisé). 1 requête. Gratuit = une promotion dont
``discountSetting.discountPercentage == 0`` (0 = prix final 0 %, c.-à-d. −100 %).
Les promotions partielles (−20 %, −60 %…) sont ignorées. Référence = prix de
liste Epic en CHF (``originalPrice``/100) -> ``msrp``. Nouveau jeu : jeudi 17:00.
"""
from __future__ import annotations



from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import iso_local, text

URL = ("https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions"
       "?locale=de&country=CH&allowCountries=CH")
STORE = "https://store.epicgames.com/de/p/"


def _free_windows(promos: dict | None, key: str) -> list[dict]:
    out = []
    for group in (promos or {}).get(key) or []:
        for p in group.get("promotionalOffers") or []:
            if (p.get("discountSetting") or {}).get("discountPercentage") == 0:
                out.append(p)
    return out


def parse_free_games(payload: dict) -> list[dict]:
    """Réponse JSON -> une entrée par fenêtre gratuite (actuelle ou à venir)."""
    elements = payload["data"]["Catalog"]["searchStore"]["elements"]
    items = []
    for e in elements:
        for status, key in (("ACTIVE", "promotionalOffers"), ("UPCOMING", "upcomingPromotionalOffers")):
            for w in _free_windows(e.get("promotions"), key):
                items.append({"el": e, "window": w, "status": status})
    return items


def _slug(e: dict) -> str | None:
    for m in ((e.get("catalogNs") or {}).get("mappings") or []) + (e.get("offerMappings") or []):
        if m.get("pageSlug"):
            return m["pageSlug"]
    ps = e.get("productSlug")
    return ps.split("/")[0] if ps else None


@register
class EpicFree(Connector):
    id = "epic_free"
    name = "Epic Games – jeux gratuits"
    family = "digital_free"
    tier = "SLOW"
    interval_minutes = 360
    base_url = "https://store.epicgames.com"
    documentation = "freeGamesPromotions?country=CH (1 req) ; rotation jeudi 15:00 UTC"

    def fetch(self, ctx):
        r = ctx.get(URL, headers={"Accept": "application/json"})
        payload = r.json()
        try:
            items = parse_free_games(payload)
        except (KeyError, TypeError):
            return FetchResult(error="structure inattendue : data.Catalog.searchStore.elements absent")
        # 0 jeu gratuit dans une réponse valide = semaine sans offre (rare mais possible).
        return FetchResult(items=items, complete=True, empty_valid=not items, raw=payload)

    def normalize(self, it, ctx):
        tz = ctx.cfg.tz
        e, w = it["el"], it["window"]
        tp = (e.get("price") or {}).get("totalPrice") or {}
        cur = (tp.get("currencyCode") or "").upper()
        ref = tp.get("originalPrice") / 100 if cur == "CHF" and tp.get("originalPrice") else None
        img = {k.get("type"): k.get("url") for k in e.get("keyImages") or []}
        slug = _slug(e)
        start = iso_local(w.get("startDate"), tz)
        return make_deal(
            deal_id=f"{self.id}:{e['id']}:{(w.get('startDate') or '')[:10]}", source_id=self.id,
            source_type="merchant", source_offer_id=e["id"], merchant="Epic Games Store",
            source_url=STORE + slug if slug else self.base_url + "/de/free-games",
            title=e["title"], description=text(e.get("description"))[:300] or None,
            family="digital_free", offer_type="free_game", category=e.get("offerType"),
            brand=(e.get("seller") or {}).get("name"), condition="new",
            current_price=0.0, reference_price=ref, reference_price_type="msrp" if ref else None,
            reference_note="prix de liste Epic Games Store (CHF)" if ref else None,
            starts_at=start, ends_at=iso_local(w.get("endDate"), tz), status_hint=it["status"],
            image_url=img.get("OfferImageWide") or img.get("Thumbnail"),
            geographic_scope="ONLINE", delivery_scope="DIGITAL", access="PUBLIC", requires_account=True,
            canonical_entity_id=f"epic:{e.get('namespace')}:{e['id']}")
