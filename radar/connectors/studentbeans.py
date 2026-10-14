"""Student Beans Suisse — réductions étudiantes.

``GET https://www.studentbeans.com/ch`` (1 requête) : la charge React Server
Components (``self.__next_f.push([1,"…"])``) contient des nœuds ``Offer``
(uid, marque, titre « 15% Studentenrabatt », discountEndDate, canal, groupe
« student », pays). Seules les offres ``country.slug == "ch"`` sont gardées.
Codes : compte Student Beans requis (non collectés). robots.txt autorise /ch.
"""
from __future__ import annotations

import json
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import text
from .unidays import end_date, parse_discount

URL = "https://www.studentbeans.com/ch"


def parse_offers(html: str) -> list[dict]:
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.S)
    s = "".join(json.loads('"' + c + '"') for c in chunks)
    dec, out = json.JSONDecoder(), {}
    for m in re.finditer(r'\{"node":\{"uid"', s):
        try:
            o, _ = dec.raw_decode(s, m.start())
        except ValueError:
            continue
        n = o.get("node") or {}
        if n.get("__typename") == "Offer" and n.get("uid"):
            out.setdefault(n["uid"], n)
    return list(out.values())


@register
class StudentBeans(Connector):
    id = "studentbeans"
    name = "Student Beans Schweiz"
    family = "student"
    tier = "DAILY"
    interval_minutes = 720
    base_url = "https://www.studentbeans.com"
    documentation = "Page /ch, nœuds Offer de la charge RSC ; 1 requête/jour"

    def fetch(self, ctx):
        html = ctx.get(URL).text
        offers = parse_offers(html)
        if not offers:
            return FetchResult(error="aucun nœud Offer dans self.__next_f (structure changée ?)")
        return FetchResult(items=offers, complete=True, raw={"offers": len(offers)})

    def normalize(self, n, ctx):
        if (n.get("country") or {}).get("slug") != "ch" or n.get("expired") or n.get("isAdvert"):
            return None
        group = n.get("closedConsumerGroup")
        if group and group != "student":
            return None
        brand = n.get("brand") or {}
        title = text(n.get("title"))
        disc = parse_discount(title)
        pct = disc.get("discount_percentage")
        url = (f"https://www.studentbeans.com/student-discount/ch/{brand['slug']}/{n['slug']}"
               if brand.get("slug") and n.get("slug") else URL)
        channel = (n.get("redemptionClass") or "").lower()
        return make_deal(
            deal_id=f"{self.id}:{n['uid']}", source_id=self.id, source_type="aggregator", source_offer_id=n["uid"],
            source_url=url, title=f"{brand.get('name')}: {title}" if brand.get("name") else title, family="student",
            merchant=brand.get("name"), category=(n.get("primaryCategory") or {}).get("name"), offer_type="student_discount",
            offer_text=title, discount_percentage=pct, reference_price_type="stated_percent_only" if pct else None,
            discount_max_percentage=disc.get("discount_max_percentage"), discount_absolute=disc.get("discount_absolute"),
            ends_at=end_date(n.get("discountEndDate"), ctx.cfg.tz), expiring_soon=n.get("expiringSoon") or None,
            requires_student=True, requires_account=True, access="MEMBER",
            eligibility="Student Beans : statut étudiant vérifié", channel=channel or None,
            image_url=n.get("defaultImageSmall"),
            geographic_scope="ONLINE" if channel in ("online", "") else "NATIONAL", delivery_scope="CH")
