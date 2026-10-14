"""Connecteurs ventes flash / tech / reconditionné, sur réponses réelles (14.10.2026)."""
import datetime as dt
import json
from pathlib import Path

import pytest

from radar.config import load
from radar.connectors.brack import Brack
from radar.connectors.daydeal import DayDeal
from radar.connectors.dg_daily import DigitecDaily
from radar.connectors.qoqa import QoQa
from radar.connectors.revendo import Revendo
from radar.core.connector import Context
from radar.parse import TZ

FIX = Path(__file__).parent / "fixtures"
NOW = dt.datetime(2026, 10, 14, 2, 0, tzinfo=TZ)


class Resp:
    def __init__(self, body: str, status=200):
        self.text, self.status_code, self.headers = body, status, {}

    def json(self):
        return json.loads(self.text)


class FakeHttp:
    """Répond aux URL connues avec les fixtures ; compte les requêtes."""

    def __init__(self, routes: dict):
        self.routes, self.requests_made, self.calls = routes, 0, []

    def get(self, url, **kw):
        self.requests_made += 1
        self.calls.append(url)
        for key, body in self.routes.items():
            if key in url:
                return Resp(body() if callable(body) else body)
        return Resp(json.dumps({"products": []}))


def run(conn, routes):
    http = FakeHttp(routes)
    ctx = Context(http=http, cfg=load(), now=NOW, source_state={})
    res = conn.fetch(ctx)
    deals = [d for d in (conn.normalize(i, ctx) for i in res.items) if d]
    return res, deals, http


def test_daydeal():
    res, deals, http = run(DayDeal(), {"get_latest_data": (FIX / "daydeal.json").read_text()})
    assert res.state == "OK" and http.requests_made == 1 and len(deals) == 7
    d = next(x for x in deals if "Mini-PC" in x["title"])
    assert d["current_price"] == 649 and d["reference_price"] == 1249
    assert d["reference_price_type"] == "catalog" and d["canonical_entity_id"].startswith("sku:brack:")
    assert d["starts_at"].endswith("+02:00") and d["ends_at"] > d["starts_at"]
    assert 0 <= d["stock_percent_sold"] <= 100


def test_qoqa_list_and_detail_once():
    routes = {"/offers/": (FIX / "qoqa_offer_detail.json").read_text(), "/offers?": (FIX / "qoqa.json").read_text()}
    conn = QoQa()
    http = FakeHttp(routes)
    ctx = Context(http=http, cfg=load(), now=NOW, source_state={})
    res = conn.fetch(ctx)
    n_first = http.requests_made
    conn.fetch(ctx)
    assert http.requests_made - n_first == 1, "le détail n'est demandé qu'une fois par offre"
    deals = [conn.normalize(i, ctx) for i in res.items]
    assert len(deals) == 33
    for d in deals:
        assert d["current_price"] > 0 and d["ends_at"] > d["starts_at"]
        if "reference_price" in d:
            assert d["reference_price"] > d["current_price"] and d["reference_price_type"] == "msrp"


def test_digitec_daily_deal_keeps_history_and_units():
    res, deals, _ = run(DigitecDaily(), {"daily-deal": (FIX / "digitec_daily.html").read_text()})
    assert len(deals) == 8
    today = max(deals, key=lambda d: d["starts_at"])
    assert today["title"].startswith("Lenovo Yoga Tab") and today["current_price"] == 299
    assert today["reference_price"] == 449 and today["reference_price_type"] == "merchant_previous"
    assert today["stock_remaining"] == 81 and today["ends_inferred"]
    assert len({d["deal_id"] for d in deals}) == 8   # un deal par jour, pas d'écrasement


def test_digitec_structure_change_is_failure():
    res, deals, _ = run(DigitecDaily(), {"daily-deal": "<html>nouvelle page</html>"})
    assert res.state == "SCRAPE_FAILURE" and not deals


def test_brack_uses_ean_and_own_previous_price():
    body = '<script type="application/json">' + (FIX / "brack.json").read_text() + "</script>"
    res, deals, http = run(Brack(), {"brack.ch": body})
    assert http.requests_made == 10 and deals
    for d in deals:
        assert d["merchant"] == "BRACK" and d["current_price"] > 0
        if "reference_price" in d:
            assert d["reference_price_type"] == "merchant_previous" and d["reference_price"] > d["current_price"]
    assert any(d.get("gtin") for d in deals)


def test_revendo_only_real_discounts_and_unique_identity():
    pages = {"page=1": (FIX / "revendo.json").read_text()}
    res, deals, _ = run(Revendo(), pages)
    assert deals and all(d["reference_price"] > d["current_price"] for d in deals)
    assert len({d["canonical_entity_id"] for d in deals}) == len(deals)
    assert not any("gutschein" in d["title"].lower() for d in deals)
    assert all(d["condition"] in ("refurbished_third_party", "open_box") for d in deals)


@pytest.mark.parametrize("conn", [DayDeal(), QoQa(), DigitecDaily(), Brack(), Revendo()])
def test_contract(conn):
    assert conn.id and conn.name and conn.min_interval > 0
