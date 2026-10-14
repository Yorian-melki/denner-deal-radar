"""Secret Flying — pages « cheap flights from » Zurich et Basel.

``GET https://www.secretflying.com/cheap-flights-from/<ville>/`` (HTML, cartes
``<article class="… post-<id> … category-<ville> …">``). RSS et REST API
désactivés côté site. robots.txt : ``Crawl-delay: 1`` respecté. 2 requêtes.

Prix lu dans le TITRE de la carte (le slug d'URL peut être périmé). Les prix
sont presque toujours en EUR : stockés tels quels (``price_original`` +
``currency``, ``price_eur``), AUCUNE conversion ; ``current_price`` seulement
si le prix est en CHF. Les cartes publiées il y a plus de 60 jours sont
écartées (les pages listent des posts de 2018-2025).
"""
from __future__ import annotations

import datetime as dt
import html as _html
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import text
from .grabenhalle_events import respect_crawl_delay

BASE = "https://www.secretflying.com"
CITIES = {"zurich": "ZRH", "basel": "BSL"}
MAX_AGE_DAYS = 60
SYM = {"€": "EUR", "$": "USD", "£": "GBP", "CHF": "CHF", "Fr.": "CHF"}
FLAGS = (("PRICE DROP", "price_drop"), ("LAST MINUTE", "last_minute"), ("ERROR FARE", "error_fare"))
_ART = re.compile(r'<article class="([^"]*\bpost-(\d+)\b[^"]*)">(.*?)</article>', re.S)


def parse_page(html: str) -> list[dict]:
    out = []
    for cls, pid, body in _ART.findall(html):
        a = re.search(r'<a href="(https://www\.secretflying\.com/posts/[^"]+)"[^>]*title="([^"]+)"', body)
        if not a:
            continue
        title = _html.unescape(a.group(2)).strip()
        pm = re.search(r"(?:for|from) only\s+(€|\$|£|CHF\s?|Fr\.\s?)?([\d,]+(?:\.\d{1,2})?)\s*([A-Z]{3})?", title)
        price = cur = None
        if pm:
            price = float(pm.group(2).replace(",", ""))
            cur = SYM.get((pm.group(1) or "").strip()) or pm.group(3)
        date = re.search(r"\b([A-Z][a-z]{2}) (\d{1,2}), (\d{4})\b", text(body))
        img = re.search(r'<img[^>]+src="([^"]+)"[^>]*class="[^"]*wp-post-image', body)
        out.append({"id": pid, "title": title, "url": a.group(1), "price": price, "currency": cur,
                    "roundtrip": "roundtrip" in title.lower(), "one_way": "one-way" in title.lower(),
                    "categories": re.findall(r"category-([a-z0-9-]+)", cls),
                    "expired": bool(re.search(r"\bexpired\b", cls)),
                    "posted": date.group(0) if date else None, "image": img.group(1) if img else None})
    return out


def posted_date(s: str | None) -> dt.date | None:
    if not s:
        return None
    try:
        return dt.datetime.strptime(s, "%b %d, %Y").date()
    except ValueError:
        return None


def is_fresh(item: dict, now: dt.datetime, max_age_days: int = MAX_AGE_DAYS) -> bool:
    d = posted_date(item.get("posted"))
    return d is not None and (now.date() - d).days <= max_age_days and not item.get("expired")


@register
class SecretFlying(Connector):
    id = "secretflying"
    name = "Secret Flying (Zurich, Basel)"
    family = "travel"
    tier = "DAILY"
    interval_minutes = 180
    base_url = BASE
    expected_min_items = 0
    documentation = "cheap-flights-from/zurich|basel (HTML) ; 2 requêtes ; Crawl-delay 1 ; posts > 60 j écartés"

    def fetch(self, ctx):
        items: dict[str, dict] = {}
        for city, code in CITIES.items():
            url = f"{BASE}/cheap-flights-from/{city}/"
            respect_crawl_delay(ctx, url)
            rows = parse_page(ctx.get(url).text)
            if not rows:
                return FetchResult(error=f"{city} : aucune carte article.post-* (structure changée ?)")
            for r in rows:
                rec = items.setdefault(r["id"], {**r, "pages": []})
                rec["pages"].append(code)
        fresh = [r for r in items.values() if is_fresh(r, ctx.now)]
        return FetchResult(items=fresh, complete=True, empty_valid=not fresh,
                           raw={"cards": len(items), "fresh": len(fresh)})

    def normalize(self, r, ctx):
        if not is_fresh(r, ctx.now):
            return None
        d = posted_date(r["posted"])
        cats = set(r.get("categories") or [])
        deps = sorted({code for city, code in CITIES.items() if city in cats} | set(r.get("pages") or []))
        cur = r.get("currency")
        flags = [tag for word, tag in FLAGS if word in r["title"].upper()]
        title = re.sub(r"^[^\w]*(?:PRICE DROP|LAST MINUTE|ERROR FARE)[^\w]*:?\s*", "", r["title"]).strip() or r["title"]
        return make_deal(
            deal_id=f"{self.id}:{r['id']}", source_id=self.id, source_type="community", source_offer_id=r["id"],
            source_url=r["url"], title=title, family="travel", merchant="Secret Flying", offer_type="flight",
            current_price=r["price"] if cur == "CHF" else None,
            price_original=r["price"], currency=cur, price_eur=r["price"] if cur == "EUR" else None,
            trip_type="roundtrip" if r.get("roundtrip") else ("one_way" if r.get("one_way") else None),
            departure_airports=deps or None, departure_note="« European cities » : vérifier le départ"
            if "european-cities" in cats or "European cities" in r["title"] else None,
            published_at=dt.datetime.combine(d, dt.time(0, 0), tzinfo=ctx.cfg.tz).isoformat() if d else None,
            extra_tags=flags or None, image_url=r.get("image"),
            geographic_scope="TRAVEL_ACCESSIBLE", access="PUBLIC")
