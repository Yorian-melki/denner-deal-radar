import datetime as dt

from radar.core import verify

CARD = '<article class="group oc-card x" id="offer={}">c</article>'


class R:
    def __init__(self, text, code=200):
        self.text, self.status_code = text, code


class Http:
    def __init__(self, pages):
        self.pages, self.calls = pages, []

    def get(self, url, **kw):
        self.calls.append(url)
        return R(self.pages[url])


class Store:
    def __init__(self, deals):
        self.deals = deals

    def source_deals(self, sid):
        return self.deals if sid == "rappn" else {}


def _deal(uuid, chain="ottos"):
    return {"deal_id": f"rappn:{uuid}", "lifecycle": "ACTIVE",
            "source_url": f"https://rappn.ch/de/aktionen/{chain}/k/sg#offer={uuid}"}


def _pages():
    base = "https://rappn.ch/de/aktionen/ottos/k/sg"
    return {base: CARD.format("aaa") + 'href="/de/aktionen/ottos/k/sg/page/2"',
            base + "/page/2": CARD.format("bbb")}


def test_list_check_marks_absent_offer_gone_and_present_ok():
    now = dt.datetime(2026, 11, 15, 15, tzinfo=dt.timezone.utc)
    deals = {"rappn:aaa": _deal("aaa"), "rappn:bbb": _deal("bbb"), "rappn:zzz": _deal("zzz")}
    http = Http(_pages())
    st = verify.run_list_checks(Store(deals), http, now)
    assert len(http.calls) == 2  # une seule lecture de la chaîne pour 3 deals
    assert st["checked"] == 3 and st["gone"] == 1
    assert deals["rappn:zzz"]["verify"]["checks"][-1]["http"] == 404
    assert deals["rappn:bbb"]["verify"]["checks"][-1]["http"] == 200
    state, code = verify._check_rules(deals["rappn:zzz"]["verify"]["checks"])
    assert state == "SUSPECT"
    # 2e absence ≥ 1 h plus tard → finie
    verify.run_list_checks(Store(deals), Http(_pages()), now + dt.timedelta(hours=2))
    assert verify._check_rules(deals["rappn:zzz"]["verify"]["checks"]) == ("ENDED", "T_GONE_404")


def test_incomplete_list_is_inconclusive():
    now = dt.datetime(2026, 11, 15, 15, tzinfo=dt.timezone.utc)
    deals = {"rappn:zzz": _deal("zzz")}
    pages = _pages()
    pages["https://rappn.ch/de/aktionen/ottos/k/sg/page/2"] = R("", 503).text
    http = Http(pages)
    http.get = lambda url, **kw: R(pages[url], 503 if url.endswith("/2") else 200)
    st = verify.run_list_checks(Store(deals), http, now)
    assert st["inconclusive"] == 1 and st["gone"] == 0
