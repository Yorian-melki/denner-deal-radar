"""Saiten — Kalender Ostschweiz, filtre ville « St. Gallen ».

Liste : ``GET https://www.saiten.ch/api/calendar-list.json?page=N&city=St.%20Gallen``
(XHR public du site, fragment HTML de 50 entrées, ~33 entrées/jour). Le prix
n'est PAS dans la liste : il est lu une seule fois par événement sur la page
détail (JSON-LD ``Event`` + bloc « Preise / Kosten »), résultat mis en cache
dans ``ctx.source_state`` (au plus ``MAX_DETAILS`` nouvelles pages par passage).

On ne garde QUE les événements gratuits (« Eintritt frei », « Kollekte »,
prix 0) ou avec un prix étudiant explicite. Gratuit -> ``current_price`` 0,
sans référence (la valeur de l'événement est inconnue).

robots.txt : saiten.ch répond 404 (aucune restriction, RFC 9309, géré par
``radar/http.py``). Les pages détail sont demandées en ``Accept-Encoding:
identity`` (encodage compressé illisible observé : ContentDecodingError).

Le module expose aussi :func:`classify_price_text`, utilisé par les autres
connecteurs d'événements (Grabenhalle, Konzert und Theater).
"""
from __future__ import annotations

import datetime as dt
import json
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import num, text

BASE = "https://www.saiten.ch"
LIST = BASE + "/api/calendar-list.json?page={page}&city=St.%20Gallen"
HORIZON_DAYS = 7
MAX_PAGES = 6           # ~33 entrées/jour -> ~5 pages pour 7 jours
MAX_DETAILS = 30        # nouvelles pages détail par passage (cache ensuite)

# --------------------------------------------------------------------------
# Classification d'un texte de prix libre (partagée par les connecteurs événements)

FREE_RE = re.compile(r"eintritt\s*(?:ist\s*)?(?:frei|gratis|kostenlos)|freie?r?\s+eintritt|\bgratis\b|"
                     r"\bkostenlos\b|\bkollekte\b|free\s+(?:entry|admission)|^\s*frei\b", re.I)
KOLLEKTE_RE = re.compile(r"\bkollekte\b|hutsammlung|\bhut\b", re.I)
GROUPS = (  # ordre = priorité
    ("student", r"studen|studierend|\bstudis?\b|\bstud\.|(?<!kultur)\blegi\b|lernend|auszubildend|"
                r"\bu\s?2[5-9]\b|unter\s+2[5-9]|bis\s+2[5-9]\s*j"),
    ("last_minute", r"last[\s-]?minute"),
    ("kulturlegi", r"kulturlegi|caritas"),
    ("pupil", r"schüler|schulangehörig|kanti"),
    ("child", r"kinder|\bkids?\b|jugendlich|familie"),
    ("senior", r"\bahv\b|rentner|senior|pension"),
    ("member", r"mitglied|member|abonnent|gönner|\biv\b|begleit"),
    ("presale", r"vorverkauf|\bvvk\b|presale"),
    ("adult", r"erwachsen|normalpreis|regulär|vollpreis|\bnormal\b"),
)
PUBLIC_GROUPS = ("presale", "adult")
_AGES = re.compile(r"(?:\b(?:bis|unter|ab|über|von)\s*)?\b\d{1,2}\s*(?:-\s*\d{1,2}\s*)?(?:jahren?|jahre|j\.)", re.I)
_NOISE = re.compile(r"\d{1,2}[:.]\d{2}\s*uhr|\b\d{1,2}\.\d{1,2}\.(?:\d{2,4})?|\b[uU]\s?\d\d\b|\d+\s*%|"
                    r"\d+\s*(?:min(?:uten)?|std|stunden|h|personen|pers|tage?n?)\b\.?", re.I)
_NUM = re.compile(r"(?<![\d.,])(\d{1,4}(?:[.,]\d{1,2})?)(?![\d%])")   # « CHF35.- » accepté
_SEP = re.compile(r"\s*(?:/|;|\||·|\n|,(?!\d)|\boder\b|\s–\s|\s-\s)\s*")


def _group(s: str) -> str | None:
    low = (s or "").lower()
    return next((g for g, pat in GROUPS if re.search(pat, low)), None)


def _segments(s: str) -> list[str]:
    """Découpe le texte ; une parenthèse contenant un nombre ou une gratuité
    devient un segment à part (« CHF 10.- (für Schulangehörige frei) »)."""
    out = []
    for seg in _SEP.split(s or ""):
        for par in re.findall(r"\(([^()]*)\)", seg):
            if FREE_RE.search(par) or _NUM.search(_NOISE.sub(" ", _AGES.sub(" ", par))):
                out.append(par)
                seg = seg.replace(f"({par})", " ")
        if seg.strip():
            out.append(seg.strip())
    return [x for x in out if x.strip()]


def classify_price_text(s: str | None) -> dict:
    """Analyse prudente d'un texte de prix libre.

    Retourne ``public_prices`` (prix accessibles à tous, y.c. prévente),
    ``concessions`` [(groupe, prix)], ``free`` (gratuit pour tous, sans aucun
    prix public > 0), ``free_groups`` (gratuité réservée à un groupe),
    ``kollekte`` et ``student_price`` (prix explicite étudiants/Legi/U26).
    Un chiffre sans contexte monétaire (âge, heure, date, %) est ignoré.
    """
    s = text(s)
    money_ctx = bool(re.search(r"\bCHF\b|\bFr\.|\bSFr|\.-|–\.|\d\.\d\d\b", s))
    public, conc, free_public, free_groups = [], [], False, []
    for seg in _segments(s):
        group = _group(seg)
        if FREE_RE.search(seg):
            if group and group not in PUBLIC_GROUPS:
                free_groups.append((group, seg))
            else:
                free_public = True
        if not money_ctx:
            continue
        # Libellé propre à chaque montant : texte qui le précède (« Erwachsene CHF 60.- »),
        # sinon texte qui le suit (« CHF 8.00 Legi ») ; un seul montant -> libellé du segment.
        parts = _NUM.split(_NOISE.sub(" ", _AGES.sub(" ", seg)))
        nums = parts[1::2]
        for i, x in enumerate(nums):
            g = _group(parts[2 * i]) or (_group(parts[2 * i + 2]) if i == len(nums) - 1 else None)
            if g is None and len(nums) == 1:
                g = group
            (conc.append((g, float(x.replace(",", ".")))) if g and g not in PUBLIC_GROUPS
             else public.append(float(x.replace(",", "."))))
    is_free = free_public and not any(p > 0 for p in public)
    student = [p for g, p in conc if g == "student"] + [0.0 for g, _ in free_groups if g == "student"]
    last_minute = [p for g, p in conc if g == "last_minute"]
    return {"public_prices": public, "concessions": conc, "free": is_free,
            "free_groups": [seg for _, seg in free_groups],
            "kollekte": bool(KOLLEKTE_RE.search(s)) and is_free,
            "student_price": min(student) if student else None,
            "last_minute_price": min(last_minute) if last_minute else None,
            "min_public": min(public) if public else None,
            "max_public": max(public) if public else None,
            "text": s[:300]}


# --------------------------------------------------------------------------
# Liste

_ITEM = re.compile(r'<a class="a-calendar-item[^"]*" href="([^"]+)">(.*?)</a>', re.S)


def _field(body: str, cls: str, tag: str = "div") -> str:
    m = re.search(r'class="a-calendar-item__' + cls + r'[^"]*">(.*?)</' + tag + '>', body, re.S)
    return text(m.group(1)) if m else ""


def _infer_date(day: int, month: int, now: dt.datetime) -> dt.date | None:
    try:
        d = dt.date(now.year, month, day)
    except ValueError:
        return None
    if d < now.date() - dt.timedelta(days=60):   # « 03.01. » vu en décembre -> année suivante
        d = d.replace(year=now.year + 1)
    return d


def parse_list(payload: dict, now: dt.datetime) -> list[dict]:
    """Fragment HTML de ``calendar-list.json`` -> occurrences (une par date)."""
    out = []
    for href, body in _ITEM.findall(payload.get("content") or ""):
        eid = href.rsplit("-", 1)[-1]
        if not eid.isdigit():
            continue
        dm = re.search(r"(\d{1,2})\.(\d{1,2})\.", _field(body, "date"))
        date = _infer_date(int(dm.group(1)), int(dm.group(2)), now) if dm else None
        times = re.findall(r"(\d{1,2}):(\d{2})", _field(body, "time"))
        out.append({"id": eid, "url": f"{BASE}/{href.lstrip('/')}", "title": _field(body, "title"),
                    "date": date.isoformat() if date else None,
                    "start_time": "%02d:%s" % (int(times[0][0]), times[0][1]) if times else None,
                    "end_time": "%02d:%s" % (int(times[1][0]), times[1][1]) if len(times) > 1 else None,
                    "venue": _field(body, "location__place"), "city": _field(body, "location__name"),
                    "category": _field(body, "tags__tag"), "lead": _field(body, "lead__rest", "span")})
    return out


# --------------------------------------------------------------------------
# Détail (JSON-LD Event + bloc « Preise / Kosten »)

def _jsonld_events(html: str) -> list[dict]:
    found = []

    def walk(o):
        if isinstance(o, dict):
            t = o.get("@type")
            if t == "Event" or (isinstance(t, list) and "Event" in t):
                found.append(o)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    for block in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S):
        try:
            walk(json.loads(block))
        except ValueError:
            continue
    return found


def parse_detail(html: str) -> dict:
    """Page détail -> {price_text, free_flag, offer_price, address, lat, lng, organizer}."""
    out: dict = {}
    m = re.search(r"Preise\s*/\s*Kosten\s*(?:</[^>]+>\s*)+(.*?)</(?:div|p|dd|section|li)>", html, re.S | re.I)
    if m:
        out["price_text"] = text(m.group(1))[:300]
    elif re.search(r"Preise\s*/\s*Kosten", html, re.I):
        i = re.search(r"Preise\s*/\s*Kosten", html, re.I).end()
        out["price_text"] = text(html[i:i + 600])[:200]
    for ev in _jsonld_events(html)[:1]:
        loc = ev.get("location") or {}
        loc = loc[0] if isinstance(loc, list) and loc else loc
        if isinstance(loc, dict):
            adr = loc.get("address") or {}
            if isinstance(adr, dict):
                out["address"] = ", ".join(x for x in (adr.get("streetAddress"),
                                                       " ".join(filter(None, (adr.get("postalCode"), adr.get("addressLocality")))))
                                           if x) or None
            geo = loc.get("geo") or {}
            if isinstance(geo, dict) and num(geo.get("latitude")) is not None and num(geo.get("longitude")) is not None:
                out["lat"], out["lng"] = num(geo["latitude"]), num(geo["longitude"])
        if ev.get("isAccessibleForFree") in (True, "true", "True"):
            out["free_flag"] = True
        offers = ev.get("offers")
        offers = offers if isinstance(offers, list) else [offers] if isinstance(offers, dict) else []
        prices = [num(o.get("price")) for o in offers if isinstance(o, dict) and num(o.get("price")) is not None]
        if prices:
            out["offer_price"] = min(prices)
        org = ev.get("organizer")
        if isinstance(org, dict) and org.get("name"):
            out["organizer"] = org["name"]
    return out


def assess(detail: dict) -> dict:
    """Prix structuré + texte -> classification (cf. classify_price_text)."""
    c = classify_price_text(detail.get("price_text"))
    if detail.get("free_flag") and not any(p > 0 for p in c["public_prices"]):
        c["free"] = True
    if detail.get("offer_price") == 0 and not c["public_prices"]:
        c["free"] = True
    return c


def _iso(date: str, hhmm: str | None, tz) -> str | None:
    if not hhmm:
        return None
    return dt.datetime.fromisoformat(f"{date}T{hhmm}:00").replace(tzinfo=tz).isoformat()


@register
class SaitenEvents(Connector):
    id = "saiten_events"
    name = "Saiten Kalender (St. Gallen)"
    family = "event"
    tier = "EVENT"
    interval_minutes = 720
    base_url = BASE
    expected_min_items = 0
    documentation = ("api/calendar-list.json?city=St. Gallen (7 jours, ≤6 pages) + détail par nouvel "
                     "événement (≤30/passage, cache) ; garde gratuit / prix étudiant explicite")

    def fetch(self, ctx):
        horizon = (ctx.now + dt.timedelta(days=HORIZON_DAYS)).date().isoformat()
        occ: list[dict] = []
        total_pages = total_count = None
        for page in range(1, MAX_PAGES + 1):
            payload = ctx.get(LIST.format(page=page), headers={"Accept": "application/json"}).json()
            if "content" not in payload:
                return FetchResult(error="structure inattendue : content absent")
            total_pages, total_count = payload.get("totalPages"), payload.get("totalCount")
            rows = parse_list(payload, ctx.now)
            occ += rows
            if not rows or (total_pages and page >= total_pages) or any((r["date"] or "") > horizon for r in rows):
                break
        occ = [o for o in occ if o["date"] and o["date"] <= horizon]
        cache = ctx.source_state.setdefault("details", {})
        todo = [o["id"] for o in sorted(occ, key=lambda o: (o["date"], o["start_time"] or ""))
                if o["id"] not in cache]
        todo = list(dict.fromkeys(todo))
        warnings, failures = [], 0
        for eid in todo[:MAX_DETAILS]:
            url = next(o["url"] for o in occ if o["id"] == eid)
            try:
                # « identity » : les pages détail ont renvoyé un Content-Encoding illisible
                # (ContentDecodingError) ; on demande le HTML non compressé.
                r = ctx.get(url, headers={"Accept-Encoding": "identity"})
                cache[eid] = {**parse_detail(r.text), "fetched": ctx.now.date().isoformat()}
                failures = 0
            except Exception as e:  # noqa: BLE001 — détail facultatif, réessayé au prochain passage
                warnings.append(f"détail {eid}: {type(e).__name__}")
                failures += 1
                if failures >= 3:
                    warnings.append("3 échecs de détail consécutifs : arrêt pour ce passage")
                    break
        if len(todo) > MAX_DETAILS:
            warnings.append(f"{len(todo) - MAX_DETAILS} détails reportés au prochain passage")
        live = {o["id"] for o in occ}
        for k in [k for k in cache if k not in live]:
            del cache[k]
        items = [{**o, "_detail": cache[o["id"]]} for o in occ if o["id"] in cache]
        return FetchResult(items=items, complete=len(todo) <= MAX_DETAILS, warnings=warnings,
                           empty_valid=total_count == 0,
                           raw={"occurrences": len(occ), "pages_total": total_pages, "total_count": total_count},
                           meta={"pending_details": max(0, len(todo) - MAX_DETAILS)})

    def normalize(self, o, ctx):
        det = o.get("_detail") or {}
        c = assess(det)
        if c["free"]:
            price, ref, student = 0.0, None, False
            offer_type = "free_event_kollekte" if c["kollekte"] else "free_event"
        elif c["student_price"] is not None:
            price, student = c["student_price"], True
            ref = c["max_public"] if c["max_public"] and c["max_public"] > price else None
            offer_type = "student_price"
        else:
            return None
        tz = ctx.cfg.tz
        city = o.get("city") or "St. Gallen"
        return make_deal(
            deal_id=f"{self.id}:{o['id']}:{o['date']}", source_id=self.id, source_type="aggregator",
            source_offer_id=o["id"], source_url=o["url"], title=o["title"], family="event",
            description=o.get("lead") or None, category=o.get("category") or None, offer_type=offer_type,
            merchant=det.get("organizer") or o.get("venue") or None,
            current_price=price, reference_price=ref, reference_price_type="catalog" if ref else None,
            reference_note="prix normal du billet (texte « Preise / Kosten »)" if ref else None,
            price_text=c["text"] or None, requires_student=student or None,
            eligibility="; ".join(c["free_groups"]) or (c["text"] if student else None),
            starts_at=_iso(o["date"], o.get("start_time"), tz), ends_at=_iso(o["date"], o.get("end_time"), tz),
            event_date=o["date"], venue=o.get("venue") or None, location=", ".join(filter(None, (o.get("venue"), city))),
            address=det.get("address"), lat=det.get("lat"), lng=det.get("lng"), city=city,
            geographic_scope="LOCAL", access="PUBLIC")
