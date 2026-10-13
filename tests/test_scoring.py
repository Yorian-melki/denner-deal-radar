import pytest

from radar.scoring import curve, label, personal_relevance, score_offer


def offer(price, ref, ref_type="denner_previous", **kw):
    return {"offer_id": "x", "discounted_price": price, "regular_price": ref,
            "reference_price_type": ref_type, "price_basis": "package", **kw}


# Cas exigés : réduction réelle vérifiée (prix « statt » Denner), sans condition.
@pytest.mark.parametrize("pct, expected", [
    (0, 0.0), (10, 2.0), (20, 3.5), (30, 5.0), (40, 6.2), (50, 7.3),
    (60, 8.0), (75, 9.0), (90, 9.7), (95, 10.0),
])
def test_absolute_scale_fixed_thresholds(pct, expected):
    r = score_offer(offer(round(10 * (1 - pct / 100), 2), 10.0))
    assert r.score == expected
    assert r.confidence >= 0.75


def test_curve_monotonic_and_bounded():
    vals = [curve(x) for x in range(0, 101)]
    assert vals == sorted(vals)
    assert vals[0] == 0 and vals[-1] == 10


def test_labels():
    assert label(None) == "non évaluée"
    assert label(0.0) == "insignifiante"
    assert label(5.0) == "correcte"
    assert label(7.0) == "très bonne"
    assert label(8.0) == "excellente"
    assert label(9.1) == "exceptionnelle"


def test_score_is_absolute_not_relative():
    """La note d'une offre ne dépend que d'elle-même (et de son propre historique)."""
    a = offer(7.0, 10.0)
    alone = score_offer(a).score
    for others in ([offer(1, 10)] * 50, [offer(9.9, 10)] * 50):
        _ = [score_offer(o) for o in others]
        assert score_offer(a).score == alone == 5.0


def test_competitor_reference_is_discounted():
    """60 % affichés vs un prix concurrent ≠ 60 % réels chez Denner."""
    own = score_offer(offer(4.0, 10.0))
    comp = score_offer(offer(4.0, 10.0, "competitor_comparison"))
    assert own.score == 8.0
    assert comp.score < own.score
    assert comp.effective_discount == pytest.approx(50.0, abs=0.1)
    assert comp.confidence < own.confidence
    # « -20 % vs concurrence » peut n'être que le prix habituel Denner -> 0
    assert score_offer(offer(8.0, 10.0, "competitor_comparison")).score == 0.0


def test_no_reference_is_not_rated():
    r = score_offer(offer(4.95, None, "none"))
    assert r.score is None
    assert r.confidence < 0.5


def test_stated_percent_only_has_medium_confidence():
    r = score_offer({"offer_id": "a", "discounted_price": None, "regular_price": None,
                     "reference_price_type": "stated_percent_only", "stated_discount_pct": 30.0})
    assert r.score == 5.0
    assert 0.5 <= r.confidence < 0.75


def test_min_quantity_condition_lowers_score():
    base = score_offer(offer(7.5, 10.0)).score
    two = score_offer(offer(7.5, 10.0, min_purchase_quantity=2)).score
    three = score_offer(offer(7.5, 10.0, min_purchase_quantity=3)).score
    assert three < two < base


def test_stated_vs_computed_mismatch_keeps_lower():
    r = score_offer(offer(7.0, 10.0, stated_discount_pct=50.0))
    assert r.effective_discount == pytest.approx(30.0)
    assert r.confidence < 0.75


def test_inflated_reference_detected_with_history():
    hist = [{"offer_id": "old1", "price": 6.0, "regular": 8.0, "ref_type": "denner_previous", "price_basis": "package"},
            {"offer_id": "old2", "price": 6.2, "regular": 8.0, "ref_type": "denner_previous", "price_basis": "package"}]
    # Affiche 50 % (5.– au lieu de 10.–), mais le prix habituel observé est 8.–
    r = score_offer(offer(5.0, 10.0), hist)
    assert r.effective_discount == pytest.approx(37.5)
    assert any("référence" in n for n in r.notes)


def test_history_bonus_and_malus_are_bounded():
    hist = [{"offer_id": f"o{i}", "price": p, "regular": 10.0, "ref_type": "denner_previous",
             "price_basis": "package"} for i, p in enumerate([7.0, 7.2, 7.5])]
    best = score_offer(offer(6.5, 10.0), hist)
    worse = score_offer(offer(8.0, 10.0), hist)
    assert best.score == pytest.approx(round(curve(35) + 0.3, 1))
    assert worse.score == pytest.approx(round(curve(20) - 0.5, 1))


def test_zero_discount_never_positive():
    hist = [{"offer_id": "o", "price": 12.0, "regular": 12, "ref_type": "denner_previous", "price_basis": "package"}] * 3
    assert score_offer(offer(10.0, 10.0), hist).score == 0.0


def test_personal_relevance_never_changes_deal_score():
    prefs = {"exclude_tags": ["porc"], "relevance": {"proteines": 1.0, "autres": 0.1},
             "favorites": {"keywords": ["Poulet"]}}
    pork = offer(5.0, 10.0, tags=["porc"], group="proteines", product_name="Schweinssteak")
    chicken = offer(5.0, 10.0, tags=["proteines"], group="proteines", product_name="Poulet")
    assert personal_relevance(pork, prefs) == 0.0
    assert personal_relevance(chicken, prefs) == 1.0
    assert score_offer(pork).score == score_offer(chicken).score
