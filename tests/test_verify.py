"""Phase 0 de fiabilité (étude R2 §3) : vérification des offres à 0 token LLM."""
import datetime as dt
import json
from pathlib import Path

import requests

from radar.connectors._grocery import stated_unit_price
from radar.core import verify as V
from radar.core.engine import apply
from radar.core.store import UStore
from radar.parse import TZ

NOW = dt.datetime(2026, 11, 6, 15, 0, tzinfo=TZ)
FIX = Path(__file__).parent / "fixtures"


def iso(t):
    return t.replace(microsecond=0).isoformat()


def deal(**kw):
    d = {"deal_id": "lidl:10061263", "source_id": "lidl", "title": "Triangle Spinach & Tomato", "family": "grocery",
         "lifecycle": "ACTIVE", "current_price": 1.29, "source_url": "https://www.lidl.ch/p/de-CH/triangle/p10061263",
         "first_seen_at": iso(NOW - dt.timedelta(days=2)), "last_seen_at": iso(NOW - dt.timedelta(hours=2)),
         "ends_at": iso(NOW + dt.timedelta(days=2)), "missing_scans": 0}
    d.update(kw)
    return d


def healthy(**kw):
    st = {"last_success": iso(NOW - dt.timedelta(hours=1)), "consecutive_failures": 0, "last_state": "OK"}
    st.update(kw)
    return V.source_health(st, "grocery", 180, NOW, "lidl")


# -- 1. X_SOURCE_STALE ---------------------------------------------------------------------------------

def test_source_stale_after_consecutive_failures():
    h = healthy(last_success=iso(NOW - dt.timedelta(hours=10)), consecutive_failures=3)
    assert h["stale"] and "3 échecs" in h["reason"]
    assert V.assess(deal(), h, NOW)["state"] == "HIDDEN"
    assert V.assess(deal(), h, NOW)["code"] == "X_SOURCE_STALE"


def test_source_stale_when_last_success_older_than_ttl():
    # Lidl réel : dernier succès le 04.11 12:00, 8 échecs ; même sans compter les échecs, 51 h > 30 h.
    h = V.source_health({"last_success": "2026-11-04T12:00:01+01:00", "consecutive_failures": 1}, "grocery", 180, NOW)
    assert h["stale"] and "> 30 h" in h["reason"]
    # Flash : 3 h, mais jamais moins de 4 intervalles.
    assert V.source_health({"last_success": iso(NOW - dt.timedelta(hours=4))}, "flash", 30, NOW)["stale"]
    assert not V.source_health({"last_success": iso(NOW - dt.timedelta(hours=4))}, "flash", 60, NOW)["stale"]
    assert not healthy()["stale"]


def test_stale_source_reinstated_on_first_successful_pass():
    d, journal = deal(), []
    V.transition(d, V.assess(d, healthy(consecutive_failures=5), NOW), NOW, healthy(consecutive_failures=5), journal)
    assert d["verify"]["state"] == "HIDDEN" and journal[-1]["code"] == "X_SOURCE_STALE"
    a = V.transition(d, V.assess(d, healthy(), NOW), NOW, healthy(), journal)
    assert a["state"] == "VERIFIED" and a["code"] == "REINSTATED" and "verify" not in d
    assert [j["to"] for j in journal] == ["HIDDEN", "VERIFIED"]


def test_verified_at_is_the_last_successful_check_not_the_build_time():
    # Revue au dernier passage réussi (relevé à 6 h près) : date du passage, pas de l'export.
    d = deal(last_seen_at=iso(NOW - dt.timedelta(hours=3)))
    assert V.verified_at(d, healthy()) == iso(NOW - dt.timedelta(hours=1))
    # Absente du dernier passage : son propre dernier relevé.
    old = deal(last_seen_at=iso(NOW - dt.timedelta(hours=20)))
    assert V.verified_at(old, healthy()) == iso(NOW - dt.timedelta(hours=20))
    # Un contrôle de page 200 plus récent l'emporte.
    old["verify"] = {"checks": [{"at": iso(NOW - dt.timedelta(minutes=5)), "http": 200}]}
    assert V.verified_at(old, healthy()) == iso(NOW - dt.timedelta(minutes=5))


# -- 2. 404/410 confirmé deux fois, drapeaux de fin --------------------------------------------------------

def checks(*items):
    return {"checks": [{"at": iso(NOW - dt.timedelta(minutes=m)), "http": s} for m, s in items]}


def test_single_404_is_suspect_two_spaced_404_end_the_deal():
    one = V.assess(deal(verify=checks((5, 404))), healthy(), NOW)
    assert (one["state"], one["code"]) == ("SUSPECT", "T_GONE_404_PENDING")
    close = V.assess(deal(verify=checks((30, 404), (5, 404))), healthy(), NOW)
    assert close["state"] == "SUSPECT"                     # < 1 h d'écart : pas encore une preuve
    two = V.assess(deal(verify=checks((70, 410), (5, 404))), healthy(), NOW)
    assert (two["state"], two["code"]) == ("ENDED", "T_GONE_404")
    flaky = V.assess(deal(verify=checks((70, 404), (5, 200))), healthy(), NOW)
    assert flaky["state"] == "VERIFIED"


def test_inconclusive_check_is_never_a_proof():
    d = deal(verify={"checks": [{"at": iso(NOW - dt.timedelta(hours=2)), "http": 404},
                                {"at": iso(NOW - dt.timedelta(hours=1)), "http": 429, "inconclusive": "HTTP 429"},
                                {"at": iso(NOW), "http": 404}]})
    assert V.assess(d, healthy(), NOW)["code"] == "T_GONE_404"   # le 429 est ignoré, les deux 404 comptent
    d["verify"]["checks"] = [{"at": iso(NOW), "http": 403, "inconclusive": "HTTP 403"}]
    assert V.assess(d, healthy(), NOW)["state"] == "VERIFIED"


PREISPIRAT = """<html><body><article class="post-inner post post-731903 expired type-post">Deal</article>
<article class="col_item column_grid">x</article><form>Deal abgelaufen / Falscher Preis</form></body></html>"""


def test_page_flags_preispirat_qoqa_fust():
    url = "https://www.preispirat.ch/buerostuhl-songmics/"
    assert V.page_flag(url, PREISPIRAT, "preispirat:731903") == "expired"
    live = PREISPIRAT.replace(" expired", "")
    assert V.page_flag(url, live, "preispirat:731903") is None           # « Deal abgelaufen » du formulaire ignoré
    side = live.replace('class="col_item column_grid"', 'class="col_item column_grid expired"')
    assert V.page_flag(url, side, "preispirat:731903") is None           # vignette expirée d'un AUTRE deal
    assert V.page_flag("https://www.qoqa.ch/de/offers/123", '{"is_sold_out":true}') == "sold_out"
    assert V.page_flag("https://www.qoqa.ch/de/offers/123", '{"is_sold_out":false}') is None
    fust = '{"code":"5010877","soldOut":false} … {"code":"5011234","name":"Kühlschrank","stock":{"stockLevel":0},"soldOut":true}'
    assert V.page_flag("https://www.fust.ch/de/p/kuehlschrank-5011234.html", fust) == "sold_out"
    assert V.page_flag("https://www.fust.ch/de/p/geschirrspueler-5010877.html", fust) is None


def test_source_flag_ends_the_deal():
    d = deal(source_id="preispirat", deal_id="preispirat:731903",
             verify={"checks": [{"at": iso(NOW), "http": 200, "flag": "expired"}]})
    assert (V.assess(d, healthy(), NOW)["state"], V.assess(d, healthy(), NOW)["code"]) == ("ENDED", "T_SRC_EXPIRED_FLAG")
    assert V.assess(deal(sold_out=True), healthy(), NOW)["code"] == "T_SRC_EXPIRED_FLAG"


def test_qoqa_zero_remaining_stock_is_sold_out():
    from radar.connectors.qoqa import QoQa

    class Ctx:
        class cfg:
            tz = TZ
    o = {"id": 1, "name": "Velo", "url_de": "https://www.qoqa.ch/de/offers/1", "price_range_min": 99,
         "remaining_stock_percent": 0, "universe": "Sport"}
    assert QoQa().normalize(o, Ctx)["sold_out"] is True
    assert "sold_out" not in QoQa().normalize({**o, "remaining_stock_percent": 40}, Ctx)


class FakeHttp:
    def __init__(self, responses):
        self.responses, self.calls = responses, []

    def get(self, url, **kw):
        self.calls.append(url)
        status, text, final = self.responses[url]
        if status >= 400:
            r = requests.Response()
            r.status_code = status
            raise requests.HTTPError(f"HTTP {status}", response=r)
        r = requests.Response()
        r.status_code, r._content, r.url, r.encoding = status, text.encode(), final, "utf-8"
        return r


def test_check_page_status_redirect_and_errors():
    u = "https://www.lidl.ch/p/de-CH/triangle/p10061263"
    http = FakeHttp({u: (404, "", u)})
    assert V.check_page(http, u, "lidl:10061263", NOW)["http"] == 404
    http = FakeHttp({u: (200, "<html></html>", "https://www.lidl.ch/c/de-CH/aktionen/a10023")})
    c = V.check_page(http, u, "lidl:10061263", NOW)
    assert c["http"] == 404 and "redirect" in c                    # renvoyé vers une catégorie : produit disparu
    http = FakeHttp({u: (429, "", u)})
    assert V.check_page(http, u, "lidl:10061263", NOW)["inconclusive"] == "HTTP 429"


def test_run_checks_confirms_404_after_one_hour(tmp_path):
    store = UStore(tmp_path)
    u = "https://www.lidl.ch/p/de-CH/triangle/p10061263"
    store.source_deals("lidl")["lidl:10061263"] = deal()
    http = FakeHttp({u: (404, "", u)})
    V.run_checks(store, http, NOW)
    V.run_checks(store, http, NOW + dt.timedelta(minutes=20))      # trop tôt : pas recontrôlée
    assert len(http.calls) == 1
    V.run_checks(store, http, NOW + dt.timedelta(minutes=65))
    d = store.source_deals("lidl")["lidl:10061263"]
    assert len(d["verify"]["checks"]) == 2
    assert V.assess(d, healthy(), NOW + dt.timedelta(minutes=65))["code"] == "T_GONE_404"


# -- 3. Région et magasin proche ------------------------------------------------------------------------------

def test_region_rules():
    assert V.region_excluded({"title": "Lucul Fondue Chinoise-Mix", "conditions": ["Nur in der französischen Schweiz erhältlich"]})
    assert V.region_excluded({"title": "Monbazillac", "conditions": ["Nur in der französischen und italienischen Schweiz erhältlich"]})
    assert V.region_excluded({"title": "Lusinga Rosato", "conditions": ["Nur in der italienischen Schweiz erhältlich"]})
    assert V.region_excluded({"title": "Vin rouge (nur Romandie)"})
    assert V.region_excluded({"title": "Raclette", "description": "Offre valable uniquement en Suisse romande"})
    assert V.region_excluded({"title": "Saucisson", "eligible_home": False})
    assert not V.region_excluded({"title": "AIR WICK Aroma-Öl (Aktion nur in der Deutsch- und Westschweiz gültig)"})
    assert not V.region_excluded({"title": "Bier", "conditions": ["Nur in der deutschen und italienischen Schweiz erhältlich"]})
    assert not V.region_excluded({"title": "Fondue", "conditions": ["solange Vorrat"], "eligible_home": True})


def test_region_and_absent_chain_are_reported():
    a = V.assess(deal(conditions=["Nur in der französischen Schweiz erhältlich"]), healthy(), NOW)
    assert "R_REGION" in a["rules"] and V.export_fields({}, a)["region_excluded"] is True
    a = V.assess(deal(source_id="rappn", merchant="Aligro"), healthy(), NOW)
    assert "R_NO_STORE_NEARBY" in a["rules"]


# -- 4. Prix, quantité, prix unitaire --------------------------------------------------------------------------

def test_aldi_kg_atg_is_not_read_as_grams():
    # « 1 KG/ATG » : le « G » d'« ATG » était lu comme « g » -> 11.99 CHF/g = 11 990 CHF/kg publié.
    assert stated_unit_price("1 KG/ATG = 11.99") is None
    assert stated_unit_price("100 g = 0.90") == (9.0, "CHF/kg")
    assert stated_unit_price("100g = 2.55") == (25.5, "CHF/kg")


def test_unit_incoherence_rules():
    schwein = {"title": "COUNTRY'S BEST Schweinsplätzli", "current_price": 11.99, "quantity": 1.0,
               "unit_price": 11990.0, "unit": "CHF/kg", "package_size": "1 KG/ATG"}
    assert V.unit_incoherent(schwein)
    assert not V.unit_incoherent({**schwein, "unit_price": 11.99})
    # Denner : prix affiché pour 100 g.
    assert not V.unit_incoherent({"title": "Bündner Bergkäse", "current_price": 1.49, "quantity": 0.35,
                                  "unit_price": 14.9, "unit": "CHF/kg", "package_size": "ca. 350 g, per 100 g"})
    # Multipack : 7 × 21 = 147 pièces ; arrondi au centime (11.89 / 160 = 0.074).
    assert not V.unit_incoherent({"title": "Finish", "current_price": 24.99, "quantity": 21, "unit_price": 0.17,
                                  "unit": "CHF/pièce", "package_size": "7 x 21 Stück"})
    assert not V.unit_incoherent({"title": "Weichspüler", "current_price": 11.89, "quantity": 160, "unit_price": 0.07,
                                  "unit": "CHF/pièce", "package_size": "160 Waschgänge"})
    # Parfum à 1 396 CHF/l : vrai prix de cosmétique.
    assert not V.unit_incoherent({"title": "Thierry Mugler Angel Elixir Eau de Parfum", "current_price": 34.9,
                                  "quantity": 0.025, "unit_price": 1396.0, "unit": "CHF/l", "package_size": "25 ml"})
    # Rappn : 500 g à 14.30 annoncé 14.30/kg (prix au kilo d'une autre variante).
    assert V.unit_incoherent({"title": "Bell Vorderschinken 500g", "current_price": 14.3, "quantity": 0.5,
                              "unit_price": 14.3, "unit": "CHF/kg", "package_size": "500g"})


def test_all_published_unit_price_errors_of_the_r2_sample_are_removed():
    """Les 35 cas du flux du 06.11 qui déclenchaient la règle brute (> 1 000 CHF/kg ou écart > 5 %) :
    19 vraies incohérences (dont 11 990 CHF/kg) ne publient plus de prix unitaire ; les 16 autres
    (Denner « per 100 g », multipacks, arrondi, cosmétiques, quantité en pièces) sont justes."""
    cases = json.loads((FIX / "unit_price_cases.json").read_text("utf-8"))["cases"]
    assert len(cases) == 35
    from radar.ucli import _publish
    dropped = []
    for c in cases:
        a = V.assess({**c, "family": "grocery", "lifecycle": "ACTIVE"}, healthy(), NOW)
        out = _publish(c, a)
        assert ("unit_price" not in out) == c["expect_dropped"], c["title"]
        if "unit_price" not in out:
            dropped.append(c["title"])
    assert len(dropped) == 19
    assert "COUNTRY'S BEST Schweinsplätzli" in dropped and "Kleenex Original Duo" in dropped
    assert not any(t.startswith("Denner ") for t in dropped)
    # Après publication, plus aucun prix au kilo > 1 000 CHF hors cosmétique.
    for c in cases:
        out = _publish(c, V.assess({**c, "family": "grocery"}, healthy(), NOW))
        if out.get("unit") in ("CHF/kg", "CHF/l") and out.get("unit_price", 0) > 1000:
            assert V.COSMETIC.search(f"{c['title']} {c.get('category', '')}"), c["title"]


# -- 5. Machine d'états, score, journal, réaffichage après 2 vérifications OK ---------------------------

def test_score_thresholds_and_upcoming():
    fresh = V.assess(deal(source_id="denner"), healthy(), NOW)
    assert fresh["state"] == "VERIFIED" and fresh["p"] >= 0.8
    stale_seen = deal(source_id="rappn", ends_at=None, last_seen_at=iso(NOW - dt.timedelta(days=12)),
                      first_seen_at=iso(NOW - dt.timedelta(days=20)))
    assert V.assess(stale_seen, healthy(), NOW)["state"] == "HIDDEN"
    up = V.assess(deal(starts_at=iso(NOW + dt.timedelta(days=1))), healthy(), NOW)
    assert up["state"] == "UPCOMING"
    assert V.assess(deal(ends_at=iso(NOW - dt.timedelta(minutes=1))), healthy(), NOW)["code"] == "T_EXPIRED"


def test_hidden_offer_needs_two_ok_verifications(tmp_path):
    store = UStore(tmp_path)
    d = deal(source_id="rappn", deal_id="rappn:1", ends_at=None, last_seen_at=iso(NOW - dt.timedelta(days=12)),
             first_seen_at=iso(NOW - dt.timedelta(days=20)))
    store.source_deals("rappn")["rappn:1"] = d
    journal = []
    V.transition(d, V.assess(d, healthy(), NOW), NOW, healthy(), journal)
    assert d["verify"]["state"] == "HIDDEN" and d["verify"]["ok_streak"] == 0
    # Revue une fois dans la liste source : score de nouveau bon, mais 1 seule vérification OK.
    t1 = NOW + dt.timedelta(hours=1)

    class C:
        id = "rappn"
    fresh = {k: v for k, v in d.items() if k not in ("verify", "first_seen_at", "last_seen_at", "missing_scans", "lifecycle")}
    apply(store, C, {"rappn:1": dict(fresh)}, "OK", t1)
    assert d["verify"]["ok_streak"] == 1
    a = V.transition(d, V.assess(d, healthy(last_success=iso(t1)), t1), t1, healthy(last_success=iso(t1)), journal)
    assert a["state"] == "HIDDEN"
    t2 = t1 + dt.timedelta(hours=1)
    apply(store, C, {"rappn:1": dict(fresh)}, "OK", t2)
    a = V.transition(d, V.assess(d, healthy(last_success=iso(t2)), t2), t2, healthy(last_success=iso(t2)), journal)
    assert a["state"] in ("VERIFIED", "UNCONFIRMED") and a["code"] == "REINSTATED" and "verify" not in d
    assert [(j["from"], j["to"], j["code"]) for j in journal] == [("LISTED", "HIDDEN", "SCORE"), ("HIDDEN", a["state"], "REINSTATED")]
    assert all(j["rule_version"] == V.RULE_VERSION for j in journal)


def test_listed_offers_and_publisher_end_dates_write_nothing():
    d, journal = deal(), []
    V.transition(d, V.assess(d, healthy(), NOW), NOW, healthy(), journal)
    ended = deal(ends_at=iso(NOW - dt.timedelta(hours=1)))
    a = V.transition(ended, V.assess(ended, healthy(), NOW), NOW, healthy(), journal)
    assert a["state"] == "ENDED" and a["since"] == ended["ends_at"]
    assert journal == [] and "verify" not in d and "verify" not in ended


def test_decisions_journal_is_appended(tmp_path):
    store = UStore(tmp_path)
    store.decisions.append({"at": iso(NOW), "deal_id": "lidl:1", "from": "LISTED", "to": "HIDDEN", "code": "X_SOURCE_STALE"})
    store.save()
    store.decisions.append({"at": iso(NOW), "deal_id": "lidl:2", "from": "LISTED", "to": "HIDDEN", "code": "X_SOURCE_STALE"})
    store.save()
    lines = (tmp_path / "universal" / "decisions" / "2026-11.ndjson").read_text().splitlines()
    assert [json.loads(x)["deal_id"] for x in lines] == ["lidl:1", "lidl:2"]


def test_export_fields():
    a = V.assess(deal(), healthy(consecutive_failures=4), NOW)
    out = V.export_fields(deal(), {**a, "since": iso(NOW)})
    assert out["state"] == "HIDDEN" and out["state_reason"] == "X_SOURCE_STALE" and out["state_since"] == iso(NOW)
    assert out["verified_at"] == iso(NOW - dt.timedelta(hours=1))   # dernier succès de la source
