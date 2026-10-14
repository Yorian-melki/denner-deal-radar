"""Konzert und Theater St. Gallen — calendrier des représentations.

``GET https://www.konzertundtheater.ch/programm/kalender/`` (HTML, microdonnées
schema.org Event, ~2 mois affichés). 1 requête. robots.txt sans restriction.

On garde « Eintritt frei » (ex. répétitions publiques) et les prix explicites
étudiants / U26 / last-minute affichés dans le bouton billet ; la référence
est alors le prix normal le plus élevé affiché (« catalog »). Les fourchettes
« CHF 35-75 » sont des catégories de places, PAS une réduction.
"""
from __future__ import annotations

import datetime as dt
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import text
from .saiten_events import classify_price_text

BASE = "https://www.konzertundtheater.ch"
URL = BASE + "/programm/kalender/"


def _g(pat: str, s: str) -> str | None:
    m = re.search(pat, s, re.S)
    return m.group(1) if m else None


def parse_calendar(html: str) -> list[dict]:
    out = []
    for p in re.split(r'(?=<div class="performance performance--)', html)[1:]:
        p = p.split("<!-- performance -->", 1)[0]
        pid = _g(r'id="([^"]+)" data-month-token', p)
        if not pid:
            continue
        info = text(_g(r'<div class="ticketbutton__info">(.*?)</div>\s*</div>', p))
        action = text(_g(r'<div class="ticketbutton__action">(.*?)</div>', p))
        url = _g(r'href="(/programm/kalender/[^"]+)"', p)
        ics = _g(r'href="(/kalender-eintrag/[^"]+\.ics)"', p)
        out.append({"id": pid, "title": text(_g(r'<h3 class="performance__title">(.*?)</h3>', p)),
                    "start": _g(r'itemprop="startDate" content="([^"]+)"', p),
                    "url": BASE + url if url else None, "ics": BASE + ics if ics else None,
                    "venue": text(_g(r'<div class="performance__location">(.*?)</div>', p)) or None,
                    "category": text(_g(r'<div class="performance__category[^"]*">(.*?)</div>', p)) or None,
                    "ticket_text": " ".join(x for x in (action, info) if x).strip(),
                    "soldout": "performance--is-soldout" in p[:200],
                    "few_left": "Resttickets" in action})
    return out


@register
class KuTEvents(Connector):
    id = "kut_events"
    name = "Konzert und Theater St. Gallen"
    family = "event"
    tier = "EVENT"
    interval_minutes = 720
    base_url = BASE
    expected_min_items = 0
    documentation = "programm/kalender/ (HTML microdata) ; 1 requête ; gratuit + prix étudiant/U26/last-minute explicites"

    def fetch(self, ctx):
        html = ctx.get(URL).text
        items = parse_calendar(html)
        if not items and "performance" not in html:
            return FetchResult(error="structure inattendue : aucune représentation trouvée")
        return FetchResult(items=items, complete=True, empty_valid=not items, raw={"performances": len(items)})

    def normalize(self, p, ctx):
        c = classify_price_text(p.get("ticket_text"))
        student = False
        if c["free"]:
            price, ref, offer_type = 0.0, None, "free_event"
        elif c["student_price"] is not None or c["last_minute_price"] is not None:
            student = c["student_price"] is not None
            price = c["student_price"] if student else c["last_minute_price"]
            ref = c["max_public"] if c["max_public"] and c["max_public"] > price else None
            offer_type = "student_price" if student else "last_minute"
        else:
            return None
        tz = ctx.cfg.tz
        start = None
        if p.get("start"):
            start = dt.datetime.fromisoformat(p["start"]).replace(tzinfo=tz).isoformat()
        venue = p.get("venue")
        return make_deal(
            deal_id=f"{self.id}:{p['id']}", source_id=self.id, source_type="merchant", source_offer_id=p["id"],
            source_url=p.get("url") or URL, title=p["title"], family="event", category=p.get("category"),
            offer_type=offer_type, merchant="Konzert und Theater St. Gallen",
            current_price=price, reference_price=ref, reference_price_type="catalog" if ref else None,
            reference_note="prix normal le plus élevé affiché (catégories de places)" if ref else None,
            price_text=c["text"] or None, requires_student=student or None,
            eligibility="; ".join(c["free_groups"]) or None, starts_at=start,
            venue=venue, location=", ".join(filter(None, (venue, "Konzert und Theater St. Gallen"))),
            city="St. Gallen", ics_url=p.get("ics"), sold_out=p.get("soldout") or None,
            low_stock_hint="Resttickets" if p.get("few_left") else None,
            geographic_scope="LOCAL", access="PUBLIC")
