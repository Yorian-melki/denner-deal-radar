"""Flux ``fr-toulon`` (bêta express, EUR). Collecté seulement avec ``RADAR_FEED=fr-toulon``.

Sources sans compte, sans anti-bot, user-agent honnête (testées au curl le 14.11.2026) :
  - Lidl France : widget public du lecteur de prospectus (``endpoints.leaflets.schwarz/v4``),
    prospectus nationaux (``region_id=0``) dont la période couvre aujourd'hui ;
  - Dealabs : flux RSS publics des groupes Épicerie, High-Tech et Gratuit (fenêtre de 30) ;
    les bons plans localisés hors Var (« (93) », « Super U Noisy-le-Grand ») sont écartés ;
  - Student Beans FR, Epic Games (country=FR), GamerPower : déclinaisons des connecteurs CH.
Aucun prix de référence inventé : Dealabs et le prospectus Lidl n'en publient pas.
"""
from __future__ import annotations

import datetime as dt
import html as _html
import re
import xml.etree.ElementTree as ET

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from ..parse import clean
from . import register
from .epic_free import EpicFree
from .gamerpower import GamerPower
from .studentbeans import StudentBeans

FEED = "fr-toulon"

# ---------------------------------------------------------------- Lidl France
LEAFLETS = "https://endpoints.leaflets.schwarz/v4"
LIDL_WIDGET = "134e349a-c72b-11ee-ae4a-fa163fe274a8"   # carrousel « Les promos de la semaine » de lidl.fr
_FLYER_SLUG = re.compile(r"/l/catalogue-de-la-semaine/([a-z0-9-]+)/ar/")


@register
class LidlFR(Connector):
    id = "lidl_fr"
    name = "Lidl France (prospectus)"
    family = "retail"
    tier = "DAILY"
    interval_minutes = 360
    base_url = "https://www.lidl.fr"
    expected_min_items = 20
    feed = FEED
    documentation = "leaflets.schwarz v4 : widget -> flyers nationaux -> produits (2-4 req)"

    def fetch(self, ctx):
        w = ctx.get(f"{LEAFLETS}/widget?widget_id={LIDL_WIDGET}", headers={"Accept": "application/json"}).json()
        slugs = []
        for f in (w.get("widget") or {}).get("flyers") or []:
            m = _FLYER_SLUG.search(f.get("url") or "")
            if m and "0" in (f.get("regions") or ["0"]) and m.group(1) not in slugs:
                slugs.append(m.group(1))
        if not slugs:
            return FetchResult(error="aucun prospectus dans le widget Lidl (structure changée ?)")
        today = ctx.now.date().isoformat()
        items, warnings = [], []
        for s in slugs[:6]:
            try:
                fl = ctx.get(f"{LEAFLETS}/flyer?flyer_identifier={s}&region_id=0",
                             headers={"Accept": "application/json"}).json()["flyer"]
            except Exception as e:  # noqa: BLE001
                warnings.append(f"{s}: {type(e).__name__}"[:120])
                continue
            start, end = fl.get("offerStartDate") or "", fl.get("offerEndDate") or ""
            if not start or not end or not (start <= today <= end):
                continue                     # prospectus à venir ou terminé
            for p in (fl.get("products") or {}).values():
                items.append({**p, "_start": start, "_end": end, "_flyer": fl.get("name") or s})
        if not items:
            return FetchResult(error="; ".join(warnings) or "aucun produit dans les prospectus en cours")
        return FetchResult(items=items, complete=not warnings, warnings=warnings, meta={"flyers": len(slugs)})

    def normalize(self, p, ctx):
        try:
            price = float(p.get("price"))
        except (TypeError, ValueError):
            return None
        if price <= 0 or (p.get("currencyText") or "EUR") != "EUR" or not p.get("productId"):
            return None
        cat = p.get("categoryPrimary") or ""
        food = cat.startswith("Assortiment/Alimentation") or "Alimentaire" in cat
        url = p.get("url") or (self.base_url + (p.get("canonicalUrl") or ""))
        tz = ctx.cfg.tz
        return make_deal(
            deal_id=f"{self.id}:{p['productId']}:{p['_start']}", source_id=self.id, source_type="merchant",
            source_offer_id=p["productId"], merchant="Lidl", brand=clean(p.get("brand") or "") or None,
            title=clean(_html.unescape(p.get("title") or "")), source_url=url,
            description=clean(_html.unescape(p.get("description") or ""))[:300] or None,
            family="grocery" if food else "retail", category=cat.split("/")[1] if "/" in cat else None,
            current_price=price, currency="EUR",
            starts_at=dt.datetime.fromisoformat(p["_start"]).replace(tzinfo=tz).isoformat(),
            ends_at=dt.datetime.fromisoformat(p["_end"]).replace(hour=23, minute=59, tzinfo=tz).isoformat(),
            image_url=None, channel="instore", geographic_scope="NATIONAL", delivery_scope="FR",
            access="PUBLIC", offer_type="leaflet")


# ---------------------------------------------------------------- Dealabs
DEALABS = "https://www.dealabs.com/rss/groupe/"
GROUPS = ("epicerie", "high-tech", "gratuit")
PEPPER = "{http://www.pepper.com/rss}merchant"
_DEPT = re.compile(r"\((\d{2}|2[AB])\)")
_CHAIN_PLACE = re.compile(
    r"(?:Lidl|Aldi|E\.?\s?Leclerc|Leclerc|Carrefour(?: Market| Contact)?|Super U|Hyper U|U Express|Intermarch[ée]"
    r"|Auchan|Casino|G[ée]ant|Monoprix|Action|Decathlon|Netto|Grand Frais|Cora|Match)\s+"
    r"(?!Drive\b|Market\b|Contact\b|Express\b|Club\b|Plus\b|\+)(?:de\s+|d')?[A-ZÉ][\w'’-]+", re.U)
_STUDENT = re.compile(r"[ée]tudiant", re.I)


def _price(s: str | None) -> float | None:
    if not s:
        return None
    m = re.search(r"(\d[\d\s ]*(?:,\d{1,2})?)\s*€", s)
    if not m:
        return None
    return float(m.group(1).replace(" ", "").replace(" ", "").replace(",", "."))


def local_elsewhere(title: str) -> bool:
    """Bon plan d'un magasin précis hors Var : département ≠ 83, ou « Enseigne + Ville » sans Toulon."""
    if "toulon" in title.lower():
        return False
    deps = _DEPT.findall(title)
    if deps:
        return "83" not in deps
    return bool(_CHAIN_PLACE.search(title))


def parse_rss(xml: str, group: str) -> list[dict]:
    root = ET.fromstring(xml)
    out = []
    for it in root.iter("item"):
        m = it.find(PEPPER)
        out.append({"group": group, "title": it.findtext("title") or "", "link": it.findtext("link") or "",
                    "guid": it.findtext("guid") or it.findtext("link") or "",
                    "category": it.findtext("category") or "", "pub": it.findtext("pubDate"),
                    "merchant": m.get("name") if m is not None else None,
                    "price": m.get("price") if m is not None else None})
    return out


@register
class Dealabs(Connector):
    id = "dealabs"
    name = "Dealabs (RSS épicerie, high-tech, gratuit)"
    family = "retail"
    tier = "FAST"
    interval_minutes = 120
    base_url = "https://www.dealabs.com"
    expected_min_items = 10
    window_ttl_hours = 48
    feed = FEED
    documentation = "RSS publics /rss/groupe/<slug> (3 req), fenêtre des 30 derniers bons plans par groupe"

    def fetch(self, ctx):
        items, warnings = [], []
        for g in GROUPS:
            try:
                r = ctx.get(DEALABS + g, headers={"Accept": "application/rss+xml, application/xml"})
                items += parse_rss(r.text, g)
            except Exception as e:  # noqa: BLE001
                warnings.append(f"{g}: {type(e).__name__}"[:120])
        if not items:
            return FetchResult(error="; ".join(warnings) or "aucun élément RSS")
        return FetchResult(items=items, complete=not warnings, warnings=warnings, window=True)

    def normalize(self, it, ctx):
        title = clean(re.sub(r"^\d+°\s*-\s*", "", it["title"]))
        merchant = clean(it.get("merchant") or "") or None
        price = _price(it.get("price"))
        free = it["group"] == "gratuit" or price == 0
        if not title or not merchant or local_elsewhere(title):
            return None
        if price is None and not free:
            return None                      # remise sans prix (« -50 % sur le site ») : pas de carte
        m = re.search(r"-(\d+)/?$", it["link"].split("?")[0])
        oid = m.group(1) if m else it["guid"][-40:]
        student = bool(_STUDENT.search(title))
        cat = it.get("category") or ""
        family = ("student" if student else "free" if free else "grocery" if cat.startswith("Épicerie")
                  else "tech" if cat in ("High-Tech", "Consoles & Jeux vidéo") else "retail")
        return make_deal(
            deal_id=f"{self.id}:{oid}", source_id=self.id, source_type="aggregator", source_offer_id=oid,
            source_url=it["link"], title=title, merchant=merchant, family=family, category=cat or None,
            current_price=0.0 if free and price is None else price, currency="EUR",
            requires_student=student or None, geographic_scope="NATIONAL", delivery_scope="FR",
            access="PUBLIC")


# ---------------------------------------------------------------- variantes FR
@register
class StudentBeansFR(StudentBeans):
    id = "studentbeans_fr"
    name = "Student Beans France"
    feed = FEED
    country = "fr"


@register
class EpicFreeFR(EpicFree):
    id = "epic_free_fr"
    feed = FEED
    url = ("https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions"
           "?locale=fr&country=FR&allowCountries=FR")
    store = "https://store.epicgames.com/fr/p/"
    currency = "EUR"

    def normalize(self, it, ctx):
        d = super().normalize(it, ctx)
        if d:
            d["currency"] = "EUR"
        return d


@register
class GamerPowerFR(GamerPower):
    id = "gamerpower_fr"
    feed = FEED
