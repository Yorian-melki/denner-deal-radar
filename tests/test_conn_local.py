"""Connecteurs vie locale (événements), télécom, voyage, étudiants.

Fixtures = extraits réels réduits (audit du 2026-10-14) ; on teste les
fonctions de parsing pures utilisées par ``fetch`` puis ``normalize``.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from radar.connectors import REGISTRY, _load_all
from radar.connectors import dschungelkompass as dk
from radar.connectors import ferienpiraten as fp
from radar.connectors import grabenhalle_events as gh
from radar.connectors import kut_events as kut
from radar.connectors import saiten_events as sa
from radar.connectors import secretflying as sf
from radar.connectors import stadtsg_news as sn
from radar.connectors import studentbeans as sb
from radar.connectors import unidays as ud
from radar.core.uscoring import score_deal

FIX = Path(__file__).parent / "fixtures"
TZ = ZoneInfo("Europe/Zurich")
NOW = dt.datetime(2026, 10, 14, 9, 0, tzinfo=TZ)


def ctx(now=NOW):
    return SimpleNamespace(cfg=SimpleNamespace(tz=TZ), now=now, source_state={})


def read(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


def run(conn, items, c=None):
    c = c or ctx()
    return [d for d in (conn.normalize(i, c) for i in items) if d]


def test_registry_and_fixture_sizes():
    _load_all()
    for cid in ("saiten_events", "grabenhalle_events", "kut_events", "dschungelkompass", "ferienpiraten",
                "secretflying", "unidays", "studentbeans", "stadtsg_news"):
        assert cid in REGISTRY
    for f in ("saiten_events.json", "grabenhalle_events.json", "kut_events.html", "dschungelkompass_mobile.html",
              "dschungelkompass_internet.html", "ferienpiraten.xml", "secretflying_zurich.html",
              "secretflying_basel.html", "unidays_home.html", "unidays_technology.html", "studentbeans.html",
              "stadtsg_news.xml", "saiten_detail_183244.html", "saiten_detail_183632.html"):
        assert (FIX / f).stat().st_size < 150_000, f


# ---------------------------------------------------------------- prix libres

@pytest.mark.parametrize("txt,free,student,public", [
    ("Info Eintritt frei", True, None, []),
    ("Eintritt frei, Kollekte", True, None, []),
    ("Kinder u. Jugendliche bis 18 Jahre: Eintritt frei", False, None, []),     # gratuité réservée
    ("CHF 12.00 / 10.00 / 6.00 Eintritt frei", False, None, [12, 10, 6]),        # ambigu -> pas gratuit
    ("CHF 30.- / 25.- (im Vorverkauf)", False, None, [30, 25]),
    ("CHF 20.- / 25.- / 10.- (Kulturlegi)", False, None, [20, 25]),
    ("Erwachsene CHF 20, Studierende CHF 10", False, 10, [20]),
    ("Eintritt frei für Studierende, sonst CHF 15", False, 0, [15]),
    ("Tickets CHF 35-75", False, None, [35, 75]),
    # textes « Preise / Kosten » réels vus sur saiten.ch le 2026-10-14
    ("Erwachsene CHF 60.- Schülerinnen und Schüler/ Studierende CHF 35.-", False, 35, [60]),
    ("Eintritt frei, Kollekte und epikureische Mitbringsel willkommen", True, None, []),
    ("Kostenlos", True, None, []),
])
def test_classify_price_text(txt, free, student, public):
    c = sa.classify_price_text(txt)
    assert c["free"] is free
    assert c["student_price"] == student
    assert c["public_prices"] == public


# ---------------------------------------------------------------- Saiten

def test_saiten_list_and_normalize():
    occ = sa.parse_list(json.loads(read("saiten_events.json")), NOW)
    assert len(occ) == 50 and len({o["id"] for o in occ}) == 37
    assert {o["date"] for o in occ} == {"2026-10-14", "2026-10-15"}
    o = occ[0]
    assert (o["id"], o["start_time"], o["end_time"], o["venue"]) == ("181076", "08:00", "18:00", "Pflegeheim Heiligkreuz")
    c = sa.SaitenEvents()
    free = c.normalize({**o, "_detail": {"price_text": "Eintritt frei, Kollekte"}}, ctx())
    assert free["current_price"] == 0 and "reference_price" not in free and free["family"] == "event"
    assert free["starts_at"] == "2026-10-14T08:00:00+02:00" and free["ends_at"] == "2026-10-14T18:00:00+02:00"
    assert free["geographic_scope"] == "LOCAL" and free["offer_type"] == "free_event_kollekte"
    stud = c.normalize({**o, "_detail": {"price_text": "Erwachsene CHF 20, Studierende CHF 10"}}, ctx())
    assert stud["requires_student"] is True and stud["current_price"] == 10
    assert stud["reference_price"] == 20 and stud["reference_price_type"] == "catalog"
    assert c.normalize({**o, "_detail": {"price_text": "CHF 25.-"}}, ctx()) is None
    assert c.normalize({**o, "_detail": {}}, ctx()) is None          # prix inconnu -> écarté


def test_saiten_detail_real_pages():
    free = sa.parse_detail(read("saiten_detail_183244.html"))
    assert free == {"price_text": "Eintritt frei, Kollekte", "address": "Gallusstrasse 11, 9000 St.Gallen",
                    "organizer": "DenkBar"}
    assert sa.assess(free)["free"] is True and sa.assess(free)["kollekte"] is True
    carmen = sa.parse_detail(read("saiten_detail_183632.html"))
    c = sa.assess(carmen)
    assert carmen["address"] == "Mühlensteg 3, 9001 St. Gallen" and c["free"] is False
    assert c["public_prices"] == [35] and c["student_price"] == 20          # « CHF20.- Studen:innen »
    assert ("kulturlegi", 5) in c["concessions"] and ("member", 30) in c["concessions"]
    occ = {"id": "183632", "url": "https://www.saiten.ch/kalender/carmen-von-prosper-merimee-183632",
           "title": "Carmen von Prosper Mérimée", "date": "2026-10-16", "start_time": "19:30", "end_time": None,
           "venue": "Theater Trouvaille", "city": "St. Gallen", "_detail": carmen}
    d = sa.SaitenEvents().normalize(occ, ctx())
    assert (d["current_price"], d["reference_price"], d["requires_student"]) == (20, 35, True)
    assert d["address"] == "Mühlensteg 3, 9001 St. Gallen" and d["merchant"] == "Theater Trouvaille"


# ---------------------------------------------------------------- Grabenhalle

def test_grabenhalle():
    ev = gh.parse_payload(read("grabenhalle_events.json"))
    assert len(ev) == 15
    deals = run(gh.GrabenhalleEvents(), ev)
    assert len(deals) == 4
    assert all(d["current_price"] <= 10 and d["family"] == "event" for d in deals)
    kanti = next(d for d in deals if d["title"].startswith("Kanti-Bandnight"))
    assert kanti["eligibility"] == "für Schulangehörige ist der Eintritt frei" and kanti["current_price"] == 10
    assert kanti["address"] == "Unterer Graben 17, 9000 St.Gallen"
    assert kanti["starts_at"] == "2026-11-06T19:00:00+01:00"
    titles = {d["title"] for d in deals}
    assert "Grabepunk Vol. 5" not in titles            # 10.- seulement avec Kulturlegi
    assert "Feministischer Sessionsrückblick" not in titles   # prix vide = inconnu, pas gratuit


# ---------------------------------------------------------------- Konzert und Theater

def test_kut_free_events():
    perf = kut.parse_calendar(read("kut_events.html"))
    assert len(perf) == 27
    deals = run(kut.KuTEvents(), perf)
    assert len(deals) == 4
    assert all(d["current_price"] == 0 and "reference_price" not in d for d in deals)
    probe = next(d for d in deals if d["title"] == "Öffentliche Probe: La Strada")
    assert probe["starts_at"] == "2026-10-21T19:30:00+02:00" and probe["venue"] == "Tonhalle"
    assert score_deal(probe).score is None           # valeur d'un événement gratuit inconnue


# ---------------------------------------------------------------- dschungelkompass

def _dk(name, kind):
    page = dk.parse_page(read(name), kind)
    return page, {d["title"]: d for d in run(dk.Dschungelkompass(), page["cards"])}


def test_dschungelkompass_mobile():
    page, deals = _dk("dschungelkompass_mobile.html", "mobile")
    assert len(page["cards"]) == 27 and page["announced"] == 54 and page["updated"] == "13.10.2026"
    assert len(deals) == 27 and all(d["family"] == "subscription" for d in deals.values())
    gomo = deals["GoMo Swiss (Aktionspreis)"]                       # « Aktion bis 15.19.2026 »
    assert "ends_at" not in gomo and gomo["promo_end_invalid"] is True and gomo["promo_end_raw"] == "15.19.2026"
    q = deals["Quickline Mobile L (Aktionspreis)"]
    assert (q["current_price"], q["regular_monthly_price"], q["promo_months"], q["price_after_promo"],
            q["commitment_months"], q["activation_fee"]) == (9.0, 29.0, 24, 29.0, 24, 40.0)
    s = score_deal(q)
    assert s.score is not None and s.components[0][0].startswith("coût total sur 24")
    t = deals["Thurcom Mobile neo XS (Aktionspreis)"]               # « 12 Monate für CHF 11.90 anstatt 15.90 »
    assert (t["current_price"], t["promo_months"], t["regular_monthly_price"]) == (11.9, 12, 15.9)
    ch = deals["CHmobile Flat (Aktionspreis)"]
    assert ch["ends_at"] == "2026-10-21T23:59:59+02:00" and ch["promo_lifetime"] is True and ch["activation_fee"] == 0
    five_g = deals["Wingo Swiss Mini (Aktionspreis) + 5G-Option"]   # le texte décrit l'abo de base
    assert five_g["price_basis"] == "card" and five_g["regular_monthly_price"] == 49.0


def test_dschungelkompass_internet_dates_and_tco():
    page, deals = _dk("dschungelkompass_internet.html", "internet")
    assert len(page["cards"]) == 18 and page["announced"] == 35
    tk = [d for t, d in deals.items() if t.startswith("TeleKing")]   # « Aktion bis 31.11.2026 »
    assert tk and all("ends_at" not in d and d["promo_end_invalid"] for d in tk)
    assert (tk[0]["current_price"], tk[0]["promo_months"], tk[0]["price_after_promo"]) == (14.0, 5, 28.0)
    sak = deals["SAK Internet S (Aktionspreis)"]                    # 3 mois gratuits puis 33.-
    assert (sak["current_price"], sak["promo_months"], sak["price_after_promo"], sak["commitment_months"]) == (0, 3, 33.0, 12)
    green = deals["Green Internet Home XL (Glasfaser) (Aktion)"]
    assert (green["current_price"], green["promo_months"], green["price_after_promo"], green["regular_monthly_price"]) \
        == (25.0, 12, 49.9, 69.9)
    gga = next(d for t, d in deals.items() if t.startswith("GGA Maur"))
    assert gga["requires_coupon"] is True and gga["coupon_code"] == "KOMPASS26"


def test_dschungelkompass_date_validation():
    assert dk.parse_promo("Aktion bis 31.11.2026: CHF 1 anstatt 2")["until"] is None
    assert dk.parse_promo("Aktion bis 30.11.2026: CHF 1 anstatt 2")["until"] == dt.date(2026, 11, 30)


# ---------------------------------------------------------------- voyage

def test_ferienpiraten():
    items = fp.parse_feed(read("ferienpiraten.xml"))
    deals = run(fp.Ferienpiraten(), items)
    assert len(items) == 5 and len(deals) == 5
    mak = next(d for d in deals if d["deal_id"] == "ferienpiraten:the-grand-makadi")
    assert (mak["current_price"], mak["currency"], mak["price_unit"]) == (509.0, "CHF", "pro Person")
    assert mak["geographic_scope"] == "TRAVEL_ACCESSIBLE" and mak["extra_tags"] == ["departure_unknown"]
    assert mak["published_at"] == "2026-10-13T13:00:00+02:00"
    assert fp.departures("Flüge ab Zürich und ab Basel") == (["ZRH", "BSL"], False)
    assert fp.departures("Städtetrip nach Zürich") == ([], False)
    assert fp.Ferienpiraten().normalize({**items[0], "description": "Abflug ab Frankfurt, ab € 99"}, ctx()) is None


def test_secretflying_price_from_title_and_staleness():
    zrh = sf.parse_page(read("secretflying_zurich.html"))
    bsl = sf.parse_page(read("secretflying_basel.html"))
    assert len(zrh) == 6 and len(bsl) == 9
    assert sum(sf.is_fresh(r, NOW) for r in zrh) == 6
    assert sum(sf.is_fresh(r, NOW) for r in bsl) == 0                  # posts de 2025 / mai 2026
    muscat = next(r for r in zrh if r["id"] == "191822")
    assert "e224" in muscat["url"] and muscat["price"] == 316.0         # titre, pas le slug périmé
    deals = run(sf.SecretFlying(), [{**r, "pages": ["ZRH"]} for r in zrh + bsl])
    assert len(deals) == 6
    d = next(x for x in deals if x["deal_id"] == "secretflying:191822")
    assert "current_price" not in d and d["price_eur"] == 316.0 and d["currency"] == "EUR"
    assert d["departure_airports"] == ["ZRH"] and d["trip_type"] == "roundtrip"
    drop = next(x for x in deals if x["deal_id"] == "secretflying:662471")
    assert drop["extra_tags"] == ["price_drop"] and not drop["title"].startswith("🚨")
    later = dt.datetime(2026, 11, 20, tzinfo=TZ)
    assert len(run(sf.SecretFlying(), zrh, ctx(later))) == 3            # > 60 jours écartés


# ---------------------------------------------------------------- étudiants

def test_unidays():
    home = ud.parse_page(read("unidays_home.html"))
    tech = ud.parse_page(read("unidays_technology.html"))
    assert len(home["benefits"]) == 16 and len(tech["benefits"]) == 8
    assert home["categories"] == ["fashion", "technology"]
    items = [{**b, "_partner": {**home["partners"], **tech["partners"]}.get(b.get("partnerId"))}
             for b in {b["id"]: b for b in home["benefits"] + tech["benefits"]}.values()]
    deals = run(ud.UNiDAYS(), items)
    assert len(items) == 21 and len(deals) == 20                       # Temu « NonStudent » écarté
    assert all(d["requires_student"] and d["family"] == "student" and d["geographic_scope"] == "ONLINE" for d in deals)
    mango = next(d for d in deals if d["merchant"] == "Mango Outlet")
    assert mango["discount_percentage"] == 5 and mango["discount_max_percentage"] == 80
    assert mango["reference_price_type"] == "stated_percent_only" and "ends_at" not in mango
    hp = next(d for d in deals if d["merchant"] == "HP")
    assert "discount_percentage" not in hp and hp["discount_max_percentage"] == 20
    rb = next(d for d in deals if d["title"] == "Ray-Ban: 10% Rabatt auf Ray-Ban Meta")
    assert rb["ends_at"] == "2026-12-01T23:59:59+01:00"
    assert score_deal(mango).score is not None


def test_studentbeans():
    offers = sb.parse_offers(read("studentbeans.html"))
    deals = run(sb.StudentBeans(), offers)
    assert len(offers) == 32 and len(deals) == 32
    je = next(d for d in deals if d["merchant"] == "Just Eat")
    assert je["discount_absolute"] == 20 and je["ends_at"] == "2026-10-31T23:59:00+01:00"
    ck = next(d for d in deals if d["merchant"] == "Charles & Keith")
    assert ck["discount_percentage"] == 15 and "ends_at" not in ck            # 2050 = sans fin
    assert sum(1 for d in deals if d.get("discount_percentage")) == 26
    assert all(d["requires_student"] for d in deals)


# ---------------------------------------------------------------- Stadt St. Gallen

def test_stadtsg_news_keyword_filter():
    items = sn.parse_feed(read("stadtsg_news.xml"))
    deals = run(sn.StadtSGNews(), items)
    assert len(items) == 10 and len(deals) == 1
    d = deals[0]
    assert d["title"] == "Das Winterbad Lerchenfeld startet in die zweite Saison"
    assert d["family"] == "local_news" and d["signal_types"] == ["opening"] and "current_price" not in d
    assert sn.match_keywords("Neueröffnung am Marktplatz, Eintritt frei") == ["opening", "free"]
    assert sn.match_keywords("Stadtrat verabschiedet Aktionsplan") == []
