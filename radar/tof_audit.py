"""Audit automatique quotidien du TOF (taux d'offres fausses), V2-C §3.1-3.2 (0 token LLM).

Méthode (celle de la mesure V2-C §1.1) :

1. Tirage aléatoire simple de N pages deal **réellement servies** (sitemap de radarsave.ch, ``/de/deal/``),
   graine = date du jour (reproductible). Le texte de la page servie est lu (prix, « ab », « Im Laden »,
   « statt »/« sonst », état affiché) et ``data-deal`` donne l'identifiant.
2. Chaque offre est comparée **en direct à sa source** par un contrôleur indépendant du parseur de
   production (aucun connecteur importé, regex propres) :
   Denner (API promotions, 5 drapeaux), Rappn (liste complète de la chaîne, 60 pages au plus),
   QoQa (API agents), Revendo (catalogue ``products.json`` ; 429 : ``Retry-After`` respecté puis abandon),
   Preispirat (page du post : « Abgelaufen », classe ``expired``), autres (page de l'offre : 404/410,
   redirection hors produit, prix dans le texte).
3. Verdict par offre : ``H`` (erreur dure : critères 1 existe, 2 prix, 5 lieu, 6 lien, 7 référence ;
   plus « en ligne seulement » affiché « Im Laden »), ``S`` (douce : « ab » manquant), ``OK``, ``U``
   (invérifiable : 403, 429, défi anti-robot, page JS — jamais contourné), ``SKIP`` (page « abgelaufen »).

Sortie : ``data/audit/AAAA-MM-JJ.json`` (verdicts) et ``data/audit/latest.json`` (jour + fenêtre de 7 jours) :
M1 = TOF dur sur tout le listé vérifiable, M2 = TOF dur sur les offres affichées comme revues à la source
(« an der Quelle gesehen », état VERIFIED), M_soft ; IC95 de Wilson et borne haute de Clopper-Pearson
(unilatérale 95 %, sur laquelle se juge le SLO).
"""
from __future__ import annotations

import datetime as dt
import html as _html
import json
import logging
import math
import random
import re
import time
from pathlib import Path
from urllib.parse import urlparse

log = logging.getLogger("radar.tof_audit")

SITE = "https://radarsave.ch"
FEED = "https://yorian-melki.github.io/denner-deal-radar/data/universal.json"
ABSENT_CHAINS = {"aligro"}          # aucune filiale à Saint-Gall (même liste que web/config/cities.ts)
RAPPN_MAX_PAGES = 60
REVENDO_MAX_PAGES = 40


def own_get(http, url: str):
    """GET sur NOTRE site ou notre flux (auto-audit) : robots.txt de radarsave.ch interdit les robots
    tiers, pas le propriétaire. Les sources tierces passent toujours par ``http.get`` (robots respecté)."""
    return http._raw("GET", url, allow_redirects=True)


# -- statistiques -------------------------------------------------------------------------------------

def wilson(x: int, n: int, z: float = 1.959964) -> tuple[float, float]:
    """Intervalle de Wilson à 95 % (bornes en proportion)."""
    if n == 0:
        return (0.0, 1.0)
    p = x / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, c - h), min(1.0, c + h))


def _binom_cdf(x: int, n: int, p: float) -> float:
    if p <= 0:
        return 1.0
    if p >= 1:
        return 1.0 if x >= n else 0.0
    lp, lq = math.log(p), math.log1p(-p)
    s = 0.0
    for k in range(x + 1):
        s += math.exp(math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1) + k * lp + (n - k) * lq)
    return min(1.0, s)


def cp_upper(x: int, n: int, alpha: float = 0.05) -> float:
    """Borne haute exacte de Clopper-Pearson (unilatérale, 1 − alpha) : P(X ≤ x ; n, p) = alpha."""
    if n == 0 or x >= n:
        return 1.0
    lo, hi = x / n, 1.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if _binom_cdf(x, n, mid) > alpha:
            lo = mid
        else:
            hi = mid
    return hi


def metric(x: int, n: int) -> dict:
    lo, hi = wilson(x, n)
    return {"x": x, "n": n, "rate": round(x / n, 4) if n else None, "wilson95": [round(lo, 4), round(hi, 4)],
            "cp_upper95": round(cp_upper(x, n), 4)}


def summarize(offers: list[dict]) -> dict:
    ver = [o for o in offers if o["verdict"] in ("OK", "S", "H")]
    shown_verified = [o for o in ver if o.get("shown_state") == "verified"]
    by_source: dict[str, dict] = {}
    for o in offers:
        b = by_source.setdefault(o.get("source") or "?", {"n": 0, "H": 0, "S": 0, "OK": 0, "U": 0, "SKIP": 0})
        b["n"] += 1
        b[o["verdict"]] = b.get(o["verdict"], 0) + 1
    causes: dict[str, int] = {}
    for o in offers:
        for c in o.get("failed") or []:
            causes[c] = causes.get(c, 0) + 1
    return {
        "sampled": len(offers), "verifiable": len(ver), "unverifiable": sum(o["verdict"] == "U" for o in offers),
        "skipped": sum(o["verdict"] == "SKIP" for o in offers),
        "M1": metric(sum(o["verdict"] == "H" for o in ver), len(ver)),
        "M2": metric(sum(o["verdict"] == "H" for o in shown_verified), len(shown_verified)),
        "M_soft": metric(sum(o["verdict"] == "S" for o in ver), len(ver)),
        "by_source": dict(sorted(by_source.items())),
        "causes": dict(sorted(causes.items())),
    }


# -- lecture de la page servie --------------------------------------------------------------------------

def _text(h: str) -> str:
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", h, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return _html.unescape(re.sub(r"\s+", " ", t)).strip()


def _num(s: str | None) -> float | None:
    if not s:
        return None
    s = s.replace("'", "").replace("’", "").replace(" ", "").replace(" ", "").replace(",", ".")
    s = re.sub(r"\.[-–]$", "", s)
    m = re.search(r"\d+(?:\.\d{1,2})?", s)
    return float(m.group(0)) if m else None


def read_page(h: str) -> dict:
    """Ce que la page deal servie PROMET : prix, « ab », « Im Laden », référence, état affiché."""
    m = re.search(r'data-deal="([^"]+)"', h)
    out: dict = {"deal_id": _html.unescape(m.group(1)) if m else None,
                 "ended": bool(re.search(r'<article class="deal deal-ended', h))}
    art = re.search(r'<article class="deal[^"]*".*?</section>', h, re.S)
    t = _text(art.group(0)) if art else _text(h)[:3000]
    out["text"] = t[:600]
    for ld in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        try:
            j = json.loads(ld)
        except ValueError:
            continue
        off = j.get("offers") if isinstance(j, dict) else None
        if isinstance(off, dict):
            out["price"] = _num(str(off.get("price") or off.get("lowPrice") or ""))
            out["from"] = off.get("@type") == "AggregateOffer"
    if out.get("price") is None:
        pm = re.search(r"CHF\s*([\d'’.,]+)", t)
        out["price"] = _num(pm.group(1)) if pm else (0.0 if re.search(r"\bGratis\b", t) else None)
    out["from"] = bool(out.get("from")) or bool(re.search(r"\bab\s+CHF\s*\d", t))
    out["in_store"] = "Im Laden bei" in t
    rm = re.search(r"\b(?:statt|sonst)\s+(?:CHF\s*)?(\d[\d'’]*(?:[.,]\d{1,2})?)", t)
    out["ref"] = _num(rm.group(1)) if rm else None
    if 'data-state="unconfirmed"' in h or "unbestätigt" in t:
        out["shown_state"] = "unconfirmed"
    elif 'data-state="seen"' in h:
        out["shown_state"] = "verified"
    return out


# -- contrôleurs par source (indépendants des connecteurs) ----------------------------------------------

def price_close(a: float | None, b: float | None) -> bool:
    """Critère 2 de V2-C §3.1 : écart ≤ max(2 %, 0.05 CHF)."""
    if a is None or b is None:
        return False
    return abs(a - b) <= max(0.02 * b, 0.05)


def _price_variants(p: float) -> list[str]:
    v = [f"{p:.2f}", f"{p:.2f}".replace(".", ",")]
    if abs(p - round(p)) < 0.005:
        n = int(round(p))
        v += [f"{n}.–", f"{n}.-", f"{n},–", f"{n}.00", f"CHF {n}", f"{n} CHF", f"{n} Franken", f"Fr. {n}"]
    return v


def price_in_text(p: float | None, text: str) -> bool | None:
    if p is None:
        return None
    flat = re.sub(r"(?<=\d)['’](?=\d)", "", text)
    return any(s in flat for s in _price_variants(p))


PP_EXPIRED = re.compile(r'class="days_left"[^>]*>(?:\s*<i[^>]*>\s*</i>)?\s*Abgelaufen'
                        r'|<article[^>]*class="[^"]*\bpost-inner\b[^"]*\bexpired\b', re.I)


class Auditor:
    def __init__(self, http, now: dt.datetime):
        self.http, self.now = http, now
        self._denner: dict | None = None
        self._rappn: dict[str, dict] = {}
        self._qoqa: dict | None = None
        self._revendo: dict | None = None

    def denner(self) -> dict:
        """API publique des promotions Denner, 5 drapeaux, toutes les pages."""
        if self._denner is None:
            arts: dict[str, list] = {}
            try:
                for flag in ("promo_current_week", "promo_next_week", "weekend_highlight", "weekend_highlight_next_week",
                             "start_of_the_week_highlight"):
                    page = 1
                    while page <= 10:
                        d = self.http.post_json("https://www.denner.ch/nuxt-api/promotions",
                                                {"lang": "de", "promoFlag": flag, "facetName": None, "facetValue": None,
                                                 "page": page, "hitsPerPage": 100, "sort": None, "includeHighlights": False},
                                                referer="https://www.denner.ch/de/aktionen/aktuelle-aktionen")
                        for it in d.get("items", []):
                            for a in it.get("attributeInfo") or [it]:
                                arts.setdefault(str(a.get("articleId")), []).append(
                                    {"price": a.get("price"), "to": a.get("promotionTo")})
                        if page * 100 >= (d.get("stats") or {}).get("totalResults", 0):
                            break
                        page += 1
            except Exception as e:  # noqa: BLE001
                log.warning("denner : %s", e)
                arts = {"__error__": str(e)[:120]}
            self._denner = arts
        return self._denner

    def rappn_chain(self, chain: str) -> dict:
        """Liste complète d'une chaîne pour SG (V2-C : Coop 10 pages, Otto's ≥ 60)."""
        if chain not in self._rappn:
            cards, page, complete, err = {}, 1, False, None
            while page <= RAPPN_MAX_PAGES:
                url = f"https://rappn.ch/de/aktionen/{chain}/k/sg" + (f"/page/{page}" if page > 1 else "")
                try:
                    h = self.http.get(url, headers={"Accept": "text/html"}).text
                except Exception as e:  # noqa: BLE001
                    err = type(e).__name__
                    break
                for uuid, blk in re.findall(r'<article class="group oc-card[^"]*" id="offer=([0-9a-f-]+)">(.*?)</article>', h, re.S):
                    now_m = re.search(r'class="oc-now[^"]*">(.*?)</span>\s*(?:</span>|</p>|<span class="oc-was)', blk, re.S)
                    was = re.search(r"<s>(.*?)</s>", blk, re.S)
                    cards[uuid] = {"price": _num(_text(now_m.group(1)).replace("CHF", "")) if now_m else None,
                                   "was": _num(_text(was.group(1))) if was else None,
                                   "online": bool(re.search(r"Nur\s+online", blk, re.I))}
                if f'href="/de/aktionen/{chain}/k/sg/page/{page + 1}"' not in h:
                    complete = True
                    break
                page += 1
            self._rappn[chain] = {"cards": cards, "complete": complete, "pages": page, "error": err}
        return self._rappn[chain]

    def qoqa(self) -> dict:
        if self._qoqa is None:
            try:
                d = self.http.get("https://api.qoqa.ch/v2/agents/offers?locale=de", headers={"Accept": "application/json"}).json()
                self._qoqa = {str(o["id"]): o for o in d.get("offers") or []}
            except Exception as e:  # noqa: BLE001
                self._qoqa = {"__error__": str(e)[:120]}
        return self._qoqa

    def revendo(self) -> dict:
        """Catalogue complet (la page produit répond 429, V2-C §1.4). 429 → Retry-After respecté (≤ 90 s,
        2 essais, radar/http.py), puis abandon : offres Revendo « U », jamais de contournement."""
        if self._revendo is None:
            prods: dict = {}
            try:
                for page in range(1, REVENDO_MAX_PAGES + 1):
                    d = self.http.get(f"https://www.revendo.ch/products.json?limit=250&page={page}",
                                      headers={"Accept": "application/json"}).json()
                    items = d.get("products") or []
                    if not items:
                        break
                    for p in items:
                        prods[p.get("handle")] = {str(v.get("id")): {"price": _num(str(v.get("price"))),
                                                                     "available": v.get("available")}
                                                  for v in p.get("variants") or []}
            except Exception as e:  # noqa: BLE001
                prods = {"__error__": f"{type(e).__name__}: {e}"[:120]}
            self._revendo = prods
        return self._revendo

    def fetch(self, url: str, own: bool = False):
        """(status, texte, url finale, html) ; status None si invérifiable (robots, réseau)."""
        import requests
        from .http import HostUnavailable, RobotsDisallowed
        try:
            r = own_get(self.http, url) if own else self.http.get(url, allow_redirects=True)
            return r.status_code, _text(r.text), r.url, r.text
        except RobotsDisallowed:
            return None, "robots", url, ""
        except HostUnavailable:
            return None, "hôte injoignable", url, ""
        except requests.HTTPError as e:
            return getattr(e.response, "status_code", None), "", url, ""
        except Exception as e:  # noqa: BLE001
            return None, type(e).__name__, url, ""

    def check(self, page: dict, feed: dict | None) -> dict:
        o = {"deal_id": page.get("deal_id"), "source": (feed or {}).get("source_id"), "shown_price": page.get("price"),
             "shown_from": page.get("from"), "shown_in_store": page.get("in_store"), "shown_ref": page.get("ref"),
             "shown_state": page.get("shown_state") or {"VERIFIED": "verified", "UNCONFIRMED": "unconfirmed"}
             .get((feed or {}).get("state") or "", "?"), "feed_state": (feed or {}).get("state")}
        if page.get("ended"):
            return {**o, "verdict": "SKIP", "note": "page « abgelaufen » (non listée)"}
        if not feed:
            return {**o, "verdict": "U", "note": "deal absent du flux publié"}
        failed, soft, note = [], [], ""
        sid, price = feed["source_id"], page.get("price")
        if str(feed.get("merchant") or "").strip().lower() in ABSENT_CHAINS and page.get("in_store"):
            failed.append("location")
        if sid == "denner":
            arts = self.denner()
            if "__error__" in arts:
                return {**o, "verdict": "U", "note": f"API Denner : {arts['__error__']}"}
            aid = (re.search(r"dn-(\d+)", feed["deal_id"]) or [None, None])[1]
            hits = arts.get(str(aid)) or []
            if not hits:
                failed.append("exists")
            elif price is not None and not any(price_close(price, h.get("price")) for h in hits):
                failed.append("price")
            note = f"API : {[h.get('price') for h in hits][:3]}"
        elif sid == "rappn":
            chain = (re.search(r"aktionen/([a-z0-9-]+)/k/", feed.get("source_url") or "") or [None, None])[1]
            uuid = feed["deal_id"].split(":", 1)[1]
            lst = self.rappn_chain(chain) if chain else {"cards": {}, "complete": False, "error": "chaîne inconnue"}
            card = lst["cards"].get(uuid)
            if card is None:
                if not lst["complete"]:
                    return {**o, "verdict": "U", "note": f"liste {chain} non lue en entier ({lst.get('error') or 'plafond'})"}
                failed.append("exists")
                note = f"absente des {lst['pages']} pages {chain}"
            else:
                if price is not None and card["price"] is not None and not price_close(price, card["price"]):
                    failed.append("price")
                if card["online"] and page.get("in_store"):
                    failed.append("online")
                if page.get("ref") is not None and not price_close(page["ref"], card["was"]):
                    failed.append("reference")
                note = f"carte : {card['price']} statt {card['was']}{' · Nur online' if card['online'] else ''}"
        elif sid == "qoqa":
            offers = self.qoqa()
            if "__error__" in offers:
                return {**o, "verdict": "U", "note": "API QoQa"}
            q = offers.get(feed["deal_id"].split(":", 1)[1])
            if q is None or q.get("is_sold_out") is True or q.get("remaining_stock_percent") == 0:
                failed.append("exists")
            else:
                lo, hi = _num(str(q.get("price_range_min"))), _num(str(q.get("price_range_max")))
                if price is not None and lo is not None and not price_close(price, lo):
                    failed.append("price")
                if lo is not None and hi is not None and hi > lo + 0.005 and not page.get("from"):
                    soft.append("from_price")
                note = f"API : {lo}–{hi}"
        elif sid == "revendo":
            cat = self.revendo()
            if "__error__" in cat:
                return {**o, "verdict": "U", "note": f"catalogue Revendo : {cat['__error__']}"}
            u = urlparse(feed.get("source_url") or feed.get("offer_url") or "")
            handle = (re.search(r"/products/([^/?#]+)", u.path) or [None, None])[1]
            var = (re.search(r"variant=(\d+)", u.query) or [None, None])[1]
            variants = cat.get(handle)
            v = (variants or {}).get(var) if var else None
            if variants is None or (var and v is None) or (v and v.get("available") is False):
                failed.append("exists")
            elif v and price is not None and not price_close(price, v["price"]):
                failed.append("price")
            note = f"catalogue : {v}"
        else:
            src = feed.get("source_url")
            url = (src if sid in ("preispirat", "migros") else feed.get("offer_url")) or src or feed.get("offer_url")
            status, text, final, raw = self.fetch(url)
            if status in (404, 410):
                failed.append("exists" if url == src else "link")
            elif status != 200:
                return {**o, "verdict": "U", "note": f"{url[:80]} → {status or text}"}
            else:
                ids = re.findall(r"\d{5,}", urlparse(url).path)
                if ids and final != url and not any(i in final for i in ids):
                    failed.append("exists" if url == src else "link")
                elif sid == "preispirat" and PP_EXPIRED.search(raw):
                    failed.append("exists")
                else:
                    hit = price_in_text(price, text)
                    note = "prix lu sur la page" if hit else "prix non trouvé dans le texte (non contrôlé)"
                    o["price_checked"] = bool(hit)
        verdict = "H" if failed else "S" if soft else "OK"
        return {**o, "verdict": verdict, "failed": failed + soft, "note": note[:200]}


# -- exécution -----------------------------------------------------------------------------------------

def sitemap_deals(http, site: str = SITE) -> list[str]:
    h = own_get(http, f"{site}/sitemap.xml").text
    locs = re.findall(r"<loc>([^<]+)</loc>", h)
    for s in [u for u in locs if u.endswith(".xml")]:
        locs += re.findall(r"<loc>([^<]+)</loc>", own_get(http, s).text)
    return sorted({u for u in locs if "/de/deal/" in u})


def run(http, now: dt.datetime, n: int = 100, seed: str | None = None, site: str = SITE, feed_url: str = FEED) -> dict:
    urls = sitemap_deals(http, site)
    seed = seed or now.date().isoformat()
    sample = random.Random(seed).sample(urls, min(n, len(urls)))
    feed = {d["deal_id"]: d for d in own_get(http, feed_url).json().get("deals", [])}
    aud = Auditor(http, now)
    offers = []
    t0 = time.monotonic()
    for u in sample:
        st, _, _, raw = aud.fetch(u, own=True)
        if st != 200:
            offers.append({"url": u, "verdict": "U", "note": f"page servie {st}"})
            continue
        page = read_page(raw)
        o = aud.check(page, feed.get(page.get("deal_id") or ""))
        o["url"] = u
        offers.append(o)
        log.info("%-4s %-12s %s", o["verdict"], o.get("source"), u)
    return {"generated_at": now.replace(microsecond=0).isoformat(), "method": "V2-C §1.1 (pages servies, source en direct)",
            "site": site, "seed": seed, "population": len(urls), "elapsed_s": round(time.monotonic() - t0),
            "summary": summarize(offers), "offers": offers}


def write(report: dict, out: Path, now: dt.datetime) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    day = out / f"{now.date().isoformat()}.json"
    day.write_text(json.dumps(report, ensure_ascii=False, indent=1), "utf-8")
    # Fenêtre glissante de 7 jours (SLO jugé sur la borne haute, V2-C §3.1).
    offers: list[dict] = []
    for f in sorted(out.glob("20??-??-??.json")):
        if f.stem >= (now.date() - dt.timedelta(days=6)).isoformat():
            offers += json.loads(f.read_text("utf-8")).get("offers", [])
    latest = {"generated_at": report["generated_at"], "day": report["summary"], "rolling_7d": summarize(offers),
              "slo": {"M1_max": 0.03, "M2_max": 0.015, "judged_on": "cp_upper95"}}
    (out / "latest.json").write_text(json.dumps(latest, ensure_ascii=False, indent=1), "utf-8")
    return day


def cmd_audit(args) -> int:
    from .cli import _http
    from .config import load
    cfg = load()
    now = dt.datetime.now(cfg.tz)
    http = _http(cfg)
    http.retries = 2          # 429 : deux attentes « Retry-After » au plus, puis U
    report = run(http, now, n=args.n, seed=args.seed, site=args.site, feed_url=args.feed)
    path = write(report, Path(args.out), now)
    s = report["summary"]
    print(json.dumps({k: s[k] for k in ("sampled", "verifiable", "unverifiable", "M1", "M2", "M_soft", "causes")}, ensure_ascii=False))
    print("audit écrit dans", path)
    return 0


def register(sub) -> None:
    p = sub.add_parser("audit", help="audit quotidien du TOF sur les pages servies (V2-C)")
    p.add_argument("--n", type=int, default=100)
    p.add_argument("--seed")
    p.add_argument("--site", default=SITE)
    p.add_argument("--feed", default=FEED)
    p.add_argument("--out", default="data/audit")
    p.set_defaults(fn=cmd_audit)
