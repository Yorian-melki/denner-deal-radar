"""ALDI SUISSE — pages d'actions par date de début (/de/aktionen-und-angebote/AAAA-MM-JJ).

Pages Nuxt SSR : les produits sont dans ``__NUXT_DATA__`` (format « devalue » :
chaque entier dans un dict/liste est un indice du tableau). Les dates sont
redécouvertes à chaque collecte depuis la page d'index ; pagination ``?page=N``
(explicitement autorisée par robots.txt : ``Allow: /*?page=*``). Le site bloque
les User-Agent de navigateur génériques mais accepte notre UA honnête : on le
garde (aucun contournement).

ALDI ne publie quasiment jamais d'ancien prix : ``current_price`` seul, aucune
référence inventée (l'historique notera plus tard). Fin d'action non publiée
(« dès le … jusqu'à épuisement du stock »).
"""
from __future__ import annotations

import json
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from ..parse import clean, parse_chf
from . import register
from ._grocery import NATIONAL_NOTE, iso_day_start, quantity_fields, stated_unit_price

BASE = "https://www.aldi-suisse.ch"
INDEX = f"{BASE}/de/aktionen-und-angebote"
MAX_DATES = 8
MAX_PAGES_PER_DATE = 4
_DATE_LINK = re.compile(r'href="/de/aktionen-und-angebote/(\d{4}-\d{2}-\d{2})"')
_NUXT = re.compile(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', re.S)
FOOD_CATEGORY = re.compile(r"vorräte|getränke|gekühlt|tiefkühl|süssigkeiten|snacks|dressings|öle|saucen|aufstriche|"
                           r"softdrinks|grundnahrungsmittel|brot|backwaren|fleisch|fisch|käse|milch|obst|gemüse|"
                           r"wein|bier|spirituosen|kaffee|tee\b|frühstück|konserven", re.I)
_WRAPPERS = {"Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef"}


def date_pages(html_text: str) -> list[str]:
    return sorted(set(_DATE_LINK.findall(html_text)))[:MAX_DATES]


def nuxt_payload(html_text: str):
    m = _NUXT.search(html_text)
    if not m:
        raise ValueError("__NUXT_DATA__ absent (structure de page changée ?)")
    arr = json.loads(m.group(1))
    memo: dict[int, object] = {}

    def res(i: int):
        if i in memo:
            return memo[i]
        v = arr[i]
        memo[i] = None                     # garde-fou contre les cycles
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in _WRAPPERS:
                out = res(v[1]) if len(v) > 1 and isinstance(v[1], int) else None
            elif v and isinstance(v[0], str) and v[0] in ("Set", "Map", "Date", "RegExp", "NuxtError", "Island"):
                out = None
            else:
                out = [res(x) if isinstance(x, int) and not isinstance(x, bool) else x for x in v]
        elif isinstance(v, dict):
            out = {k: (res(x) if isinstance(x, int) and not isinstance(x, bool) else x) for k, x in v.items()}
        else:
            out = v
        memo[i] = out
        return out
    return res(0)


def _walk(o, pred, acc):
    if isinstance(o, dict):
        if pred(o):
            acc.append(o)
        for v in o.values():
            _walk(v, pred, acc)
    elif isinstance(o, list):
        for v in o:
            _walk(v, pred, acc)
    return acc


def parse_page(html_text: str) -> tuple[list[dict], dict | None]:
    """(produits, pagination {offset, limit, totalCount})."""
    data = nuxt_payload(html_text)
    prods = _walk(data, lambda d: "sku" in d and "price" in d and "onSaleDate" in d, [])
    pag = _walk(data, lambda d: "totalCount" in d and "limit" in d, [])
    by_sku = {}
    for p in prods:
        if isinstance(p.get("price"), dict) and p.get("sku"):
            by_sku.setdefault(p["sku"], p)
    return list(by_sku.values()), (pag[0] if pag else None)


@register
class Aldi(Connector):
    id = "aldi"
    name = "ALDI SUISSE (actions)"
    family = "grocery"
    tier = "DAILY"
    interval_minutes = 480
    base_url = BASE
    expected_min_items = 30
    documentation = "Index -> pages par date de début (Nuxt __NUXT_DATA__), ?page=N"

    def fetch(self, ctx):
        idx = ctx.get(INDEX, headers={"Accept": "text/html"}).text
        dates = date_pages(idx)
        if not dates:
            idx = ctx.get(f"{BASE}/de", headers={"Accept": "text/html"}).text
            dates = date_pages(idx)
        if not dates:
            return FetchResult(error="aucune page de dates d'action trouvée")
        items, warnings, seen = [], [], set()
        for d in dates:
            page = 1
            while page <= MAX_PAGES_PER_DATE:
                url = f"{INDEX}/{d}" + (f"?page={page}" if page > 1 else "")
                try:
                    prods, pag = parse_page(ctx.get(url, headers={"Accept": "text/html"}).text)
                except Exception as e:  # noqa: BLE001
                    warnings.append(f"{d} p{page}: {type(e).__name__}: {e}"[:200])
                    break
                for p in prods:
                    if p["sku"] not in seen:
                        seen.add(p["sku"])
                        items.append({**p, "_date_page": d})
                if not pag or pag.get("offset", 0) + pag.get("limit", 0) >= pag.get("totalCount", 0):
                    break
                page += 1
            else:
                warnings.append(f"{d}: pagination tronquée à {MAX_PAGES_PER_DATE} pages")
        if not items:
            return FetchResult(error="; ".join(warnings) or "aucun produit")
        return FetchResult(items=items, complete=not warnings, warnings=warnings,
                           raw={"dates": dates, "products": items}, meta={"dates": dates})

    def normalize(self, x, ctx):
        pr = x.get("price") or {}
        cents = pr.get("amountRelevant")
        if not isinstance(cents, (int, float)) or cents <= 0:
            return None
        price = round(cents / 100, 2)
        was = parse_chf(pr.get("wasPriceDisplay"))
        ref = was if was and was > price else None
        size = clean(x.get("sellingSize"))
        stated = None
        comp = clean(pr.get("comparisonDisplay"))          # « CHF 0.90/100 g »
        m = re.match(r"CHF\s*([\d.,]+)\s*/\s*(.+)$", comp)
        if m:
            stated = stated_unit_price(f"{m.group(2)} = {m.group(1)}")
        qf = quantity_fields(price, size, stated)
        if qf.get("quantity_note"):
            qf.pop("unit_price", None)
            qf.pop("unit", None)
        badges = [clean(i.get("displayText")) for b in x.get("badges") or [] for i in b.get("items") or []
                  if i.get("displayText")]
        cats = [c.get("name") for c in x.get("categories") or [] if c.get("name")]
        food = bool(qf.get("quantity") or (qf.get("unit") in ("CHF/kg", "CHF/l"))
                    or any(b in ("Tiefgekühlt", "Gekühlt") for b in badges)
                    or any(FOOD_CATEGORY.search(c) for c in cats))
        img = None
        if x.get("assets"):
            img = (x["assets"][0].get("url") or "").replace("{width}", "400").replace("{slug}", x.get("urlSlugText") or "") or None
        start = x.get("onSaleDate") or x.get("_date_page")
        conds = ["jusqu'à épuisement du stock (date de fin non publiée)"]
        if pr.get("bottleDeposit"):
            conds.append(f"consigne {pr['bottleDeposit'] / 100:.2f} CHF en sus")
        return make_deal(
            deal_id=f"{self.id}:{x['sku']}", source_id=self.id, source_type="merchant",
            source_offer_id=x["sku"], merchant="ALDI SUISSE",
            source_url=f"{BASE}/de/produkt/{x.get('urlSlugText')}-{x['sku']}" if x.get("urlSlugText") else f"{INDEX}/{x.get('_date_page')}",
            title=clean(f"{x.get('brandName') or ''} {x.get('name') or ''}"), brand=x.get("brandName"),
            category=", ".join(cats) or None, family="grocery" if food else "retail",
            offer_type="weekly_promotion", condition="new", merchant_sku=x["sku"], image_url=img,
            current_price=price, reference_price=ref,
            reference_price_type="merchant_previous" if ref else None,
            discount_badge=", ".join(badges) or None, conditions=conds,
            starts_at=iso_day_start(start), not_for_sale_online=x.get("notForSale"),
            geographic_scope="NATIONAL", geographic_note=NATIONAL_NOTE, **qf)
