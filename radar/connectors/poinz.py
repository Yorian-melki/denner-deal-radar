"""poinz.ch — bons « DEAL » locaux (canton SG) + taux de cashback par marchand.

Pages publiques ``/de/shop?searchableTypes=…`` (robots.txt : aucune interdiction) ;
données lues dans ``__NEXT_DATA__`` -> ``dehydratedState.queries[queryKey[0]=='SEARCH']
.state.data`` (20 éléments/page, ``totalPages``, paramètre ``page`` base 1).

* DEAL : on ne garde que ``locationLabel`` commençant par « SG » (canton de
  St-Gall). Prix = ``discountedPrice`` (bon), référence = ``price`` (prix habituel
  annoncé par le commerçant -> ``catalog``). Famille déduite du contenu.
* AFFILIATE_ONLINE / AFFILIATE_OFFLINE : famille ``cashback``,
  ``cashback_rate`` = taux en % (campagne en cours si plus élevée, sinon taux de
  base), ``cashback_certain=False`` (versé après validation, compte requis).
  Plafond : taux >= 5 % ET au plus 50 marchands (les meilleurs taux).

Coût : 2 pages DEAL + ~21 pages online + 2 offline, une fois par jour.
"""
from __future__ import annotations

import datetime as dt
import json
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register

SHOP = "https://poinz.ch/de/shop"
MAX_PAGES = {"DEAL": 5, "AFFILIATE_ONLINE": 30, "AFFILIATE_OFFLINE": 5}
CASHBACK_MIN_RATE = 5.0
CASHBACK_MAX = 50
SG_CITY = re.compile(r"\bSt\.?\s*Gallen\b", re.I)
FAMILY_RULES = [
    (re.compile(r"(übernachtung|hotel|kurzurlaub|urlaub|aufenthalt|ferien|reise)", re.I), "travel"),
    (re.compile(r"(dinner|lunch|brunch|menü|menu|fondue|pizza|burger|rice|sushi|essen|restaurant|bar\b|"
                r"apéro|apero|kaffee|café|frühstück|degustation|wok|grill)", re.I), "restaurant"),
    (re.compile(r"(eintritt|ticket|konzert|theater|kino|bingo|show|escape|museum|bad\b|sauna|therme)", re.I), "event"),
]


def parse_search(html: str) -> dict:
    """HTML -> ``state.data`` de la requête SEARCH (content, totalPages…)."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise ValueError("__NEXT_DATA__ absent (structure de page changée ?)")
    for q in json.loads(m.group(1))["props"]["pageProps"]["dehydratedState"]["queries"]:
        if (q.get("queryKey") or [None])[0] == "SEARCH":
            data = (q.get("state") or {}).get("data")
            if isinstance(data, dict) and isinstance(data.get("content"), list):
                return data
    raise ValueError("requête SEARCH absente du __NEXT_DATA__")


def _local(s: str | None, tz) -> dt.datetime | None:
    if not s:
        return None
    d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=tz)   # poinz : heure locale sans fuseau


def cashback_of(e: dict, now: dt.datetime, tz) -> tuple[float | None, dict | None]:
    """(taux en %, campagne active retenue ou None)."""
    base = e.get("bestBaseCashback") or {}
    camp = e.get("bestCampaignCashback") or {}
    rate = base.get("value") * 100 if base.get("type") == "PERCENTAGE" and base.get("value") is not None else None
    active = None
    if camp.get("type") == "PERCENTAGE" and camp.get("value") is not None:
        st, en = _local(camp.get("startDateTime"), tz), _local(camp.get("endDateTime"), tz)
        if (st is None or st <= now) and (en is None or now <= en) and (rate is None or camp["value"] * 100 > rate):
            rate, active = camp["value"] * 100, camp
    return (round(rate, 2) if rate is not None else None), active


def select_cashback(entries: list[dict], now: dt.datetime, tz) -> list[dict]:
    rated = []
    for e in entries:
        rate, camp = cashback_of(e, now, tz)
        if rate is not None and rate >= CASHBACK_MIN_RATE:
            rated.append({**e, "_rate": rate, "_campaign": camp})
    rated.sort(key=lambda x: (-x["_rate"], str(x.get("name"))))
    return rated[:CASHBACK_MAX]


def is_sg(e: dict) -> bool:
    lab = ((e.get("dealData") or {}).get("locationLabel") or e.get("locationLabel") or "").strip()
    return bool(re.match(r"^SG\b", lab))


def family_of_deal(name: str) -> str:
    for rx, fam in FAMILY_RULES:
        if rx.search(name or ""):
            return fam
    return "retail"


@register
class Poinz(Connector):
    id = "poinz"
    name = "poinz (bons SG + cashback)"
    family = "cashback"
    tier = "SLOW"
    interval_minutes = 1440
    base_url = "https://poinz.ch"
    documentation = "/de/shop?searchableTypes=DEAL|AFFILIATE_ONLINE|AFFILIATE_OFFLINE, __NEXT_DATA__, 1x/jour"

    def _all_pages(self, ctx, kind: str) -> tuple[list[dict], bool]:
        items, page, total = [], 1, 1
        while page <= min(total, MAX_PAGES[kind]):
            url = f"{SHOP}?searchableTypes={kind}" + (f"&page={page}" if page > 1 else "")
            data = parse_search(ctx.get(url, headers={"Accept": "text/html"}).text)
            items += data["content"]
            total = int(data.get("totalPages") or 1)
            page += 1
        return items, total <= MAX_PAGES[kind]

    def fetch(self, ctx):
        tz = ctx.cfg.tz
        out, warnings, complete = [], [], True
        try:
            deals, full = self._all_pages(ctx, "DEAL")
            complete &= full
            sg = {e["entityId"]: e for e in deals if e.get("entityType") == "DEAL" and is_sg(e) and e.get("entityId")}
            out += [{"_kind": "DEAL", **e} for e in sg.values()]
        except Exception as e:  # noqa: BLE001
            return FetchResult(error=f"DEAL: {type(e).__name__}: {e}"[:200])
        merchants = []
        for kind in ("AFFILIATE_ONLINE", "AFFILIATE_OFFLINE"):
            try:
                got, full = self._all_pages(ctx, kind)
                complete &= full
                merchants += [{"_kind": kind, **e} for e in got]
            except Exception as e:  # noqa: BLE001
                warnings.append(f"{kind}: {type(e).__name__}: {e}"[:200])
                complete = False
        uniq = {e["entityId"]: e for e in merchants if e.get("entityId") is not None}
        out += select_cashback(list(uniq.values()), ctx.now, tz)
        return FetchResult(items=out, complete=complete and not warnings, warnings=warnings, raw=out,
                           meta={"merchants_seen": len(uniq)})

    def normalize(self, e, ctx):
        tz = ctx.cfg.tz
        name = (e.get("name") or "").strip()
        biz = ((e.get("businessProfileData") or {}).get("name") or "").strip() or None
        if e["_kind"] == "DEAL":
            dd = e.get("dealData") or {}
            lab = dd.get("locationLabel") or e.get("locationLabel") or ""
            price, ref = dd.get("discountedPrice"), dd.get("price")
            end = _local(e.get("lastChanceAt"), tz)
            return make_deal(
                deal_id=f"{self.id}:deal:{e['entityId']}", source_id=self.id, source_type="merchant",
                source_offer_id=e["entityId"], source_url=f"{SHOP}/deal/{e['slug']}" if e.get("slug") else SHOP,
                title=f"{biz} – {name}" if biz and biz.lower() not in name.lower() else name, merchant=biz,
                family=family_of_deal(name), offer_type="voucher", condition="new",
                current_price=price, reference_price=ref if ref and price is not None and ref > price else None,
                reference_price_type="catalog" if ref and price is not None and ref > price else None,
                reference_note="prix habituel annoncé par le commerçant (bon poinz)",
                ends_at=end.isoformat() if end else None, location_label=lab,
                city=lab.split(",", 1)[1].strip() if "," in lab else None, canton="SG",
                geographic_scope="LOCAL" if SG_CITY.search(lab) else "NEARBY",
                sold_out=bool(dd.get("soldOut")) or None, stock_remaining=dd.get("goingFastRemaining"),
                image_url=e.get("thumbnail"), access="MEMBER", requires_account=True)
        camp = e.get("_campaign") or {}
        st, en = _local(camp.get("startDateTime"), tz), _local(camp.get("endDateTime"), tz)
        base = (e.get("bestBaseCashback") or {})
        online = e["_kind"] == "AFFILIATE_ONLINE"
        return make_deal(
            deal_id=f"{self.id}:cashback:{e['entityId']}", source_id=self.id, source_type="aggregator",
            source_offer_id=e["entityId"], merchant=name or biz,
            source_url=f"{SHOP}/affiliate/{e['slug']}" if e.get("slug") else SHOP,
            title=f"{e['_rate']:g} % cashback chez {name}" + (" (campagne)" if camp else ""),
            family="cashback", offer_type="cashback", cashback_rate=e["_rate"], cashback_certain=False,
            cashback_base_rate=round(base["value"] * 100, 2) if base.get("value") is not None else None,
            conditions=base.get("nameLocalized"), starts_at=st.isoformat() if st else None,
            ends_at=en.isoformat() if en else None, image_url=e.get("logo"),
            geographic_scope="ONLINE" if online else "NATIONAL", access="MEMBER", requires_account=True)
