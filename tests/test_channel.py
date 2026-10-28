"""Distribution publique : canal Telegram + kit de partage (aucun appel réseau)."""
import argparse
import datetime as dt
import json
import shutil
import subprocess
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from radar import channel as C

TZ = ZoneInfo("Europe/Zurich")
ROOT = Path(__file__).resolve().parent.parent
CCFG = C.load_config(ROOT)
CITY = {**CCFG["cities"]["st-gallen"], "slug": "st-gallen"}
SITE = ("Test Radar", "https://example.test")


def at(h, m=0, day=28):
    return dt.datetime(2026, 10, day, h, m, tzinfo=TZ)


def deal(i, score=7.0, **kw):
    d = {"deal_id": f"src{i}:{i}", "source_id": f"src{i}", "title": f"Produit {i}", "family": "retail",
         "deal_score": score, "score_confidence": 0.8, "current_price": 20.0, "reference_price": 50.0,
         "reference_price_type": "merchant_previous", "effective_discount": 60.0, "lifecycle": "ACTIVE",
         "geographic_scope_resolved": "ONLINE", "source_url": f"https://shop.example/{i}",
         "ends_at": "2026-10-30T23:59:00+01:00", "canonical_entity_id": f"sku:x:{i}",
         "score_components": [["réduction vs ancien prix marchand : 60 %", score]]}
    d.update(kw)
    return d


# -- slug : parité avec web/lib/project.ts ---------------------------------

# Valeurs calculées avec dealSlug() de web/lib/project.ts (Node).
PARITY = [
    ("denner:dn-1024368-week-20261022", "Vanish Oxi Action Fleckentferner Pulver",
     "vanish-oxi-action-fleckentferner-pulver-1s4dfsp"),
    ("unidays:a6bfe5cd-2ef5-468d-a81e-d3a550e5b896", "ExpressVPN: 82% Rabatt auf ein 24-Monats-Abo + 4 Monate extra",
     "expressvpn-82-rabatt-auf-ein-24-monats-abo-4-monate-extra-19g9nkg"),
    ("a:1", "Crème brûlée à l'Île-de-France — Größe XL", "creme-brulee-a-l-ile-de-france-gro-e-xl-1oywwh5"),
    ("x:ü€😀", "😀😀", "deal-nfm1m"),
    ("", "", "deal-ztntfp"),
    ("rappn:c171f844", "Äpfel Kissabel vv süss-säuerlich IP-Suisse · 1kg very long title that goes way beyond "
     "sixty characters for sure", "apfel-kissabel-vv-suss-sauerlich-ip-suisse-1kg-very-long-tit-ursr6m"),
]


@pytest.mark.parametrize("deal_id,title,expected", PARITY)
def test_slug_parity_with_web(deal_id, title, expected):
    assert C.deal_slug(deal_id, title) == expected


@pytest.mark.skipif(not shutil.which("node"), reason="node absent")
def test_slug_parity_live_against_typescript(tmp_path):
    """Si Node est disponible : exécute les fonctions TS réelles (anti-dérive)."""
    src = (ROOT / "web" / "lib" / "project.ts").read_text("utf-8")

    def grab(name):
        i = src.index("export function " + name)
        return src[i + 7: src.index("\n}\n", i) + 3]
    code = (grab("slugify") + grab("shortHash")).replace("(s: string, max = 60): string", "(s, max = 60)") \
        .replace("(s: string): string", "(s)")
    cases = json.dumps([[i, t] for i, t, _ in PARITY])
    js = code + f"\nconsole.log(JSON.stringify({cases}.map(([i,t]) => `${{slugify(t)||'deal'}}-${{shortHash(i)}}`)));"
    (tmp_path / "p.js").write_text(js, "utf-8")
    out = json.loads(subprocess.run(["node", str(tmp_path / "p.js")], capture_output=True, text=True, check=True).stdout)
    assert out == [C.deal_slug(i, t) for i, t, _ in PARITY]


# -- formatage --------------------------------------------------------------

def test_instant_message_contents():
    d = deal(1, score=8.9, title="Kaffee <Bohnen> & Co")
    txt = C.format_instant(d, CITY, SITE, CCFG, at(12))
    assert "Kaffee &lt;Bohnen&gt; &amp; Co" in txt
    assert "CHF 20.– · vorher CHF 50.– (−60 %)" in txt
    assert "8.9/10" in txt
    assert "gültig bis Fr 30.10." in txt
    assert "Warum: 60 % unter dem früheren Preis" in txt
    assert f"https://example.test/deal/{C.deal_slug(d['deal_id'], d['title'])}" in txt
    assert "Test Radar" in txt
    for hype in ("nur heute", "schnell", "jetzt zuschlagen", "letzte chance", "!!"):
        assert hype not in txt.lower()


def test_link_falls_back_to_source_without_site_url():
    d = deal(1)
    assert C.deal_link(d, "", CCFG) == "https://shop.example/1"
    # Note < 5 : pas de page publique sur le site -> lien vers l'offre.
    assert C.deal_link(deal(2, score=4.0), "https://example.test", CCFG) == "https://shop.example/2"


def test_site_info_from_env(monkeypatch):
    monkeypatch.delenv("SITE_NAME", raising=False)
    monkeypatch.delenv("SITE_URL", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_SITE_NAME", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_SITE_URL", raising=False)
    assert C.site_info(CCFG) == ("Deal Radar", "")
    monkeypatch.setenv("SITE_NAME", "Spar Radar")
    monkeypatch.setenv("SITE_URL", "https://spar.example/")
    assert C.site_info(CCFG) == ("Spar Radar", "https://spar.example")


def test_price_wording_is_honest():
    assert "UVP CHF 50.–" in C.price_line(deal(1, reference_price_type="msrp"), "de")
    assert "kein Vergleichspreis" in C.price_line(deal(1, reference_price=None, effective_discount=None), "de")
    assert "Rabatt laut Anbieter" in C.price_line(deal(1, current_price=None, reference_price=None), "de")
    assert C.price_line(deal(1, current_price=0.0, family="free", reference_price=None), "fr") == "Gratuit"
    student = C.format_instant(deal(1, score=9, requires_student=True), CITY, SITE, CCFG, at(12))
    assert "nur für Studierende" in student
    assert "voraussichtlich gültig bis" in C.format_instant(deal(1, score=9, ends_inferred=True), CITY, SITE, CCFG, at(12))


def test_daily_message_lists_top():
    top = [deal(1, 8.0), deal(2, 7.5), deal(3, 7.0)]
    txt = C.format_daily(top, CITY, SITE, CCFG, at(18))
    assert "Top 3 des Tages · St. Gallen" in txt
    assert txt.index("Produit 1") < txt.index("Produit 2") < txt.index("Produit 3")
    assert "https://example.test/st-gallen" in txt


# -- sélection --------------------------------------------------------------

def test_selection_filters():
    now = at(12)
    bad = [deal(1, lifecycle="EXPIRED"), deal(2, duplicate_of="x"), deal(3, ends_at="2026-10-27T10:00:00+01:00"),
           deal(4, starts_at="2026-10-29T00:00:00+01:00"), deal(5, score_confidence=0.2), deal(6, deal_score=None),
           deal(7, family="grocery", effective_discount=95.0),  # invraisemblable (erreur de parsing probable)
           deal(8, source_url=None)]
    assert C.select_top(bad, now, CITY, CCFG) == []
    other = {"name": "Zürich", "country": "CH", "lang": "de", "local": False, "slug": "zuerich"}
    local = deal(9, geographic_scope_resolved="LOCAL")
    assert C.select_top([local], now, CITY, CCFG) == [local]
    assert C.select_top([local], now, other, CCFG) == []


def test_top_diversity_and_order():
    deals = [deal(1, 8.0), deal(2, 9.0), deal(3, 6.5), {**deal(4, 8.5), "source_id": "src2"}, deal(5, 5.0)]
    top = C.select_top(deals, at(18), CITY, CCFG)
    assert [d["deal_id"] for d in top] == ["src2:2", "src1:1", "src3:3"]   # 1 par source, note >= 6


# -- heures calmes ------------------------------------------------------------

@pytest.mark.parametrize("h,m,quiet", [(22, 0, True), (23, 30, True), (3, 0, True), (7, 29, True),
                                       (7, 30, False), (12, 0, False), (21, 59, False)])
def test_quiet_hours(h, m, quiet):
    assert C.in_quiet_hours(at(h, m), CCFG) is quiet


def test_nothing_posted_in_quiet_hours():
    cs, sent = C.city_state({}, "st-gallen"), []
    rep = C.run([deal(1, 9.5)], CITY, CCFG, cs, at(23), lambda t, p: sent.append(t), SITE)
    assert sent == [] and rep["reason"] == "heures calmes" and cs["posted"] == {}


# -- anti-spam ----------------------------------------------------------------

def test_instant_cap_gap_and_no_repost():
    deals = [deal(i, 9.0 - i * 0.01) for i in range(1, 7)]
    cs, sent = C.city_state({}, "st-gallen"), []

    def send(t, p):
        sent.append(t)
    C.run(deals, CITY, CCFG, cs, at(8), send, SITE, mode="instant")
    C.run(deals, CITY, CCFG, cs, at(8, 30), send, SITE, mode="instant")    # < 60 min : rien
    assert len(sent) == 1
    for h in (10, 12, 14, 16):
        C.run(deals, CITY, CCFG, cs, at(h), send, SITE, mode="instant")
    assert len(sent) == CCFG["max_instant_per_day"] == 3
    ids = [k for k in cs["posted"] if not k.startswith("e:")]
    assert len(ids) == len(set(ids)) == 3
    # Lendemain : nouveaux posts, jamais les mêmes deals.
    C.run(deals, CITY, CCFG, cs, at(10, day=29), send, SITE, mode="instant")
    assert len(sent) == 4 and "Produit 4" in sent[-1]


def test_same_entity_never_reposted():
    cs, sent = C.city_state({}, "st-gallen"), []
    a = deal(1, 9.0, canonical_entity_id="gtin:123")
    b = {**deal(2, 9.0), "canonical_entity_id": "gtin:123"}   # même produit, autre source
    C.run([a], CITY, CCFG, cs, at(8), lambda t, p: sent.append(t), SITE, mode="instant")
    C.run([b], CITY, CCFG, cs, at(12), lambda t, p: sent.append(t), SITE, mode="instant")
    assert len(sent) == 1


def test_daily_once_per_day_in_window_and_excludes_instant():
    deals = [deal(1, 9.0), deal(2, 8.0), deal(3, 7.0), deal(4, 6.5)]
    cs, sent = C.city_state({}, "st-gallen"), []

    def send(t, p):
        sent.append((t, p))
    C.run(deals, CITY, CCFG, cs, at(17, 30), send, SITE)      # instantané (9.0), pas encore de Top
    assert len(sent) == 1 and sent[0][1] is True
    C.run(deals, CITY, CCFG, cs, at(18, 5), send, SITE)       # Top du jour
    C.run(deals, CITY, CCFG, cs, at(18, 35), send, SITE)      # déjà fait
    daily = [t for t, p in sent if not p]
    assert len(daily) == 1
    assert "Produit 1" not in daily[0] and "Produit 2" in daily[0] and "Produit 4" in daily[0]


def test_failed_send_does_not_mark_posted():
    cs = C.city_state({}, "st-gallen")

    def boom(t, p):
        raise RuntimeError("Telegram 500")
    with pytest.raises(RuntimeError):
        C.run([deal(1, 9.0)], CITY, CCFG, cs, at(12), boom, SITE, mode="instant")
    assert cs["posted"] == {}


# -- commande : désactivée sans canal, dry-run sans écriture -----------------

def _args(**kw):
    base = dict(dry_run=False, send=False, city=None, mode="auto", state=None, now="2026-10-28T18:05:00")
    base.update(kw)
    return argparse.Namespace(**base)


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("RADAR_DATA_DIR", str(tmp_path))
    for k in ("TELEGRAM_CHANNEL_ID", "TELEGRAM_BOT_TOKEN", "SITE_URL", "SITE_NAME"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(C, "load_deals", lambda cfg, now: [deal(1, 9.0), deal(2, 7.0)])

    def no_network(*a, **k):
        raise AssertionError("aucun appel réseau attendu")
    monkeypatch.setattr(C, "telegram_post", no_network)
    return tmp_path


def test_send_without_channel_is_noop(env, monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "x")
    assert C.cmd_channel(_args(send=True)) == 0
    assert not (env / "universal" / "channel_state.json").exists()


def test_dry_run_prints_and_never_writes_state(env, capsys):
    assert C.cmd_channel(_args(dry_run=True)) == 0
    out = capsys.readouterr().out
    assert "DRY-RUN canal st-gallen" in out and "Produit 1" in out
    assert not (env / "universal" / "channel_state.json").exists()


def test_send_records_state(env, monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "x")
    monkeypatch.setenv("TELEGRAM_CHANNEL_ID", "@test")
    posts = []
    monkeypatch.setattr(C, "telegram_post", lambda tok, chat, text, preview: posts.append(chat))
    assert C.cmd_channel(_args(send=True)) == 0
    st = json.loads((env / "universal" / "channel_state.json").read_text("utf-8"))
    assert posts == ["@test", "@test"]
    assert "src1:1" in st["cities"]["st-gallen"]["posted"] and st["cities"]["st-gallen"]["days"]["2026-10-28"]["daily"]


def test_sharekit_three_languages(env):
    assert C.cmd_sharekit(argparse.Namespace(city=None, out_dir=None, now="2026-10-28T18:00:00")) == 0
    md = (env / "universal" / "sharekit" / "2026-10-28.md").read_text("utf-8")
    for s in ("## Deutsch", "## Français", "## English", "### WhatsApp", "### Telegram", "### Instagram",
              "Top 2 des Tages", "Top 2 du jour", "Top 2 of the day", "*Produit 1*", "**Produit 1**",
              "Link in der Bio"):
        assert s in md, s
