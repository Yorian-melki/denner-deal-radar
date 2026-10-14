"""dschungelkompass.ch — « Aktionen » abonnements mobiles et internet (Suisse).

Pages (HTML JSF/PrimeFaces, rendu serveur, 2 requêtes) :
  /mobile/handy-abo-vergleich/handy-abo-aktionen.xhtml   (50 cartes affichées / « 54 Ergebnisse »)
  /internet/aktionen.xhtml                                (« 35 Angebote »)
Les ~4 cartes au-delà de la première page ne s'obtiennent que par un POST
PrimeFaces : non utilisé -> état PARTIAL si le total annoncé dépasse les cartes.

Par carte : prix mensuel promo, prix normal (dk-abo__old), texte « Aktion … »
(durée, prix après promo, date de fin), frais d'activation, durée minimale.
« dk-abo__new » est le coût mensuel MOYEN calculé par le site sur 24 mois :
il n'est utilisé comme prix promo que si le texte de l'action n'en donne pas.
Dates « Aktion bis » VALIDÉES : le site contient des coquilles (15.19.2026,
31.11.2026) -> date ignorée, jamais devinée.

robots.txt : 404 (aucune restriction, RFC 9309, géré par radar/http.py).
"""
from __future__ import annotations

import datetime as dt
import html as _html
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal, slug
from . import register
from ._util import text

BASE = "https://www.dschungelkompass.ch"
PAGES = {"mobile": BASE + "/mobile/handy-abo-vergleich/handy-abo-aktionen.xhtml",
         "internet": BASE + "/internet/aktionen.xhtml"}
_N = r"(\d+(?:\.\d{1,2})?)(?:\.-|-)?"          # « 39.- », « 25.-, », « 9.90 »
WORDS = {"einen": 1, "einem": 1, "zwei": 2, "drei": 3, "vier": 4, "fünf": 5, "sechs": 6, "zwölf": 12}
YOUTH_RE = re.compile(r"\b(jugend\w*|young|youth|u\s?2[5-9]|u30|unter\s+(?:2[5-9]|30)|bis\s+(?:2[5-9]|30)\s*(?:j|jahre))", re.I)
STUDENT_RE = re.compile(r"\b(student\w*|studierend\w*|studi)\b", re.I)


def _f(x) -> float | None:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def valid_date(d: int, m: int, y: int) -> dt.date | None:
    try:
        return dt.date(y, m, d)
    except ValueError:
        return None


def parse_promo(t: str) -> dict:
    """Texte « Aktion … » -> {promo, regular, promo_months, after, lifetime, until_raw, until}."""
    t = re.sub(r"\s+", " ", t or "")
    r: dict = {}
    m = re.search(r"Aktion bis (\d{1,2})\.(\d{1,2})\.(\d{4})", t)
    if m:
        r["until_raw"] = m.group(0)[11:]
        r["until"] = valid_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    if re.search(r"lebenslang|dauerhaft", t, re.I):
        r["lifetime"] = True
    pats = [
        # « 12 Monate für CHF 25.-, danach für 49.90 anstatt 69.90 » / « 12 Monate für CHF 38.90, danach 48.90 »
        (rf"(\d+) Monate? für (?:CHF )?{_N},? danach (?:für )?(?:CHF )?{_N}(?: anstatt (?:CHF )?{_N})?",
         lambda g: dict(promo_months=int(g[0]), promo=_f(g[1]), after=_f(g[2]), regular=_f(g[3]) or _f(g[2]))),
        # « 12 Monate für CHF 11.90 anstatt 15.90 »
        (rf"(\d+) Monate? für (?:CHF )?{_N} anstatt (?:CHF )?{_N}",
         lambda g: dict(promo_months=int(g[0]), promo=_f(g[1]), regular=_f(g[2]), after=_f(g[2]))),
        # « während 24 Monaten für CHF 44.- anstatt 59.- »
        (rf"während (\d+) Monaten für (?:CHF )?{_N} anstatt (?:CHF )?{_N}",
         lambda g: dict(promo_months=int(g[0]), promo=_f(g[1]), regular=_f(g[2]), after=_f(g[2]))),
        # « 14.00 anstatt 28.00 für 5 Monate » / « CHF 24.95 anstatt 49.90 (für 18 Monate) »
        (rf"(?:CHF )?{_N} anstatt (?:CHF )?{_N}\)? \(?für (\d+) Monate",
         lambda g: dict(promo=_f(g[0]), regular=_f(g[1]), promo_months=int(g[2]), after=_f(g[1]))),
        # « während 3 Monaten kostenlos, danach CHF 33.00 »
        (rf"während (\d+) Monaten (?:kostenlos|gratis),? danach (?:CHF )?{_N}",
         lambda g: dict(promo=0.0, promo_months=int(g[0]), after=_f(g[1]), regular=_f(g[1]))),
        # « CHF 9.- pro Monat, ab dem 3. Jahr CHF 29.00/Monat »
        (rf"(?:CHF )?{_N} pro Monat, ab dem (\d+)\. Jahr (?:CHF )?{_N}",
         lambda g: dict(promo=_f(g[0]), promo_months=(int(g[1]) - 1) * 12, after=_f(g[2]), regular=_f(g[2]))),
        # « Grundgebühr während zwei Jahren zum halben Preis, ab dem 3. Jahr CHF 24.00/Monat »
        (rf"zum halben Preis, ab dem (\d+)\. Jahr (?:CHF )?{_N}",
         lambda g: dict(promo=round(_f(g[1]) / 2, 2), promo_months=(int(g[0]) - 1) * 12, after=_f(g[1]), regular=_f(g[1]))),
        # « CHF 9.90 anstatt 24.90 (lebenslanger Rabatt) » / « Internet Smart für CHF 40.95 anstatt 70.- »
        (rf"(?:CHF )?{_N} anstatt (?:CHF )?{_N}", lambda g: dict(promo=_f(g[0]), regular=_f(g[1]))),
    ]
    for pat, build in pats:
        m = re.search(pat, t)
        if m:
            r.update({k: v for k, v in build(m.groups()).items() if v is not None})
            break
    else:
        # « 1 Monat gratis testen, 2 weitere Monate gratis. Danach CHF 29.00/Monat » / « 4 Monate kostenlos »
        free = [int(x) for x in re.findall(r"(\d+) (?:weitere )?Monate? (?:gratis|kostenlos)", t)]
        if free:
            r.update(promo=0.0, promo_months=sum(free))
            m = re.search(rf"[Dd]anach (?:CHF )?{_N}", t)
            if m:
                r["after"] = r["regular"] = _f(m.group(1))
    if "anstatt" in t and "Aufschaltgebühr" in t and "promo" not in r:
        r["activation_only"] = True
    return r


def _fee(meta: list[str]) -> tuple[float | None, str | None]:
    for x in meta:
        if x.startswith("Aufschaltgebühr"):
            rest = x[len("Aufschaltgebühr"):].strip()
            m = re.search(r"CHF\s*" + _N, rest)
            if m:
                return float(m.group(1)), (rest if "gratis" in rest.lower() else None)
            if re.search(r"gratis|kostenlos|keine", rest, re.I):
                return 0.0, None
    return None, None


def parse_page(html: str, kind: str) -> dict:
    """HTML -> {'cards': [...], 'announced': int|None, 'updated': 'DD.MM.YYYY'|None}."""
    h = re.sub(r";jsessionid=[0-9A-Za-z._-]+", "", html)
    m = re.search(r"(\d+)\s*(?:<[^>]+>\s*)*(?:Ergebnisse|Angebote)\b", h)
    upd = re.search(r"Letztes Update:\s*(\d{2}\.\d{2}\.\d{4})", h)
    cards = []
    for a in re.findall(r'<article class="dk-abo[^"]*">(.*?)</article>', h, re.S):
        title = re.search(r'<h3 class="dk-abo__title">(.*?)</h3>', a, re.S)
        if not title:
            continue
        sub = re.search(r'<p class="dk-abo__subtitle">(.*?)</p>', a, re.S)
        link = re.search(r'href="([^"]+\.xhtml)"', sub.group(1)) if sub else None
        old = re.search(r'<div class="dk-abo__old">(.*?)</div>', a, re.S)
        new = re.search(r'<div class="dk-abo__new">(.*?)</div>', a, re.S)
        meta = [text(x) for x in re.findall(r'<div class="dk-metaItem">(.*?)</div>', a, re.S)]
        ext = re.search(r"window\.open\('([^']+)'", a)
        num = lambda mm: _f((re.search(r"(\d+(?:\.\d+)?)", text(mm.group(1))) or [None, None])[1]) if mm else None  # noqa: E731
        cards.append({"kind": kind, "provider": text(title.group(1)), "plan": text(sub.group(1)) if sub else None,
                      "plan_url": BASE + link.group(1) if link else None,
                      "offer_url": _html.unescape(ext.group(1)) if ext else None,
                      "regular_month": num(old), "avg_month": num(new), "meta": meta,
                      "promo_text": next((x for x in meta if x.startswith("Aktion")), None),
                      "promo_badge": 'class="dk-badge"' in a})
    return {"cards": cards, "announced": int(m.group(1)) if m else None, "updated": upd.group(1) if upd else None}


@register
class Dschungelkompass(Connector):
    id = "dschungelkompass"
    name = "dschungelkompass.ch Aktionen"
    family = "subscription"
    tier = "DAILY"
    interval_minutes = 720
    base_url = BASE
    documentation = "Aktionen Handy-Abo + Internet (HTML) ; 2 requêtes/jour ; dates « Aktion bis » validées"

    def fetch(self, ctx):
        items, warnings, complete, info = [], [], True, {}
        for kind, url in PAGES.items():
            page = parse_page(ctx.get(url).text, kind)
            info[kind] = {"cards": len(page["cards"]), "announced": page["announced"], "updated": page["updated"]}
            if not page["cards"]:
                return FetchResult(error=f"{kind} : aucune carte dk-abo (structure changée ?)")
            if page["announced"] and page["announced"] > len(page["cards"]):
                complete = False
                warnings.append(f"{kind} : {len(page['cards'])}/{page['announced']} offres (suite via POST non suivie)")
            items += [{**c, "_updated": page["updated"]} for c in page["cards"]]
        bad = [c["promo_text"] for c in items if (parse_promo(c["promo_text"] or "").get("until_raw")
                                                    and not parse_promo(c["promo_text"]).get("until"))]
        if bad:
            warnings.append(f"{len(bad)} date(s) « Aktion bis » invalide(s) ignorée(s)")
        return FetchResult(items=items, complete=complete, warnings=warnings, raw=info)

    def normalize(self, c, ctx):
        p = parse_promo(c.get("promo_text") or "")
        tz = ctx.cfg.tz
        regular = p.get("regular") or c.get("regular_month")
        promo = p.get("promo")
        basis = "promo_text"
        card_reg = c.get("regular_month")
        if p.get("regular") and card_reg and abs(p["regular"] - card_reg) > 0.01:
            # Le texte décrit l'abo de base, la carte une variante (ex. « + 5G-Option ») :
            # on garde les prix de la carte, jamais un mélange des deux.
            regular, basis = card_reg, "card"
            promo = c.get("avg_month") if p.get("lifetime") and not p.get("promo_months") else None
            p = {k: v for k, v in p.items() if k not in ("promo", "regular", "after", "promo_months")}
        if promo is None:
            promo, basis = c.get("avg_month"), "average_24m_dschungelkompass"
        if promo is None:
            return None
        fee, fee_note = _fee(c.get("meta") or [])
        mm = next((re.search(r"(\d+) Monate? Mindestlaufzeit", x) for x in c.get("meta") or []
                   if "Mindestlaufzeit" in x), None)
        months = int(mm.group(1)) if mm else None
        until = p.get("until")
        ends = dt.datetime.combine(until, dt.time(23, 59, 59), tzinfo=tz).isoformat() if until else None
        blob = " ".join(filter(None, [c.get("provider"), c.get("plan"), c.get("promo_text")]))
        youth = YOUTH_RE.search(blob)
        student = bool(STUDENT_RE.search(blob))
        # « lebenslanger Rabatt » sans durée promo = rabais sur toute la durée ; avec une durée
        # (« 12 Monate für 25.-, danach 49.90 anstatt 69.90 (lebenslang) ») il porte sur le prix d'après.
        lifetime = bool(p.get("lifetime")) and not p.get("promo_months")
        code = re.search(r"Gutscheincode:?\s*«?([A-Z0-9-]{3,})»?", c.get("promo_text") or "")
        # L'URL du plan est partagée par ses variantes (« + 5G-Option ») -> clé = fournisseur + plan.
        key = slug(f"{c['provider']} {c.get('plan') or ''}")
        title = " ".join(filter(None, [c["provider"], c.get("plan")]))
        # Référence pour le repli « discount_based » (sans durée d'engagement) : seulement si
        # le rabais est explicitement à vie (sinon une réduction mensuelle surestimerait l'économie).
        ref = regular if (lifetime and regular and regular > promo) else None
        return make_deal(
            deal_id=f"{self.id}:{c['kind']}:{key}", source_id=self.id, source_type="aggregator",
            source_url=c.get("plan_url") or PAGES[c["kind"]], offer_url=c.get("offer_url"),
            title=title, family="subscription", category="Handy-Abo" if c["kind"] == "mobile" else "Internet",
            merchant=c["provider"], offer_type="telecom_promo", conditions=[c["promo_text"]] if c.get("promo_text") else None,
            current_price=promo, price_basis=basis, regular_monthly_price=regular,
            promo_months=p.get("promo_months"), price_after_promo=p.get("after"),
            promo_lifetime=lifetime or None, commitment_months=months, activation_fee=fee,
            activation_fee_note=fee_note, average_monthly_price_24m=c.get("avg_month"),
            reference_price=ref, reference_price_type="merchant_previous" if ref else None,
            reference_note="prix mensuel normal (rabais à vie)" if ref else None,
            ends_at=ends, promo_end_raw=p.get("until_raw") if p.get("until_raw") and not until else None,
            promo_end_invalid=True if p.get("until_raw") and not until else None,
            activation_only_promo=p.get("activation_only"),
            requires_coupon=True if code else None, coupon_code=code.group(1) if code else None,
            requires_student=True if student else None,
            eligibility=youth.group(0) if youth else None,
            source_updated=c.get("_updated"), unit="CHF/Monat",
            geographic_scope="NATIONAL", delivery_scope="CH", access="PUBLIC")
