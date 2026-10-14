"""Ferienpiraten.ch (Urlaubspiraten Suisse) — flux RSS des bons plans voyage.

``GET https://www.ferienpiraten.ch/feed`` (RSS 2.0, ~5 entrées, prix en CHF
dans la description « Ab CHF 509.- p.P. »). 1 requête ; robots.txt autorise /feed.

Aéroport de départ : non structuré. On le déduit du texte quand il est cité :
départ ZRH / BSL / Friedrichshafen / Memmingen / St. Gallen-Altenrhein / « ab
der Schweiz » -> gardé ; départ uniquement depuis un autre aéroport cité ->
écarté ; non déterminable -> gardé avec l'étiquette ``departure_unknown``.
"""
from __future__ import annotations

import email.utils
import re
import xml.etree.ElementTree as ET

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import text

URL = "https://www.ferienpiraten.ch/feed"
_DEP = r"(?:\bab|\bvon|Abflug(?:\s+(?:ab|in))?|Flughafen|Airport)\s+(?:dem\s+|der\s+)?"
ALLOWED = (("ZRH", _DEP + r"(?:Zürich|Zuerich|Zurich|Kloten)|\bZRH\b"),
           ("BSL", _DEP + r"(?:Basel|EuroAirport|Mulhouse)|\bBSL\b|EuroAirport"),
           ("FDH", _DEP + r"Friedrichshafen|\bFDH\b"), ("FMM", _DEP + r"Memmingen|\bFMM\b"),
           ("ACH", _DEP + r"(?:St\.?\s?Gallen|Altenrhein)|\bACH\b"), ("GVA", _DEP + r"(?:Genf|Genève|Geneva)|\bGVA\b"),
           ("CH", r"(?:ab|aus) der Schweiz|\bab Schweiz|Schweizer Flughäfen"))
OTHER = _DEP + r"(?:Frankfurt|München|Stuttgart|Wien|Mailand|Milano|Berlin|Hamburg|Düsseldorf|Köln|Paris|London|Lyon|Innsbruck|Salzburg)"
PRICE = re.compile(r"(?:\b[Aa]b|für|nur)\s*(CHF|Fr\.|€|EUR)\s*([\d'’.,]+?)(?:\.-|-)?(?=[\s,.!)]|$)")


def parse_price(desc: str) -> tuple[float | None, str | None, str | None]:
    m = PRICE.search(desc or "")
    if not m:
        return None, None, None
    raw = m.group(2).replace("'", "").replace("’", "").rstrip(".,")
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", raw):        # 1.299 / 1,299 = milliers
        raw = re.sub(r"[.,]", "", raw)
    try:
        val = float(raw.replace(",", "."))
    except ValueError:
        return None, None, None
    cur = "CHF" if m.group(1) in ("CHF", "Fr.") else "EUR"
    tail = desc[m.end():m.end() + 25]
    per = "pro Person" if re.search(r"p\.\s?P\.|pro Person|pP", tail) else None
    return val, cur, per


def departures(blob: str) -> tuple[list[str], bool]:
    """-> (codes autorisés trouvés, autre départ explicitement cité)."""
    found = [code for code, pat in ALLOWED if re.search(pat, blob, re.I)]
    return found, bool(re.search(OTHER, blob, re.I))


def parse_feed(xml: str) -> list[dict]:
    root = ET.fromstring(xml)
    out = []
    for it in root.iter("item"):
        link = (it.findtext("link") or "").strip()
        guid = (it.findtext("guid") or link).strip()
        enc = it.find("enclosure")
        path = re.sub(r"^https?://[^/]+/", "", link).split("/")
        out.append({"guid": guid, "url": link, "title": text(it.findtext("title")),
                    "description": text(it.findtext("description")), "pub": it.findtext("pubDate"),
                    "image": enc.get("url") if enc is not None else None,
                    "category": path[0] if len(path) > 1 else None})
    return out


@register
class Ferienpiraten(Connector):
    id = "ferienpiraten"
    name = "Ferienpiraten.ch"
    family = "travel"
    tier = "FAST"
    interval_minutes = 60
    base_url = "https://www.ferienpiraten.ch"
    documentation = "RSS /feed (5 entrées, CHF) ; 1 requête/h ; départ déduit du texte"

    def fetch(self, ctx):
        r = ctx.get(URL, conditional=True)
        if r.status_code == 304:
            return FetchResult(not_modified=True, complete=True)
        items = parse_feed(r.text)
        return FetchResult(items=items, complete=True, empty_valid="<channel" in r.text and not items,
                           raw={"items": len(items)})

    def normalize(self, it, ctx):
        blob = f"{it['title']} {it['description']}"
        found, other = departures(blob)
        if other and not found:
            return None                    # départ explicitement hors zone
        price, cur, per = parse_price(it["description"])
        pub = None
        if it.get("pub"):
            try:
                pub = email.utils.parsedate_to_datetime(it["pub"]).astimezone(ctx.cfg.tz).isoformat()
            except (TypeError, ValueError):
                pub = None
        slug_id = it["guid"].rstrip("/").rsplit("/", 1)[-1]
        return make_deal(
            deal_id=f"{self.id}:{slug_id}", source_id=self.id, source_type="community", source_offer_id=it["guid"],
            source_url=it["url"], title=it["title"], family="travel", description=it["description"][:400],
            category=it.get("category"), merchant="Ferienpiraten",
            offer_type={"pauschalreisen": "package", "hotels": "accommodation", "fluege": "flight"}.get(it.get("category") or "", "travel"),
            current_price=price if cur == "CHF" else None, price_eur=price if cur == "EUR" else None,
            currency=cur, price_unit=per, departure_airports=found or None,
            extra_tags=None if found else ["departure_unknown"], published_at=pub, image_url=it.get("image"),
            geographic_scope="TRAVEL_ACCESSIBLE", access="PUBLIC")
