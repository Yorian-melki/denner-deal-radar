"""Distribution publique : canal Telegram par ville + kit de partage.

Distinct des alertes privées (notify.py / core/ualerts.py), qui restent
inchangées. Ici, tout est public : aucune donnée personnelle (pertinence,
distance, favoris) n'est utilisée, seulement la note absolue du deal.

    u-channel  --dry-run|--send [--city st-gallen] [--mode auto|daily|instant]
        (a) Top 3 du jour, au premier passage entre 18:00 et 22:00 (Europe/Zurich)
        (b) post instantané si note >= instant_min_score (8,5 par défaut)
        Anti-spam : N posts instantanés max / jour, intervalle minimal, jamais
        deux fois le même deal (ni la même entité canonique), heures calmes
        22:00-07:30. État : data/universal/channel_state.json.
    u-sharekit [--city st-gallen]
        data/universal/sharekit/<date>.md : textes prêts à coller (WhatsApp,
        Telegram, légende Instagram) du Top 3, en DE/FR/EN.

Formulation honnête : pas de fausse urgence, la référence de prix est nommée
(« UVP », « prix concurrent »…), les deals à réduction invraisemblable (erreur
de parsing probable) ne sont jamais publiés — même règle que le site
(web/lib/project.ts isPlausible).
"""
from __future__ import annotations

import copy
import datetime as dt
import html
import json
import logging
import os
import time
import tomllib
import unicodedata
import re
from pathlib import Path
from zoneinfo import ZoneInfo

log = logging.getLogger("radar.channel")

# --------------------------------------------------------------------------
# Slug : parité exacte avec web/lib/project.ts (slugify + FNV-1a base36)
# --------------------------------------------------------------------------

_B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def slugify(s: str, max_len: int = 60) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = re.sub("[̀-ͯ]", "", s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:max_len].rstrip("-")


def short_hash(s: str) -> str:
    """FNV-1a 32 bits sur les unités UTF-16 (comme String.charCodeAt en JS), base 36."""
    h = 0x811C9DC5
    units = s.encode("utf-16-le")
    for i in range(0, len(units), 2):
        h ^= units[i] | (units[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    if h == 0:
        return "0"
    out = ""
    while h:
        h, r = divmod(h, 36)
        out = _B36[r] + out
    return out


def deal_slug(deal_id: str, title: str) -> str:
    return f"{slugify(title) or 'deal'}-{short_hash(deal_id)}"


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

DEFAULTS = {
    "timezone": "Europe/Zurich", "site_name_default": "Deal Radar", "site_url_default": "",
    "daily_hour": 18, "daily_until_hour": 22, "daily_top_n": 3, "daily_min_score": 6.0,
    "daily_max_per_source": 1, "instant_min_score": 8.5, "max_instant_per_day": 3,
    "min_minutes_between_instant": 60, "min_confidence": 0.5, "quiet_start": "22:00",
    "quiet_end": "07:30", "repost_memory_days": 60, "page_min_score": 5.0,
}
DEFAULT_CITY = {"st-gallen": {"name": "St. Gallen", "country": "CH", "lang": "de", "local": True,
                              "channel_env": "TELEGRAM_CHANNEL_ID"}}


def load_config(root: Path) -> dict:
    p = Path(root) / "config" / "channel.toml"
    data = tomllib.loads(p.read_text("utf-8")) if p.exists() else {}
    ch = {**DEFAULTS, **data.get("channel", {})}
    ch["cities"] = data.get("cities") or DEFAULT_CITY
    return ch


def site_info(ccfg: dict) -> tuple[str, str]:
    """(nom, url) : variables d'environnement d'abord (marque non définitive)."""
    name = os.environ.get("SITE_NAME") or os.environ.get("NEXT_PUBLIC_SITE_NAME") or ccfg["site_name_default"]
    url = os.environ.get("SITE_URL") or os.environ.get("NEXT_PUBLIC_SITE_URL") or ccfg["site_url_default"] or ""
    return name.strip() or "Deal Radar", url.strip().rstrip("/")


# --------------------------------------------------------------------------
# Sélection
# --------------------------------------------------------------------------

LOCAL_SCOPES = {"LOCAL", "NEARBY", "REGIONAL"}
HIDDEN_LIFECYCLE = {"EXPIRED", "REMOVED", "SOURCE_FAILURE", "UPCOMING"}
IMPLAUSIBLE_DISCOUNT = {"grocery": 80, "retail": 85, "tech": 85, "flash": 90, "refurbished": 85}


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _dt(iso: str | None, tz) -> dt.datetime | None:
    if not iso:
        return None
    try:
        x = dt.datetime.fromisoformat(iso)
    except ValueError:
        return None
    return x if x.tzinfo else x.replace(tzinfo=tz)


def discount(d: dict):
    v = _num(d.get("effective_discount"))
    return v if v is not None else _num(d.get("discount_percentage"))


def plausible(d: dict) -> bool:
    mx, pct = IMPLAUSIBLE_DISCOUNT.get(d.get("family")), discount(d)
    return mx is None or pct is None or pct <= mx


def offer_url(d: dict) -> str | None:
    for k in ("offer_url", "source_url"):
        u = d.get(k)
        if isinstance(u, str) and re.match(r"^https?://", u.strip()):
            return u.strip()
    return None


FEED_COUNTRY = "CH"   # le flux du scanner (web/config/cities.ts, feed ch-sg)


def in_city(d: dict, city: dict) -> bool:
    """Même règle que le site : local -> villes du flux seulement ; sinon tout le pays."""
    if city.get("country", FEED_COUNTRY) != FEED_COUNTRY:
        return False
    geo = d.get("geographic_scope_resolved") or d.get("geographic_scope") or "NATIONAL"
    return bool(city.get("local")) if geo in LOCAL_SCOPES else True


def publishable(d: dict, now: dt.datetime, city: dict, ccfg: dict) -> bool:
    if not d.get("deal_id") or not d.get("title") or not offer_url(d):
        return False
    if d.get("lifecycle") in HIDDEN_LIFECYCLE or d.get("duplicate_of") or d.get("sold_out") is True:
        return False
    end, start = _dt(d.get("ends_at"), now.tzinfo), _dt(d.get("starts_at"), now.tzinfo)
    if (end and end < now) or (start and start > now):
        return False
    if not in_city(d, city) or not plausible(d):
        return False
    s = _num(d.get("deal_score"))
    return s is not None and (_num(d.get("score_confidence")) or 0) >= float(ccfg["min_confidence"])


def rank_key(d: dict):
    return (_num(d.get("deal_score")) or -1, _num(d.get("score_confidence")) or 0, discount(d) or -1)


def already_posted(d: dict, posted: dict) -> bool:
    ent = d.get("canonical_entity_id")
    return d["deal_id"] in posted or bool(ent and ("e:" + ent) in posted)


def select_top(deals: list[dict], now, city: dict, ccfg: dict, posted: dict | None = None,
               n: int | None = None) -> list[dict]:
    posted = posted or {}
    n = int(ccfg["daily_top_n"]) if n is None else n
    per_src, seen, out = {}, set(), []
    for d in sorted((d for d in deals if publishable(d, now, city, ccfg)), key=rank_key, reverse=True):
        if d["deal_score"] < float(ccfg["daily_min_score"]) or already_posted(d, posted):
            continue
        slug = deal_slug(d["deal_id"], d["title"])
        if slug in seen or per_src.get(d.get("source_id"), 0) >= int(ccfg["daily_max_per_source"]):
            continue
        seen.add(slug)
        per_src[d.get("source_id")] = per_src.get(d.get("source_id"), 0) + 1
        out.append(d)
        if len(out) >= n:
            break
    return out


def select_instant(deals: list[dict], now, city: dict, ccfg: dict, posted: dict) -> list[dict]:
    th = float(ccfg["instant_min_score"])
    return sorted((d for d in deals if publishable(d, now, city, ccfg) and d["deal_score"] >= th
                   and not already_posted(d, posted)), key=rank_key, reverse=True)


def _hm(s: str) -> int:
    h, m = (s.split(":") + ["0"])[:2]
    return int(h) * 60 + int(m)


def in_quiet_hours(now: dt.datetime, ccfg: dict) -> bool:
    qs, qe, m = _hm(str(ccfg["quiet_start"])), _hm(str(ccfg["quiet_end"])), now.hour * 60 + now.minute
    return (m >= qs or m < qe) if qs > qe else (qs <= m < qe)


# --------------------------------------------------------------------------
# Textes (DE / FR / EN) — formulation factuelle, sans fausse urgence
# --------------------------------------------------------------------------

T = {
    "de": {"days": ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"], "until": "gültig bis", "score": "Bewertung",
           "why": "Warum", "go": "Zum Deal", "free": "Gratis", "no_ref": "kein Vergleichspreis veröffentlicht",
           "stated": "Rabatt laut Anbieter", "top": "Top {n} des Tages", "instant": "Aussergewöhnlicher Deal",
           "all": "Alle Deals", "asof": "Angaben der Anbieter, Stand {t}. Preise können sich ändern.",
           "conf": "Datenqualität {p} %", "code": "Code", "cond": "Bedingung",
           "student": "nur für Studierende", "member": "nur für Mitglieder", "approx": "voraussichtlich",
           "ref": {"merchant_previous": "vorher", "msrp": "UVP", "competitor": "Konkurrenzpreis",
                   "declared_value": "angegebener Wert", "market": "Marktpreis", "catalog": "Katalogpreis",
                   "community_claimed": "Vergleich (Community)", "_": "Vergleichspreis"},
           "w_ref": "{p} % unter {r}", "w_stated": "nur vom Anbieter angegebener Rabatt ({p} %)",
           "w_median": "{p} % unter dem beobachteten Medianpreis", "w_record": "tiefster je beobachteter Preis",
           "w_saving": "Ersparnis ca. {c} {s}", "w_cap": "Bewertung begrenzt (Referenz nicht bestätigt)",
           "w_free": "kostenlos", "link_bio": "Link in der Bio", "story": "Teilen erwünscht"},
    "fr": {"days": ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."], "until": "valable jusqu'au",
           "score": "Note", "why": "Pourquoi", "go": "Voir le deal", "free": "Gratuit",
           "no_ref": "aucun prix de référence publié", "stated": "rabais annoncé par le marchand",
           "top": "Top {n} du jour", "instant": "Deal exceptionnel", "all": "Tous les deals",
           "asof": "Données des marchands, état à {t}. Les prix peuvent changer.",
           "conf": "fiabilité {p} %", "code": "Code", "cond": "Condition",
           "student": "réservé aux étudiants", "member": "réservé aux membres", "approx": "probablement",
           "ref": {"merchant_previous": "avant", "msrp": "prix conseillé", "competitor": "prix concurrent",
                   "declared_value": "valeur annoncée", "market": "prix du marché", "catalog": "prix catalogue",
                   "community_claimed": "référence (communauté)", "_": "référence"},
           "w_ref": "{p} % sous le {r}", "w_stated": "rabais annoncé seulement par le marchand ({p} %)",
           "w_median": "{p} % sous le prix médian observé", "w_record": "plus bas prix jamais observé",
           "w_saving": "économie d'environ {c} {s}", "w_cap": "note plafonnée (référence non confirmée)",
           "w_free": "gratuit", "link_bio": "lien dans la bio", "story": "à partager"},
    "en": {"days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "until": "valid until", "score": "Score",
           "why": "Why", "go": "See the deal", "free": "Free", "no_ref": "no reference price published",
           "stated": "discount stated by the seller", "top": "Top {n} of the day", "instant": "Exceptional deal",
           "all": "All deals", "asof": "Seller data as of {t}. Prices may change.",
           "conf": "data confidence {p} %", "code": "Code", "cond": "Condition",
           "student": "students only", "member": "members only", "approx": "probably",
           "ref": {"merchant_previous": "before", "msrp": "RRP", "competitor": "competitor price",
                   "declared_value": "stated value", "market": "market price", "catalog": "list price",
                   "community_claimed": "community reference", "_": "reference"},
           "w_ref": "{p} % below the {r}", "w_stated": "discount stated by the seller only ({p} %)",
           "w_median": "{p} % below the observed median price", "w_record": "lowest price ever observed",
           "w_saving": "saves about {c} {s}", "w_cap": "score capped (reference not confirmed)",
           "w_free": "free", "link_bio": "link in bio", "story": "feel free to share"},
}


def _t(lang: str) -> dict:
    return T.get(lang, T["de"])


def money(v: float, cur: str) -> str:
    return f"{cur} {v:.2f}".replace(".00", ".–") if cur == "CHF" else f"{cur} {v:.2f}"


def price_line(d: dict, lang: str) -> str:
    t, cur = _t(lang), d.get("currency") or "CHF"
    p, r, pct = _num(d.get("current_price")), _num(d.get("reference_price")), discount(d)
    if p == 0 or (p is None and d.get("family") in ("free", "digital_free")):
        return t["free"] + (f" ({t['ref'].get(d.get('reference_price_type'), t['ref']['_'])} {money(r, cur)})"
                            if r else "")
    if p is None:
        return f"−{pct:.0f} % ({t['stated']})" if pct is not None else t["no_ref"]
    s = money(p, cur)
    if r is not None and r > p:
        label = t["ref"].get(d.get("reference_price_type"), t["ref"]["_"])
        s += f" · {label} {money(r, cur)}"
        if pct is not None:
            s += f" (−{pct:.0f} %)"
    elif pct is not None:
        s += f" (−{pct:.0f} %, {t['stated']})"
    else:
        s += f" · {t['no_ref']}"
    return s


def ends_text(d: dict, lang: str, tz) -> str | None:
    end = _dt(d.get("ends_at"), tz)
    if not end:
        return None
    end, t = end.astimezone(tz), _t(lang)
    approx = f"{t['approx']} " if d.get("ends_inferred") is True else ""
    return f"{approx}{t['until']} {t['days'][end.weekday()]} {end:%d.%m.}"


def why_text(d: dict, lang: str) -> str:
    t = _t(lang)
    comps = [str(c[0]) for c in (d.get("score_components") or []) if c and c[0]]
    joined = " ".join(comps).lower()
    pct, parts = discount(d), []
    if d.get("family") in ("free", "digital_free") or _num(d.get("current_price")) == 0:
        parts.append(t["w_free"])
    if "médiane observée" in joined and pct is not None:
        parts.append(t["w_median"].format(p=f"{pct:.0f}"))
    elif "pourcentage annoncé seul" in joined and pct is not None:
        parts.append(t["w_stated"].format(p=f"{pct:.0f}"))
    elif pct is not None and _num(d.get("reference_price")) is not None:
        label = t["ref"].get(d.get("reference_price_type"), t["ref"]["_"])
        if d.get("reference_price_type") == "merchant_previous":
            label = {"de": "dem früheren Preis", "fr": "prix précédent", "en": "previous price"}.get(lang, label)
        parts.append(t["w_ref"].format(p=f"{pct:.0f}", r=label))
    if "record" in joined:
        parts.append(t["w_record"])
    sav = _num(d.get("net_savings"))
    if sav and sav >= 15:
        parts.append(t["w_saving"].format(c=d.get("currency") or "CHF", s=f"{sav:.0f}"))
    if "plafonnée" in joined:
        parts.append(t["w_cap"])
    conf = _num(d.get("score_confidence"))
    if conf is not None:
        parts.append(t["conf"].format(p=round(conf * 100)))
    return " · ".join(parts)


def deal_link(d: dict, site_url: str, ccfg: dict) -> str:
    """Page publique du deal si le site en génère une (note >= 5, plausible), sinon l'offre."""
    if site_url and plausible(d) and (_num(d.get("deal_score")) or -1) >= float(ccfg["page_min_score"]):
        return f"{site_url}/deal/{deal_slug(d['deal_id'], d['title'])}"
    return offer_url(d) or site_url


def _esc(s) -> str:
    return html.escape(str(s or ""), quote=False)


def _extras(d: dict, lang: str) -> list[str]:
    t, out = _t(lang), []
    if d.get("requires_student") is True or d.get("family") == "student":
        out.append(t["student"])
    elif d.get("access") == "MEMBER":
        out.append(t["member"])
    if d.get("coupon_code"):
        out.append(f"{t['code']}: {d['coupon_code']}")
    conds = [c for c in (d.get("conditions") or []) if isinstance(c, str) and c.strip()]
    if conds:
        out.append(f"{t['cond']}: {conds[0][:110]}")
    return out


def format_instant(d: dict, city: dict, site: tuple[str, str], ccfg: dict, now: dt.datetime) -> str:
    lang, (name, url) = city.get("lang", "de"), site
    t = _t(lang)
    L = [f"⭐ <b>{_esc(t['instant'])} · {_esc(city['name'])}</b>", "",
         f"<b>{_esc(d['title'][:140])}</b>",
         _esc(price_line(d, lang)),
         f"{t['score']}: <b>{d['deal_score']:.1f}/10</b>"]
    e = ends_text(d, lang, now.tzinfo)
    if e:
        L.append(_esc(e))
    L += [_esc(x) for x in _extras(d, lang)]
    w = why_text(d, lang)
    if w:
        L.append(f"{t['why']}: {_esc(w)}")
    L += ["", f"<a href=\"{_esc(deal_link(d, url, ccfg))}\">{_esc(t['go'])}</a>",
          f"<i>{_esc(t['asof'].format(t=now.strftime('%H:%M')))}</i> — {_esc(name)}"]
    return "\n".join(L)


def format_daily(top: list[dict], city: dict, site: tuple[str, str], ccfg: dict, now: dt.datetime) -> str:
    lang, (name, url) = city.get("lang", "de"), site
    t = _t(lang)
    L = [f"🏆 <b>{_esc(t['top'].format(n=len(top)))} · {_esc(city['name'])}</b> ({now:%d.%m.})", ""]
    for i, d in enumerate(top, 1):
        meta = [f"{t['score']} {d['deal_score']:.1f}/10"]
        e = ends_text(d, lang, now.tzinfo)
        if e:
            meta.append(e)
        L.append(f"{i}. <b>{_esc(d['title'][:110])}</b>")
        L.append("   " + _esc(price_line(d, lang)))
        L.append("   " + _esc(" · ".join(meta)))
        for x in _extras(d, lang):
            L.append("   " + _esc(x))
        w = why_text(d, lang)
        if w:
            L.append(f"   {t['why']}: {_esc(w)}")
        L.append(f"   <a href=\"{_esc(deal_link(d, url, ccfg))}\">{_esc(t['go'])}</a>")
        L.append("")
    if url:
        L.append(f"🔗 <a href=\"{_esc(url)}/{_esc(city_slug(city))}\">{_esc(t['all'])}</a>")
    L.append(f"<i>{_esc(t['asof'].format(t=now.strftime('%H:%M')))}</i> — {_esc(name)}")
    return "\n".join(L)


def city_slug(city: dict) -> str:
    return city.get("slug") or slugify(city.get("name", ""))


# --------------------------------------------------------------------------
# Planification + état
# --------------------------------------------------------------------------

def city_state(state: dict, slug: str) -> dict:
    cs = state.setdefault("cities", {}).setdefault(slug, {})
    cs.setdefault("posted", {})
    cs.setdefault("days", {})
    return cs


def mark_posted(cs: dict, d: dict, at: str) -> None:
    cs["posted"][d["deal_id"]] = at
    if d.get("canonical_entity_id"):
        cs["posted"]["e:" + d["canonical_entity_id"]] = at


def purge(cs: dict, now: dt.datetime, ccfg: dict) -> None:
    cut = (now - dt.timedelta(days=int(ccfg["repost_memory_days"]))).isoformat()
    cs["posted"] = {k: v for k, v in cs["posted"].items() if v >= cut}
    keep = (now - dt.timedelta(days=14)).date().isoformat()
    cs["days"] = {k: v for k, v in cs["days"].items() if k >= keep}


def run(deals: list[dict], city: dict, ccfg: dict, cs: dict, now: dt.datetime, send, site: tuple[str, str],
        mode: str = "auto") -> dict:
    """Décide quoi poster, appelle send(text, preview) et met à jour l'état ``cs``
    seulement après un envoi réussi. Retourne un rapport."""
    rep = {"posted": [], "reason": None}
    if in_quiet_hours(now, ccfg):
        rep["reason"] = "heures calmes"
        return rep
    at = now.replace(microsecond=0).isoformat()
    day = cs["days"].setdefault(now.date().isoformat(), {"instant": 0, "daily": False})

    if mode in ("auto", "instant"):
        last = _dt(cs.get("last_instant_at"), now.tzinfo)
        gap_ok = not last or now - last >= dt.timedelta(minutes=int(ccfg["min_minutes_between_instant"]))
        cands = select_instant(deals, now, city, ccfg, cs["posted"])
        if cands and day["instant"] >= int(ccfg["max_instant_per_day"]):
            rep["reason"] = "plafond quotidien de posts instantanés atteint"
        elif cands and not gap_ok:
            rep["reason"] = "intervalle minimal entre posts instantanés"
        elif cands:
            d = cands[0]
            send(format_instant(d, city, site, ccfg, now), True)
            mark_posted(cs, d, at)
            day["instant"] += 1
            cs["last_instant_at"] = at
            rep["posted"].append({"kind": "instant", "ids": [d["deal_id"]]})

    if mode in ("auto", "daily") and not day.get("daily"):
        h = now.hour
        if int(ccfg["daily_hour"]) <= h < int(ccfg["daily_until_hour"]) or mode == "daily":
            top = select_top(deals, now, city, ccfg, cs["posted"])
            if top:
                send(format_daily(top, city, site, ccfg, now), False)
                for d in top:
                    mark_posted(cs, d, at)
                day["daily"] = True
                rep["posted"].append({"kind": "daily", "ids": [d["deal_id"] for d in top]})
            else:
                rep["reason"] = rep["reason"] or "aucun deal publiable pour le Top du jour"
    return rep


# --------------------------------------------------------------------------
# Envoi Telegram (canal)
# --------------------------------------------------------------------------

def telegram_post(token: str, chat_id: str, text: str, preview: bool) -> None:
    import requests
    for attempt in range(4):
        r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", timeout=30, json={
            "chat_id": chat_id, "text": text, "parse_mode": "HTML",
            "link_preview_options": {"is_disabled": not preview}})
        if r.status_code == 429:
            time.sleep(int(r.json().get("parameters", {}).get("retry_after", 5)) + 1)
            continue
        if r.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        if not r.ok:
            raise RuntimeError(f"Telegram {r.status_code}: {r.text[:200]}")
        return
    raise RuntimeError("Telegram : trop de tentatives")


# --------------------------------------------------------------------------
# Données + E/S
# --------------------------------------------------------------------------

def load_deals(cfg, now: dt.datetime) -> list[dict]:
    from .connectors import denner_v2
    from .core.store import UStore
    from .storage import Store
    deals = list(UStore(cfg.data_dir).all_deals())
    try:
        deals += denner_v2.deals(Store(cfg.data_dir), now)
    except Exception as e:  # noqa: BLE001 — Denner absent ne bloque pas le canal
        log.warning("deals Denner ignorés : %s", e)
    return deals


def state_path(cfg) -> Path:
    return Path(cfg.data_dir) / "universal" / "channel_state.json"


def read_state(p: Path) -> dict:
    try:
        return json.loads(p.read_text("utf-8"))
    except FileNotFoundError:
        return {}


def write_state(p: Path, state: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True) + "\n", "utf-8")


def _city(ccfg: dict, slug: str | None) -> dict:
    cities = ccfg["cities"]
    slug = slug or next(iter(cities))
    if slug not in cities:
        raise SystemExit(f"ville inconnue : {slug} (config/channel.toml : {', '.join(cities)})")
    return {**cities[slug], "slug": slug}


def _now(tz: ZoneInfo, override: str | None) -> dt.datetime:
    if override:
        n = dt.datetime.fromisoformat(override)
        return n.astimezone(tz) if n.tzinfo else n.replace(tzinfo=tz)
    return dt.datetime.now(tz)


def cmd_channel(args) -> int:
    from .config import load
    cfg = load()
    ccfg = load_config(cfg.root)
    tz = ZoneInfo(ccfg["timezone"])
    now = _now(tz, args.now)
    city = _city(ccfg, args.city)
    chat = os.environ.get(city.get("channel_env", "TELEGRAM_CHANNEL_ID"), "").strip()
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if args.send and not chat:
        log.warning("%s absent : canal public désactivé pour %s (rien envoyé).", city.get("channel_env"), city["slug"])
        return 0
    if args.send and not token:
        log.warning("TELEGRAM_BOT_TOKEN absent : rien envoyé.")
        return 0
    site = site_info(ccfg)
    sp = Path(args.state) if args.state else state_path(cfg)
    state = read_state(sp)
    deals = load_deals(cfg, now)

    if args.send:
        cs = city_state(state, city["slug"])

        def send(text, preview):
            telegram_post(token, chat, text, preview)
    else:
        cs = city_state(copy.deepcopy(state), city["slug"])   # dry-run : état jamais écrit

        def send(text, preview):
            print("\n" + "=" * 70 + f"\n[DRY-RUN canal {city['slug']}] preview={preview}\n" + "-" * 70)
            print(text)
    code = 0
    try:
        rep = run(deals, city, ccfg, cs, now, send, site, mode=args.mode)
    except Exception as e:  # noqa: BLE001
        log.error("publication échouée : %s", e)
        rep, code = {"posted": [], "reason": str(e)}, 1
    log.info("u-channel %s (%s) : %s", city["slug"], "send" if args.send else "dry-run", rep)
    if args.send:
        purge(cs, now, ccfg)
        write_state(sp, state)
    return code


# --------------------------------------------------------------------------
# Kit de partage (WhatsApp / Telegram / Instagram), DE / FR / EN
# --------------------------------------------------------------------------

HASHTAGS = {"de": "#sparen #deals #schnäppchen", "fr": "#bonsplans #promo #économies",
            "en": "#deals #savings #bargains"}


def _plain_block(top: list[dict], city: dict, site, ccfg, now, lang: str, kind: str) -> str:
    t, (name, url) = _t(lang), site
    bold = (lambda s: f"*{s}*") if kind == "whatsapp" else (lambda s: f"**{s}**") if kind == "telegram" else (lambda s: s)
    L = [f"🏆 {bold(t['top'].format(n=len(top)) + ' · ' + city['name'])} ({now:%d.%m.})", ""]
    for i, d in enumerate(top, 1):
        meta = [f"{t['score']} {d['deal_score']:.1f}/10"]
        e = ends_text(d, lang, now.tzinfo)
        if e:
            meta.append(e)
        L.append(f"{i}. {bold(d['title'][:100])}")
        L.append(f"   {price_line(d, lang)}")
        L.append(f"   {' · '.join(meta)}")
        for x in _extras(d, lang):
            L.append(f"   {x}")
        w = why_text(d, lang)
        if w:
            L.append(f"   {t['why']}: {w}")
        if kind != "instagram":
            L.append(f"   👉 {deal_link(d, url, ccfg)}")
        L.append("")
    if kind == "instagram":
        L.append(f"🔗 {t['link_bio']}" + (f" ({url.split('://')[-1]})" if url else ""))
        L.append(f"#{slugify(city['name']).replace('-', '')} {HASHTAGS.get(lang, '')}")
    elif url:
        L.append(f"{t['all']}: {url}/{city_slug(city)}")
    L.append(t["asof"].format(t=now.strftime("%H:%M")) + f" — {name}")
    return "\n".join(L).rstrip() + "\n"


def build_sharekit(top: list[dict], city: dict, site, ccfg, now) -> str:
    out = [f"# Share kit — {city['name']} — {now:%Y-%m-%d}", "",
           f"Généré à {now:%H:%M} ({ccfg['timezone']}). {len(top)} deal(s). "
           "Copier-coller tel quel ; vérifier le lien avant de poster.", ""]
    if not top:
        out.append("Aucun deal publiable aujourd'hui (note minimale "
                   f"{ccfg['daily_min_score']}, confiance ≥ {ccfg['min_confidence']}).")
        return "\n".join(out) + "\n"
    for lang, title in (("de", "Deutsch"), ("fr", "Français"), ("en", "English")):
        out.append(f"## {title}")
        for kind, label in (("whatsapp", "WhatsApp"), ("telegram", "Telegram"), ("instagram", "Instagram (légende)")):
            out += ["", f"### {label}", "", "```", _plain_block(top, city, site, ccfg, now, lang, kind).rstrip(), "```"]
        out.append("")
    return "\n".join(out)


def cmd_sharekit(args) -> int:
    from .config import load
    cfg = load()
    ccfg = load_config(cfg.root)
    tz = ZoneInfo(ccfg["timezone"])
    now = _now(tz, args.now)
    city = _city(ccfg, args.city)
    top = select_top(load_deals(cfg, now), now, city, ccfg)
    out_dir = Path(args.out_dir) if args.out_dir else Path(cfg.data_dir) / "universal" / "sharekit"
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = "" if city["slug"] == next(iter(ccfg["cities"])) else f"-{city['slug']}"
    p = out_dir / f"{now:%Y-%m-%d}{suffix}.md"
    p.write_text(build_sharekit(top, city, site_info(ccfg), ccfg, now), "utf-8")
    print("kit de partage écrit :", p)
    return 0
