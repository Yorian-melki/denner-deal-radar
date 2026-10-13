from radar import stores as S

FOUND = {
    "s1145081": {"id": "s1145081", "zip": "9008", "city": "St. Gallen", "address": "Langgasse 26", "scope": "city"},
    "s1145891": {"id": "s1145891", "zip": "9300", "city": "Wittenbach", "address": "Oedenhofstrasse 1c", "scope": "neighbour"},
}


def test_in_city():
    assert S.in_city({"zip": "9016", "city": "St.Gallen"})
    assert not S.in_city({"zip": "9300", "city": "Wittenbach"})
    assert not S.in_city({"zip": "9200", "city": "Gossau SG"})


def test_reconcile_detects_changes_and_neighbours_disabled():
    known = {}
    assert S.reconcile(known, dict(FOUND), "t0") == []          # initialisation silencieuse
    assert S.enabled_ids(known) == ["s1145081"]                   # voisins désactivés par défaut
    moved = {k: dict(v) for k, v in FOUND.items()}
    moved["s1145081"]["address"] = "Langgasse 30"
    moved["s9999999"] = {"id": "s9999999", "zip": "9000", "city": "St. Gallen", "address": "Neu 1", "scope": "city"}
    del moved["s1145891"]
    ch = {c["type"] for c in S.reconcile(known, moved, "t1")}
    assert ch == {"store_address_changed", "store_opened", "store_closed"}
    assert "s9999999" in S.enabled_ids(known)


def test_no_closure_when_sources_incomplete():
    known = {}
    S.reconcile(known, dict(FOUND), "t0")
    ch = S.reconcile(known, {}, "t1", complete=False)
    assert not [c for c in ch if c["type"] == "store_closed"]


def test_decode_nuxt():
    html = '<script type="application/json" id="__NUXT_DATA__">[{"data":1},{"x":2},["Reactive",3],{"hits":4},[5],"ok"]</script>'
    assert S.decode_nuxt(html) == {"data": {"x": {"hits": ["ok"]}}}
