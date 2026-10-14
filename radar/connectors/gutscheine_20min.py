"""20 Minuten Gutscheine (gutscheine.20min.ch, opéré par Checkout Charlie).

Page publique ``/neue-gutscheine`` : les offres sont dans ``__NUXT_DATA__``
(sérialisation « devalue » : tableau plat, entiers = renvois d'index, enveloppes
``["Reactive", i]``…). 1 requête par collecte ; robots.txt impose
``Crawl-delay: 3`` (respecté : attente avant chaque requête) et interdit les URL
de révélation ``?code=`` — jamais appelées.

Les codes sont présents dans la charge utile, mais les republier irait contre
l'intention du site : seul ``code.type`` (single/multi/none) est lu, le code
lui-même n'est JAMAIS copié. Le lien pointe vers la page 20min du marchand.
"""
from __future__ import annotations

import json
import re
import time

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import iso_local, text

URL = "https://gutscheine.20min.ch/neue-gutscheine"
BASE = "https://gutscheine.20min.ch"
CRAWL_DELAY_S = 3.0
WRAPPERS = {"Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef",
            "Set", "Map", "Date", "RegExp", "NuxtError", "Island"}


def devalue(arr: list):
    """Reconstruit l'objet racine d'un payload devalue (sous-ensemble Nuxt)."""
    memo: dict[int, object] = {}

    def r(i):
        if not isinstance(i, int) or i < 0 or i >= len(arr):
            return None
        if i in memo:
            return memo[i]
        v = arr[i]
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in WRAPPERS:
                memo[i] = None
                out = r(v[1]) if len(v) > 1 else None
            else:
                out = []
                memo[i] = out
                out.extend(r(x) if isinstance(x, int) and not isinstance(x, bool) else x for x in v)
        elif isinstance(v, dict):
            out = {}
            memo[i] = out
            for k, x in v.items():
                out[k] = r(x) if isinstance(x, int) and not isinstance(x, bool) else x
        else:
            out = v
        memo[i] = out
        return out

    return r(0)


def parse_offers(html: str) -> list[dict]:
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise ValueError("__NUXT_DATA__ absent (structure de page changée ?)")
    root = devalue(json.loads(m.group(1)))
    found: dict[str, dict] = {}

    def walk(o):
        if isinstance(o, dict):
            if "availability" in o and "saving" in o and isinstance(o.get("shop"), dict) and o.get("id"):
                found.setdefault(str(o["id"]), o)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(root)
    return [_safe(o) for o in found.values()]


def _safe(o: dict) -> dict:
    """Copie restreinte aux champs utiles : le code promo n'est jamais conservé."""
    code = o.get("code") if isinstance(o.get("code"), dict) else {}
    shop = o.get("shop") or {}
    cats = [c.get("title") for c in (o.get("portal_main_categories") or []) if isinstance(c, dict) and c.get("title")]
    return {"id": str(o["id"]), "title": o.get("title"), "saving": o.get("saving") or {},
            "code_type": code.get("type"), "availability": o.get("availability") or {},
            "applicability": o.get("applicability") or {}, "publishedAt": o.get("publishedAt"),
            "exclusive": o.get("exclusive"), "available": o.get("available"), "categories": cats,
            "shop": {"id": shop.get("id"), "title": shop.get("title"), "slug": shop.get("slug")}}


@register
class Gutscheine20min(Connector):
    id = "gutscheine_20min"
    name = "20 Minuten Gutscheine"
    family = "coupon"
    tier = "SLOW"
    interval_minutes = 360
    base_url = BASE
    documentation = "/neue-gutscheine (__NUXT_DATA__) ; Crawl-delay 3 s ; jamais ?code= ; codes non republiés"

    def fetch(self, ctx):
        if hasattr(ctx.http, "load_robots"):   # client réel : délai d'exploration du robots.txt
            ctx.http.load_robots(BASE)
            time.sleep(CRAWL_DELAY_S)
        r = ctx.get(URL, headers={"Accept": "text/html"})
        try:
            offers = parse_offers(r.text)
        except (ValueError, json.JSONDecodeError) as e:
            return FetchResult(error=str(e))
        offers = [o for o in offers if o.get("available") is not False]
        return FetchResult(items=offers, complete=True, raw=offers)

    def normalize(self, o, ctx):
        tz = ctx.cfg.tz
        sv, av, ap, shop = o["saving"], o["availability"], o["applicability"], o["shop"]
        stype, val, prefix = sv.get("type"), sv.get("value"), sv.get("prefix")
        exact = prefix in (None, "none")
        pct = float(val) if stype == "percent" and exact and isinstance(val, (int, float)) else None
        absolute = float(val) if stype == "currency" and exact and isinstance(val, (int, float)) else None
        min_order = ap.get("orderValue") if isinstance(ap.get("orderValue"), (int, float)) and ap["orderValue"] > 0 else None
        has_code = o.get("code_type") in ("single", "multi")
        cond = []
        if ap.get("product"):
            cond.append(f"valable sur : {text(ap['product'])[:160]}")
        if min_order:
            cond.append(f"dès CHF {min_order:g}")
        if prefix == "up_to" and val is not None:
            cond.append(f"jusqu'à {val}{' %' if stype == 'percent' else ' CHF' if stype == 'currency' else ''}")
        return make_deal(
            deal_id=f"{self.id}:{o['id']}", source_id=self.id, source_type="aggregator", source_offer_id=o["id"],
            source_url=f"{BASE}/{shop['slug']}" if shop.get("slug") else URL,
            merchant=shop.get("title"), title=text(o.get("title")) or "Gutschein",
            category=", ".join(o.get("categories") or []) or None, family="coupon", offer_type="coupon",
            coupon_value=val if isinstance(val, (int, float)) else None,
            coupon_value_type=stype, coupon_value_text=val if isinstance(val, str) else None,
            coupon_up_to=True if prefix == "up_to" else None,
            discount_percentage=pct, discount_absolute=absolute,
            reference_price_type="stated_percent_only" if pct else None,
            minimum_order_value=min_order, conditions="; ".join(cond) or None,
            starts_at=iso_local(av.get("AvailableFrom"), tz), ends_at=iso_local(av.get("AvailableTill"), tz),
            published_at=iso_local(o.get("publishedAt"), tz), requires_coupon=has_code,
            code_kind=o.get("code_type"), exclusive=bool(o.get("exclusive")) or None,
            geographic_scope="ONLINE", delivery_scope="CH", access="PUBLIC")
