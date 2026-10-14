"""Migros — actions hebdomadaires en magasin, coopérative Migros Ostschweiz (gmos).

API JSON publique utilisée par migros.ch, avec le jeton invité anonyme que le
site obtient lui-même (aucun compte) :

1. GET  /authentication/public/v1/api/guest        -> en-tête ``leshopch``
2. GET  /product-display/public/v1/promotions/instore/{new,weekend,personalized}
3. POST /product-display/public/v4/product-cards   (lots de 40 uids, articles)
4. GET  /product-display/public/v2/promotions-details/{ids} (actions « gamme »)

robots.txt : ``Disallow: */promotion/`` et ``*/offers/instore/`` — les chemins
ci-dessus (``/promotions/``, ``/promotions-details/``) sont autorisés (vérifié
par protego, et re-vérifié à chaque requête par le client HTTP).
``/product-display/public/v1/products/promotion/search`` est INTERDIT : jamais
utilisé, ni reconstruit autrement. ≈ 6 requêtes par collecte.

Règles métier :
* référence = prix habituel Migros (« statt ») -> ``merchant_previous`` ;
* badge « 20x » = 20x points Cumulus : PAS une baisse de prix -> aucune
  réduction, condition signalée ;
* action de gamme (« Gesamtes … Sortiment -20 % ») -> ``stated_percent_only`` ;
  l'exemple chiffré du texte n'est qu'une illustration (champ ``example_*``).
"""
from __future__ import annotations

import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from ..parse import clean, parse_chf
from . import register
from ._grocery import iso_day_end, iso_day_start, per_unit_display, quantity_fields

BASE = "https://www.migros.ch"
AUTH = f"{BASE}/authentication/public/v1/api/guest"
INSTORE = BASE + "/product-display/public/v1/promotions/instore/{kind}?region={region}&language=de"
CARDS = f"{BASE}/product-display/public/v4/product-cards"
DETAILS = BASE + "/product-display/public/v2/promotions-details/{ids}?language=de&region={region}"
REGION = "gmos"                      # Genossenschaft Migros Ostschweiz (St-Gall)
KINDS = ("new", "weekend", "personalized")   # « personalized » : non personnalisé pour un invité
BATCH = 40
IMAGE_STACK = "mo-custom/v-w-400-h-340"
NON_FOOD = re.compile(r"küche & wohn|reinigung|wäsche|haushalt|beauty|gesundheit|drogerie|elektronik|"
                      r"freizeit|garten|tier|büro|mode|sport|spielwaren", re.I)
NEUTRAL = re.compile(r"baby und kind", re.I)
_EXAMPLE = re.compile(r"(\d+[.,]\d{2}|\d+\.[–-])\s*</strong>\s*statt\s*(\d+[.,]\d{2}|\d+\.[–-])")


def family_for(categories: list[str]) -> str:
    cats = [c for c in categories if c and not NEUTRAL.search(c)]
    if cats and all(NON_FOOD.search(c) for c in cats):
        return "retail"
    return "grocery"


def collect_ids(instore_payloads: list[dict]) -> tuple[list[int], list[str]]:
    """Fusionne les listes instore : (uids articles, ids actions de gamme), sans doublon."""
    prods, groups, seen = [], [], set()
    for payload in instore_payloads:
        for it in (payload or {}).get("items") or []:
            if not isinstance(it, dict) or it.get("id") is None:
                continue
            key = f"{it.get('type')}:{it['id']}"
            if key in seen:
                continue
            seen.add(key)
            if it.get("type") == "GROUP_PROMOTION":
                groups.append(str(it["id"]))
            else:
                prods.append(int(it["id"]))
    return prods, groups


def parse(cards: list, details: list) -> list[dict]:
    """Réponses product-cards + promotions-details -> éléments bruts pour normalize."""
    items = []
    for c in cards or []:
        if isinstance(c, dict) and (c.get("offer") or {}).get("promotionPrice"):
            items.append({"_kind": "product", **c})
    for g in details or []:
        if isinstance(g, dict) and g.get("id"):
            items.append({"_kind": "group", **g})
    return items


def _badges(block: dict) -> list[tuple[str, str]]:
    return [(b.get("type") or "", clean(b.get("description") or b.get("rawDescription")))
            for b in block.get("badges") or []]


def _pct(badges) -> float | None:
    for t, desc in badges:
        if t == "PERCENTAGE_PROMOTION":
            m = re.search(r"(\d+(?:[.,]\d+)?)\s*%", desc)
            if m:
                return float(m.group(1).replace(",", "."))
    return None


def _conditions(badges) -> tuple[list[str], int | None, list[str]]:
    conds, tags, minq = [], [], None
    for t, desc in badges:
        if t == "CUMULUS_PROMOTION":
            conds.append(f"{desc} points Cumulus (bonus fidélité, pas une baisse de prix)")
            tags.append("cumulus_points")
        elif t == "MINIMUM_PIECES":
            conds.append(desc)
            m = re.search(r"(\d+)", desc)
            if m:
                minq = int(m.group(1))
        elif t == "VITAMIN_FRANC_PROMOTION":
            tags.append("prix_fixe_action")
    return conds, minq, tags


def _img(url: str | None) -> str | None:
    return url.replace("{stack}", IMAGE_STACK) if url else None


@register
class Migros(Connector):
    id = "migros"
    name = "Migros (actions magasin, Ostschweiz)"
    family = "grocery"
    tier = "DAILY"
    interval_minutes = 360
    base_url = BASE
    expected_min_items = 10
    documentation = "Jeton invité + API product-display (instore, product-cards, promotions-details), région gmos"

    def fetch(self, ctx):
        r = ctx.get(AUTH, headers={"Accept": "application/json", "Origin": BASE,
                                   "Referer": f"{BASE}/de/offers/home"})
        token = r.headers.get("leshopch")
        if not token:
            return FetchResult(error="jeton invité absent (en-tête leshopch)")
        h = {"leshopch": token, "Accept": "application/json", "Origin": BASE}
        lists, warnings = [], []
        for kind in KINDS:
            try:
                lists.append(ctx.get(INSTORE.format(kind=kind, region=REGION), headers=dict(h)).json())
            except Exception as e:  # noqa: BLE001
                warnings.append(f"instore/{kind}: {type(e).__name__}: {e}"[:200])
        uids, groups = collect_ids(lists)
        if not lists:
            return FetchResult(error="; ".join(warnings) or "listes instore indisponibles")
        cards, details = [], []
        day = ctx.now.date().isoformat() + "T00:00:00"
        for i in range(0, len(uids), BATCH):
            body = {"offerFilter": {"storeType": "OFFLINE", "region": REGION, "ongoingOfferDate": day},
                    "productFilter": {"uids": uids[i:i + BATCH]}}
            try:
                resp = ctx.post_json(CARDS, body, headers=h)
                cards += resp if isinstance(resp, list) else list(resp.values())
            except Exception as e:  # noqa: BLE001
                warnings.append(f"product-cards: {type(e).__name__}: {e}"[:200])
        for i in range(0, len(groups), BATCH):
            try:
                resp = ctx.get(DETAILS.format(ids=",".join(groups[i:i + BATCH]), region=REGION),
                               headers=dict(h)).json()
                details += resp if isinstance(resp, list) else []
            except Exception as e:  # noqa: BLE001
                warnings.append(f"promotions-details: {type(e).__name__}: {e}"[:200])
        items = parse(cards, details)
        if not items and warnings:
            return FetchResult(error="; ".join(warnings))
        return FetchResult(items=items, complete=not warnings, warnings=warnings,
                           empty_valid=not uids and not groups and len(lists) == len(KINDS),
                           raw={"instore": lists, "product_cards": cards, "promotions_details": details},
                           meta={"products": len(uids), "groups": len(groups)})

    def normalize(self, x, ctx):
        return self._group(x) if x["_kind"] == "group" else self._product(x)

    def _common(self):
        return dict(source_id=self.id, source_type="merchant", merchant="Migros", condition="new",
                    geographic_scope="REGIONAL", geographic_note="prix Migros Ostschweiz (gmos) ; stock du magasin local inconnu",
                    store_type="instore", access="PUBLIC")

    def _product(self, c):
        o = c["offer"]
        badges = _badges(o)
        conds, minq, tags = _conditions(badges)
        promo = (o.get("promotionPrice") or {}).get("effectiveValue")
        regular = (o.get("price") or {}).get("effectiveValue")
        cumulus_only = "cumulus_points" in tags and (regular is None or promo is None or promo >= regular)
        has_cut = promo is not None and regular is not None and regular > promo and not cumulus_only
        pct = None if cumulus_only else _pct(badges)
        variable = bool(o.get("isVariableWeight"))
        up_block = (o.get("promotionPrice") or {}).get("unitPrice") or (o.get("price") or {}).get("unitPrice") or {}
        stated = per_unit_display(up_block.get("value"), up_block.get("unit"))
        qf = quantity_fields(promo, o.get("quantity") or "", stated)
        if variable:
            qf.pop("quantity", None)
            conds.append(f"poids variable : prix indiqué par {o.get('quantity') or 'unité de poids'}")
        cats = [b.get("name") for b in c.get("breadcrumb") or [] if b.get("name")]
        gtins = [g for g in c.get("gtins") or [] if g]
        brand = clean(c.get("brand"))
        name = clean(c.get("name"))
        title = name if not brand or name.lower().startswith(brand.lower()) else f"{brand} {name}"
        rng = o.get("promotionDateRange") or {}
        return make_deal(
            deal_id=f"{self.id}:{c['uid']}", source_offer_id=str(c["uid"]), **self._common(),
            source_url=c.get("productUrls") or f"{BASE}/de/product/{c.get('migrosId')}",
            title=title, brand=brand or None, description=clean(c.get("description")) or None,
            category=cats[0] if cats else None, subcategory=" > ".join(cats[1:]) or None,
            family=family_for(cats[:1]), offer_type="weekly_promotion",
            merchant_sku=str(c.get("migrosId") or c["uid"]),
            # Plusieurs GTIN = origines/variantes différentes : aucun n'identifie l'article à coup sûr.
            gtin=gtins[0] if len(gtins) == 1 else None,
            image_url=_img(((c.get("images") or [{}])[0]).get("url")),
            current_price=promo if not cumulus_only else (regular if regular is not None else promo),
            reference_price=regular if has_cut else None,
            regular_price=regular,
            reference_price_type="merchant_previous" if has_cut else None,
            discount_percentage=pct if has_cut else None,
            discount_badge=", ".join(d for _, d in badges) or None,
            minimum_quantity=minq, conditions=conds, extra_tags=tags,
            starts_at=iso_day_start(rng.get("startDate")), ends_at=iso_day_end(rng.get("endDate")),
            **qf)

    def _group(self, g):
        badges = _badges(g)
        conds, minq, tags = _conditions(badges)
        cumulus_only = "cumulus_points" in tags and _pct(badges) is None
        pct = None if cumulus_only else _pct(badges)
        hint_raw = g.get("discountHint") or ""
        m = _EXAMPLE.search(hint_raw)
        ex_price, ex_ref = (parse_chf(m.group(1)), parse_chf(m.group(2))) if m else (None, None)
        cats = [c.get("name") for c in g.get("categories") or [] if c.get("name")]
        conds = conds + ["action sur une gamme d'articles : prix variable selon l'article"]
        return make_deal(
            deal_id=f"{self.id}:grp:{g['id']}", source_offer_id=str(g["id"]), **self._common(),
            source_url=f"{BASE}/de/offers/home", title=clean(g.get("description")),
            description=clean(hint_raw) or None, category=", ".join(cats) or None,
            family=family_for(cats), offer_type="range_promotion",
            image_url=_img((g.get("image") or {}).get("url")),
            reference_price_type="stated_percent_only" if pct else None,
            discount_percentage=pct, discount_badge=", ".join(d for _, d in badges) or None,
            example_price=ex_price, example_reference_price=ex_ref,
            minimum_quantity=minq, conditions=conds, extra_tags=tags + ["action_gamme"],
            products_count=len(g.get("productIds") or []) or None,
            starts_at=iso_day_start(g.get("startDate")), ends_at=iso_day_end(g.get("endDate")))
