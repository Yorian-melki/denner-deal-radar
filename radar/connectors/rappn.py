"""Rappn — agrégateur des actions des supermarchés, filtré sur le canton de St-Gall.

Pages publiques server-rendered ``/de/aktionen/<chaîne>/k/sg[/page/N]``
(robots.txt : ``Allow: /de/aktionen`` ; ``/api/``, ``/ref/``, ``/open/``
interdits et jamais utilisés). Source = ``aggregator`` : les données viennent
des chaînes ; Rappn est cité comme source.

On n'ingère QUE les chaînes sans connecteur direct (Coop, Aligro, Otto's…) :
Migros, Denner, Lidl, ALDI et Volg sont exclus pour éviter les doublons.
Volume volontairement modeste : premières pages seulement (``MAX_PAGES``) ->
collecte marquée incomplète (aucune disparition déduite des pages non lues).

Référence = « statt » = ancien prix de la chaîne -> ``merchant_previous``
(sauf Otto's : prix concurrent -> ``competitor``, voir ``REFERENCE_TYPE``).
« ab 2 Stk. −25% » -> ``minimum_quantity`` = 2.
"""
from __future__ import annotations

import datetime as dt
import re
from urllib.parse import parse_qs, urlparse

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from ..parse import clean, parse_chf
from . import register
from ._grocery import iso_day_end, quantity_fields, resolve_day_month, stated_unit_price

BASE = "https://rappn.ch"
CANTON = "sg"
FIRST_CHAIN = "coop"
# Chaînes déjà couvertes par un connecteur direct (slugs Rappn).
COVERED = {"migros", "denner", "lidl-schweiz", "lidl", "aldi-suisse", "aldi", "volg"}
MAX_PAGES = {"coop": 3}
DEFAULT_MAX_PAGES = 2
MAX_CHAINS = 6
NAMES = {"coop": "Coop", "aligro": "Aligro", "ottos": "Otto's", "spar": "Spar", "volg": "Volg",
         "manor": "Manor", "landi": "Landi", "denner": "Denner", "migros": "Migros"}

# Particularités vérifiées par chaîne (cf. docstring) :
# * Otto's affiche sur son propre site des « Konkurrenzpreis » (prix concurrent)
#   comme prix barré -> référence ``competitor`` (prudence), assortiment
#   majoritairement non alimentaire -> famille ``retail``.
# * Aligro (cash & carry) : magasins connus en Suisse romande et à Schlieren
#   (ZH), aucun connu dans le canton de St-Gall -> portée ``TRAVEL_ACCESSIBLE``
#   (liste des magasins non vérifiée par ce connecteur).
REFERENCE_TYPE = {"ottos": "competitor"}
FAMILY = {"ottos": "retail"}
SCOPE = {"aligro": ("TRAVEL_ACCESSIBLE", "Aligro : prix publiés pour SG par Rappn, mais aucun magasin Aligro "
                                         "connu dans le canton (Suisse romande, Schlieren ZH) — à vérifier")}

_CARD = re.compile(r'<article class="group oc-card[^"]*" id="offer=([0-9a-f-]+)">(.*?)</article>', re.S)
_CHAIN_LINK = re.compile(r'href="/de/aktionen/([a-z0-9-]+)(?:\?kanton=SG|/k/sg)"', re.I)
_STAND = re.compile(r"Stand\s+(\d{1,2})\.(\d{1,2})\.(\d{4})")


def chain_url(slug: str, page: int = 1) -> str:
    return f"{BASE}/de/aktionen/{slug}/k/{CANTON}" + (f"/page/{page}" if page > 1 else "")


def chains(html_text: str) -> list[str]:
    out = []
    for s in _CHAIN_LINK.findall(html_text):
        s = s.lower()
        if s not in out and s not in COVERED:
            out.append(s)
    return out


def has_page(html_text: str, slug: str, page: int) -> bool:
    return f'href="/de/aktionen/{slug}/k/{CANTON}/page/{page}"' in html_text


def stand_date(html_text: str) -> dt.date | None:
    m = _STAND.search(html_text)
    if not m:
        return None
    try:
        return dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def _one(pattern: str, block: str) -> str:
    m = re.search(pattern, block, re.S)
    return m.group(1) if m else ""


def parse(html_text: str, slug: str, today: dt.date) -> list[dict]:
    ref_day = stand_date(html_text) or today
    out = []
    for uuid, b in _CARD.findall(html_text):
        img = _one(r'<img[^>]+src="([^"]+)"', b).replace("&amp;", "&")
        if img.startswith("/_next/image"):
            img = (parse_qs(urlparse(img).query).get("url") or [""])[0]
        out.append({
            "uuid": uuid, "chain": slug, "stand": ref_day.isoformat(),
            "title": clean(_one(r'class="oc-link">(.*?)</a>', b)),
            "meta": clean(_one(r'class="oc-meta[^"]*">(.*?)</p>', b)),
            "price": clean(_one(r'class="oc-now[^"]*">(?:<span[^>]*>CHF</span>)?(.*?)</span>', b)),
            "was": clean(_one(r"<s>(.*?)</s>", b)),
            "badge": clean(_one(r'class="oc-badge[^"]*">(.*?)</span>', b)),
            "unit": clean(_one(r'class="oc-unit"[^>]*>(.*?)</p>', b)),
            "valid": clean(_one(r'class="oc-valid[^"]*">(.*?)</p>', b)),
            "image": img or None,
        })
    return out


_SIZE = re.compile(r"\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kg|g|l|dl|cl|ml|stk\.?|stück|rollen|beutel)\b", re.I)


def _meta(meta: str) -> tuple[str | None, str]:
    brand, size = None, ""
    for part in [p.strip() for p in meta.split("·") if p.strip()]:
        if _SIZE.search(part):
            size = part
        elif brand is None:
            brand = part
    return brand, size


@register
class Rappn(Connector):
    id = "rappn"
    name = "Rappn (Coop & autres chaînes, canton SG)"
    family = "grocery"
    tier = "DAILY"
    interval_minutes = 480
    base_url = BASE
    expected_min_items = 50
    documentation = "rappn.ch/de/aktionen/<chaîne>/k/sg — chaînes sans connecteur direct, premières pages"

    def fetch(self, ctx):
        today = ctx.now.date()
        items, warnings, seen, truncated = [], [], set(), []
        first = ctx.get(chain_url(FIRST_CHAIN), headers={"Accept": "text/html"}).text
        todo = [FIRST_CHAIN] + [s for s in chains(first) if s != FIRST_CHAIN][:MAX_CHAINS - 1]
        for slug in todo:
            limit = MAX_PAGES.get(slug, DEFAULT_MAX_PAGES)
            page, html_text = 1, first if slug == FIRST_CHAIN else None
            while True:
                try:
                    if html_text is None:
                        html_text = ctx.get(chain_url(slug, page), headers={"Accept": "text/html"}).text
                except Exception as e:  # noqa: BLE001
                    warnings.append(f"{slug} p{page}: {type(e).__name__}: {e}"[:200])
                    break
                got = parse(html_text, slug, today)
                if not got and page == 1:
                    warnings.append(f"{slug}: aucune carte d'offre")
                for it in got:
                    if it["uuid"] not in seen:
                        seen.add(it["uuid"])
                        items.append(it)
                more = has_page(html_text, slug, page + 1)
                if not more:
                    break
                if page >= limit:
                    truncated.append(f"{slug}: {page} page(s) lue(s), suite non collectée (volume limité)")
                    break
                page, html_text = page + 1, None
        if not items:
            return FetchResult(error="; ".join(warnings) or "aucune offre")
        return FetchResult(items=items, complete=not warnings and not truncated,
                           warnings=warnings + truncated, raw=items, meta={"chains": todo})

    def normalize(self, x, ctx):
        price = parse_chf(x["price"])
        if not price or not x["title"]:
            return None
        was = parse_chf(x["was"])
        ref = was if was and was > price else None
        badge = x["badge"].replace("−", "-") if x["badge"] else ""
        minq = re.search(r"ab\s+(\d+)\s*(?:Stk|Stück)", badge, re.I)
        pct = re.search(r"-\s*(\d+)\s*%", badge)
        brand, size = _meta(x["meta"])
        if not size:
            found = [m.group(0) for m in _SIZE.finditer(x["title"])]
            if found:
                size = found[-1].strip()
        end = None
        m = re.search(r"bis\s+\w+\.?\s*(\d{1,2})\.(\d{1,2})\.", x["valid"])
        if m:
            end = resolve_day_month(int(m.group(1)), int(m.group(2)), dt.date.fromisoformat(x["stand"]))
        stated = None
        um = re.match(r"CHF\s*([\d.,]+)\s*/\s*(.+)$", x["unit"] or "")
        if um:
            stated = stated_unit_price(f"{um.group(2)} = {um.group(1)}")
        chain = NAMES.get(x["chain"], x["chain"].replace("-", " ").title())
        rtype = REFERENCE_TYPE.get(x["chain"], "merchant_previous")
        scope, note = SCOPE.get(x["chain"], ("LOCAL", f"prix {chain} publiés pour le canton de St-Gall (via Rappn) ; "
                                                      "stock du magasin inconnu"))
        conds = []
        if minq:
            conds.append(f"dès {minq.group(1)} pièces")
        return make_deal(
            deal_id=f"{self.id}:{x['uuid']}", source_id=self.id, source_type="aggregator",
            source_offer_id=x["uuid"], source_url=f"{chain_url(x['chain'])}#offer={x['uuid']}",
            merchant=chain, title=x["title"], brand=brand, description=x["meta"] or None,
            family=FAMILY.get(x["chain"], "grocery"), offer_type="weekly_promotion", condition="new",
            image_url=x.get("image"), current_price=price, reference_price=ref,
            regular_price=ref if rtype == "merchant_previous" else None,
            reference_price_type=rtype if ref else ("stated_percent_only" if pct else None),
            discount_percentage=float(pct.group(1)) if pct else None,
            discount_badge=x["badge"] or None, minimum_quantity=int(minq.group(1)) if minq else None,
            conditions=conds, ends_at=iso_day_end(end) if end else None,
            geographic_scope=scope, geographic_note=note,
            attribution="Données: rappn.ch", **quantity_fields(price, size, stated))
