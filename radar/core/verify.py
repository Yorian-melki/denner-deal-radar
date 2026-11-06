"""Vérification des offres à 0 token LLM (étude R2, §3 ; phase 0 de fiabilité).

Chaque offre reçoit un état et une probabilité « obtenable comme affiché » :

    VERIFIED (p ≥ 0.80)  UNCONFIRMED (0.50–0.80, hors vitrines)  SUSPECT (0.30–0.50, non listée)
    HIDDEN(code)         ENDED(code) (terminal, page « abgelaufen »)

Règles dures, dans l'ordre (R2 §3.3) :

    T_EXPIRED            ends_at < maintenant
    T_GONE_404           page source 404/410 sur 2 contrôles espacés d'au moins 1 h (1 seul : SUSPECT)
    T_SRC_EXPIRED_FLAG   drapeau de fin lu à la source (Preispirat ``expired``, QoQa ``is_sold_out``,
                         Fust ``soldOut``, ``sold_out`` du connecteur)
    X_SOURCE_STALE       la source est en panne (≥ 3 échecs consécutifs, ou dernier succès plus vieux
                         que max(TTL de la famille, 4 × intervalle)) : offres masquées, réaffichées
                         au premier passage réussi
    R_REGION             réservée à une autre région (``eligible_home=false``, « Nur in der
                         französischen Schweiz », « nur Romandie ») : retirée des villes alémaniques
    R_NO_STORE_NEARBY    enseigne sans magasin dans la ville (Aligro à Saint-Gall)
    P_UNIT_INCOHERENT    prix unitaire ≠ prix ÷ quantité (> 5 %) ou > 1 000 CHF/kg hors cosmétique :
                         le prix unitaire n'est pas publié

Puis un score log-odds déterministe (poids = HYPOTHÈSE de départ, R2 §3.3) et l'hystérésis :
une offre SUSPECT/HIDDEN/ENDED ne revient qu'après 2 vérifications OK consécutives
(X_SOURCE_STALE : dès le premier passage réussi de la source). Chaque transition est écrite dans
``data/universal/decisions/AAAA-MM.ndjson`` (append-only).

Seul l'état stable (état, code, depuis, série OK, contrôles de page) est persisté dans le deal
(clé ``verify``), jamais ``p`` qui bouge à chaque passage : pas de réécriture de milliers de
fichiers par collecte.

Couches V2-C (rangs 0 à 3, ``V2C_FIABILITE_MINIMUM.md`` §2.1) :

    X_NOT_RECHECKED      porte « fail-closed » : sans preuve positive (``last_verified_at``) plus
                         récente que le TTL de la famille, une offre n'est jamais VERIFIED
                         (UNCONFIRMED, « unbestätigt », hors vitrines). Preispirat : seule la page
                         du post relue (200, pas « Abgelaufen ») est une preuve, pas le flux RSS.
    T_PP_REMAINING       Preispirat « N Tage verbleibend » / « Letzter Tag » → date de fin ;
                         « Abgelaufen » → ENDED
    C_ONLINE_FLAG        carte Rappn « Nur online » → jamais « Im Laden »
    P_FROM_PRICE         « Ab X bis Y » (QoQa ``price_range_max``, « ab CHF X ») → « ab CHF X », sans %
    P_ZERO_NONFREE       prix 0 mais payant ensuite (« 3 Monate kostenlos, danach CHF 44 »)
    Q_PARSE_SANITY       quantité ambiguë (« Maximal 250 Stück », « 1000 ml & 150 ml ») → non publiée
    P_REF_IMPLAUSIBLE    référence concurrente/communautaire > 3 × le prix → non publiée
"""
from __future__ import annotations

import datetime as dt
import logging
import math
import re
import time
from urllib.parse import urlparse

log = logging.getLogger("radar.verify")

RULE_VERSION = "v2c.1"

# TTL de fraîcheur par famille (heures), R2 §3.3.
TTL_H = {"grocery": 30, "retail": 30, "tech": 30, "surplus": 30, "restaurant": 30, "refurbished": 30,
         "secondhand": 30, "flash": 3, "community": 48, "student": 168, "free": 24, "digital_free": 24,
         "coupon": 48, "subscription": 168, "cashback": 168, "travel": 48, "transport": 48, "event": 72,
         "local_news": 168}
DEFAULT_TTL_H = 48
# Sources communautaires : leur fraîcheur est celle d'une communauté, quelle que soit la famille du deal.
SOURCE_TTL_FAMILY = {"preispirat": "community", "dschungelkompass": "community", "gutscheine_20min": "community",
                     "studentbeans": "student", "unidays": "student"}
FAILURES_STALE = 3            # échecs consécutifs qui figent une source
INTERVAL_FACTOR = 4           # … ou dernier succès > 4 × intervalle (et > TTL de la famille)

# A prioris de précision par source (R2 §3.3, Beta(1+ok, 1+ko) sur l'échantillon du 06/11).
# Lidl (0/2) et StudentBeans (0/2) : erreurs dues à la panne et aux 404, désormais traitées par
# des règles dures ; on ne les compte pas deux fois (a priori par défaut).
PRIOR = {"denner": 14 / 15, "aldi": 10 / 11, "rappn": 18 / 24, "preispirat": 10 / 14}
DEFAULT_PRIOR = 0.85

P_VERIFIED, P_UNCONFIRMED, P_SUSPECT = 0.80, 0.50, 0.30
LISTED = ("VERIFIED", "UNCONFIRMED", "UPCOMING")
GONE = (404, 410)
CHECK_GAP = dt.timedelta(hours=1)

# Enseignes sans filiale dans la ville (web/config/cities.ts `absentChains`, même liste).
ABSENT_CHAINS = {"st-gallen": {"aligro"}}

# -- règles de région -----------------------------------------------------------------------------

# « Nur in der französischen (und italienischen) Schweiz erhältlich », « nur im Tessin »,
# « (nur Romandie) », « uniquement en Suisse romande ». Exclu pour une ville alémanique si la
# région nommée ne contient pas la Suisse alémanique (« Deutsch- und Westschweiz » reste valable).
REGION_ONLY = re.compile(
    r"\bnur\s+(?:noch\s+)?(?:im|in\s+der|in)?\s*(?P<r>[\w\s\-–/]{0,60}?(?:schweiz|tessin|romandie|welschland))\b"
    r"|\b(?:uniquement|seulement|exclusivement)\s+(?:en|au|dans\s+(?:le|la))\s+(?P<f>suisse\s+romande|romandie|tessin|suisse\s+italienne)",
    re.I)
GERMAN_PART = re.compile(r"deutsch|ost|zentral|nordwest|alemann|ganze[nr]?\s+schweiz", re.I)


def region_excluded(d: dict, home_lang: str = "de") -> bool:
    """Offre réservée à une région qui n'inclut pas la région linguistique de la ville."""
    if d.get("eligible_home") is False:
        return True
    texts = [str(d.get("title") or ""), str(d.get("description") or "")]
    texts += [c for c in (d.get("conditions") or []) if isinstance(c, str)]
    for t in texts:
        for m in REGION_ONLY.finditer(t):
            r = m.group("r") or m.group("f") or ""
            if home_lang == "de" and not GERMAN_PART.search(r):
                return True
    return False


def absent_chain(d: dict, city: str = "st-gallen") -> bool:
    m = str(d.get("merchant") or "").strip().lower()
    return m in ABSENT_CHAINS.get(city, set())


# -- cohérence prix / quantité / prix unitaire -----------------------------------------------------

COSMETIC = re.compile(r"parf[uü]m|eau de|serum|sérum|crème|creme|lotion|kosmetik|cosm[eé]ti|make-?up|mascara|"
                      r"lippen|lipstick|rouge|contour|nagel|lack|duft|deo|shampoo|haar|gesicht|augen|nivea|artdeco|"
                      r"l[’']or[eé]al|garnier|maybelline|essence|catrice|beauty|pflege|skin|vichy|la roche|eucerin",
                      re.I)
METRIC = re.compile(r"\d\s*(?:kg|g|ml|cl|dl|l|liter)\b", re.I)
COUNT = re.compile(r"\d\s*(?:stück|stk|pièces?|blatt|waschgänge|lavages|tabs|beutel|rollen|kapseln)", re.I)
PER_100 = re.compile(r"\b(?:per|pro|par)\s+100\s*(?:g|ml)\b", re.I)
PER_BASE = re.compile(r"\b(?:per|pro|par)\s+(?:kg|l|liter)\b", re.I)
MULTI = re.compile(r"(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l|stück|stk)?", re.I)
_TO_BASE = {"kg": 1, "g": 0.001, "l": 1, "dl": 0.1, "cl": 0.01, "ml": 0.001}
MAX_UNIT_PRICE = 1000.0       # CHF/kg ou CHF/l, hors cosmétique


def _close(a: float, b: float) -> bool:
    """Égalité à 5 % près, ou à l'arrondi au centime près (0.07 pour 11.89/160 = 0.074)."""
    return b > 0 and (abs(a - b) / b <= 0.05 or abs(a - b) <= 0.005)


def unit_incoherent(d: dict) -> bool:
    """Le prix unitaire publié contredit prix ÷ quantité (R2 §2, P_ABERRANT ; bug « 11'990 CHF/kg »)."""
    up, p, q, unit = d.get("unit_price"), d.get("current_price"), d.get("quantity"), d.get("unit") or ""
    if not isinstance(up, (int, float)) or not isinstance(p, (int, float)) or up <= 0 or p <= 0:
        return False
    size = " ".join(str(d.get(k) or "") for k in ("package_size", "description"))
    text = f"{d.get('title') or ''} {d.get('category') or ''} {size}"
    base = unit in ("CHF/kg", "CHF/l")
    if base and up > MAX_UNIT_PRICE and not COSMETIC.search(text):
        return True
    if base and PER_100.search(size):          # prix affiché pour 100 g (Denner « per 100 g »)
        return not _close(up, p / 0.1)
    if base and PER_BASE.search(size):         # prix affiché par kg / litre
        return not _close(up, p)
    if not isinstance(q, (int, float)) or q <= 0:
        return False
    # La quantité doit être dans la dimension du prix unitaire, sinon rien à contrôler.
    if base and not METRIC.search(size):
        return False
    if unit == "CHF/pièce" and METRIC.search(size) and not COUNT.search(size):
        return False
    candidates = {q}
    for m in MULTI.finditer(size):             # « 7 x 21 Stück » = 147 pièces ; « 6 x 1,5 l » = 9 l
        n, v, u = float(m.group(1)), float(m.group(2).replace(",", ".")), (m.group(3) or "").lower()
        candidates.add(n * v * _TO_BASE.get(u, 1) if base else n * v)
    return not any(_close(up, p / c) for c in candidates if c > 0)


# -- règles de lecture V2-C (§2.1) : ce que l'affichage promet doit être ce que dit la source -------

# « Ab CHF 59.90 », « dès CHF 9.– », « ab 59.90 bis 249.– » dans le TITRE (une description dit souvent
# « ab CHF 50 Bestellwert », qui est un minimum de commande, pas un prix « à partir de »).
FROM_PRICE = re.compile(r"\b(?:ab|dès|from)\s+(?:CHF|Fr\.)\s?\d|\bab\s+\d+(?:[.,]\d{1,2}|\.[-–])\s*bis\s+\d", re.I)


MIN_ORDER_AFTER = re.compile(r"^[\d.,'’–\-\s]*(?:CHF\s*)?(?:Einkaufs|Bestell|Mindest|Warenkorb|Einkauf\b|d.achat|de commande)", re.I)


def price_is_from(d: dict) -> bool:
    """P_FROM_PRICE : plusieurs prix à la source (QoQa « Ab 59.90 bis 249.– ») → « ab CHF X », sans %.
    « ab CHF 70.– Einkaufswert » est un minimum d'achat, pas un prix plancher."""
    p, pmax = d.get("current_price"), d.get("price_max")
    if isinstance(p, (int, float)) and isinstance(pmax, (int, float)) and pmax > p + 0.005:
        return True
    title = str(d.get("title") or "")
    return any(not MIN_ORDER_AFTER.match(title[m.end() - 1:]) for m in FROM_PRICE.finditer(title))


THEN_PRICE = re.compile(r"\b(?:danach|anschliessend|dann|ensuite|puis|then)\s+(?:für\s+)?(?:CHF|Fr\.)\s?(\d+(?:[.,]\d{1,2})?)"
                        r"|\b(?:ensuite|puis)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:CHF|francs)", re.I)
FREE_FAMILIES = {"free", "digital_free"}


def zero_then_price(d: dict) -> float | None:
    """P_ZERO_NONFREE : prix 0 affiché « Gratis » alors que l'offre devient payante (« 3 Monate kostenlos,
    danach CHF 44 ») → prix payé ensuite (sinon None)."""
    if d.get("current_price") != 0 or d.get("family") in FREE_FAMILIES:
        return None
    for k in ("price_after_promo", "regular_monthly_price"):
        v = d.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
    texts = [str(d.get("title") or ""), str(d.get("description") or "")]
    texts += [c for c in (d.get("conditions") or []) if isinstance(c, str)]
    for t in texts:
        m = THEN_PRICE.search(t)
        if m:
            v = float((m.group(1) or m.group(2)).replace(",", "."))
            if v > 0:
                return v
    return None


# « Maximal 250 Stück zum reduzierten Einzelpreis » est un plafond de vente, pas une taille.
MAX_COUNT = re.compile(r"\b(?:maximal|max\.?|höchstens|limitiert auf|nur|bis zu)\s+\d[\d']*\s*(?:Stück|Stk\.?|Exemplare?)"
                       r"|\b\d[\d']*\s*(?:Stück|Stk\.?)\s+zum\b", re.I)
MEASURE = re.compile(r"(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l|liter)\b", re.I)
MEASURE_PRODUCT = re.compile(r"\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|dl|l|liter)\b", re.I)
_DIM = {"kg": ("m", 1000), "g": ("m", 1), "l": ("v", 1000), "liter": ("v", 1000), "dl": ("v", 100),
        "cl": ("v", 10), "ml": ("v", 1)}


def quantity_suspect(d: dict) -> bool:
    """Q_PARSE_SANITY : la quantité affichable est ambiguë → jamais publiée.

    * un plafond de vente lu comme une taille (« Maximal 250 Stück ») ;
    * plusieurs mesures différentes de même dimension dans le titre ou le champ taille (« 2 Behälter,
      1000 ml & 150 ml », « 50 ml Eau de Parfum + 75 ml Duschgel »), sauf un total cohérent
      (« 500 g (2 × 250 g) », « 1 kg = 2 × 500 g »).
    """
    desc = str(d.get("description") or "")
    head = f"{d.get('title') or ''} {d.get('package_size') or ''}"
    if MAX_COUNT.search(head) or MAX_COUNT.search(desc):
        return True
    text = MEASURE_PRODUCT.sub(lambda m: " ", head)
    # Prix « pro 100 g », poids par pièce (« ca. 150 g », « 170-240 g ») : pas une taille de l'emballage.
    text = re.sub(r"\b(?:per|pro|par|je|ca\.?|env\.?|circa)\s*\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|dl|l)\b", " ", text, flags=re.I)
    text = re.sub(r"\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|dl|l)\b", " ", text, flags=re.I)
    by_dim: dict[str, set[float]] = {}
    for m in MEASURE.finditer(text):
        dim, f = _DIM[m.group(2).lower()]
        by_dim.setdefault(dim, set()).add(round(float(m.group(1).replace(",", ".")) * f, 3))
    products = [round(float(n) * float(v.replace(",", ".")) * _DIM[u.lower()][1], 3)
                for n, v, u in re.findall(r"(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l|liter)\b", head, re.I)]
    for vals in by_dim.values():
        vals = vals - set(products)
        if len(vals) >= 2 and max(vals) != round(sum(vals) - max(vals), 3):
            return True
    return False


# Références que nous ne pouvons pas tenir pour un prix pratiqué par le marchand lui-même.
WEAK_REF = {None, "competitor", "community_claimed", "stated_percent_only"}
REF_MAX_RATIO = 3.0


def ref_implausible(d: dict) -> bool:
    """P_REF_IMPLAUSIBLE : référence concurrente ou communautaire > 3 × le prix (Otto's « sonst 3'229 » pour
    649, alors que Rappn affiche « statt 679 ») sans corroboration → la référence n'est pas publiée."""
    p, r = d.get("current_price"), d.get("reference_price")
    if not isinstance(p, (int, float)) or not isinstance(r, (int, float)) or p <= 0:
        return False
    return r / p > REF_MAX_RATIO and d.get("reference_price_type") in WEAK_REF and not d.get("corroborated_by")


def reading_rules(d: dict) -> tuple[list[str], dict]:
    """Règles de lecture (0 token) : (codes, correctifs d'affichage pour l'export)."""
    rules: list[str] = []
    patch: dict = {}
    if d.get("online_only") is True:
        rules.append("C_ONLINE_FLAG")
        patch["online_only"] = True
    if price_is_from(d):
        rules.append("P_FROM_PRICE")
        patch["price_is_from"] = True
    then = zero_then_price(d)
    if then is not None:
        rules.append("P_ZERO_NONFREE")
        patch["zero_then_price"] = then
    if quantity_suspect(d):
        rules.append("Q_PARSE_SANITY")
        patch["size_unknown"] = True
    if ref_implausible(d):
        rules.append("P_REF_IMPLAUSIBLE")
        patch["ref_hidden"] = True
    return rules, patch


# -- santé des sources -------------------------------------------------------------------------------

def _dt(s) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(s) if s else None
    except (TypeError, ValueError):
        return None


def ttl_hours(family: str, source_id: str = "") -> float:
    return TTL_H.get(SOURCE_TTL_FAMILY.get(source_id, family), DEFAULT_TTL_H)


def source_health(st: dict, family: str, interval_min: float, now: dt.datetime, source_id: str = "") -> dict:
    """{stale, reason, failure_days, last_success, ttl_h} d'une source (état de ``state.json``)."""
    ttl = max(ttl_hours(family, source_id), INTERVAL_FACTOR * interval_min / 60)
    last = _dt(st.get("last_success"))
    fails = int(st.get("consecutive_failures") or 0)
    age_h = (now - last).total_seconds() / 3600 if last else math.inf
    reason = None
    if fails >= FAILURES_STALE:
        reason = f"{fails} échecs consécutifs"
    elif age_h > ttl:
        reason = f"dernier succès il y a {age_h:.0f} h (> {ttl:.0f} h)"
    failure_days = age_h / 24 if fails and last else 0.0
    return {"stale": reason is not None, "reason": reason, "failure_days": round(min(failure_days, 30), 2),
            "last_success": st.get("last_success"), "ttl_h": ttl, "failures": fails,
            "last_state": st.get("last_state")}


# -- contrôles de page (404/410 et drapeaux de fin) --------------------------------------------------

# Intervalle de recontrôle par source (heures) : sources sans liste complète (R2 §3.1, §3.5).
RECHECK_H = {"lidl": 12, "studentbeans": 24, "unidays": 24, "preispirat": 8, "poinz": 24}
MAX_CHECKS_PER_RUN = 60
CHECK_TIME_BUDGET_S = 200
KEEP_CHECKS = 3


def page_flag(url: str, html: str, deal_id: str = "") -> str | None:
    """Drapeau de fin lu dans la page source : ``expired`` ou ``sold_out`` (sinon None)."""
    host = urlparse(url).netloc.lower()
    if host.endswith("preispirat.ch"):
        # L'article PRINCIPAL du post (« post-<id> ») ; les vignettes et le formulaire
        # « Deal abgelaufen » de la page ne comptent pas (faux positifs de R2 §4.1).
        pid = deal_id.split(":")[-1]
        for m in re.finditer(r"<article\b[^>]*\bclass=\"([^\"]*)\"", html):
            cls = m.group(1)
            if (pid and re.search(rf"\bpost-{re.escape(pid)}\b", cls)) or (not pid and "post-inner" in cls):
                return "expired" if re.search(r"\bexpired\b", cls) else None
        return None
    if host.endswith("qoqa.ch"):
        return "sold_out" if re.search(r"\"is_sold_out\"\s*:\s*true", html) else None
    if host.endswith("fust.ch"):
        code = (re.findall(r"(\d{6,})", urlparse(url).path) or [""])[-1]
        if not code:
            return None
        for m in re.finditer(re.escape(code), html):
            window = html[m.start(): m.start() + 3000]
            sm = re.search(r"\\?\"soldOut\\?\"\s*:\s*(true|false)", window)
            if sm:
                return "sold_out" if sm.group(1) == "true" else None
        return None
    return None


DAYS_LEFT = re.compile(r"<span[^>]*\bclass=\"[^\"]*\bdays_left\b[^\"]*\"[^>]*>(.*?)</span>", re.S)


def preispirat_days_left(html: str, now: dt.datetime) -> tuple[str | None, str | None]:
    """T_PP_REMAINING : compteur du post principal Preispirat (``<span class="days_left">``, avant
    l'article ; les listes du contenu ne comptent pas). → (drapeau, fin ISO) :
    « Abgelaufen » → ("expired", None) ; « Letzter Tag » → fin du jour ; « N Tage verbleibend » →
    maintenant + N jours ; sinon (None, None)."""
    m = DAYS_LEFT.search(html)
    if not m:
        return None, None
    t = re.sub(r"<[^>]+>", " ", m.group(1))
    if re.search(r"abgelaufen|expired", t, re.I):
        return "expired", None
    if re.search(r"letzter\s+tag", t, re.I):
        return None, now.replace(hour=23, minute=59, second=59, microsecond=0).isoformat()
    n = re.search(r"(\d+)\s*Tag(?:e|en)?\s+verbleibend", t, re.I)
    if n:
        return None, (now + dt.timedelta(days=int(n.group(1)))).replace(microsecond=0).isoformat()
    return None, None


def _redirected_away(url: str, final: str) -> bool:
    """Redirection vers une autre page (catégorie, accueil) : l'identifiant produit a disparu."""
    ids = re.findall(r"\d{5,}", urlparse(url).path)
    return bool(ids) and final != url and not any(i in final for i in ids)


def check_page(http, url: str, deal_id: str, now: dt.datetime) -> dict:
    """Un contrôle : {at, http, flag?, inconclusive?}. Jamais d'exception."""
    import requests
    from ..http import HostUnavailable, RobotsDisallowed
    out: dict = {"at": now.replace(microsecond=0).isoformat()}
    try:
        r = http.get(url, allow_redirects=True)
        out["http"] = r.status_code
        if _redirected_away(url, r.url):
            out["http"] = 404
            out["redirect"] = r.url[:200]
        else:
            flag = page_flag(url, r.text, deal_id)
            if urlparse(url).netloc.lower().endswith("preispirat.ch"):
                pflag, ends = preispirat_days_left(r.text, now)
                flag = flag or pflag
                if ends and not flag:
                    out["ends"] = ends
            if flag:
                out["flag"] = flag
    except RobotsDisallowed:
        out.update(http=None, inconclusive="robots")
    except HostUnavailable as e:
        out.update(http=None, inconclusive=str(e)[:80])
    except requests.HTTPError as e:
        status = getattr(e.response, "status_code", None)
        out["http"] = status
        if status not in GONE:
            out["inconclusive"] = f"HTTP {status}"
    except Exception as e:  # noqa: BLE001 — un contrôle raté n'est pas une preuve
        out.update(http=None, inconclusive=f"{type(e).__name__}"[:80])
    return out


def _check_url(d: dict) -> str | None:
    u = d.get("source_url") or d.get("offer_url")
    return u if isinstance(u, str) and u.startswith("http") else None


def due_checks(store, now: dt.datetime) -> list[dict]:
    """Deals à recontrôler, par priorité : 404 à confirmer (≥ 1 h), jamais contrôlés, plus anciens."""
    out = []
    for sid, interval_h in RECHECK_H.items():
        for d in store.source_deals(sid).values():
            if d.get("lifecycle") in ("EXPIRED", "REMOVED") or not _check_url(d):
                continue
            v = d.get("verify") or {}
            if v.get("state") == "ENDED" and v.get("code") != "T_GONE_404":
                continue
            checks = v.get("checks") or []
            last = _dt(checks[-1]["at"]) if checks else None
            pending = bool(checks) and checks[-1].get("http") in GONE
            blocked = v.get("state") in ("SUSPECT", "HIDDEN") and v.get("code") != "X_SOURCE_STALE"
            if pending and now - last >= CHECK_GAP:
                prio = 0
            elif blocked and (last is None or now - last >= CHECK_GAP):
                prio = 1   # masquée : recontrôle au prochain créneau, 1 h d'écart (R2 §3.5)
            elif last is None:
                prio = 2
            elif now - last >= dt.timedelta(hours=interval_h):
                prio = 3
            else:
                continue
            # Sources à preuve par page (Preispirat) d'abord : sans contrôle, la porte fail-closed les
            # laisse « unbestätigt » (V2-C §2.1).
            out.append((prio, sid not in PAGE_PROOF_SOURCES, checks[-1]["at"] if checks else "", d))
    out.sort(key=lambda x: x[:3])
    return [x[3] for x in out]


def run_checks(store, http, now: dt.datetime, limit: int = MAX_CHECKS_PER_RUN,
               budget_s: float = CHECK_TIME_BUDGET_S) -> dict:
    """Recontrôle poli (robots.txt, délai par hôte, UA honnête du scanner) d'un lot de pages."""
    t0, stats = time.monotonic(), {"checked": 0, "gone": 0, "flag": 0, "inconclusive": 0}
    for d in due_checks(store, now)[:limit]:
        if time.monotonic() - t0 > budget_s:
            break
        c = check_page(http, _check_url(d), d["deal_id"], now)
        v = d.setdefault("verify", {})
        v["checks"] = ((v.get("checks") or []) + [c])[-KEEP_CHECKS:]
        note_check(d)
        stats["checked"] += 1
        stats["gone"] += c.get("http") in GONE
        stats["flag"] += bool(c.get("flag"))
        stats["inconclusive"] += bool(c.get("inconclusive"))
    log.info("recontrôle de pages : %s", stats)
    return stats


# -- évaluation ----------------------------------------------------------------------------------------

def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def logit(p: float) -> float:
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def verified_at(d: dict, health: dict | None) -> str | None:
    """Dernière vérification réussie de l'offre : le dernier succès de sa source si l'offre y était
    (relevé à 6 h près, cf. engine.SEEN_GRANULARITY), sinon son dernier relevé ; un contrôle de
    page 200 sans drapeau plus récent l'emporte."""
    seen = d.get("last_seen_at")
    best = seen
    if health and health.get("last_success") and seen and not d.get("missing_scans"):
        ls, sd = _dt(health["last_success"]), _dt(seen)
        if ls and sd and sd >= ls - dt.timedelta(hours=6) and ls > sd:
            best = health["last_success"]
    for c in (d.get("verify") or {}).get("checks") or []:
        if c.get("http") == 200 and not c.get("flag") and (best is None or c["at"] > best):
            best = c["at"]
    return best


# Sources dont la présence dans la liste ne prouve pas que l'offre vit encore : le flux RSS de
# Preispirat garde les posts « Abgelaufen » (V2-C : 4/10 affichés). Seule la page relue est une preuve.
PAGE_PROOF_SOURCES = {"preispirat"}


def proof_at(d: dict, health: dict | None) -> str | None:
    """``last_verified_at`` : dernière preuve POSITIVE que l'offre est encore là (porte fail-closed)."""
    if d.get("source_id") in PAGE_PROOF_SOURCES:
        ok = [c["at"] for c in (d.get("verify") or {}).get("checks") or []
              if c.get("http") == 200 and not c.get("flag") and not c.get("inconclusive")]
        return max(ok) if ok else None
    return verified_at(d, health)


def fresh_ok(proof: str | None, now: dt.datetime, ttl_h: float) -> bool:
    """Porte fail-closed (V2-C §2.1) : une preuve positive existe et date de moins du TTL."""
    t = _dt(proof)
    return t is not None and (now - t).total_seconds() / 3600 <= ttl_h


def checked_end(d: dict) -> str | None:
    """Fin lue sur la page source au dernier contrôle qui en donne une (T_PP_REMAINING)."""
    for c in reversed((d.get("verify") or {}).get("checks") or []):
        if c.get("ends"):
            return c["ends"]
    return None


def _check_rules(checks: list[dict]) -> tuple[str | None, str | None]:
    """(état, code) imposé par les contrôles de page, ou (None, None)."""
    if not checks:
        return None, None
    last = checks[-1]
    if last.get("flag"):
        return "ENDED", "T_SRC_EXPIRED_FLAG"
    if last.get("http") in GONE:
        prev = next((c for c in reversed(checks[:-1]) if not c.get("inconclusive")), None)
        if prev and prev.get("http") in GONE and _dt(last["at"]) - _dt(prev["at"]) >= CHECK_GAP:
            return "ENDED", "T_GONE_404"
        return "SUSPECT", "T_GONE_404_PENDING"
    return None, None


def assess(d: dict, health: dict | None, now: dt.datetime) -> dict:
    """Évaluation pure d'une offre : {state, code, p, rules, verified_at, unit_incoherent}."""
    rules: list[str] = []
    va = verified_at(d, health)
    fam = d.get("family") or "retail"
    ttl = ttl_hours(fam, d.get("source_id", ""))
    if region_excluded(d):
        rules.append("R_REGION")
    if absent_chain(d):
        rules.append("R_NO_STORE_NEARBY")
    ui = unit_incoherent(d)
    if ui:
        rules.append("P_UNIT_INCOHERENT")
    read_rules, patch = reading_rules(d)
    rules += read_rules
    proof = proof_at(d, health)
    res = {"rules": rules, "verified_at": proof, "unit_incoherent": ui, "patch": patch}
    end = _dt(d.get("ends_at"))
    if end and end < now:
        return {**res, "state": "ENDED", "code": "T_EXPIRED", "p": 0.0}
    pp_end = None if d.get("ends_at") else checked_end(d)
    if pp_end:
        rules.append("T_PP_REMAINING")
        patch["ends_at"] = pp_end
        if _dt(pp_end) < now:
            return {**res, "state": "ENDED", "code": "T_PP_REMAINING", "p": 0.0}
    checks = (d.get("verify") or {}).get("checks") or []
    st, code = _check_rules(checks)
    if d.get("sold_out") is True:
        st, code = "ENDED", "T_SRC_EXPIRED_FLAG"
    if st == "ENDED":
        return {**res, "state": st, "code": code, "p": 0.0}
    if health and health.get("stale"):
        return {**res, "state": "HIDDEN", "code": "X_SOURCE_STALE", "p": 0.0}
    # Score (R2 §3.3) — poids de départ, HYPOTHÈSE à calibrer sur l'audit hebdomadaire.
    l = logit(PRIOR.get(d.get("source_id", ""), DEFAULT_PRIOR))
    vad = _dt(va)
    age_h = (now - vad).total_seconds() / 3600 if vad else 3 * ttl
    l += 2.0 * (age_h <= 24)
    l -= 1.0 * min(max(age_h, 0) / ttl, 3)
    l -= 1.5 * (health or {}).get("failure_days", 0)
    l += 0.7 * min(len(d.get("corroborated_by") or []), 2)
    if not d.get("ends_at") and not pp_end:
        l -= 0.8
        first = _dt(d.get("first_seen_at"))
        days = (now - first).total_seconds() / 86400 if first else 0
        l -= 0.5 * min(max(days, 0) / 7, 2)       # plafond : HYPOTHÈSE (pas de masquage de masse)
    l -= 0.6 * ui
    p = round(sigmoid(l), 3)
    if st == "SUSPECT":                             # 404 unique : à confirmer, non listée
        return {**res, "state": st, "code": code, "p": min(p, 0.49)}
    start = _dt(d.get("starts_at"))
    if start and start > now:
        state = "UPCOMING"
    else:
        state = "VERIFIED" if p >= P_VERIFIED else "UNCONFIRMED" if p >= P_UNCONFIRMED else \
            "SUSPECT" if p >= P_SUSPECT else "HIDDEN"
    # Porte fail-closed (V2-C §2.1, X_NOT_RECHECKED) : p peut rester haut par l'a priori de la source,
    # sans preuve récente. Sans revérification réussie dans le TTL, l'offre n'est jamais VERIFIED.
    if state == "VERIFIED" and not fresh_ok(proof, now, ttl):
        rules.append("X_NOT_RECHECKED")
        return {**res, "state": "UNCONFIRMED", "code": "X_NOT_RECHECKED", "p": min(p, P_VERIFIED - 0.001)}
    return {**res, "state": state, "code": "SCORE", "p": p}


BLOCKED = ("SUSPECT", "HIDDEN", "ENDED")


def transition(d: dict, a: dict, now: dt.datetime, health: dict | None, journal: list | None) -> dict:
    """Applique l'hystérésis à l'évaluation ``a`` et persiste l'état stable dans ``d['verify']``.

    Seuls les états masqués (SUSPECT, HIDDEN, ENDED) et les contrôles de page sont persistés ; une
    offre listée (VERIFIED, UNCONFIRMED, UPCOMING) n'écrit rien. Le journal reçoit chaque entrée
    dans un état masqué, chaque changement de code masqué et chaque réaffichage."""
    if a["code"] == "T_EXPIRED":
        # Fin publiée par la source : déjà portée par ``lifecycle`` (EXPIRED), rien à persister
        # (sinon chaque jeudi réécrirait toutes les actions de la semaine).
        return {**a, "since": d.get("ends_at")}
    prev = d.get("verify") or {}
    before, before_code = prev.get("state"), prev.get("code")
    state, code = a["state"], a["code"]
    if before in BLOCKED and state in LISTED:
        streak = int(prev.get("ok_streak") or 0)
        lifted = before_code == "X_SOURCE_STALE" and not (health or {}).get("stale")
        if lifted or streak >= 2:
            code = "REINSTATED"
        else:
            state, code = before, before_code   # pas encore 2 vérifications OK : on attend
    changed = state in BLOCKED and (state != before or code != before_code) or code == "REINSTATED"
    v = dict(prev)
    if changed:
        if journal is not None:
            ev: dict = {"url": _check_url(d), "rules": a["rules"]}
            if prev.get("checks"):
                ev["checks"] = [{k: c[k] for k in ("at", "http", "flag", "redirect") if k in c} for c in prev["checks"]]
            if (health or {}).get("reason"):
                ev["source"] = health["reason"]
            journal.append({"at": now.replace(microsecond=0).isoformat(), "deal_id": d["deal_id"],
                            "from": before or "LISTED", "to": state, "code": code, "p_after": a["p"],
                            "rule_version": RULE_VERSION, "evidence": ev})
        if state in BLOCKED:
            v.update(state=state, code=code, since=now.replace(microsecond=0).isoformat(), ok_streak=0)
    if state not in BLOCKED:
        for k in ("state", "code", "since", "ok_streak"):
            v.pop(k, None)
    if v:
        d["verify"] = v
    else:
        d.pop("verify", None)
    return {**a, "state": state, "code": code, "since": v.get("since")}


def note_seen(rec: dict) -> None:
    """Appelé par engine.apply pour une offre revue dans un passage réussi : +1 vérification OK
    si elle est masquée (seules les offres masquées sont réécrites)."""
    v = rec.get("verify")
    if v and v.get("state") in ("SUSPECT", "HIDDEN", "ENDED"):
        v["ok_streak"] = int(v.get("ok_streak") or 0) + 1


def note_check(rec: dict) -> None:
    """Après un contrôle de page : 200 sans drapeau = +1 vérification OK ; 404/drapeau = remise à 0."""
    v = rec.get("verify") or {}
    c = (v.get("checks") or [{}])[-1]
    if c.get("inconclusive"):
        return
    if c.get("http") == 200 and not c.get("flag"):
        if v.get("state") in ("SUSPECT", "HIDDEN", "ENDED"):
            v["ok_streak"] = int(v.get("ok_streak") or 0) + 1
    else:
        v["ok_streak"] = 0


def connector_health(store, cfg, now: dt.datetime) -> dict[str, dict]:
    from ..connectors import enabled_connectors
    out = {}
    for c in enabled_connectors(cfg):
        out[c.id] = source_health(store.source_state(c.id), c.family, c.min_interval, now, c.id)
    return out


def denner_health(radar_store, now: dt.datetime) -> dict:
    rs = radar_store.state
    return source_health({"last_success": rs.get("last_success"),
                          "consecutive_failures": rs.get("consecutive_failures", 0),
                          "last_state": "SCRAPE_FAILURE" if rs.get("consecutive_failures") else "OK"},
                         "grocery", 24 * 60 / 4, now, "denner")


def assess_all(store, radar_store, cfg, now: dt.datetime, den: list[dict] | None = None,
               persist: bool = False, journal: list | None = None) -> dict[str, dict]:
    """Évalue toutes les offres (moteur universel + Denner V2). Avec ``persist``, l'état stable
    est écrit dans les deals du store et les transitions dans ``journal``."""
    health = connector_health(store, cfg, now)
    out = {}
    for sid, deals in store.deals.items():
        h = health.get(sid)
        for d in deals.values():
            if d.get("lifecycle") in ("EXPIRED", "REMOVED") and not d.get("verify"):
                continue
            a = assess(d, h, now)
            if persist:
                a = transition(d, a, now, h, journal)
            else:
                prev = d.get("verify") or {}
                tmp = {"deal_id": d["deal_id"], "verify": dict(prev)} if prev else {"deal_id": d["deal_id"]}
                a = transition(tmp, a, now, h, None)
            out[d["deal_id"]] = a
    dh = denner_health(radar_store, now) if radar_store is not None else None
    for d in den or []:
        out[d["deal_id"]] = assess(d, dh, now)
    return out


def export_fields(d: dict, a: dict | None) -> dict:
    """Champs publiés dans universal.json (lus par web/lib/project.ts)."""
    if not a:
        return {}
    out = {"state": a["state"], "state_reason": a["code"], "verify_p": a["p"]}
    # Rang 0 V2-C : ``last_verified_at`` = dernière preuve positive (porte fail-closed, « Zuletzt an der
    # Quelle gesehen ») ; ``last_seen_at`` (dernier relevé dans la liste source) est publié par ucli.
    if a.get("verified_at"):
        out["last_verified_at"] = a["verified_at"]
    if a.get("since") and a["state"] in ("ENDED", "HIDDEN", "SUSPECT"):
        out["state_since"] = a["since"]
    if a["rules"]:
        out["verify_rules"] = a["rules"]
    if "R_REGION" in a["rules"]:
        out["region_excluded"] = True
    return out


def apply_patch(out: dict, patch: dict | None) -> dict:
    """Correctifs d'affichage des règles de lecture, appliqués au deal exporté."""
    if not patch:
        return out
    if patch.get("ref_hidden"):
        for k in ("reference_price", "regular_price", "discount_percentage", "discount_absolute", "effective_discount",
                  "net_savings", "deal_score"):
            out.pop(k, None)
        out["reference_price_type"] = "none"
    if patch.get("price_is_from"):
        # « ab CHF X » : aucune économie chiffrée sur un prix plancher.
        for k in ("discount_percentage", "discount_absolute", "effective_discount", "net_savings", "deal_score"):
            out.pop(k, None)
    if patch.get("size_unknown"):
        for k in ("quantity", "package_size", "unit_price", "unit"):
            out.pop(k, None)
    if patch.get("ends_at") and not out.get("ends_at"):
        out["ends_at"] = patch["ends_at"]
    for k in ("online_only", "price_is_from", "zero_then_price", "size_unknown", "ref_hidden"):
        if patch.get(k) is not None:
            out[k] = patch[k]
    return out
