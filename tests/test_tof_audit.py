"""Audit quotidien du TOF (V2-C §3.1-3.2) : statistiques, lecture de la page servie, verdicts."""
import datetime as dt
import json

from radar import tof_audit as A
from radar.parse import TZ

NOW = dt.datetime(2026, 11, 6, 15, 0, tzinfo=TZ)


def test_wilson_and_clopper_pearson_match_v2c_figures():
    lo, hi = A.wilson(12, 45)                          # V2-C : 26,7 % (IC95 16,0–41,0)
    assert round(lo, 3) == 0.160 and round(hi, 3) == 0.410
    assert round(A.cp_upper(0, 100), 4) == 0.0295      # règle de 3 : ≈ 3/n
    assert abs(A.cp_upper(7, 700) - 0.0189) < 0.002    # V2-C §3.2 : 700 contrôles à 1 % → borne ≈ 1,9 %
    m = A.metric(3, 60)
    assert m["rate"] == 0.05 and m["wilson95"][0] < 0.05 < m["wilson95"][1] < m["cp_upper95"] + 0.05


PAGE = ('<article class="deal" data-ends="2026-11-11"><header>Coop</header><section class="panel deal-buy">'
        '<p class="deal-price"><span class="price"><span class="price-from">ab </span><span class="cur">CHF</span> '
        '<span class="amt">4.68</span></span><span class="was">statt 6.95 · laut Coop</span></p>'
        '<p class="deal-note deal-seen" data-state="seen">an der Quelle gesehen Fr 06.11.</p>'
        '<p class="store-cta">Im Laden bei Coop</p><a data-deal="rappn:7a23d393">x</a></section></article>'
        '<script type="application/ld+json">{"offers":{"@type":"AggregateOffer","lowPrice":"4.68"}}</script>')


def test_read_page_extracts_what_the_page_promises():
    p = A.read_page(PAGE)
    assert p["deal_id"] == "rappn:7a23d393" and p["price"] == 4.68 and p["from"] is True
    assert p["in_store"] is True and p["ref"] == 6.95 and p["shown_state"] == "verified" and not p["ended"]


def test_rappn_verdicts_exists_online_reference():
    aud = A.Auditor(None, NOW)
    aud._rappn["coop"] = {"complete": True, "pages": 10, "error": None, "cards": {
        "7a23d393": {"price": 4.68, "was": 6.95, "online": False},
        "e356f920": {"price": 8.95, "was": None, "online": True}}}
    feed = {"source_id": "rappn", "merchant": "Coop", "source_url": "https://rappn.ch/de/aktionen/coop/k/sg#offer=x"}
    page = A.read_page(PAGE)
    assert aud.check(page, {**feed, "deal_id": "rappn:7a23d393"})["verdict"] == "OK"
    gone = aud.check(page, {**feed, "deal_id": "rappn:5200bfab"})
    assert gone["verdict"] == "H" and gone["failed"] == ["exists"]
    online = aud.check({**page, "price": 8.95, "ref": None}, {**feed, "deal_id": "rappn:e356f920"})
    assert online["verdict"] == "H" and "online" in online["failed"]
    wrong_ref = aud.check({**page, "ref": 3229.0}, {**feed, "deal_id": "rappn:7a23d393"})
    assert "reference" in wrong_ref["failed"]
    aud._rappn["ottos"] = {"complete": False, "pages": 60, "error": None, "cards": {}}
    u = aud.check(page, {**feed, "deal_id": "rappn:550d0d0b", "source_url": "https://rappn.ch/de/aktionen/ottos/k/sg"})
    assert u["verdict"] == "U"                         # liste non lue en entier : jamais « absente »


def test_aligro_in_store_is_a_location_error_and_qoqa_missing_from_is_soft():
    aud = A.Auditor(None, NOW)
    aud._rappn["aligro"] = {"complete": True, "pages": 2, "error": None, "cards": {"f267db05": {"price": 12.75, "was": None, "online": False}}}
    r = aud.check({"price": 12.75, "in_store": True}, {"source_id": "rappn", "merchant": "Aligro", "deal_id": "rappn:f267db05",
                                                        "source_url": "https://rappn.ch/de/aktionen/aligro/k/sg"})
    assert r["verdict"] == "H" and r["failed"] == ["location"]
    aud._qoqa = {"99960": {"price_range_min": 59.9, "price_range_max": 249.0}}
    q = aud.check({"price": 59.9, "from": False}, {"source_id": "qoqa", "deal_id": "qoqa:99960"})
    assert q["verdict"] == "S" and q["failed"] == ["from_price"]
    assert aud.check({"price": 59.9, "from": True}, {"source_id": "qoqa", "deal_id": "qoqa:99960"})["verdict"] == "OK"


def test_revendo_429_is_unverifiable_and_summary(tmp_path):
    aud = A.Auditor(None, NOW)
    aud._revendo = {"__error__": "HTTPError: HTTP 429"}
    r = aud.check({"price": 199.0}, {"source_id": "revendo", "deal_id": "revendo:1", "source_url": "https://www.revendo.ch/products/x?variant=1"})
    assert r["verdict"] == "U"
    offers = [{"verdict": "H", "shown_state": "verified", "source": "rappn", "failed": ["exists"]},
              {"verdict": "OK", "shown_state": "verified", "source": "denner"},
              {"verdict": "OK", "shown_state": "unconfirmed", "source": "preispirat"}, r]
    s = A.summarize(offers)
    assert s["M1"]["x"] == 1 and s["M1"]["n"] == 3 and s["M2"]["n"] == 2 and s["unverifiable"] == 1
    path = A.write({"generated_at": NOW.isoformat(), "summary": s, "offers": offers}, tmp_path, NOW)
    latest = json.loads((tmp_path / "latest.json").read_text())
    assert path.name == "2026-11-06.json" and latest["rolling_7d"]["M1"]["n"] == 3
