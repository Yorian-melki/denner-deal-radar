"""Alertes universelles — un seul centre d'alerte : le bot Telegram existant.

Politique par défaut (config/settings.toml [universal.alerts]) :
  score ≥ 9 (confiance ≥ 0,5)                -> 🚨 immédiat
  score ≥ 8 (confiance ≥ 0,5)                -> 🔥 immédiat
  gratuit ≥ 7, anomalie ≥ 7 (conf. ≥ 0,6)    -> rapide (immédiat)
  urgence CRITICAL et score ≥ 7              -> immédiat
  sinon                                      -> digest quotidien / dashboard
Anti-spam : une entité vue par 3 sources = 1 alerte (doublons exclus) ; une
alerte n'est renvoyée que si le prix baisse d'au moins 3 % ou si la note gagne
au moins 1 point ; plafond d'alertes immédiates par source et par exécution.
Les deals Denner restent notifiés par le moteur V2 (aucun doublon) ; seules
les watchlists les examinent ici.
"""
from __future__ import annotations

import datetime as dt
import re

from .. import notify as N
from .deal import FAMILIES

FAMILY_EMOJI = {"grocery": "🛒", "retail": "🏷️", "tech": "💻", "flash": "⚡", "surplus": "🥡", "free": "🎁",
                "secondhand": "♻️", "refurbished": "🔁", "restaurant": "🍔", "student": "🎓", "transport": "🚆",
                "travel": "✈️", "event": "🎟️", "subscription": "📱", "cashback": "💸", "coupon": "🏷️",
                "contest": "🎲", "digital_free": "🎮", "local_news": "📍"}


def chf(x) -> str:
    return "—" if x is None else f"{x:.2f}"


def headline(d: dict) -> str:
    s = d.get("deal_score")
    comps = " ".join(c for c, _ in d.get("score_components") or [])
    if s is not None and s >= 9:
        tag = "🚨 ULTRA DEAL"
    elif "record" in comps:
        tag = "📉 RECORD HISTORIQUE"
    elif (d.get("anomaly_score") or 0) >= 7 and (d.get("anomaly_confidence") or 0) >= 0.6:
        tag = "⚡ PRICE ANOMALY"
    elif d["family"] in ("free", "digital_free"):
        tag = "🎁 GRATUIT"
    elif d["family"] == "surplus":
        tag = "🥡 ANTI-GASPI"
    elif s is not None and s >= 8:
        tag = "🔥 EXCELLENT DEAL"
    else:
        tag = f"{FAMILY_EMOJI.get(d['family'], '•')} {FAMILIES[d['family']].split(' ', 1)[1].upper()}"
    return f"{tag}"


def detail(d: dict, cfg) -> str:
    s = d.get("deal_score")
    L = [f"<b>{'n/é' if s is None else f'{s:.1f}'}/10 — {N.esc(headline(d))}</b>", "",
         f"<b>{N.esc(d['title'])}</b>"]
    if d.get("merchant"):
        L.append(f"Marchand : {N.esc(d['merchant'])}")
    if d.get("current_price") is not None:
        L.append(f"Prix : <b>CHF {chf(d['current_price'])}</b>"
                 + (f" (total CHF {chf(d['total_acquisition_cost'])})" if d.get("total_acquisition_cost") not in (None, d.get("current_price")) else ""))
    rt = d.get("reference_price_type")
    if d.get("reference_price") is not None:
        label = {"merchant_previous": "Ancien prix", "msrp": "Prix conseillé", "competitor": "Prix concurrent cité",
                 "declared_value": "Valeur annoncée", "market": "Prix de marché", "catalog": "Prix catalogue",
                 "community_claimed": "Référence (communauté)"}.get(rt, "Référence")
        L.append(f"{label} : CHF {chf(d['reference_price'])}")
    if d.get("historical_median") is not None:
        L.append(f"Prix médian observé : CHF {chf(d['historical_median'])} · plus bas : CHF {chf(d.get('historical_low'))}")
    if d.get("effective_discount") is not None:
        L.append(f"Économie réelle estimée : {d['effective_discount']:.0f} %"
                 + (f" (~CHF {d['net_savings']:.2f})" if d.get("net_savings") else ""))
    if d.get("unit_price"):
        L.append(f"Prix unitaire : {chf(d['unit_price'])} {d.get('unit') or ''}")
    if d.get("ends_at"):
        L.append(f"Fin : {N.day(d['ends_at'])} {d['ends_at'][11:16]}")
    if d.get("pickup_window"):
        L.append(f"Collecte : {N.esc(d['pickup_window'])}")
    if d.get("distance_km") is not None:
        L.append(f"Distance : {d['distance_km']:.1f} km du centre de St-Gall")
    for c in (d.get("conditions") or [])[:3]:
        L.append(f"Condition : {N.esc(c)}")
    L.append(f"Confiance : {round((d.get('score_confidence') or 0) * 100)} % · Urgence : {d.get('urgency', '?')}")
    why = [f"{c} ({v:+.1f})" if isinstance(v, (int, float)) and c else c for c, v in (d.get("score_components") or [])[:4]]
    if why:
        L.append("Pourquoi : " + N.esc(" · ".join(why)))
    L.append(f"Disponibilité : {N.esc(availability_text(d))}")
    L.append(f"<a href=\"{N.esc(d.get('source_url'))}\">Voir l'offre</a> · source : {N.esc(d['source_id'])}")
    return "\n".join(L)


def availability_text(d: dict) -> str:
    scope = d.get("geographic_scope_resolved") or d.get("geographic_scope")
    acc = {"PUBLIC": "", "MEMBER": " (membres)", "PERSONALIZED": " (personnalisée)", "UNKNOWN": ""}.get(d.get("access", "PUBLIC"), "")
    return {"ONLINE": "en ligne, livrable en Suisse", "NATIONAL": "nationale — disponibilité locale non vérifiée",
            "LOCAL": "St-Gall", "NEARBY": "proche de St-Gall", "REGIONAL": "Suisse orientale",
            "TRAVEL_ACCESSIBLE": "nécessite un déplacement"}.get(scope, "non précisée") + acc


def reason_for(d: dict, cfg) -> str | None:
    a = cfg.settings.get("universal", {}).get("alerts", {})
    s, conf = d.get("deal_score"), d.get("score_confidence") or 0
    if d.get("duplicate_of") or d.get("lifecycle") in ("EXPIRED", "REMOVED", "UPCOMING"):
        return None
    if set(d.get("tags") or []) & set(a.get("exclude_tags", [])):
        return None
    if d["family"] not in ("free", "digital_free", "surplus", "grocery") and d.get("net_savings") is not None \
            and d["net_savings"] < a.get("min_savings_chf", 15.0):
        return None   # biais de pourcentage : −70 % sur CHF 6 n'est pas une alerte
    if s is not None and conf >= a.get("min_confidence", 0.5):
        if s >= a.get("ultra", 9.0):
            return "ultra"
        if s >= a.get("immediate", 8.0):
            return "excellent"
        if d["family"] in ("free", "digital_free") and s >= a.get("free_fast", 7.0):
            return "free"
        if d.get("urgency") == "CRITICAL" and s >= a.get("critical_min_score", 7.0):
            return "critical"
    if (d.get("anomaly_score") or 0) >= a.get("anomaly", 7.0) and (d.get("anomaly_confidence") or 0) >= 0.6:
        return "anomaly"
    return None


def should_send(d: dict, state: dict) -> bool:
    prev = state.get(d["deal_id"]) or state.get("e:" + (d.get("canonical_entity_id") or ""))
    if not prev:
        return True
    p0, p1 = prev.get("price"), d.get("current_price")
    if p0 and p1 is not None and p1 <= p0 * 0.97:
        return True
    return (d.get("deal_score") or 0) >= (prev.get("score") or 0) + 1.0


def remember(d: dict, state: dict, reason: str, at: str) -> None:
    rec = state.get(d["deal_id"], {})
    rec.update(first=rec.get("first", at), last=at, reason=reason, score=d.get("deal_score"),
               price=d.get("current_price"), count=rec.get("count", 0) + 1)
    state[d["deal_id"]] = rec
    if d.get("canonical_entity_id"):
        state["e:" + d["canonical_entity_id"]] = rec


def build(live: list[dict], cfg, now: dt.datetime, store) -> list[dict]:
    a = cfg.settings.get("universal", {}).get("alerts", {})
    at = now.replace(microsecond=0).isoformat()
    ns = store.notify_state.setdefault("deals", {})
    per_source: dict[str, int] = {}
    msgs = []
    cands = sorted((d for d in live if d["source_id"] != "denner"),
                   key=lambda d: (d.get("deal_score") or 0, d.get("score_confidence") or 0), reverse=True)
    for d in cands:
        boot = store.source_state(d["source_id"]).get("bootstrap_at")
        if boot and (d.get("first_seen_at") or "") <= boot:
            continue   # catalogue initial d'une nouvelle source : enregistré sans alerte
        reason = reason_for(d, cfg)
        if not reason or not should_send(d, ns):
            continue
        n = per_source.get(d["source_id"], 0)
        if n >= int(a.get("max_immediate_per_source", 4)):
            continue
        per_source[d["source_id"]] = n + 1
        remember(d, ns, reason, at)
        msgs.append({"key": f"u:{reason}:{d['deal_id']}:{d.get('current_price')}", "text": detail(d, cfg),
                     "ultra": reason == "ultra"})
    msgs += watchlist_alerts(live, cfg, now, store)
    msgs += digest(live, cfg, now, store)
    return msgs


# --------------------------------------------------------------------------
# Watchlists (sans LLM : expressions régulières + seuils)
# --------------------------------------------------------------------------

def match_watch(d: dict, w: dict) -> bool:
    text = f"{d.get('title', '')} {d.get('brand', '')} {d.get('package_size', '')}"
    if not re.search(w["query"], text, re.I):
        return False
    if w.get("exclude") and re.search(w["exclude"], text, re.I):
        return False
    if w.get("family") and d.get("family") not in ([w["family"]] if isinstance(w["family"], str) else w["family"]):
        return False
    if w.get("merchant") and not re.search(w["merchant"], d.get("merchant", ""), re.I):
        return False
    if w.get("max_price") is not None and not (d.get("current_price") is not None and d["current_price"] <= w["max_price"]):
        return False
    if w.get("max_unit_price") is not None:
        if d.get("unit_price") is None or (w.get("unit") and w["unit"] != d.get("unit")):
            return False
        if d["unit_price"] > w["max_unit_price"]:
            return False
    if w.get("min_score") is not None and (d.get("deal_score") or 0) < w["min_score"]:
        return False
    return d.get("lifecycle") not in ("EXPIRED", "REMOVED") and not d.get("duplicate_of")


def watchlist_alerts(live: list[dict], cfg, now: dt.datetime, store) -> list[dict]:
    at = now.replace(microsecond=0).isoformat()
    ws = cfg.settings.get("watchlists", [])
    ns = store.notify_state.setdefault("watch", {})
    out = []
    for w in ws:
        for d in live:
            if not match_watch(d, w):
                continue
            d.setdefault("watchlists", []).append(w["name"])
            key = f"{w['name']}|{d['deal_id']}"
            prev = ns.get(key)
            if prev and not (d.get("current_price") is not None and prev.get("price") and d["current_price"] <= prev["price"] * 0.97):
                continue
            ns[key] = {"at": at, "price": d.get("current_price")}
            out.append({"key": f"w:{key}:{d.get('current_price')}",
                        "text": f"👀 <b>WATCHLIST « {N.esc(w['name'])} »</b>\n\n" + detail(d, cfg)})
    return out


def digest(live: list[dict], cfg, now: dt.datetime, store) -> list[dict]:
    """Récapitulatif quotidien des nouveautés (hors Denner, déjà couvert par V2)."""
    a = cfg.settings.get("universal", {}).get("alerts", {})
    hour = int(a.get("digest_hour", 18))
    st = store.notify_state
    today = now.date().isoformat()
    if now.hour < hour or st.get("digest_day") == today:
        return []
    since = st.get("digest_since") or (now - dt.timedelta(days=1)).isoformat()
    new = [d for d in live if d["source_id"] != "denner" and (d.get("first_seen_at") or "") >= since
           and not d.get("duplicate_of") and d.get("lifecycle") not in ("EXPIRED", "REMOVED")]
    st["digest_day"], st["digest_since"] = today, now.replace(microsecond=0).isoformat()
    if not new:
        return []
    new.sort(key=lambda d: (d.get("deal_score") or -1, d.get("score_confidence") or 0), reverse=True)
    by_fam: dict[str, int] = {}
    for d in new:
        by_fam[d["family"]] = by_fam.get(d["family"], 0) + 1
    L = ["📰 <b>ST. GALLEN DEAL RADAR — récapitulatif du jour</b>", ""]
    top = [d for d in new if d.get("deal_score") is not None][:10]
    if top and top[0]["deal_score"] < 5:
        L.append("ℹ️ Aucune nouveauté ne dépasse 5/10 aujourd'hui.\n")
    for i, d in enumerate(top, 1):
        L.append(f"{i}. <b>{d['deal_score']:.1f}</b> {FAMILY_EMOJI.get(d['family'], '')} {N.esc(d['title'][:70])}"
                 + (f" — CHF {chf(d.get('current_price'))}" if d.get("current_price") is not None else ""))
    L += ["", "📊 " + " · ".join(f"{FAMILY_EMOJI.get(f, '')} {n}" for f, n in sorted(by_fam.items(), key=lambda x: -x[1])),
          f"🔗 <a href=\"{cfg.dashboard_url.rstrip('/')}/#u/nouveautes\">Voir les {len(new)} nouveautés</a>"]
    return [{"key": f"u:digest:{today}", "text": "\n".join(L)}]
