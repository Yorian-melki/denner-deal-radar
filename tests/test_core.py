"""Tests du moteur universel V3."""
import datetime as dt

import pytest

from radar.config import load
from radar.core import analytics as A
from radar.core import ualerts
from radar.core.connector import Connector, FetchResult
from radar.core.deal import make_deal, total_acquisition_cost
from radar.core.engine import enrich, lifecycle, run_connector
from radar.core.entity import canonical_entity_id, deduplicate, valid_gtin
from radar.core.store import UStore
from radar.core.uscoring import accessibility, free_curve, score_deal
from radar.http import Http
from radar.parse import TZ
from radar.scoring import curve

NOW = dt.datetime(2026, 10, 14, 12, 0, tzinfo=TZ)


def D(**kw):
    base = dict(deal_id="t:1", source_id="test", title="Produit", family="retail")
    base.update(kw)
    return make_deal(**base)


# -- schéma ----------------------------------------------------------------

def test_make_deal_validates_and_never_invents():
    d = D(current_price=40, reference_price=100, reference_price_type="merchant_previous")
    assert d["discount_percentage"] == 60.0 and d["discount_absolute"] == 60.0
    assert "shipping_cost" not in d and d["access"] == "PUBLIC"
    with pytest.raises(ValueError):
        D(current_price=-1)
    with pytest.raises(ValueError):
        D(family="inconnue")
    with pytest.raises(ValueError):
        make_deal(deal_id="x", source_id="s", family="retail")  # titre manquant


def test_conditions_always_a_list():
    assert D(conditions="ab 2 Stück")["conditions"] == ["ab 2 Stück"]


def test_total_acquisition_cost_lists_assumptions():
    d = D(current_price=10, shipping_cost=7.9, geographic_scope="ONLINE")
    assert total_acquisition_cost(d) == (17.9, ["livraison 7.90 inclus"])
    tac, notes = total_acquisition_cost(D(current_price=10, geographic_scope="ONLINE"))
    assert tac == 10 and "frais de livraison inconnus (non inclus)" in notes


# -- entités & dédup ---------------------------------------------------------

def test_gtin_checksum():
    assert valid_gtin("4006381333931")      # EAN-13 réel
    assert valid_gtin("7613035974685")      # EAN suisse (Nestlé)
    assert not valid_gtin("4006381333932")


def test_canonical_ids_priority():
    assert canonical_entity_id(D(gtin="4006381333931")).startswith("gtin:")
    assert canonical_entity_id(D(brand="Apple", manufacturer_sku="MX2D3SM/A")).startswith("mpn:apple:")
    assert canonical_entity_id(D(merchant="Lidl", merchant_sku="123")) == "sku:lidl:123"


def test_same_entity_three_sources_is_one_deal():
    common = dict(title="Sony WH-1000XM5", family="tech", gtin="4006381333931", current_price=249.0,
                  canonical_entity_id="gtin:04006381333931")
    a = D(deal_id="a", source_id="merchant", source_type="merchant", **common)
    b = D(deal_id="b", source_id="preispirat", source_type="community", **common)
    c = D(deal_id="c", source_id="toppreise", source_type="comparator", **common)
    deduplicate([b, c, a])
    assert a.get("duplicate_of") is None and set(a["corroborated_by"]) == {"b", "c"}
    assert b["duplicate_of"] == "a" and c["duplicate_of"] == "a"


def test_divergent_price_is_not_merged():
    a = D(deal_id="a", source_id="s1", current_price=100, canonical_entity_id="gtin:1")
    b = D(deal_id="b", source_id="s2", current_price=60, canonical_entity_id="gtin:1", source_type="community")
    deduplicate([a, b])
    assert "duplicate_of" not in b and b["possible_duplicate_of"] == "a"


# -- notation universelle ------------------------------------------------------

@pytest.mark.parametrize("pct", [0, 10, 20, 30, 40, 50, 60, 75, 90, 95])
def test_universal_scale_matches_denner_curve(pct):
    s = score_deal(D(current_price=1000 * (1 - pct / 100), reference_price=1000,
                     reference_price_type="merchant_previous"))
    expected = round(curve(pct) + (0.5 if pct >= 30 else 0.3 if pct >= 10 else 0), 1)
    assert s.score == pytest.approx(min(10.0, expected), abs=0.05)


def test_msrp_and_competitor_are_discounted():
    own = score_deal(D(current_price=50, reference_price=100, reference_price_type="merchant_previous"))
    msrp = score_deal(D(current_price=50, reference_price=100, reference_price_type="msrp"))
    comp = score_deal(D(current_price=50, reference_price=100, reference_price_type="competitor"))
    assert own.score > msrp.score > comp.score
    assert msrp.confidence < own.confidence


def test_weak_reference_alone_cannot_be_exceptional():
    s = score_deal(D(current_price=6, reference_price=29, reference_price_type="msrp"))
    assert s.score == 7.5 and any("non confirmée" in c for c, _ in s.components)
    ok = score_deal(D(current_price=6, reference_price=29, reference_price_type="merchant_previous"))
    assert ok.score > 7.5


def test_fake_promotion_with_inflated_reference():
    """Exemple I : « −70 % » mais référence gonflée et prix habituel identique."""
    hist = [{"deal_id": f"o{i}", "current_price": 30.0, "reference_price": 35.0,
             "reference_price_type": "merchant_previous"} for i in range(4)]
    s = score_deal(D(deal_id="new", current_price=30.0, reference_price=100.0,
                     reference_price_type="merchant_previous"), hist)
    assert s.integrity in ("inflated_reference", "above_usual_price")
    assert s.score <= 2.0


def test_silent_price_drop_detected_without_badge():
    """Exemple H : aucun prix barré, mais très sous l'historique."""
    hist = [{"deal_id": f"o{i}", "current_price": 100.0} for i in range(6)]
    d = D(deal_id="now", current_price=45.0)
    s = score_deal(d, hist)
    assert s.score is not None and s.score >= 7
    an = A.anomaly(d, A.history_stats(hist), 0.9)
    assert an["silent_drop"] and an["anomaly_score"] >= 7


def test_tiny_absolute_saving_is_capped():
    s = score_deal(D(current_price=0.1, reference_price=1.0, reference_price_type="merchant_previous"))
    assert s.score <= 6.0


def test_no_reference_is_unrated():
    assert score_deal(D(current_price=10)).score is None


def test_free_is_not_automatically_ten():
    sofa = score_deal(D(family="free", current_price=0, market_price=300, condition="used",
                        estimated_transport_cost=150))
    junk = score_deal(D(family="free", current_price=0, market_price=5, condition="used"))
    unknown = score_deal(D(family="free", current_price=0))
    assert sofa.score < 7 and junk.score < 2 and unknown.score is None
    assert free_curve(0) == 0 and free_curve(1500) == 10


def test_surplus_declared_value_is_haircut():
    s = score_deal(D(family="surplus", current_price=5.9, reference_price=18.0, reference_price_type="declared_value"))
    assert 6.5 < s.score < 8.0 and s.confidence <= 0.5


def test_subscription_total_cost_of_ownership():
    s = score_deal(D(family="subscription", current_price=10, regular_monthly_price=30, commitment_months=24,
                     promo_months=12, price_after_promo=30))
    # 12×10 + 12×30 = 480 vs 720×0,6 = 432 -> aucun gain réel face au prix catalogue pondéré
    assert s.effective_discount == pytest.approx(0.0, abs=0.1)
    life = score_deal(D(family="subscription", current_price=34.9, regular_monthly_price=135, commitment_months=2,
                        promo_lifetime=True))
    assert life.score == 7.5 and life.confidence <= 0.4   # « 34.90 au lieu de 133.– à vie » : plafonné


def test_contest_without_probability_has_no_value():
    assert score_deal(D(family="contest", prize_value=1000)).score is None


def test_conditional_cashback_not_deducted():
    d = D(current_price=100, cashback=20, cashback_certain=False)
    assert total_acquisition_cost(d)[0] == 100
    d2 = D(current_price=100, cashback=20, cashback_certain=True)
    assert total_acquisition_cost(d2)[0] == 80


def test_accessibility():
    a, why = accessibility(D(requires_account=True, requires_referral=True), {"profile": {"student": True}})
    assert a == 0.7 and "parrainage requis" in why


# -- historique, anomalies, urgence ---------------------------------------------

def test_history_stats_does_not_mix_pack_sizes():
    obs = [{"deal_id": "a", "current_price": 2.0, "quantity": 0.5, "unit": "l"},
           {"deal_id": "b", "current_price": 3.0, "quantity": 1.0, "unit": "l"},
           {"deal_id": "c", "current_price": 2.9, "quantity": 1.0, "unit": "l"}]
    st = A.history_stats(obs)
    assert st["n"] == 2 and st["min"] == 2.9


def test_shrinkflation():
    obs = [{"current_price": 3.0, "quantity": 0.5}, {"current_price": 3.0, "quantity": 0.45}]
    assert A.shrinkflation(obs)["unit_price_change_pct"] == pytest.approx(11.1, abs=0.1)


def test_extreme_anomaly_without_corroboration_has_low_confidence():
    hist = [{"deal_id": f"o{i}", "current_price": 1000.0} for i in range(5)]
    d = D(current_price=99.0, reference_price=1000.0, reference_price_type="merchant_previous")
    weak = A.anomaly(d, A.history_stats(hist), 0.9)
    strong = A.anomaly(d, A.history_stats(hist), 0.9, corroborated=True)
    assert weak["anomaly_score"] == strong["anomaly_score"] == 10
    assert weak["anomaly_confidence"] < strong["anomaly_confidence"]


def test_urgency_levels():
    soon = D(ends_at=(NOW + dt.timedelta(minutes=40)).isoformat())
    week = D(ends_at=(NOW + dt.timedelta(days=7)).isoformat())
    assert A.urgency(soon, NOW)[0] == "CRITICAL"
    assert A.urgency(week, NOW)[0] == "LOW"
    assert A.urgency(D(), NOW, typical_lifetime_min=8)[0] == "CRITICAL"
    assert A.urgency(D(stock_percent_sold=75), NOW)[0] == "VERY_HIGH"


def test_geo_scopes():
    assert A.geo_scope(D(lat=47.4239, lng=9.3748)) == "LOCAL"
    assert A.geo_scope(D(lat=47.3769, lng=8.5417)) == "TRAVEL_ACCESSIBLE"   # Zurich ~ 64 km
    assert A.geo_scope(D(geographic_scope="ONLINE")) == "ONLINE"


# -- moteur : cycle de vie et isolation ------------------------------------------

class FakeConn(Connector):
    id, name, family = "fake", "Fake", "retail"

    def __init__(self, items=None, error=None, empty_valid=False):
        self._items, self._err, self._ev = items or [], error, empty_valid

    def fetch(self, ctx):
        if self._err:
            raise RuntimeError(self._err)
        return FetchResult(items=list(self._items), complete=True, empty_valid=self._ev)

    def normalize(self, raw, ctx):
        return make_deal(deal_id=f"fake:{raw['id']}", source_id="fake", title=raw["t"], family="retail",
                         current_price=raw["p"], reference_price=raw.get("r"),
                         reference_price_type="merchant_previous" if raw.get("r") else None)


@pytest.fixture
def env(tmp_path):
    cfg = load()
    return cfg, UStore(tmp_path), Http("test", retries=0, delay=0)


ITEMS = [{"id": 1, "t": "A", "p": 5, "r": 10}, {"id": 2, "t": "B", "p": 20, "r": 25}]


def test_failure_keeps_last_valid_state(env):
    cfg, store, http = env
    run_connector(FakeConn(ITEMS), store, cfg, http, NOW, None)
    for _ in range(3):
        r = run_connector(FakeConn(error="boom"), store, cfg, http, NOW, None)
        assert r["state"] == "SCRAPE_FAILURE"
    assert all(d["lifecycle"] == "ACTIVE" for d in store.source_deals("fake").values())
    assert store.source_state("fake")["consecutive_failures"] == 3


def test_empty_without_confirmation_is_failure_not_removal(env):
    cfg, store, http = env
    run_connector(FakeConn(ITEMS), store, cfg, http, NOW, None)
    for _ in range(3):
        assert run_connector(FakeConn([]), store, cfg, http, NOW, None)["state"] == "SCRAPE_FAILURE"
    assert not [d for d in store.source_deals("fake").values() if d["lifecycle"] == "REMOVED"]
    for _ in range(2):
        assert run_connector(FakeConn([], empty_valid=True), store, cfg, http, NOW, None)["state"] == "EMPTY_VALID"
    assert all(d["lifecycle"] == "REMOVED" for d in store.source_deals("fake").values())


def test_price_drop_and_no_double_new(env):
    cfg, store, http = env
    run_connector(FakeConn(ITEMS), store, cfg, http, NOW, None)
    run_connector(FakeConn([{**ITEMS[0], "p": 4}, ITEMS[1]]), store, cfg, http, NOW, None)
    evs = store.new_events
    assert sum(1 for e in evs if e["type"] == "new") == 2
    assert [e for e in evs if e["type"] == "price_drop" and e["new"] == 4]
    assert len(store.history["fake"][store.source_deals("fake")["fake:1"]["canonical_entity_id"]]) == 2


def test_lifecycle_states():
    assert lifecycle({"starts_at": (NOW + dt.timedelta(days=1)).isoformat()}, NOW) == "UPCOMING"
    assert lifecycle({"ends_at": (NOW - dt.timedelta(hours=1)).isoformat()}, NOW) == "EXPIRED"
    assert lifecycle({"ends_at": (NOW + dt.timedelta(hours=3)).isoformat()}, NOW) == "ENDING_SOON"
    assert lifecycle({"stock_percent_sold": 85}, NOW) == "LOW_STOCK"


def test_alert_policy_dedup_and_antispam(env):
    cfg, store, http = env
    run_connector(FakeConn(ITEMS), store, cfg, http, NOW, None)
    boot = [m for m in ualerts.build(enrich(store, cfg, cfg.prefs, NOW), cfg, NOW, store) if m["key"].startswith("u:") and "digest" not in m["key"]]
    assert boot == []   # 1re collecte d'une source : aucune avalanche d'alertes
    later = NOW + dt.timedelta(hours=1)
    run_connector(FakeConn(ITEMS + [{"id": 9, "t": "Super deal", "p": 10, "r": 100}]), store, cfg, http, later, None)
    live = enrich(store, cfg, cfg.prefs, later)
    m1 = [m for m in ualerts.build(live, cfg, later, store) if m["key"].startswith("u:") and "digest" not in m["key"]]
    assert len(m1) == 1 and "ULTRA" in m1[0]["text"]
    assert "Pourquoi" in m1[0]["text"] and "Confiance" in m1[0]["text"]
    m2 = [m for m in ualerts.build(live, cfg, later, store) if m["key"].startswith("u:") and "digest" not in m["key"]]
    assert m2 == []   # même deal, même prix : pas de renvoi


def test_watchlist_unit_price(env):
    cfg, store, _ = env
    d = D(deal_id="w1", title="Denner Pouletflügeli", unit_price=4.5, unit="CHF/kg", current_price=4.5,
          lifecycle="ACTIVE", family="grocery")
    w = {"name": "poulet", "query": "poulet", "max_unit_price": 12, "unit": "CHF/kg"}
    assert ualerts.match_watch(d, w)
    assert not ualerts.match_watch({**d, "unit_price": 15}, w)
    cfg.settings["watchlists"] = [w]
    assert len(ualerts.watchlist_alerts([d], cfg, NOW, store)) == 1
    assert ualerts.watchlist_alerts([d], cfg, NOW, store) == []   # pas de doublon


def test_robots_404_means_allow(monkeypatch):
    import requests
    h = Http("test", retries=0, delay=0)

    def boom(method, url, **kw):
        r = requests.Response()
        r.status_code = 404
        raise requests.HTTPError("404", response=r)
    monkeypatch.setattr(h, "_raw", boom)
    assert h.allowed("https://example.org/anything")


def test_window_feed_items_expire_by_ttl_not_by_absence(env):
    cfg, store, http = env

    class Win(FakeConn):
        window_ttl_hours = 24

        def fetch(self, ctx):
            r = super().fetch(ctx)
            r.window = True
            return r
    run_connector(Win(ITEMS), store, cfg, http, NOW, None)
    for h in (1, 2, 3):
        run_connector(Win([ITEMS[1]]), store, cfg, http, NOW + dt.timedelta(hours=h), None)
    assert store.source_deals("fake")["fake:1"]["lifecycle"] == "ACTIVE"
    run_connector(Win([ITEMS[1]]), store, cfg, http, NOW + dt.timedelta(hours=30), None)
    assert store.source_deals("fake")["fake:1"]["lifecycle"] == "REMOVED"


def test_coupon_and_cashback_scoring():
    c = score_deal(D(family="coupon", coupon_value=15, minimum_order_value=100))
    assert c.score == pytest.approx(curve(15), abs=0.05) and c.confidence < 0.5
    cb = score_deal(D(family="cashback", cashback_rate=30))
    assert cb.effective_discount == pytest.approx(18) and cb.confidence <= 0.3
    assert score_deal(D(family="coupon")).score is None


def test_same_game_across_sources():
    from radar.core.entity import canonical_game_id
    assert canonical_game_id("TerraScape (Epic Games) Giveaway") == canonical_game_id("TerraScape")


def test_savings_caps_against_percentage_bias():
    tiny = score_deal(D(current_price=0.5, reference_price=2.5, reference_price_type="merchant_previous"))
    mid = score_deal(D(current_price=3.0, reference_price=30.0, reference_price_type="merchant_previous"))  # CHF 27 économisés
    big = score_deal(D(current_price=69.75, reference_price=279, reference_price_type="merchant_previous"))
    assert tiny.score == 6.0 and mid.score == 8.5 and big.score > 9
    food = score_deal(D(family="grocery", current_price=2.0, reference_price=5.0, reference_price_type="merchant_previous"))
    assert food.score == pytest.approx(curve(60), abs=0.05)   # supermarché : pas de plafond par CHF
