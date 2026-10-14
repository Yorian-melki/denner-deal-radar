"""UNiDAYS Suisse — réductions étudiantes (métadonnées publiques).

Pages ``www.myunidays.com/CH/de-CH`` (accueil) et ``…/categories/<slug>``
(liens « viewMoreUrl » de l'accueil, au plus ``MAX_CATEGORIES``) : le JSON
``__NEXT_DATA__`` contient les « benefits » (id, displayName « 15% Rabatt »,
type, canal, dates, exclusivité) et les partenaires (nom). Les codes exigent
un compte UNiDAYS vérifié : non collectés.

robots.txt : www autorisé (seul BrandVerity exclu). ``content.myunidays.com``
est ``Disallow: /`` : ses URL présentes dans le JSON ne sont JAMAIS appelées.
"""
from __future__ import annotations

import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import iso_local, next_data, text

BASE = "https://www.myunidays.com"
HOME = BASE + "/CH/de-CH"
MAX_CATEGORIES = 6
UPTO = re.compile(r"(?:bis zu|up to|jusqu'à)\s*$", re.I)


def walk(o, benefits: dict, partners: dict) -> None:
    if isinstance(o, dict):
        if o.get("type") in ("perk", "giveaway") and o.get("displayName") and o.get("id"):
            benefits.setdefault(o["id"], o)
        elif o.get("id") and o.get("displayName") and ("logo" in o or "defaultPerkSubdomain" in o):
            partners.setdefault(o["id"], o["displayName"])
        for v in o.values():
            walk(v, benefits, partners)
    elif isinstance(o, list):
        for v in o:
            walk(v, benefits, partners)


def parse_page(html: str) -> dict:
    """-> {'benefits': [...], 'partners': {id: nom}, 'categories': [slug, …]}."""
    data = next_data(html)
    pp = data.get("props", {}).get("pageProps", {})
    benefits, partners = {}, {}
    walk(pp, benefits, partners)
    cats = list(dict.fromkeys(re.findall(r'"viewMoreUrl":\s*"/categories/([a-z0-9-]+)"', html)))
    return {"benefits": list(benefits.values()), "partners": partners, "categories": cats}


def parse_discount(s: str) -> dict:
    """« 15% Rabatt » -> 15 ; « Bis zu 80% + 5% Extra » -> 5 garanti (80 = maximum) ;
    « CHF 20 Rabatt » -> remise absolue 20. Un « bis zu X % » seul n'est PAS une remise sûre."""
    out: dict = {}
    sure, upto = [], []
    for m in re.finditer(r"(\d+(?:[.,]\d+)?)\s?%", s or ""):
        v = float(m.group(1).replace(",", "."))
        (upto if UPTO.search(s[:m.start()]) else sure).append(v)
    if sure:
        out["discount_percentage"] = min(sure)          # plusieurs % : le plus prudent
    if upto:
        out["discount_max_percentage"] = max(upto)
    m = re.search(r"(?:CHF\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?CHF)\s+(?:Rabatt|Discount|off)", s or "", re.I)
    if m and not sure:
        out["discount_absolute"] = float(m.group(1) or m.group(2))
    return out


def end_date(s: str | None, tz) -> str | None:
    if not s or s.startswith("9999") or int(s[:4]) >= 2049:   # « ouvert » (9999-12-31, 2050-01-01…)
        return None
    return iso_local(s, tz)


@register
class UNiDAYS(Connector):
    id = "unidays"
    name = "UNiDAYS Schweiz"
    family = "student"
    tier = "SLOW"
    interval_minutes = 1440
    base_url = BASE
    documentation = "__NEXT_DATA__ accueil + ≤6 pages catégorie (www uniquement ; content.myunidays.com interdit)"

    def fetch(self, ctx):
        home = parse_page(ctx.get(HOME).text)
        benefits = {b["id"]: b for b in home["benefits"]}
        partners = dict(home["partners"])
        warnings = []
        for cat in home["categories"][:MAX_CATEGORIES]:
            try:
                page = parse_page(ctx.get(f"{HOME}/categories/{cat}").text)
            except Exception as e:  # noqa: BLE001 — une catégorie en échec n'invalide pas le reste
                warnings.append(f"catégorie {cat}: {type(e).__name__}")
                continue
            partners.update(page["partners"])
            for b in page["benefits"]:
                benefits.setdefault(b["id"], b)
        if not benefits:
            return FetchResult(error="aucun benefit dans __NEXT_DATA__ (structure changée ?)")
        items = [{**b, "_partner": partners.get(b.get("partnerId"))} for b in benefits.values()]
        return FetchResult(items=items, complete=not warnings, warnings=warnings,
                           raw={"benefits": len(items), "categories": home["categories"][:MAX_CATEGORIES]})

    def normalize(self, b, ctx):
        content = b.get("content") or {}
        excl = content.get("perkExclusivityType")
        if excl and excl != "Student":
            return None                     # offre ouverte à tous (NonStudent…) : pas un deal étudiant
        tz = ctx.cfg.tz
        name = text(b["displayName"])
        disc = parse_discount(name)
        merchant = b.get("_partner") or content.get("slug")
        pct = disc.get("discount_percentage")
        return make_deal(
            deal_id=f"{self.id}:{b['id']}", source_id=self.id, source_type="aggregator", source_offer_id=b["id"],
            source_url=b.get("url") or HOME, title=f"{merchant}: {name}" if merchant else name, family="student",
            merchant=merchant, offer_type=b.get("type"), offer_text=name,
            discount_percentage=pct, reference_price_type="stated_percent_only" if pct else None,
            discount_max_percentage=disc.get("discount_max_percentage"),
            discount_absolute=disc.get("discount_absolute"),
            starts_at=iso_local(b.get("startDate"), tz), ends_at=end_date(b.get("endDate"), tz),
            requires_student=True, requires_account=True, access="MEMBER",
            eligibility="UNiDAYS : statut étudiant vérifié", channel=b.get("channel"),
            image_url=b.get("defaultImageUrl"), limited_time=content.get("isLimitedTimeOnly") or None,
            geographic_scope="ONLINE" if b.get("channel") != "instore" else "NATIONAL", delivery_scope="CH")
