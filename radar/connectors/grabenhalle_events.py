"""Grabenhalle St. Gallen — programme via le hub de données minasa.

``GET https://www.grabenhalle.ch/wp-json/minasa-datenhub/v1/events`` ->
``{"xml": "<minasa …>"}`` (schéma https://minasa.ch/schema/v1) : événements,
``ticketPrice`` en texte libre, horaires ISO, adresse du lieu. 1 requête.

robots.txt : ``Crawl-delay: 10`` -> on attend ce délai (lu dans robots.txt)
avant la requête. On ne garde que les soirées gratuites, à CHF 10 ou moins
(prix public le plus bas) ou avec un prix étudiant explicite.
"""
from __future__ import annotations

import json
import time
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import iso_local, text
from .saiten_events import classify_price_text

URL = "https://www.grabenhalle.ch/wp-json/minasa-datenhub/v1/events"
NS = "{https://minasa.ch/schema/v1}"
CHEAP_MAX = 10.0


def respect_crawl_delay(ctx, url: str) -> float:
    """Attend le ``Crawl-delay`` annoncé par robots.txt pour ``url`` (0 si absent)."""
    p = urlparse(url)
    rules = ctx.http.load_robots(f"{p.scheme}://{p.netloc}")
    ua = ctx.http.s.headers.get("User-Agent", "*")
    delay = rules.crawl_delay(ua) or rules.crawl_delay("*") or 0
    if delay:
        time.sleep(float(delay))
    return float(delay)


def parse_events(xml: str) -> list[dict]:
    """XML minasa -> une entrée par représentation (schedule)."""
    root = ET.fromstring(xml)
    locs = {}
    for loc in root.iter(NS + "location"):
        a = loc.find(NS + "address")
        if a is None:
            continue
        street = " ".join(filter(None, (a.findtext(NS + "street"), a.findtext(NS + "number"))))
        locs[loc.findtext(NS + "uuid7")] = {
            "venue": a.findtext(NS + "title"),
            "address": ", ".join(filter(None, (street, " ".join(filter(None, (a.findtext(NS + "zip"), a.findtext(NS + "city"))))))),
            "city": a.findtext(NS + "city")}
    out = []
    for e in root.iter(NS + "event"):
        base_price = (e.findtext(NS + "ticketPrice") or "").strip()
        loc = locs.get(e.findtext(NS + "locationUuid7"), {})
        common = {"event_id": e.findtext(NS + "uuid7"), "title": text(e.findtext(NS + "title")),
                  "summary": text(e.findtext(NS + "summary"))[:300],
                  "url": e.findtext(NS + "originalEventUrl") or e.findtext(f"{NS}providerReference/{NS}url"),
                  "image": e.findtext(NS + "imageUrl"), "category": e.findtext(f"{NS}category/{NS}mainCategory"),
                  "presale_url": e.findtext(NS + "presaleUrl") or None, **loc}
        schedules = list(e.iter(NS + "schedule"))
        for s in schedules or [None]:
            sl = locs.get(s.findtext(NS + "locationUuid7"), loc) if s is not None else loc
            out.append({**common, **sl,
                        "schedule_id": s.findtext(NS + "uuid7") if s is not None else None,
                        "start": s.findtext(NS + "start") if s is not None else None,
                        "end": s.findtext(NS + "end") if s is not None else None,
                        "status": s.findtext(NS + "eventStatus") if s is not None else None,
                        "ticket_price": ((s.findtext(NS + "ticketPrice") if s is not None else None) or base_price).strip()})
    return out


def parse_payload(raw: str) -> list[dict]:
    data = json.loads(raw)
    if not isinstance(data, dict) or "xml" not in data:
        raise ValueError("structure inattendue : clé xml absente")
    return parse_events(data["xml"])


@register
class GrabenhalleEvents(Connector):
    id = "grabenhalle_events"
    name = "Grabenhalle St. Gallen"
    family = "event"
    tier = "EVENT"
    interval_minutes = 720
    base_url = "https://www.grabenhalle.ch"
    expected_min_items = 0
    documentation = "wp-json/minasa-datenhub/v1/events (XML minasa) ; 1 requête ; Crawl-delay 10 s respecté"

    def fetch(self, ctx):
        respect_crawl_delay(ctx, URL)
        r = ctx.get(URL, headers={"Accept": "application/json"})
        items = parse_payload(r.text)
        return FetchResult(items=items, complete=True, empty_valid=not items, raw={"events": len(items)})

    def normalize(self, e, ctx):
        if (e.get("status") or "").lower() in ("cancelled", "canceled", "postponed"):
            return None
        c = classify_price_text(e.get("ticket_price"))
        student = False
        if c["free"]:
            price, ref, offer_type = 0.0, None, "free_event"
        elif c["min_public"] is not None and c["min_public"] <= CHEAP_MAX:
            price, offer_type = c["min_public"], "cheap_event"
            ref = None
        elif c["student_price"] is not None:
            price, student, offer_type = c["student_price"], True, "student_price"
            ref = c["max_public"] if c["max_public"] and c["max_public"] > price else None
        else:
            return None
        tz = ctx.cfg.tz
        sid = e.get("schedule_id") or e.get("start") or "x"
        return make_deal(
            deal_id=f"{self.id}:{e['event_id']}:{sid}", source_id=self.id, source_type="merchant",
            source_offer_id=e["event_id"], source_url=e.get("url"), title=e["title"], family="event",
            description=e.get("summary") or None, category=e.get("category"), offer_type=offer_type,
            merchant="Grabenhalle", image_url=e.get("image"),
            current_price=price, reference_price=ref, reference_price_type="catalog" if ref else None,
            reference_note="prix normal du billet (ticketPrice)" if ref else None,
            price_text=c["text"] or None, requires_student=student or None,
            eligibility="; ".join(c["free_groups"] + [f"{g} CHF {p:g}" for g, p in c["concessions"]]) or None,
            starts_at=iso_local(e.get("start"), tz), ends_at=iso_local(e.get("end"), tz),
            venue=e.get("venue") or "Grabenhalle", location=e.get("venue") or "Grabenhalle",
            address=e.get("address") or None, city=e.get("city") or "St.Gallen",
            presale_url=e.get("presale_url"), geographic_scope="LOCAL", access="PUBLIC")
