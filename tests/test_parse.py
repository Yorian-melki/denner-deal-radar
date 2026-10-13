import datetime as dt

import pytest

from radar import parse as P


@pytest.mark.parametrize("raw, expected", [
    ("statt 26.25", 26.25), ("statt 15.–", 15.0), ("–.99", 0.99), ("5.-", 5.0),
    ("4,95", 4.95), ("CHF 1'299.–", 1299.0), ("Fr. 3.50", 3.5), ("", None), ("0", None),
    (0.99, 0.99), (None, None),
])
def test_parse_chf(raw, expected):
    assert P.parse_chf(raw) == expected


def test_validity_label_is_authoritative():
    # Calendrier 2026 : jeudi -> mercredi
    assert P.parse_validity("08.10.–14.10.2026") == (dt.date(2026, 10, 8), dt.date(2026, 10, 14))
    assert P.parse_validity("01.10.–28.10.2026") == (dt.date(2026, 10, 1), dt.date(2026, 10, 28))
    assert P.parse_validity("16.10.–18.10.2026") == (dt.date(2026, 10, 16), dt.date(2026, 10, 18))


def test_validity_year_boundary():
    assert P.parse_validity("31.12.–06.01.2027") == (dt.date(2026, 12, 31), dt.date(2027, 1, 6))


def test_validity_until_uses_publication_timestamp_for_start():
    # « Bis 14.10.2026 » (Wochenstart-Knaller) publié lundi 12.10.2026 02:03
    start, end = P.parse_validity("Bis 14.10.2026", "1791763411", "1791928800")
    assert (start, end) == (dt.date(2026, 10, 12), dt.date(2026, 10, 14))


def test_validity_fallback_timestamps_cet_cest():
    # promotionTo = minuit (heure suisse) au début du dernier jour
    assert P.parse_validity("", None, "1791928800")[1] == dt.date(2026, 10, 14)   # CEST
    ts_winter = int(dt.datetime(2026, 12, 2, 0, 0, tzinfo=P.TZ).timestamp())
    assert P.parse_validity("", None, str(ts_winter))[1] == dt.date(2026, 12, 2)  # CET


def test_day_end_timezone_aware():
    e = P.day_end(dt.date(2026, 10, 28))
    assert e.utcoffset() == dt.timedelta(hours=1)   # CET après le 25.10.2026
    assert P.day_end(dt.date(2026, 10, 14)).utcoffset() == dt.timedelta(hours=2)


@pytest.mark.parametrize("text, extra, pct, qty", [
    ("½ PREIS", "", 50, 1),
    ("21%", "", 21, 1),
    ("25% <vertical>ab 2 Stück</vertical>", "", 25, 2),
    ("30%", "ab 2 Stück auf alle Wernli Produkte", 30, 2),
    ("3 für 2", "", 33.3, 3),
    ("1+1 gratis", "", 50, 2),
    ("SPECIAL", "", None, 1),
])
def test_discount_text(text, extra, pct, qty):
    d = P.parse_discount_text(text, extra)
    assert d.stated_pct == pct
    assert d.min_qty == qty


def test_special_flag():
    assert P.parse_discount_text("SPECIAL").special


@pytest.mark.parametrize("foot, regions", [
    ("", None),
    ("Konkurrenzvergleich", None),
    ("Nur in der deutschen Schweiz erhältlich", ["de"]),
    ("Nur in der französischen Schweiz erhältlich", ["fr"]),
    ("Konkurrenzvergleich | Nur in der deutschen und italienischen Schweiz erhältlich", ["de", "it"]),
    ("Nur in der französischen und italienischen Schweiz erhältlich", ["fr", "it"]),
])
def test_regions(foot, regions):
    assert P.parse_regions(foot) == regions


def test_competitor_reference():
    assert P.is_competitor_reference("Konkurrenzvergleich | Nur in der deutschen Schweiz erhältlich")
    assert not P.is_competitor_reference("Nicht mit anderen Gutscheinen kumulierbar.")


@pytest.mark.parametrize("sub, cst, total, unit, basis", [
    ("24\xa0x\xa033\xa0cl", "33 cl", 7.92, "l", "package"),
    ("Italien, Apulien, 2024, 6\xa0x\xa075\xa0cl", "", 4.5, "l", "package"),
    ("am Stück, Uruguay/Argentinien, ca. 800 g, per 100 g", "0.8 unit.g", 0.8, "kg", "per_100g"),
    ("Schweiz, per kg", "1 unit.kg", None, None, "per_kg"),
    ("essreif, Herkunft siehe Etikette, per Stück", "1 unit.kg", 1, "pc", "per_piece"),
    ("Gel, 27 Waschgänge, 1,5 Liter", "1.5 Liter", 1.5, "l", "package"),
    ("3 x 8 g", "0.024 unit.g", 0.024, "kg", "package"),
    ("185\xa0g", "0.185 unit.g", 0.185, "kg", "package"),
    ("10 Stück", "", 10, "pc", "package"),
    ("", "0.75 unit.ml", 0.75, "l", "package"),
    ("60 Caps", "", 60, "pc", "package"),
])
def test_quantity(sub, cst, total, unit, basis):
    q = P.parse_quantity(sub, cst)
    assert q.unit == unit
    assert q.price_basis == basis
    if total is None:
        assert q.total is None
    else:
        assert q.total == pytest.approx(total)


def test_unit_prices():
    assert P.unit_price(2.99, P.parse_quantity("ca. 800 g, per 100 g")) == (29.9, "CHF/kg")
    assert P.unit_price(1.95, P.parse_quantity("Schweiz, per kg")) == (1.95, "CHF/kg")
    assert P.unit_price(12.95, P.parse_quantity("24 x 33 cl")) == (1.64, "CHF/l")
    assert P.unit_price(4.2, P.parse_quantity("10 Stück")) == (0.42, "CHF/pièce")
    assert P.unit_price(None, P.parse_quantity("500 g")) == (None, None)
    assert P.unit_price(3.0, P.parse_quantity("Herkunft siehe Etikette")) == (None, None)


def test_attrs_flatten():
    item = {"attributeInfo": [{"attributeName": "name", "vals": [{"value": "Mango"}]},
                              {"attributeName": "empty", "vals": []}]}
    assert P.attrs(item) == {"name": "Mango"}
