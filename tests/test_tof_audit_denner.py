from radar.tof_audit import _denner_articles


def test_denner_new_attribute_format():
    it = {"price": 0.89, "attributeInfo": [
        {"attributeName": "articleId", "vals": [{"value": "1003706"}]},
        {"attributeName": "promotionTo", "vals": [{"value": "1794956400"}]}]}
    assert _denner_articles(it) == [{"articleId": "1003706", "price": 0.89, "promotionTo": "1794956400"}]


def test_denner_legacy_format():
    it = {"attributeInfo": [{"articleId": "1", "price": 2.5, "promotionTo": "x"}]}
    assert _denner_articles(it) == [{"articleId": "1", "price": 2.5, "promotionTo": "x"}]
