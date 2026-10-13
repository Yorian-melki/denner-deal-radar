"""Alertes Telegram (Bot API, gratuit, sans LLM).

Les messages sont d'abord placés dans une file d'attente (state.outbox) puis
envoyés hors des heures calmes. Chaque message a une clé de déduplication :
une même alerte n'est jamais envoyée deux fois.
"""
from __future__ import annotations

import datetime as dt
import html
import logging
import os
import time

import requests

from .categories import GROUP_LABELS
from .scoring import label as score_label

log = logging.getLogger("radar.notify")
DAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
MAX_LEN = 3900


def esc(s) -> str:
    return html.escape(str(s or ""), quote=False)


def chf(x) -> str:
    return "—" if x is None else f"{x:.2f}"


def day(iso: str | None) -> str:
    if not iso:
        return "?"
    d = dt.datetime.fromisoformat(iso)
    return f"{DAYS[d.weekday()]} {d:%d.%m}"


def validity(o: dict) -> str:
    return f"{day(o.get('starts_at'))} → {day(o.get('ends_at'))}"


def score_txt(o: dict) -> str:
    s = o.get("deal_score")
    return "n/é" if s is None else f"{s:.1f}"


def stores_txt(o: dict, n_enabled: int) -> str:
    if o.get("availability_confidence") == "store_verified":
        return f"✅ vue en magasin ({esc(', '.join(o.get('store_ids') or []))})"
    if not o.get("eligible_home"):
        return "⛔ non disponible en Suisse alémanique"
    scope = "offre nationale" if o.get("geographic_scope") == "national" else "offre régionale incluant la Suisse alémanique"
    return f"éligible dans les {n_enabled} Denner de St-Gall ({scope}) — stock non vérifié"


def ref_line(o: dict) -> str:
    rt, ref = o.get("reference_price_type"), o.get("regular_price")
    if rt == "denner_previous":
        return f"Avant : CHF {chf(ref)} (prix Denner habituel)"
    if rt == "competitor_comparison" and ref:
        return f"Prix concurrent cité : CHF {chf(ref)} ⚠️ pas un ancien prix Denner"
    if o.get("stated_discount_pct"):
        return f"Rabais annoncé : {o['stated_discount_pct']:g} % (aucun prix vérifiable)"
    return "Aucun prix de référence publié"


def detail_block(o: dict, n_enabled: int, medal: str = "🏆") -> str:
    lines = [f"{medal} <b>{score_txt(o)}/10</b> — <b>{esc(o['product_name'])}</b>"
             + (f" <i>{esc(o.get('subline'))}</i>" if o.get("subline") else "")]
    lines.append(ref_line(o))
    if o.get("discounted_price"):
        lines.append(f"Maintenant : <b>CHF {chf(o['discounted_price'])}</b>")
    if o.get("effective_discount") is not None:
        shown = o.get("discount_percentage") or o.get("stated_discount_pct")
        eff = o["effective_discount"]
        txt = f"Réduction : {eff:.0f} %"
        if shown and abs(shown - eff) >= 1:
            txt += f" retenus ({shown:.0f} % affichés)"
        lines.append(txt)
    if o.get("unit_price"):
        lines.append(f"Prix unitaire : CHF {chf(o['unit_price'])}/{o['unit_price_unit'].split('/')[-1]}")
    lines.append(f"Valable : {validity(o)}")
    for c in (o.get("conditions") or [])[:3]:
        lines.append(f"Condition : {esc(c)}")
    lines.append(f"Magasins : {stores_txt(o, n_enabled)}")
    lines.append(f"Confiance : {o.get('score_confidence_label', '?')} · <a href=\"{esc(o.get('source_url'))}\">fiche Denner</a>")
    return "\n".join(lines)


def short_line(i: int, o: dict) -> str:
    parts = [f"{i}. <b>{score_txt(o)}</b> · {esc(o['product_name'])}"]
    if o.get("discounted_price"):
        parts.append(f"— CHF {chf(o['discounted_price'])}")
    if o.get("effective_discount"):
        parts.append(f"(−{o['effective_discount']:.0f} %)")
    if o.get("unit_price"):
        parts.append(f"· {chf(o['unit_price'])} {o['unit_price_unit']}")
    if o.get("status") == "announced":
        parts.append(f"· dès {day(o.get('starts_at'))}")
    return " ".join(parts)


def rank_key(o: dict):
    return (o.get("deal_score") if o.get("deal_score") is not None else -1, o.get("score_confidence") or 0)


def link(cfg, view: str, **params) -> str:
    base = cfg.dashboard_url.rstrip("/") + "/"
    q = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{base}#{view}" + (f"?{q}" if q else "")


def _alertable(o: dict, cfg) -> bool:
    excl = set(cfg.s("notify", "exclude_tags_from_alerts", []))
    return o.get("eligible_home") and not (set(o.get("tags") or []) & excl)


# --------------------------------------------------------------------------
# Construction des messages
# --------------------------------------------------------------------------

def build(store, cfg, now: dt.datetime, run_events: list[dict], run_at: str, n_enabled: int,
          first_run: bool = False) -> list[dict]:
    msgs: list[dict] = []
    top_n = int(cfg.s("notify", "top_n", 10))
    offers = store.offers

    new = [offers[e["offer_id"]] for e in run_events if e["type"] == "new" and e.get("offer_id") in offers]
    new_eligible = [o for o in new if o.get("eligible_home")]
    if new_eligible:
        ranked = sorted(new_eligible, key=rank_key, reverse=True)
        best = ranked[0]
        n = len(new_eligible)
        title = "🔥 <b>DENNER DEAL RADAR — NOUVELLES OFFRES</b>" if not first_run else \
            "🚀 <b>DENNER DEAL RADAR — PREMIER RELEVÉ</b>"
        parts = [title, "", detail_block(best, n_enabled)]
        lines = [short_line(i, o) for i, o in enumerate(ranked[1:top_n + 1], 2)]
        if lines:
            parts += ["", f"🥇 <b>Top {min(top_n, n)} des offres nouvelles</b>"] + lines
        scored = [o for o in new_eligible if o.get("deal_score") is not None]
        if scored and max(o["deal_score"] for o in scored) < 5:
            parts += ["", "ℹ️ Aucune nouvelle offre ne dépasse 5/10 (promotions ordinaires)."]
        ann = sum(1 for o in new_eligible if o.get("status") == "announced")
        parts += ["", f"📊 <b>{n}</b> promotions nouvelles détectées"
                  + (f" (dont {ann} annoncées, pas encore actives)" if ann else "")
                  + (f" · {len(new) - n} hors Suisse alémanique ignorées" if len(new) > n else ""),
                  f"🔗 <a href=\"{link(cfg, 'nouveautes', since=run_at)}\">Voir toutes les {n} offres</a>"]
        msgs.append({"key": f"wave:{run_at}", "text": "\n".join(parts)})

        if not first_run:
            th = float(cfg.s("notify", "individual_alert_min_score", 8.0))
            exc = [o for o in ranked if (o.get("deal_score") or 0) >= th and _alertable(o, cfg)]
            for o in exc[1:6]:  # la meilleure figure déjà en tête du message groupé
                msgs.append({"key": f"exceptional:{o['offer_id']}",
                             "text": "⚡ <b>OFFRE EXCEPTIONNELLE</b>\n\n" + detail_block(o, n_enabled, "💎")})

    th_drop = float(cfg.s("notify", "price_drop_alert_min_score", 5.0))
    for e in run_events:
        if e["type"] == "price_drop" and e.get("offer_id") in offers:
            o = offers[e["offer_id"]]
            if (o.get("deal_score") or 0) >= th_drop and _alertable(o, cfg):
                msgs.append({"key": f"drop:{o['offer_id']}:{e['new']}",
                             "text": f"📉 <b>BAISSE SUPPLÉMENTAIRE</b> : CHF {chf(e['old'])} → <b>CHF {chf(e['new'])}</b>\n\n"
                                     + detail_block(o, n_enabled, "📉")})
    return msgs


def recaps(store, cfg, now: dt.datetime, n_enabled: int) -> list[dict]:
    msgs: list[dict] = []
    st = store.state.setdefault("recaps", {})
    today = now.date().isoformat()
    if now.hour < int(cfg.s("notify", "recap_not_before_hour", 7)):
        return msgs
    live = [o for o in store.offers.values() if o.get("status") == "active" and o.get("eligible_home")]
    top_n = int(cfg.s("notify", "top_n", 10))

    def block(title: str, items: list[dict], view: str) -> str:
        items = sorted(items, key=rank_key, reverse=True)
        lines = [title, ""]
        if items and items[0].get("deal_score") is not None and items[0]["deal_score"] < 5:
            lines.append("ℹ️ Aucune offre ne dépasse 5/10 cette fois-ci.\n")
        lines += [short_line(i, o) for i, o in enumerate(items[:top_n], 1)]
        lines += ["", f"📊 {len(items)} offres · 🔗 <a href=\"{link(cfg, view)}\">tout voir</a>"]
        return "\n".join(lines)

    if now.weekday() == 0 and cfg.s("notify", "monday_recap", True) and st.get("monday") != today:
        ws = [o for o in live if o.get("kind") == "weekstart"]
        text = block("🌅 <b>DÉBUT DE SEMAINE — Wochenstart-Knaller</b>", ws, "semaine") if ws else \
            "🌅 <b>DÉBUT DE SEMAINE</b>\n\nAucune offre « Wochenstart » publiée pour l'instant."
        text += "\n\n" + block("🏆 <b>Meilleures offres encore valables</b>", live, "semaine")
        msgs.append({"key": f"recap:monday:{today}", "text": text})
        st["monday"] = today
    if now.weekday() == 3 and cfg.s("notify", "thursday_recap", True) and st.get("thursday") != today:
        started = [o for o in live if (o.get("starts_at") or "")[:10] == today]
        if started:
            msgs.append({"key": f"recap:thursday:{today}",
                         "text": block("🗓️ <b>NOUVELLE SEMAINE DENNER — offres actives dès aujourd'hui</b>",
                                       started, "semaine")})
            st["thursday"] = today
    return msgs


def expiry_reminders(store, cfg, now: dt.datetime, n_enabled: int) -> list[dict]:
    th = float(cfg.s("notify", "expiry_reminder_min_score", 7.0))
    hours = float(cfg.s("notify", "expiry_reminder_hours", 30))
    reminded = store.state.setdefault("reminded", {})
    due = []
    for o in store.offers.values():
        if o.get("status") != "active" or (o.get("deal_score") or 0) < th or not _alertable(o, cfg):
            continue
        end = dt.datetime.fromisoformat(o["ends_at"]) if o.get("ends_at") else None
        if end and now < end <= now + dt.timedelta(hours=hours) and o["offer_id"] not in reminded:
            due.append(o)
            reminded[o["offer_id"]] = now.date().isoformat()
    if not due:
        return []
    due.sort(key=rank_key, reverse=True)
    lines = ["⏳ <b>DERNIÈRE CHANCE — meilleures offres qui se terminent bientôt</b>", ""]
    lines += [short_line(i, o) + f" · fin {day(o['ends_at'])}" for i, o in enumerate(due[:15], 1)]
    lines += ["", f"🔗 <a href=\"{link(cfg, 'fin')}\">Voir « Fin bientôt »</a>"]
    return [{"key": f"expiry:{now.date()}:{due[0]['offer_id']}", "text": "\n".join(lines)}]


def technical(key: str, text: str) -> dict:
    return {"key": key, "text": "🛠️ <b>DENNER DEAL RADAR — technique</b>\n\n" + text}


# --------------------------------------------------------------------------
# Envoi
# --------------------------------------------------------------------------

def credentials() -> tuple[str | None, str | None]:
    return os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")


def split(text: str) -> list[str]:
    if len(text) <= MAX_LEN:
        return [text]
    chunks, cur = [], ""
    for line in text.split("\n"):
        if len(cur) + len(line) + 1 > MAX_LEN:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    return chunks + ([cur] if cur.strip() else [])


def send_telegram(text: str, token: str, chat_id: str) -> None:
    for chunk in split(text):
        for attempt in range(4):
            r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", timeout=30, json={
                "chat_id": chat_id, "text": chunk, "parse_mode": "HTML", "disable_web_page_preview": True})
            if r.status_code == 429:
                time.sleep(int(r.json().get("parameters", {}).get("retry_after", 5)) + 1)
                continue
            if r.status_code >= 500:
                time.sleep(2 ** attempt)
                continue
            if not r.ok:
                raise RuntimeError(f"Telegram {r.status_code}: {r.text[:200]}")
            break
        else:
            raise RuntimeError("Telegram: trop de tentatives")
        time.sleep(0.4)


def enqueue(store, msgs: list[dict], at: str) -> int:
    sent = store.state.setdefault("sent_keys", {})
    box = store.state.setdefault("outbox", [])
    queued = {m["key"] for m in box}
    n = 0
    for m in msgs:
        if m["key"] in sent or m["key"] in queued:
            continue
        box.append({**m, "created": at})
        n += 1
    return n


def in_quiet_hours(cfg, now: dt.datetime) -> bool:
    qs, qe = int(cfg.s("notify", "quiet_start", 22)), int(cfg.s("notify", "quiet_end", 7))
    return (now.hour >= qs or now.hour < qe) if qs > qe else (qs <= now.hour < qe)


def flush(store, cfg, now: dt.datetime, dry_run: bool = False, force: bool = False) -> dict:
    box = store.state.setdefault("outbox", [])
    sent = store.state.setdefault("sent_keys", {})
    res = {"sent": 0, "pending": len(box), "reason": None}
    # Une alerte de plus de 36 h n'a plus d'intérêt (sauf technique).
    limit = (now - dt.timedelta(hours=36)).isoformat()
    box[:] = [m for m in box if m["key"].startswith("tech:") or m.get("created", "") >= limit]
    res["pending"] = len(box)
    if not box:
        return res
    token, chat = credentials()
    if dry_run:
        for m in box:
            print("\n" + "=" * 70 + f"\n[DRY-RUN Telegram] {m['key']}\n" + "-" * 70)
            print(m["text"])
        res["reason"] = "dry-run (file conservée)"
        return res
    if not cfg.s("notify", "enabled", True):
        res["reason"] = "notifications désactivées"
        return res
    if not token or not chat:
        res["reason"] = "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID absents"
        box[:] = box[-40:]
        return res
    urgent = [m for m in box if m["key"].startswith(("tech:", "test:"))]
    if in_quiet_hours(cfg, now) and not force:
        to_send = urgent
        res["reason"] = "heures calmes : seules les alertes techniques partent"
    else:
        to_send = list(box)
    for m in to_send:
        try:
            send_telegram(m["text"], token, chat)
            sent[m["key"]] = now.isoformat()
            box.remove(m)
            res["sent"] += 1
        except Exception as e:  # noqa: BLE001
            log.error("envoi Telegram échoué: %s", e)
            res["reason"] = str(e)
            break
    # Purge des clés anciennes (60 jours).
    cutoff = (now - dt.timedelta(days=60)).isoformat()
    for k in [k for k, v in sent.items() if v < cutoff]:
        del sent[k]
    res["pending"] = len(box)
    return res


__all__ = ["build", "recaps", "expiry_reminders", "technical", "enqueue", "flush", "GROUP_LABELS", "score_label"]
