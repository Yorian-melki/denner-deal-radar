"""Stadt St. Gallen — communiqués (RSS), signaux d'opportunités locales.

``GET https://www.stadt.sg.ch/home/_jcr_content/NewsPar.RssFeed.qualident__item0.rdf``
(RSS 2.0, 10 derniers communiqués). 1 requête. robots.txt : /content/ et
/news/stsg_versteigerungen interdits -> ni les images (/content/…) ni les
enchères ne sont appelées.

Ce ne sont pas des offres : on ne garde que les communiqués dont le titre ou
le résumé contient un mot-clé d'ouverture / fermeture / liquidation / gratuité.
Aucun prix n'est déduit.
"""
from __future__ import annotations

import email.utils
import re
import xml.etree.ElementTree as ET

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import text

URL = "https://www.stadt.sg.ch/home/_jcr_content/NewsPar.RssFeed.qualident__item0.rdf"
KEYWORDS = (
    ("opening", r"(?:neu)?eröffn\w*|wiedereröffn\w*|nimmt\b[^.]{0,60}\bbetrieb\s+(?:wieder\s+)?auf|"
                r"öffnet\s+(?:wieder|neu)|saisonstart|startet\s+in\s+die\s+\w+\s+saison"),
    ("closing", r"schliessung\w*|schließung\w*|schliesst\b|geschlossen\b|betriebsaufgabe"),
    ("clearance", r"ausverkauf\w*|liquidation\w*|räumungsverkauf\w*|totalverkauf\w*"),
    ("free", r"\bgratis\b|kostenlos\w*|unentgeltlich\w*|eintritt\s+frei|freier\s+eintritt"),
)


def match_keywords(s: str) -> list[str]:
    return [tag for tag, pat in KEYWORDS if re.search(pat, s or "", re.I)]


def parse_feed(xml: str) -> list[dict]:
    root = ET.fromstring(xml)
    out = []
    for it in root.iter("item"):
        link = (it.findtext("link") or "").strip()
        out.append({"id": (it.findtext("guid") or link).strip(), "url": link, "title": text(it.findtext("title")),
                    "summary": text(it.findtext("description"))[:600], "pub": it.findtext("pubDate")})
    return out


@register
class StadtSGNews(Connector):
    id = "stadtsg_news"
    name = "Stadt St. Gallen News"
    family = "local_news"
    tier = "DAILY"
    interval_minutes = 180
    base_url = "https://www.stadt.sg.ch"
    expected_min_items = 0
    documentation = "RSS communiqués (10 items) ; filtre mots-clés ouverture/fermeture/liquidation/gratuit"

    def fetch(self, ctx):
        r = ctx.get(URL, conditional=True)
        if r.status_code == 304:
            return FetchResult(not_modified=True, complete=True)
        items = parse_feed(r.text)
        return FetchResult(items=items, complete=True, empty_valid="<channel" in r.text and not items,
                           raw={"items": len(items)})

    def normalize(self, it, ctx):
        tags = match_keywords(f"{it['title']} {it['summary']}")
        if not tags or "/news/stsg_versteigerungen" in it["url"]:
            return None
        pub = None
        if it.get("pub"):
            try:
                pub = email.utils.parsedate_to_datetime(it["pub"]).astimezone(ctx.cfg.tz).isoformat()
            except (TypeError, ValueError):
                pub = None
        key = it["url"].rstrip("/").rsplit("/", 1)[-1].removesuffix(".html") or it["id"]
        return make_deal(
            deal_id=f"{self.id}:{key}", source_id=self.id, source_type="official", source_url=it["url"],
            title=it["title"], family="local_news", description=it["summary"][:400], merchant="Stadt St. Gallen",
            offer_type="local_signal", signal_types=tags, extra_tags=[f"signal_{t}" for t in tags],
            free_mentioned=True if "free" in tags else None, published_at=pub, city="St. Gallen",
            geographic_scope="LOCAL", access="PUBLIC")
