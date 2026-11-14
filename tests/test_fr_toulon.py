"""Bêta Toulon : sélection par flux et filtres Dealabs (sans réseau)."""
from radar.config import load
from radar.connectors import enabled_connectors
from radar.connectors.fr_toulon import _price, local_elsewhere, parse_rss

RSS = """<?xml version="1.0"?><rss xmlns:pepper="http://www.pepper.com/rss" version="2.0"><channel>
<item><category><![CDATA[Épicerie & Courses]]></category><pepper:merchant name="Lidl" price="0,98€"/>
<title><![CDATA[Bananes Cavendish]]></title><link>https://www.dealabs.com/bons-plans/bananes-123</link></item>
</channel></rss>"""


def test_feed_selection(monkeypatch):
    ids = {c.id for c in enabled_connectors(load())}
    assert "lidl" in ids and "dealabs" not in ids and "lidl_fr" not in ids
    monkeypatch.setenv("RADAR_FEED", "fr-toulon")
    ids = {c.id for c in enabled_connectors(load())}
    assert ids == {"lidl_fr", "dealabs", "studentbeans_fr", "epic_free_fr", "gamerpower_fr"}


def test_dealabs_parsing_and_local_filter():
    it = parse_rss(RSS, "epicerie")[0]
    assert it["merchant"] == "Lidl" and _price(it["price"]) == 0.98
    assert _price("1 799,10€") == 1799.10
    assert local_elsewhere("PS5 slim - Super U Noisy-le-Grand (93)")
    assert local_elsewhere("Accessoires de musculation - Lidl St pierre du Perray")
    assert not local_elsewhere("Promo Carrefour Market Toulon (83)")
    assert not local_elsewhere("Lot de 10 Kinder Bueno")
