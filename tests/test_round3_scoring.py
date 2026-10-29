"""Round 3 : intégrité « unchecked », bonus record à 3 relevés, distance hors note publique."""
from radar.core.uscoring import RECORD_MIN_N, score_deal


def D(**kw):
    base = {"deal_id": "t:1", "family": "grocery", "title": "Kaffee 500g", "current_price": 6.0,
            "reference_price": 12.0, "reference_price_type": "merchant_previous"}
    base.update(kw)
    return base


def test_reference_never_ok_by_default():
    s = score_deal(D())
    assert s.integrity == "unchecked"


def test_reference_ok_with_three_observations_or_prior_refs():
    hist = [{"deal_id": f"o{i}", "current_price": 11.8, "reference_price": 12.0,
             "reference_price_type": "merchant_previous"} for i in range(3)]
    assert score_deal(D(), hist).integrity == "ok"
    one = [{"deal_id": "o1", "current_price": 11.8, "reference_price": 12.0, "reference_price_type": "merchant_previous"}]
    assert score_deal(D(), one).integrity == "ok"  # référence déjà vue, cohérente


def test_record_bonus_needs_three_observations():
    assert RECORD_MIN_N == 3
    two = [{"deal_id": f"o{i}", "current_price": 9.0} for i in range(2)]
    assert not any("record" in c for c, _ in score_deal(D(), two).components)
    three = [{"deal_id": f"o{i}", "current_price": 9.0} for i in range(3)]
    assert any("record" in c for c, _ in score_deal(D(), three).components)


def test_public_score_ignores_owner_distance():
    near = score_deal(D(family="surplus", distance_km=1))
    far = score_deal(D(family="surplus", distance_km=40))
    assert near.score == far.score
    assert not any("km" in c for c, _ in far.components)


def test_score_components_never_mention_commission():
    for d in (D(), D(family="tech", current_price=500, reference_price=900)):
        text = " ".join(c for c, _ in score_deal(d).components).lower()
        for bad in ("commission", "payout", "epc", "affil"):
            assert bad not in text
