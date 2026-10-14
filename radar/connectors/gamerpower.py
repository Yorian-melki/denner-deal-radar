"""GamerPower — giveaways jeux / clés / « loot » (Steam, Epic, GOG, mobile…).

RSS UNIQUEMENT : ``/rss/giveaways``. L'API JSON (``/api/*``) est interdite par
robots.txt et n'est jamais appelée. Le flux ne donne ni valeur ni date de fin
structurées : une valeur n'est retenue que si le texte l'énonce en CHF
(« worth CHF 19.90 ») ; énoncée en USD/EUR, elle est conservée telle quelle
(``stated_worth``/``stated_worth_currency``) SANS conversion ni prix de
référence (aucun taux de change inventé). Fin : seulement « until <Mois> <jour> »
explicite dans la description (précision au jour).
"""
from __future__ import annotations

import datetime as dt
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import text

URL = "https://www.gamerpower.com/rss/giveaways"
MEDIA = "{http://search.yahoo.com/mrss/}content"
MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september",
     "october", "november", "december"], 1)}
PLATFORMS = [("epic games", "Epic Games"), ("steam", "Steam"), ("gog", "GOG"), ("itch.io", "itch.io"),
             ("prime gaming", "Prime Gaming"), ("xbox", "Xbox"), ("playstation", "PlayStation"),
             ("ps4", "PlayStation"), ("ps5", "PlayStation"), ("nintendo", "Nintendo"), ("switch", "Nintendo"),
             ("android", "Mobile"), ("ios", "Mobile"), ("mobile", "Mobile"), ("ubisoft", "Ubisoft"),
             ("battle.net", "Battle.net"), ("origin", "EA"), ("ea app", "EA")]
LOOT = re.compile(r"\b(key|pack|dlc|loot|skin|bundle|playtest|beta|alpha|bonus|starter|items?|currency|"
                  r"coins?|gold|chest|cosmetic)\b", re.I)
WORTH = re.compile(r"(?:worth|valued? at|value of|regularly|normally)\s*(?:of\s*)?"
                   r"(CHF|USD|EUR|\$|€)\s?(\d+(?:[.,]\d{1,2})?)", re.I)
UNTIL = re.compile(r"\buntil\s+(?:the\s+)?(" + "|".join(MONTHS) + r")\s+(\d{1,2})(?:st|nd|rd|th)?\b", re.I)


def parse_rss(xml: str) -> list[dict]:
    root = ET.fromstring(xml)
    ch = root.find("channel")
    if ch is None:
        raise ValueError("RSS sans <channel>")
    out = []
    for it in ch.findall("item"):
        media = it.find(MEDIA)
        out.append({"title": text(it.findtext("title")), "description": text(it.findtext("description")),
                    "link": (it.findtext("link") or "").strip(), "guid": (it.findtext("guid") or "").strip(),
                    "pubDate": (it.findtext("pubDate") or "").strip(),
                    "image": media.get("url") if media is not None else None})
    return out


def platform_of(title: str) -> str | None:
    m = re.search(r"\(([^)]+)\)", title)
    cands = [m.group(1).lower()] if m else []
    cands.append(title.lower())
    for c in cands:
        for k, label in PLATFORMS:
            if re.search(r"(?<![a-z])" + re.escape(k) + r"(?![a-z])", c):
                return label
    return None


def stated_worth(desc: str) -> tuple[float, str] | None:
    m = WORTH.search(desc or "")
    if not m:
        return None
    cur = {"$": "USD", "€": "EUR"}.get(m.group(1), m.group(1).upper())
    return float(m.group(2).replace(",", ".")), cur


def stated_end(desc: str, published: dt.datetime | None, tz) -> str | None:
    m = UNTIL.search(desc or "")
    if not m or published is None:
        return None
    month, day = MONTHS[m.group(1).lower()], int(m.group(2))
    year = published.year + (1 if month < published.month - 6 else 0)   # « until January 3 » publié en décembre
    try:
        end = dt.datetime(year, month, day, 23, 59, 59, tzinfo=tz)
    except ValueError:
        return None
    return end.isoformat()


@register
class GamerPower(Connector):
    id = "gamerpower"
    name = "GamerPower (giveaways)"
    family = "digital_free"
    tier = "DAILY"
    interval_minutes = 180
    base_url = "https://www.gamerpower.com"
    documentation = "RSS /rss/giveaways (l'API /api/* est interdite par robots.txt)"

    def fetch(self, ctx):
        r = ctx.get(URL, conditional=True, headers={"Accept": "application/rss+xml, application/xml"})
        if r.status_code == 304:
            return FetchResult(not_modified=True, complete=True)
        try:
            items = parse_rss(r.text)
        except (ET.ParseError, ValueError) as e:
            return FetchResult(error=f"RSS illisible : {e}")
        return FetchResult(items=items, complete=True, raw=r.text[:200000])

    def normalize(self, it, ctx):
        tz = ctx.cfg.tz
        try:
            pub = parsedate_to_datetime(it["pubDate"]) if it.get("pubDate") else None
        except (TypeError, ValueError):
            pub = None
        title = re.sub(r"\s+Giveaway$", "", it["title"]).strip() or it["title"]
        slug = (it.get("guid") or it.get("link") or "").replace("http://", "https://").rstrip("/").rsplit("/", 1)[-1]
        if not slug:
            return None
        worth = stated_worth(it.get("description"))
        chf = worth[0] if worth and worth[1] == "CHF" else None
        return make_deal(
            deal_id=f"{self.id}:{slug}", source_id=self.id, source_type="aggregator", source_offer_id=slug,
            source_url=(it.get("link") or "").replace("http://", "https://") or None, title=title,
            description=(it.get("description") or "")[:300] or None, merchant=platform_of(it["title"]),
            family="digital_free", offer_type="loot" if LOOT.search(it["title"]) else "free_game",
            condition="new", current_price=0.0, reference_price=chf, reference_price_type="msrp" if chf else None,
            stated_worth=worth[0] if worth and not chf else None,
            stated_worth_currency=worth[1] if worth and not chf else None,
            published_at=pub.astimezone(tz).isoformat() if pub else None,
            ends_at=stated_end(it.get("description"), pub.astimezone(tz) if pub else None, tz),
            image_url=it.get("image"), geographic_scope="ONLINE", delivery_scope="DIGITAL",
            access="PUBLIC", requires_account=True)
