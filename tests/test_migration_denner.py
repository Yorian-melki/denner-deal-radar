"""Non-régression : la V3 expose Denner sans rien perdre ni modifier."""
import copy
import datetime as dt
import json
from pathlib import Path

from radar import denner, diff
from radar.config import load
from radar.connectors import denner_v2
from radar.parse import TZ
from radar.storage import Store
from tests.test_pipeline import STORES, results

NOW = dt.datetime(2026, 10, 13, 12, 0, tzinfo=TZ)


def _store(tmp_path):
    cfg = load()
    s = Store(tmp_path)
    fresh = denner.normalize_all(results(), cfg, STORES)
    diff.apply_scan(s, fresh, NOW, True)
    diff.rescore(s, cfg, NOW)
    return s


def test_every_denner_offer_is_exposed_with_same_id_and_score(tmp_path):
    s = _store(tmp_path)
    before = copy.deepcopy(s.offers)
    deals = denner_v2.deals(s, NOW)
    assert s.offers == before, "l'adaptateur ne doit jamais modifier les données V2"
    by_id = {d["deal_id"]: d for d in deals}
    live = [o for o in s.offers.values() if diff.status_at(o, NOW) in ("active", "announced")]
    assert len(live) == len(deals)
    for o in live:
        d = by_id[f"denner:{o['offer_id']}"]
        assert d.get("deal_score") == o.get("deal_score")
        assert d.get("current_price") == o.get("discounted_price")
        assert d["score_model"] == "denner_v2"
        if o["reference_price_type"] == "competitor_comparison":
            assert d["reference_price_type"] == "competitor"
            assert "regular_price" not in d   # prix concurrent ≠ ancien prix Denner


def test_denner_never_claims_store_stock(tmp_path):
    for d in denner_v2.deals(_store(tmp_path), NOW):
        assert d.get("availability_status") in ("ELIGIBLE_NOT_VERIFIED", "not_eligible_region")


def test_production_data_files_untouched_by_v3_layout():
    root = Path(__file__).resolve().parent.parent / "data"
    if (root / "state.json").exists():
        st = json.loads((root / "state.json").read_text())
        assert "universal" not in st and "sources" in st   # l'état V2 garde son format
