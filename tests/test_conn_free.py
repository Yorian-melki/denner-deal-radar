"""Connecteurs gratuit / communauté / coupons, sur réponses réelles (14.10.2026).

Fixtures réduites : tutti/anibis/poinz = seul le ``__NEXT_DATA__`` utile (alias
vendeur anonymisé) ; 20min = seul ``__NUXT_DATA__``, codes promo remplacés par
``FIXTURECODEnn`` ; Epic / GamerPower / Preispirat = réponses brutes.
"""
import datetime as dt
import json
import re
from pathlib import Path

from radar.config import load
from radar.connectors.anibis_free import AnibisFree
from radar.connectors.epic_free import EpicFree
from radar.connectors.gamerpower import GamerPower, platform_of, stated_worth
from radar.connectors.gutscheine_20min import Gutscheine20min, parse_offers
from radar.connectors.poinz import Poinz
from radar.connectors.preispirat import Preispirat, chf, redact_codes
from radar.connectors.tutti_free import TuttiFree, parse_listings, price_of, search_token
from radar.core.connector import Context
from radar.core.engine import lifecycle
from radar.core.uscoring import score_deal
from radar.parse import TZ

FIX = Path(__file__).parent / "fixtures"
NOW = dt.datetime(2026, 10, 14, 2, 0, tzinfo=TZ)


class Resp:
    def __init__(self, body: str, status=200):
        self.text, self.status_code, self.headers = body, status, {}

    def json(self):
        return json.loads(self.text)


class FakeHttp:
    """Sert les fixtures selon un fragment d'URL (le 1er qui correspond)."""

    def __init__(self, routes):
        self.routes, self.requests_made, self.calls = routes, 0, []

    def get(self, url, **kw):
        self.requests_made += 1
        self.calls.append(url)
        for key, body in self.routes:
            if key in url:
                return Resp(body(url) if callable(body) else body)
        raise AssertionError(f"URL inattendue : {url}")


def run(conn, routes):
    http = FakeHttp(routes)
    ctx = Context(http=http, cfg=load(), now=NOW, source_state={})
    res = conn.fetch(ctx)
    deals = [d for d in (conn.normalize(i, ctx) for i in res.items) if d]
    return res, deals, http


def aware(s):
    return s is None or dt.datetime.fromisoformat(s).tzinfo is not None


def assert_dates_aware(deals):
    for d in deals:
        for k in ("starts_at", "ends_at", "published_at"):
            assert aware(d.get(k)), (k, d.get(k))


# -- tutti / anibis ------------------------------------------------------------

def test_search_token_matches_audit():
    assert search_token("verschenken") == "Ak6t2ZXJzY2hlbmtlbsCUwMDAkZOobG9jYXRpb260Z2VvLWNhbnRvbi1zdC1nYWxsZW7A"
    assert search_token("gratis") == "Ak6ZncmF0aXPAlMDAwJGTqGxvY2F0aW9utGdlby1jYW50b24tc3QtZ2FsbGVuwA"
    assert search_token(None, [["location", "geo-city-st-gallen", None]]) == \
        "Ak8DAlMDAwJGTqGxvY2F0aW9usmdlby1jaXR5LXN0LWdhbGxlbsA"


def test_price_of():
    assert price_of("Gratis") == 0 and price_of("600.-") == 600 and price_of("1'200.-") == 1200
    assert price_of("Auf Anfrage") is None and price_of("12.50") == 12.5


def test_tutti_free_only_and_dedup():
    html = (FIX / "tutti_free.html").read_text()
    nodes, total = parse_listings(html)
    assert len(nodes) == 30 and total == 381
    res, deals, http = run(TuttiFree(), [("tutti.ch/de/q/st-gallen/", html)])
    assert http.requests_made == 2 and not any("/api/" in u for u in http.calls)
    assert res.state == "OK" and len(deals) == 21          # 21/30 « Gratis », dédoublonnés entre requêtes
    for d in deals:
        assert d["current_price"] == 0 and d["family"] == "free" and d["condition"] == "used"
        assert d["deal_id"].startswith("tutti_free:") and d["source_url"].startswith("https://www.tutti.ch/de/vi/")
        assert "market_price" not in d and "reference_price" not in d
        assert score_deal(d).score is None                  # listé mais « non évalué »
        assert d["geographic_scope"] in ("LOCAL", "NEARBY") and d["canton"] == "SG"
        assert "anon" not in json.dumps(d)                  # pas d'alias vendeur
    sitzsack = next(d for d in deals if "Sitzsack" in d["title"])
    assert sitzsack["geographic_scope"] == "LOCAL" and sitzsack["published_at"] == "2026-10-13T18:42:54+02:00"
    assert_dates_aware(deals)


def test_anibis_separate_inventory():
    res, deals, _ = run(AnibisFree(), [("anibis.ch/de/q/st-gallen/", (FIX / "anibis_free.html").read_text())])
    assert res.state == "OK" and len(deals) == 3
    assert all(d["deal_id"].startswith("anibis_free:") and "anibis.ch/de/vi/" in d["source_url"] for d in deals)
    assert all(d["current_price"] == 0 for d in deals)


# -- Epic ------------------------------------------------------------------------

def test_epic_current_and_upcoming():
    res, deals, http = run(EpicFree(), [("freeGamesPromotions", (FIX / "epic_free.json").read_text())])
    assert res.state == "OK" and http.requests_made == 1 and len(deals) == 4
    by = {d["title"]: d for d in deals}
    oos = by["Out of Sight"]
    assert oos["current_price"] == 0 and oos["reference_price"] == 13.49 and oos["reference_price_type"] == "msrp"
    assert oos["family"] == "digital_free" and oos["ends_at"] == "2026-10-15T17:00:00+02:00"
    assert lifecycle(oos, NOW) == "ACTIVE" and lifecycle(by["Bad Cheese"], NOW) == "UPCOMING"
    assert score_deal(oos).score > 0
    assert_dates_aware(deals)


# -- GamerPower -----------------------------------------------------------------

def test_gamerpower_rss_only_no_invented_value():
    res, deals, http = run(GamerPower(), [("/rss/giveaways", (FIX / "gamerpower.xml").read_text())])
    assert res.state == "OK" and len(deals) == 14 and all("/api/" not in u for u in http.calls)
    for d in deals:
        assert d["current_price"] == 0 and "reference_price" not in d and d["family"] == "digital_free"
    ff = next(d for d in deals if d["title"].startswith("Fireside Feelings"))
    assert ff["merchant"] == "Steam" and ff["ends_at"].startswith("2026-10-12T23:59:59")
    assert platform_of("TerraScape (Epic Games) Giveaway") == "Epic Games"
    assert platform_of("Bounty Train (GOG) Giveaway") == "GOG"
    assert stated_worth("worth $19.99 on Steam") == (19.99, "USD") and stated_worth("Definitely worth checking out") is None
    assert_dates_aware(deals)


# -- Preispirat ------------------------------------------------------------------

def _preispirat():
    return run(Preispirat(), [("/cat/freebies/feed/", (FIX / "preispirat_freebies.xml").read_text()),
                              ("preispirat.ch/feed/", (FIX / "preispirat.xml").read_text())])


def test_preispirat_competitor_reference_and_families():
    res, deals, http = _preispirat()
    assert res.state == "OK" and http.requests_made == 2
    assert len(deals) == 58                               # 30 + 30, 2 posts communs dédoublonnés
    by = {d["source_offer_id"]: d for d in deals}
    tab = by["766181"]
    assert tab["current_price"] == 329.9 and tab["reference_price"] == 373.05
    assert tab["reference_price_type"] == "competitor" and tab["family"] == "tech" and tab["merchant"] == "Fust"
    assert by["759537"]["current_price"] == 104.0          # « 104.- »
    assert by["761393"]["merchant"] == "DeubaXXL"
    coupon = by["766105"]
    assert coupon["family"] == "coupon" and coupon["requires_coupon"] and "description" not in coupon
    ebook = by["766168"]
    assert ebook["family"] == "digital_free" and ebook["current_price"] == 0
    app = by["722989"]
    assert app["reference_price"] == 4.99 and app["reference_price_type"] == "community_claimed"
    assert by["766185"]["discount_percentage"] == 20 and by["766185"]["reference_price_type"] == "stated_percent_only"
    assert all(d["source_type"] == "community" for d in deals)
    assert_dates_aware(deals)


def test_preispirat_never_republishes_codes():
    _, deals, _ = _preispirat()
    blob = json.dumps(deals, ensure_ascii=False)
    for code in ("WONC02", "WONC06", "WONC12", "ZAKPRE"):
        assert code not in blob
    assert chf("1'498.-") == 1498 and chf("83.90") == 83.9
    assert redact_codes("Samsung SM-X520NZAREUE zum Bestpreis") == "Samsung SM-X520NZAREUE zum Bestpreis"


# -- 20 Minuten Gutscheine --------------------------------------------------------

def test_gutscheine_20min_no_code_link_to_page():
    html = (FIX / "gutscheine_20min.html").read_text()
    assert len(parse_offers(html)) == 23
    res, deals, http = run(Gutscheine20min(), [("gutscheine.20min.ch/neue-gutscheine", html)])
    assert res.state == "OK" and http.requests_made == 1 and len(deals) == 23
    assert not any("code=" in u for u in http.calls)
    blob = json.dumps(deals, ensure_ascii=False) + json.dumps(res.raw, ensure_ascii=False)
    assert "FIXTURECODE" not in blob                     # le code n'est ni conservé ni republié
    for d in deals:
        assert d["family"] == "coupon" and d["source_url"].startswith("https://gutscheine.20min.ch/")
        assert "code=" not in d["source_url"]
    by = {d["source_offer_id"]: d for d in deals}
    lm = by["552049"]
    assert lm["merchant"] == "Lampenmeister" and lm["requires_coupon"] is True and lm["discount_percentage"] == 5
    assert lm["ends_at"] == "2026-10-25T23:59:00+01:00" and lm["source_url"].endswith("/lampenmeister")
    golf = by["306442"]
    assert golf["coupon_value"] == 15 and golf["coupon_value_type"] == "currency" and golf["minimum_order_value"] == 100
    assert by["555475"]["requires_coupon"] is False       # offre sans code
    assert "discount_percentage" not in by["553890"]      # « bis zu 25 % » : pas de % exact inventé
    assert_dates_aware(deals)


# -- poinz -----------------------------------------------------------------------

def _paged(fixture: str):
    """Page 1 = fixture réelle ; pages suivantes = même structure, contenu vide."""
    html = (FIX / fixture).read_text()

    def body(url):
        if "page=" not in url:
            return html
        m = re.search(r'(<script id="__NEXT_DATA__"[^>]*>)(.*?)(</script>)', html, re.S)
        d = json.loads(m.group(2))
        for q in d["props"]["pageProps"]["dehydratedState"]["queries"]:
            if q["queryKey"][0] == "SEARCH":
                q["state"]["data"]["content"] = []
        return m.group(1) + json.dumps(d) + m.group(3)
    return body


def test_poinz_sg_deals_and_capped_cashback():
    routes = [("searchableTypes=DEAL", _paged("poinz_deal.html")),
              ("searchableTypes=AFFILIATE_ONLINE", _paged("poinz_affiliate.html")),
              ("searchableTypes=AFFILIATE_OFFLINE", _paged("poinz_affiliate.html"))]
    res, deals, http = run(Poinz(), routes)
    vouchers = [d for d in deals if d["deal_id"].startswith("poinz:deal:")]
    cashback = [d for d in deals if d["family"] == "cashback"]
    assert {d["source_offer_id"] for d in vouchers} == {4559, 4399, 4344}  # canton SG uniquement (page 1)
    v = next(d for d in vouchers if d["source_offer_id"] == 4559)
    assert v["current_price"] == 42.5 and v["reference_price"] == 85 and v["reference_price_type"] == "catalog"
    assert v["geographic_scope"] == "NEARBY" and v["city"] == "Wil" and v["ends_at"].endswith("+01:00")
    assert 0 < len(cashback) <= 50
    for d in cashback:
        assert d["cashback_rate"] >= 5 and d["cashback_certain"] is False and "cashback" not in d
    temu = next(d for d in cashback if d["merchant"] == "Temu")
    assert temu["cashback_rate"] == 20 and temu["ends_at"].startswith("2026-10-31T23:59")   # campagne en cours
    rates = [d["cashback_rate"] for d in cashback]
    assert len({d["deal_id"] for d in cashback}) == len(cashback)
    assert max(rates) == 20
    assert_dates_aware(deals)
