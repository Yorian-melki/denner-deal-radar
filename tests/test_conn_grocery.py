"""Connecteurs supermarchés (Migros, Lidl, ALDI, Volg, Rappn) sur fixtures réelles réduites.

Chaque test reconstruit les éléments exactement comme ``fetch`` le ferait
(mêmes fonctions pures de parsing), puis passe chaque élément dans ``normalize``.
"""
import datetime as dt
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from radar.connectors import aldi, lidl, migros, rappn, volg
from radar.connectors._grocery import quantity_fields, stated_unit_price
from radar.core.connector import Context, FetchResult
from radar.core.uscoring import score_deal
from radar.parse import TZ

FIX = Path(__file__).parent / "fixtures"
NOW = dt.datetime(2026, 10, 14, 12, 0, tzinfo=TZ)


class FakeResp:
    def __init__(self, text="", payload=None, headers=None):
        self.text, self._payload, self.headers, self.status_code = text, payload, headers or {}, 200

    def json(self):
        return self._payload


class FakeHttp:
    """Répond depuis les fixtures ; compte les requêtes ; ne touche pas le réseau."""

    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def request(self, method, url, **kw):
        self.calls.append((method, url))
        for key, resp in self.routes:
            if key in url:
                return resp(url, kw) if callable(resp) else resp
        raise AssertionError(f"URL inattendue : {method} {url}")


def ctx(http=None):
    return Context(http=http, cfg=SimpleNamespace(tz=TZ), now=NOW, source_state={})


def normalize_all(conn, items):
    c = ctx()
    out = [conn.normalize(it, c) for it in items]
    return [d for d in out if d]


def check_common(deals, source_id):
    assert deals, "aucun deal"
    for d in deals:
        assert d["deal_id"].startswith(f"{source_id}:")
        assert d["source_id"] == source_id and d["title"]
        if "current_price" in d:
            assert d["current_price"] > 0
        if d.get("reference_price") is not None:
            assert d["reference_price"] > d["current_price"]
        for k in ("starts_at", "ends_at"):
            if d.get(k):
                t = dt.datetime.fromisoformat(d[k])
                assert t.tzinfo is not None and t.utcoffset() == dt.timedelta(hours=2)  # Europe/Zurich (été)
        if d.get("starts_at") and d.get("ends_at"):
            assert d["starts_at"] < d["ends_at"]
        if d.get("unit_price") is not None:
            assert d["unit_price"] > 0 and d["unit"] in ("CHF/kg", "CHF/l", "CHF/pièce")
    assert len({d["deal_id"] for d in deals}) == len(deals)


# --------------------------------------------------------------------------
# Migros

@pytest.fixture(scope="module")
def migros_fx():
    return json.loads((FIX / "migros.json").read_text(encoding="utf-8"))


def test_migros_parse_and_normalize(migros_fx):
    uids, groups = migros.collect_ids(migros_fx["instore"])
    assert len(uids) == 13 and len(groups) == 27
    items = migros.parse(migros_fx["product_cards"], migros_fx["promotions_details"])
    assert len(items) == 12 + 27          # « Meatballs » sans bloc promotionPrice est ignoré
    deals = normalize_all(migros.Migros(), items)
    check_common(deals, "migros")
    by = {d["deal_id"]: d for d in deals}
    feigen = by["migros:100037799"]
    assert (feigen["current_price"], feigen["reference_price"]) == (2.2, 3.0)
    assert feigen["reference_price_type"] == "merchant_previous" and feigen["discount_percentage"] == 26.0
    assert feigen["unit_price"] == 4.4 and feigen["unit"] == "CHF/kg" and feigen["quantity"] == 0.5
    assert feigen["starts_at"] == "2026-10-08T00:00:00+02:00" and feigen["ends_at"] == "2026-10-14T23:59:59+02:00"
    assert "gtin" not in feigen                     # 7 GTIN différents : aucun retenu


def test_migros_cumulus_20x_is_not_a_discount(migros_fx):
    items = migros.parse(migros_fx["product_cards"], migros_fx["promotions_details"])
    deals = normalize_all(migros.Migros(), items)
    cumulus = [d for d in deals if "cumulus_points" in (d.get("extra_tags") or [])]
    assert len(cumulus) >= 8
    for d in cumulus:
        assert "reference_price" not in d and "discount_percentage" not in d
        assert d.get("reference_price_type") is None
        assert any("Cumulus" in c for c in d["conditions"])
        assert score_deal(d).score is None              # aucune réduction vérifiable
    kettle = next(d for d in deals if d["deal_id"] == "migros:100213668")
    assert kettle["current_price"] == 14.95 and kettle["family"] == "retail"


def test_migros_range_promotions(migros_fx):
    deals = normalize_all(migros.Migros(), migros.parse([], migros_fx["promotions_details"]))
    lindt = next(d for d in deals if d["deal_id"] == "migros:grp:2374033")
    assert lindt["reference_price_type"] == "stated_percent_only" and lindt["discount_percentage"] == 20.0
    assert lindt["minimum_quantity"] == 2 and "current_price" not in lindt
    assert lindt["example_price"] == 10.36 and lindt["example_reference_price"] > lindt["example_price"]
    assert score_deal(lindt).score is not None


def test_migros_fetch_with_fake_http(migros_fx):
    def cards(url, kw):
        assert kw["headers"]["leshopch"] == "tok"
        wanted = set(kw["json"]["productFilter"]["uids"])
        return FakeResp(payload=[c for c in migros_fx["product_cards"] if c["uid"] in wanted])
    http = FakeHttp([
        ("/api/guest", FakeResp(headers={"leshopch": "tok"})),
        ("/instore/new", FakeResp(payload=migros_fx["instore"][0])),
        ("/instore/", FakeResp(payload={"items": []})),
        ("/product-cards", cards),
        ("/promotions-details/", FakeResp(payload=migros_fx["promotions_details"])),
    ])
    res = migros.Migros().fetch(ctx(http))
    assert res.state == "OK" and len(res.items) == 39
    assert not any("/promotion/search" in u for _, u in http.calls)
    assert len(http.calls) <= 7


# --------------------------------------------------------------------------
# Lidl

def lidl_items():
    pages = lidl.offer_pages((FIX / "lidl_home.html").read_text(encoding="utf-8"))
    recs = lidl.parse_page((FIX / "lidl_page.html").read_text(encoding="utf-8"), pages[0])
    return pages, lidl.dedupe(recs)


def test_lidl_discovers_weekly_pages():
    pages, _ = lidl_items()
    assert "/c/de-CH/wochenaktion/a10104196" in pages and "/c/de-CH/wochenaktion/a10104656" in pages
    assert not any("/mode/" in p or "/parkside/" in p for p in pages)


def test_lidl_normalize():
    _, items = lidl_items()
    deals = normalize_all(lidl.Lidl(), items)
    check_common(deals, "lidl")
    by = {d["deal_id"]: d for d in deals}
    sel = by["lidl:10059906"]
    assert (sel["current_price"], sel["reference_price"], sel["reference_price_type"]) == (2.89, 3.99, "merchant_previous")
    assert sel["unit_price"] == 5.8 and sel["unit"] == "CHF/kg" and sel["quantity"] == 0.5
    assert sel["starts_at"] == "2026-10-08T00:00:00+02:00" and sel["ends_at"] == "2026-10-14T23:59:59+02:00"
    plum = by["lidl:10059909"]                       # « Pro kg »
    assert plum["unit"] == "CHF/kg" and plum["unit_price"] == plum["current_price"]
    aktion = by["lidl:10059914"]                     # badge « Aktion », oldPrice 0
    assert "reference_price" not in aktion and aktion.get("reference_price_type") is None
    assert "lidl:10059929" not in by                 # « nur im Tessin gültig »
    plus = [d for d in deals if d.get("requires_membership")]
    assert plus and all(d["access"] == "MEMBER" for d in plus)
    assert any(d["family"] == "retail" for d in deals) and any(d["family"] == "grocery" for d in deals)


# --------------------------------------------------------------------------
# ALDI

def test_aldi_nuxt_and_no_invented_reference():
    html = (FIX / "aldi.html").read_text(encoding="utf-8")
    assert aldi.date_pages(html) == ["2026-10-05", "2026-10-08", "2026-10-12", "2026-10-15", "2026-10-19"]
    prods, pag = aldi.parse_page(html)
    assert len(prods) == 30 and pag["totalCount"] == 49 and pag["limit"] == 60
    deals = normalize_all(aldi.Aldi(), [{**p, "_date_page": "2026-10-12"} for p in prods])
    check_common(deals, "aldi")
    assert len(deals) == 30
    for d in deals:
        assert "reference_price" not in d and "discount_percentage" not in d
        assert d["starts_at"] == "2026-10-12T00:00:00+02:00" and "ends_at" not in d
    haribo = next(d for d in deals if d["title"] == "HARIBO Halloween-Mix")
    assert haribo["current_price"] == 4.49 and haribo["unit_price"] == 9.0 and haribo["unit"] == "CHF/kg"
    mm = next(d for d in deals if "Cookie Dough" in d["title"] and "M&M" in d["title"])
    assert "quantity" not in mm and "unit_price" not in mm   # « 675 kg » publié : invraisemblable


def test_aldi_fetch_paginates_with_fake_http():
    html = (FIX / "aldi.html").read_text(encoding="utf-8")
    http = FakeHttp([("/de/aktionen-und-angebote", FakeResp(text=html))])
    res = aldi.Aldi().fetch(ctx(http))
    assert res.state == "OK" and len(res.items) == 30           # même SKU sur chaque date : dédoublonné
    assert len(http.calls) == 1 + 5                             # index + 5 dates, 1 page chacune


# --------------------------------------------------------------------------
# Volg

def test_volg_normalize():
    items = volg.parse((FIX / "volg.html").read_text(encoding="utf-8"), NOW.date())
    assert len(items) == 25
    deals = normalize_all(volg.Volg(), items)
    check_common(deals, "volg")
    assert len(deals) == 25 and all(d["reference_price_type"] == "merchant_previous" for d in deals)
    pb = next(d for d in deals if d["title"] == "Suttero Pouletbrüstli")
    assert (pb["current_price"], pb["reference_price"], pb["discount_percentage"]) == (2.55, 3.65, 30.0)
    assert pb["unit_price"] == 25.5 and pb["unit"] == "CHF/kg" and pb["deal_id"] == "volg:76798"
    assert pb["starts_at"] == "2026-10-14T00:00:00+02:00" and pb["ends_at"] == "2026-10-17T23:59:59+02:00"
    lotus = next(d for d in deals if d["title"] == "Lotus Biscuits")
    assert lotus["reference_price"] == 7.0 and "unit_price" not in lotus    # « z.B. » : exemple seulement
    weitere = [d for d in deals if d["category"] == "Weitere Aktionen"]
    assert weitere and all(d["starts_at"] == "2026-10-12T00:00:00+02:00" for d in weitere)
    assert all(any("kleineren Verkaufsstellen" in c for c in d["conditions"]) for d in weitere)


# --------------------------------------------------------------------------
# Rappn

def test_rappn_discovery_and_exclusions():
    html = (FIX / "rappn_coop_sg.html").read_text(encoding="utf-8")
    assert rappn.chains(html) == ["coop", "aligro", "ottos"]   # Migros/Denner/Lidl/ALDI exclus
    assert rappn.has_page(html, "coop", 3) and rappn.stand_date(html) == dt.date(2026, 10, 14)


def test_rappn_normalize():
    html = (FIX / "rappn_coop_sg.html").read_text(encoding="utf-8")
    items = rappn.parse(html, "coop", NOW.date())
    assert len(items) == 70
    deals = normalize_all(rappn.Rappn(), items)
    check_common(deals, "rappn")
    for d in deals:
        assert d["source_type"] == "aggregator" and d["merchant"] == "Coop"
        assert d["geographic_scope"] == "LOCAL" and d["ends_at"].startswith("2026-10-")
    steak = next(d for d in deals if d["title"] == "Schweinshalssteak 8 Stück")
    assert (steak["current_price"], steak["reference_price"], steak["reference_price_type"]) == (19.6, 39.2, "merchant_previous")
    assert steak["ends_at"] == "2026-10-14T23:59:59+02:00" and steak["image_url"].startswith("https://www.coop.ch/")
    multi = [d for d in deals if d.get("minimum_quantity")]
    assert multi and all(d["minimum_quantity"] >= 2 for d in multi)
    assert sum(1 for d in deals if d.get("unit_price")) > 30


def test_rappn_ottos_reference_is_competitor():
    html = (FIX / "rappn_coop_sg.html").read_text(encoding="utf-8")
    it = rappn.parse(html, "ottos", NOW.date())[0]
    d = rappn.Rappn().normalize(it, ctx())
    assert d["merchant"] == "Otto's" and d["reference_price_type"] == "competitor" and d["family"] == "retail"


def test_rappn_fetch_limits_pages():
    html = (FIX / "rappn_coop_sg.html").read_text(encoding="utf-8")

    def page(url, kw):                 # chaque chaîne annonce 10 pages
        slug = url.split("/de/aktionen/")[1].split("/")[0]
        n = int(url.rsplit("/page/", 1)[1]) if "/page/" in url else 1
        return FakeResp(text=html + f'<a href="/de/aktionen/{slug}/k/sg/page/{n + 1}">next</a>')
    http = FakeHttp([("rappn.ch/de/aktionen/", page)])
    res = rappn.Rappn().fetch(ctx(http))
    assert isinstance(res, FetchResult) and len(res.items) == 70      # UUID dédoublonnés
    assert res.state == "PARTIAL"                     # pagination volontairement limitée
    assert not any("/api/" in u for _, u in http.calls)
    assert [u.split("rappn.ch")[1] for _, u in http.calls] == [
        "/de/aktionen/coop/k/sg", "/de/aktionen/coop/k/sg/page/2", "/de/aktionen/coop/k/sg/page/3",
        "/de/aktionen/aligro/k/sg", "/de/aktionen/aligro/k/sg/page/2",
        "/de/aktionen/ottos/k/sg", "/de/aktionen/ottos/k/sg/page/2"]


# --------------------------------------------------------------------------
# Utilitaires

def test_quantity_helpers():
    assert stated_unit_price("100 g = -.80") == (8.0, "CHF/kg")
    assert stated_unit_price("100 ml = 0.83") == (8.3, "CHF/l")
    assert stated_unit_price("1 kg = 17.90") == (17.9, "CHF/kg")
    assert quantity_fields(4.49, "1000 g/ 750 g").get("quantity") is None
    assert quantity_fields(6.75, "675 kg").get("unit_price") is None
    assert quantity_fields(5.4, "360 g") == {"package_size": "360 g", "quantity": 0.36, "unit_price": 15.0, "unit": "CHF/kg"}
