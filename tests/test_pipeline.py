"""Tests de bout en bout sur des réponses réelles de l'API (13.10.2026)."""
import copy
import datetime as dt
import json
from pathlib import Path

import pytest

from radar import denner, diff, export, notify
from radar.config import load
from radar.denner import FlagResult
from radar.parse import TZ
from radar.storage import Store

FIX = json.loads((Path(__file__).parent / "fixtures" / "sample_items.json").read_text())
STORES = [f"s{i}" for i in (1145081, 1145123, 1144945, 1146069, 1145508, 1145228, 1145534)]


@pytest.fixture
def cfg():
    return load()


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path)


def results(cur=None, nxt=None, ok=True):
    out = {}
    for flag, items in (("promo_current_week", FIX["cur"] if cur is None else cur),
                        ("promo_next_week", FIX["next"] if nxt is None else nxt)):
        r = FlagResult(flag, ok=ok, complete=ok, total=len(items), items=items)
        out[flag] = r
    return out


def at(s):
    return dt.datetime.fromisoformat(s).replace(tzinfo=TZ)


def find(offers, **kw):
    return [o for o in offers.values() if all(o.get(k) == v for k, v in kw.items())]


def test_normalize_real_items(cfg):
    offers = denner.normalize_all(results(), cfg, STORES)
    assert len(offers) > 40
    for o in offers.values():
        assert o["product_name"]
        assert o["starts_at"] and o["ends_at"]
        assert o["stock"] == "unknown"
        assert o["availability_confidence"] in ("national_eligible", "not_eligible_region")
        # jamais de magasin associé à une offre non éligible
        if not o["eligible_home"]:
            assert o["store_ids"] == []
        if o["regular_price"] and o["discounted_price"]:
            assert o["regular_price"] > o["discounted_price"]
    comp = [o for o in offers.values() if o["reference_price_type"] == "competitor_comparison"]
    assert comp, "les « Konkurrenzvergleich » doivent être distingués"
    french_only = [o for o in offers.values() if o["regions"] == ["fr"]]
    assert french_only and all(not o["eligible_home"] for o in french_only)


def test_week_runs_thursday_to_wednesday(cfg):
    offers = denner.normalize_all(results(), cfg, STORES)
    weekly = [o for o in offers.values() if o["validity_label"] == "08.10.–14.10.2026"]
    assert weekly
    o = weekly[0]
    assert dt.datetime.fromisoformat(o["starts_at"]).weekday() == 3   # jeudi
    assert dt.datetime.fromisoformat(o["ends_at"]).weekday() == 2     # mercredi


def test_multiweek_offer_deduplicated_across_feeds(cfg):
    offers = denner.normalize_all(results(), cfg, STORES)
    multi = [o for o in offers.values() if o["validity_label"] == "01.10.–28.10.2026"]
    assert multi
    assert any(set(o["sources"]) == {"promo_current_week", "promo_next_week"} for o in multi)


def test_assortment_and_min_qty(cfg):
    offers = denner.normalize_all(results(), cfg, STORES)
    ass = [o for o in offers.values() if o["offer_type"] == "assortment"]
    assert ass and all(o["discounted_price"] is None and o["stated_discount_pct"] for o in ass)
    assert all(o["min_purchase_quantity"] >= 2 for o in ass)  # « ab 2 » ou « ab 3 Stück »
    mq = [o for o in offers.values() if o["offer_type"] == "percent_min_qty"]
    assert mq and all(o["min_purchase_quantity"] >= 2 for o in mq)


def test_announced_then_active_is_not_new_twice(cfg, store):
    fresh = denner.normalize_all(results(), cfg, STORES)
    diff.apply_scan(store, fresh, at("2026-10-13T12:00"), True)
    new1 = [e for e in store.new_events if e["type"] == "new"]
    assert len(new1) == len(fresh)
    store.save()
    # jeudi : les offres de la semaine suivante passent dans le flux courant
    fresh2 = denner.normalize_all(results(cur=FIX["next"], nxt=[]), cfg, STORES)
    diff.apply_scan(store, fresh2, at("2026-10-15T08:00"), True)
    evs = store.new_events
    assert not [e for e in evs if e["type"] == "new"]
    assert [e for e in evs if e["type"] == "became_active"]
    assert [e for e in evs if e["type"] == "expired"]


def test_failed_scan_never_withdraws(cfg, store):
    fresh = denner.normalize_all(results(), cfg, STORES)
    diff.apply_scan(store, fresh, at("2026-10-13T12:00"), True)
    for _ in range(3):  # collectes vides mais NON fiables
        diff.apply_scan(store, {}, at("2026-10-13T14:00"), trusted_complete=False)
    assert not [e for e in store.new_events if e["type"] == "withdrawn"]


def test_withdrawal_needs_consecutive_complete_scans(cfg, store):
    fresh = denner.normalize_all(results(), cfg, STORES)
    diff.apply_scan(store, fresh, at("2026-10-13T12:00"), True)
    victim = next(iter(o for o in fresh.values() if o["validity_label"] == "15.10.–21.10.2026"))
    partial = {k: v for k, v in fresh.items() if k != victim["offer_id"]}
    diff.apply_scan(store, partial, at("2026-10-13T14:00"), True)
    assert not store.offers[victim["offer_id"]]["withdrawn"]
    diff.apply_scan(store, partial, at("2026-10-13T18:00"), True)
    assert store.offers[victim["offer_id"]]["withdrawn"]
    diff.apply_scan(store, fresh, at("2026-10-13T20:00"), True)
    assert [e for e in store.new_events if e["type"] == "reappeared"]


def test_price_drop_event_and_history_kept(cfg, store):
    fresh = denner.normalize_all(results(), cfg, STORES)
    diff.apply_scan(store, fresh, at("2026-10-13T12:00"), True)
    o = next(o for o in fresh.values() if o["discounted_price"] and o["regular_price"])
    cheaper = copy.deepcopy(fresh)
    cheaper[o["offer_id"]]["discounted_price"] = round(o["discounted_price"] * 0.8, 2)
    diff.apply_scan(store, cheaper, at("2026-10-13T14:00"), True)
    assert [e for e in store.new_events if e["type"] == "price_drop" and e["offer_id"] == o["offer_id"]]
    assert len(store.prices[o["article_id"]]) == 2


def test_expired_never_shown_as_current(cfg, store):
    fresh = denner.normalize_all(results(), cfg, STORES)
    diff.apply_scan(store, fresh, at("2026-10-13T12:00"), True)
    diff.rescore(store, cfg, at("2026-10-13T12:00"))
    # trois semaines sans collecte : l'export recalcule les statuts à l'heure actuelle
    offers, meta = export.build(store, cfg, at("2026-11-05T12:00"))
    assert not [o for o in offers["offers"] if o["status"] == "active" and o["ends_at"] < "2026-11-05"]
    assert meta["stale"] is True


def test_persistence_roundtrip(cfg, tmp_path):
    s = Store(tmp_path)
    fresh = denner.normalize_all(results(), cfg, STORES)
    diff.apply_scan(s, fresh, at("2026-10-13T12:00"), True)
    s.save()
    s2 = Store(tmp_path)
    assert set(s2.offers) == set(fresh)
    assert (tmp_path / "events").exists() and s2.read_events()


def test_notifications_wording_and_grouping(cfg, store):
    fresh = denner.normalize_all(results(), cfg, STORES)
    now = at("2026-10-13T12:00")
    diff.apply_scan(store, fresh, now, True)
    diff.rescore(store, cfg, now)
    msgs = notify.build(store, cfg, now, store.new_events, now.isoformat(), 7)
    wave = [m for m in msgs if m["key"].startswith("wave:")]
    assert len(wave) == 1, "les offres ordinaires sont regroupées en un seul message"
    text = wave[0]["text"]
    assert "disponible en magasin" not in text.lower()
    assert "stock non vérifié" in text
    n_eligible = sum(1 for o in fresh.values() if o["eligible_home"])
    assert f"Voir toutes les {n_eligible} offres" in text
    # une alerte n'est jamais mise en file deux fois
    assert notify.enqueue(store, msgs, "t") == len(msgs)
    assert notify.enqueue(store, msgs, "t") == 0


def test_quiet_hours(cfg):
    assert notify.in_quiet_hours(cfg, at("2026-10-13T23:30"))
    assert notify.in_quiet_hours(cfg, at("2026-10-13T05:00"))
    assert not notify.in_quiet_hours(cfg, at("2026-10-13T12:00"))


def test_telegram_split():
    long = "\n".join(["ligne " * 20] * 200)
    parts = notify.split(long)
    assert all(len(p) <= notify.MAX_LEN + 200 for p in parts) and len(parts) > 1
