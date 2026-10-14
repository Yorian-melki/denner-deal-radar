"""Point d'entrée : ``python -m radar <commande>``.

    scan [--dry-run] [--force] [--no-notify]   collecte complète + alertes + export
    export [--out site/data]                   régénère les JSON du dashboard
    stores [--dry-run]                         vérifie les succursales
    status                                     état de santé lisible
    watchdog                                   alerte si les données sont obsolètes (code 3)
    notify-test                                envoie un message de test Telegram
    telegram-chat-id                           affiche le chat_id (après /start au bot)
    add-manual ...                             ajoute une offre vue en magasin
    add-manual-from-issue --body-file F        idem depuis un formulaire GitHub Issue
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import logging
import re
import statistics
import sys
from pathlib import Path

from . import audit, denner, diff, export, notify
from . import stores as storesmod
from .categories import classify
from .config import load
from .http import Http
from .parse import day_end, day_start, parse_chf, parse_quantity, unit_price
from .storage import Store

log = logging.getLogger("radar")
BASE_FLAGS = ("promo_current_week", "promo_next_week")


def _now(cfg, override: str | None) -> dt.datetime:
    if override:
        n = dt.datetime.fromisoformat(override)
        return n if n.tzinfo else n.replace(tzinfo=cfg.tz)
    return dt.datetime.now(cfg.tz)


def _http(cfg) -> Http:
    c = cfg.settings["collect"]
    return Http(c["user_agent"], c["timeout_s"], c["retries"], c["backoff_s"], c["delay_between_requests_s"])


def _due(state: dict, key: str, now: dt.datetime, hours: float) -> bool:
    last = state.get(key)
    return not last or now - dt.datetime.fromisoformat(last) >= dt.timedelta(hours=hours)


def _store_line(s: dict) -> str:
    return f"{s.get('id')} {s.get('zip')} {s.get('city')} — {s.get('address')} ({s.get('channel')})"


# --------------------------------------------------------------------------

def check_stores(store: Store, cfg, http: Http, now: dt.datetime) -> list[dict]:
    at = now.replace(microsecond=0).isoformat()
    found, warnings, complete = storesmod.discover(http, cfg.s("collect", "base_url"))
    changes = storesmod.reconcile(store.stores, found, at, complete)
    store.stores["warnings"] = warnings
    msgs = []
    for c in changes:
        store.event(c["type"], at, store_id=c["store"], **{k: v for k, v in c.items() if k not in ("type", "store")})
        s = store.stores["stores"].get(c["store"], {})
        icon = {"store_opened": "🆕", "store_closed": "🚪", "store_address_changed": "📍",
                "store_reopened": "🔁"}.get(c["type"], "ℹ️")
        msgs.append(notify.technical(f"tech:store:{c['type']}:{c['store']}:{at[:10]}",
                                     f"{icon} Changement de succursale : <b>{c['type']}</b>\n{notify.esc(_store_line(s))}"
                                     + ("\n(désactivée par défaut : magasin voisin)" if s.get("scope") == "neighbour" else "")))
    return msgs


def manual_offers(store: Store, cfg, now: dt.datetime) -> dict[str, dict]:
    out = {}
    for m in store.manual:
        end = m.get("until")
        if end and end < (now - dt.timedelta(days=60)).date().isoformat():
            continue
        price, ref = m.get("price"), m.get("regular")
        start = m.get("from") or m["added"][:10]
        o = {
            "offer_id": m["id"], "article_id": m["id"], "sku": None, "product_name": m["name"],
            "subline": m.get("size", ""), "brand": None, "category": None, "group": m.get("group", "nourriture"),
            "tags": [], "kind": "manual", "source": "manual", "sources": ["manual"],
            "source_url": m.get("photo") or "", "image_url": m.get("photo"), "regions": None,
            "geographic_scope": "store", "eligible_home": True, "online_only": False,
            "store_ids": [m["store"]] if m.get("store") else [],
            "availability_confidence": "store_verified" if m.get("store") else "local_unconfirmed",
            "stock": "observed" if m.get("store") else "unknown",
            "regular_price": ref, "reference_price_type": "denner_previous" if ref else "none",
            "discounted_price": price,
            "discount_percentage": round((1 - price / ref) * 100, 1) if price and ref and ref > price else None,
            "stated_discount_pct": m.get("pct"), "discount_text": "", "offer_type": "manual",
            "package_size": m.get("size"), "total_quantity": None, "quantity_unit": None, "pack_count": None,
            "price_basis": "package", "unit_price": None, "unit_price_unit": None, "regular_unit_price": None,
            "min_purchase_quantity": 1, "conditions": [m["note"]] if m.get("note") else [],
            "validity_label": f"{start} – {end or '?'}",
            "starts_at": day_start(dt.date.fromisoformat(start)).isoformat(),
            "ends_at": day_end(dt.date.fromisoformat(end)).isoformat() if end else None,
        }
        o["group"], o["tags"] = classify(m["name"], m.get("size", ""), "")
        q = parse_quantity(m.get("size", ""))
        o["total_quantity"], o["quantity_unit"], o["price_basis"] = q.total, q.unit, q.price_basis
        o["unit_price"], o["unit_price_unit"] = unit_price(price, q)
        out[o["offer_id"]] = o
    return out


def cmd_scan(args) -> int:
    cfg = load()
    now = _now(cfg, args.now)
    at = now.replace(microsecond=0).isoformat()
    store = Store(cfg.data_dir)
    st = store.state
    min_int = float(cfg.s("collect", "min_interval_minutes", 35))
    if not args.force and st.get("last_success") and \
            now - dt.datetime.fromisoformat(st["last_success"]) < dt.timedelta(minutes=min_int):
        log.info("dernière collecte réussie il y a moins de %.0f min : collecte sautée", min_int)
        if not args.no_notify:
            r = notify.flush(store, cfg, now, dry_run=args.dry_run)
            log.info("file Telegram : %s", r)
        if not args.dry_run:
            store.save()
            export.write(store, cfg, now, Path(args.out))
        return 0

    http = _http(cfg)
    base = cfg.s("collect", "base_url")
    st["last_attempt"] = at
    msgs: list[dict] = []
    run = {"at": at, "ok": False}

    # 1. robots.txt
    if args.force or _due(st, "robots_checked", now, cfg.s("collect", "robots_check_every_hours", 20)):
        try:
            rb = audit.robots(http, base)
            st["robots"] = {**rb, "checked": at}
            st["robots_checked"] = at
            if not rb["ok"]:
                msgs.append(notify.technical(f"tech:robots:{at[:10]}",
                                             "⛔ robots.txt interdit désormais un chemin utilisé :\n"
                                             + "\n".join(p for p, ok in rb["paths"].items() if not ok)
                                             + "\nCollecte suspendue pour ces chemins."))
        except Exception as e:  # noqa: BLE001
            log.warning("robots.txt illisible: %s", e)

    # 2. succursales
    first_stores = not store.stores.get("initialized")
    if first_stores or _due(st, "stores_checked", now, 24 * cfg.s("collect", "stores_check_every_days", 6)):
        try:
            msgs += check_stores(store, cfg, http, now)
            st["stores_checked"] = at
        except Exception as e:  # noqa: BLE001
            log.error("vérification des magasins échouée: %s", e)
            run["stores_error"] = str(e)
    enabled = storesmod.enabled_ids(store.stores)

    # 3. collecte
    results = denner.collect(http, cfg)
    sources = {}
    hist_totals = st.setdefault("totals_history", {})
    anomalies = []
    for flag, r in results.items():
        prev = hist_totals.get(flag, [])
        med = statistics.median(prev) if len(prev) >= 3 else None
        ratio = float(cfg.s("health", "min_ratio_vs_median", 0.4))
        anomalous = bool(r.ok and med and med >= 20 and (r.total or 0) < ratio * med)
        if anomalous:
            anomalies.append(f"{flag}: {r.total} offres vs médiane {med:.0f}")
        fails = st.setdefault("flag_failures", {})
        fails[flag] = 0 if r.ok else fails.get(flag, 0) + 1
        sources[flag] = {"ok": r.ok, "complete": r.complete, "total": r.total, "received": len(r.items),
                         "pages": r.pages, "error": r.error, "warnings": r.structure_warnings,
                         "anomalous": anomalous, "checked": at,
                         "last_ok": at if r.ok else (st.get("sources", {}).get(flag, {}).get("last_ok"))}
        if r.ok and not anomalous:
            hist_totals[flag] = (prev + [r.total])[-12:]
        if fails[flag] >= int(cfg.s("health", "failure_alert_after", 2)) and flag not in BASE_FLAGS:
            msgs.append(notify.technical(f"tech:flag:{flag}:{at[:10]}",
                                         f"⚠️ Le flux <b>{flag}</b> échoue depuis {fails[flag]} collectes : {notify.esc(r.error)}"))
        if r.structure_warnings and r.ok:
            msgs.append(notify.technical(f"tech:struct:{flag}:{at[:10]}",
                                         f"🧩 Structure de réponse inhabituelle ({flag}) :\n"
                                         + notify.esc("\n".join(r.structure_warnings))))
    st["sources"] = sources
    base_ok = all(results[f].ok for f in BASE_FLAGS if f in results)
    trusted = base_ok and all(r.ok and r.complete for r in results.values()) and not anomalies
    run.update(requests=http.requests_made, sources={f: s["received"] for f, s in sources.items()},
               trusted=trusted, anomalies=anomalies)

    if not base_ok:
        st["consecutive_failures"] = st.get("consecutive_failures", 0) + 1
        n = st["consecutive_failures"]
        run["error"] = "; ".join(f"{f}: {results[f].error}" for f in BASE_FLAGS if not results[f].ok)
        log.error("collecte en échec (%d consécutifs): %s", n, run["error"])
        if n >= int(cfg.s("health", "failure_alert_after", 2)):
            msgs.append(notify.technical(f"tech:fail:{n}" if n < 5 else f"tech:fail:{at[:10]}",
                                         f"❌ La collecte Denner échoue depuis <b>{n}</b> tentatives.\n"
                                         f"Erreur : {notify.esc(run['error'])}\n"
                                         f"Les dernières données valides restent affichées (dernier succès : "
                                         f"{st.get('last_success', 'jamais')})."))
        diff.refresh_statuses(store, now)
        _finish(store, cfg, now, msgs, run, args)
        return 2

    if st.get("consecutive_failures", 0) >= int(cfg.s("health", "failure_alert_after", 2)):
        msgs.append(notify.technical(f"tech:recovered:{at}", "✅ La collecte fonctionne à nouveau."))
    st["consecutive_failures"] = 0
    if anomalies:
        msgs.append(notify.technical(f"tech:anomaly:{at[:10]}",
                                     "📉 Nombre d'offres anormalement bas — aucune disparition enregistrée :\n"
                                     + notify.esc("\n".join(anomalies))))
    new_flags = [f for f in results if f not in cfg.s("collect", "flags")]
    if new_flags:
        msgs.append(notify.technical(f"tech:newflag:{','.join(new_flags)}",
                                     "🔎 Nouveau type de promotion détecté et collecté automatiquement : "
                                     + ", ".join(new_flags)))

    # 4. audit de couverture HTML
    if args.force or _due(st, "audit_checked", now, cfg.s("collect", "html_audit_every_hours", 20)):
        try:
            refs = {i.get("sku") for r in results.values() for i in r.items}
            rep = audit.html_coverage(http, base, refs)
            st["audit"] = {**rep, "checked": at}
            st["audit_checked"] = at
            if rep["missing"] or rep["unknown_sections"]:
                msgs.append(notify.technical(
                    f"tech:audit:{at[:10]}",
                    f"🔍 Audit de couverture : {len(rep['missing'])} offre(s) visibles sur denner.ch absentes de l'API"
                    + (f"\nNouvelles sections : {notify.esc(', '.join(rep['unknown_sections']))}" if rep["unknown_sections"] else "")
                    + "".join(f"\n• {notify.esc(u)}" for u in rep["missing"][:8])))
        except Exception as e:  # noqa: BLE001
            log.warning("audit HTML impossible: %s", e)

    # 5. normalisation, diff, notation
    fresh = denner.normalize_all({f: r for f, r in results.items() if r.ok}, cfg, enabled)
    fresh.update(manual_offers(store, cfg, now))
    first_run = not any(o.get("source") == "denner_api" for o in store.offers.values())
    stats = diff.apply_scan(store, fresh, now, trusted,
                            int(cfg.s("health", "missing_scans_before_withdrawn", 2)))
    diff.rescore(store, cfg, now)
    events = store.new_events
    run.update(ok=True, offers=len(fresh), **stats,
               events={t: sum(1 for e in events if e["type"] == t) for t in {e["type"] for e in events}})
    st["last_success"] = at
    if stats["new"]:
        st["last_new_at"] = at

    # 6. alertes
    n_enabled = len(enabled)
    msgs = notify.build(store, cfg, now, events, at, n_enabled, first_run) + msgs
    msgs += notify.recaps(store, cfg, now, n_enabled)
    msgs += notify.expiry_reminders(store, cfg, now, n_enabled)
    rem = st.get("reminded", {})
    cutoff = (now - dt.timedelta(days=45)).date().isoformat()
    st["reminded"] = {k: v for k, v in rem.items() if v >= cutoff}

    log.info("collecte OK : %d offres (%d nouvelles, %d mises à jour, %d retirées), %d requêtes",
             len(fresh), stats["new"], stats["updated"], stats["withdrawn"], http.requests_made)
    _finish(store, cfg, now, msgs, run, args)
    return 0


def _finish(store: Store, cfg, now, msgs, run, args) -> None:
    at = now.replace(microsecond=0).isoformat()
    if not args.no_notify:
        run["queued"] = notify.enqueue(store, msgs, at)
        run["telegram"] = notify.flush(store, cfg, now, dry_run=args.dry_run)
        log.info("Telegram : %s", run["telegram"])
    store.log_run(run)
    if args.dry_run:
        log.info("--dry-run : rien n'est écrit ni envoyé")
        if args.out_dry:
            export.write(store, cfg, now, Path(args.out_dry))
        return
    store.save()
    export.write(store, cfg, now, Path(args.out))


# --------------------------------------------------------------------------

def cmd_export(args) -> int:
    cfg = load()
    now = _now(cfg, args.now)
    store = Store(cfg.data_dir)
    diff.refresh_statuses(store, now)
    export.write(store, cfg, now, Path(args.out))
    print(f"export écrit dans {args.out}")
    return 0


def cmd_stores(args) -> int:
    cfg = load()
    now = _now(cfg, None)
    store = Store(cfg.data_dir)
    msgs = check_stores(store, cfg, _http(cfg), now)
    for s in sorted(store.stores["stores"].values(), key=lambda s: (s["scope"] != "city", s.get("distance_km") or 99)):
        flag = "✓ suivi" if s.get("enabled") else "  (désactivé)"
        state = "" if s.get("active", True) else " [FERMÉ?]"
        print(f"{flag:13} {s['scope']:9} {_store_line(s)} ~{s.get('distance_km')} km{state}")
    for w in store.stores.get("warnings", []):
        print("avertissement:", w)
    for m in msgs:
        print(m["text"])
    if not args.dry_run:
        store.save()
    return 0


def cmd_status(args) -> int:
    cfg = load()
    store = Store(cfg.data_dir)
    st = store.state
    print("Dernier succès :", st.get("last_success"), "| dernière tentative :", st.get("last_attempt"))
    print("Échecs consécutifs :", st.get("consecutive_failures", 0))
    for f, s in st.get("sources", {}).items():
        print(f"  {f:32} ok={s['ok']} complet={s['complete']} {s['received']}/{s['total']} {s.get('error') or ''}")
    print("Offres en base :", len(store.offers), "| file Telegram :", len(st.get("outbox", [])))
    print("Magasins suivis :", ", ".join(storesmod.enabled_ids(store.stores)))
    return 0


def cmd_watchdog(args) -> int:
    cfg = load()
    now = _now(cfg, args.now)
    store = Store(cfg.data_dir)
    last = store.state.get("last_success")
    hours = float(cfg.s("health", "stale_after_hours", 14))
    age = (now - dt.datetime.fromisoformat(last)).total_seconds() / 3600 if last else 1e9
    if age <= hours:
        print(f"OK : dernière collecte réussie il y a {age:.1f} h")
        return 0
    msg = notify.technical(f"tech:stale:{now.date()}",
                           f"⏰ Aucune collecte réussie depuis {age:.0f} h (seuil {hours:.0f} h). "
                           "Le watchdog relance une collecte.")
    notify.enqueue(store, [msg], now.isoformat())
    print(notify.flush(store, cfg, now, dry_run=args.dry_run, force=True))
    if not args.dry_run and not args.no_save:
        store.save()
    return 3


def cmd_notify_test(args) -> int:
    token, chat = notify.credentials()
    if not token or not chat:
        print("Définir TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID.")
        return 1
    notify.send_telegram("✅ <b>Denner Deal Radar</b> : connexion Telegram opérationnelle.", token, chat)
    print("message envoyé")
    return 0


def cmd_chat_id(args) -> int:
    import requests
    token, _ = notify.credentials()
    if not token:
        print("Définir TELEGRAM_BOT_TOKEN.")
        return 1
    r = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=30).json()
    ids = {}
    for u in r.get("result", []):
        chat = (u.get("message") or u.get("my_chat_member") or {}).get("chat")
        if chat:
            ids[chat["id"]] = chat.get("first_name") or chat.get("title")
    if not ids:
        print("Aucun message reçu : envoyez /start à votre bot puis relancez.")
        return 1
    for cid, name in ids.items():
        print(cid, name)
    return 0


def _add_manual(store: Store, cfg, now: dt.datetime, name: str, price: float, regular: float | None,
                store_id: str | None, until: str | None, start: str | None, size: str, note: str,
                photo: str | None) -> dict:
    known = store.stores.get("stores", {})
    if store_id and not store_id.startswith("s"):
        store_id = "s" + store_id
    if store_id and known and store_id not in known:
        raise SystemExit(f"magasin inconnu {store_id} ; connus : {', '.join(known)}")
    mid = "man-" + hashlib.sha1(f"{name}|{store_id}|{start or now.date()}|{price}".encode()).hexdigest()[:10]
    entry = {"id": mid, "name": name, "price": price, "regular": regular, "store": store_id,
             "from": start or now.date().isoformat(), "until": until, "size": size, "note": note,
             "photo": photo, "added": now.replace(microsecond=0).isoformat()}
    store.manual = [m for m in store.manual if m["id"] != mid] + [entry]
    return entry


def cmd_add_manual(args) -> int:
    cfg = load()
    store = Store(cfg.data_dir)
    e = _add_manual(store, cfg, _now(cfg, None), args.name, args.price, args.regular, args.store,
                    args.until, args.start, args.size or "", args.note or "", args.photo)
    store.save()
    print("ajoutée :", e)
    return 0


def parse_issue_form(body: str) -> dict:
    fields = {}
    for m in re.finditer(r"###\s*(.+?)\n+(.*?)(?=\n###|\Z)", body, re.S):
        v = m.group(2).strip()
        fields[m.group(1).strip().lower()] = "" if v in ("_No response_", "None") else v
    return fields


def cmd_add_from_issue(args) -> int:
    cfg = load()
    store = Store(cfg.data_dir)
    body = Path(args.body_file).read_text(encoding="utf-8")
    f = parse_issue_form(body)

    def get(*keys: str) -> str:
        return next((v for k, v in f.items() if any(kk in k for kk in keys)), "")

    sid = re.search(r"s?(\d{7})", get("magasin"))
    photo = re.search(r"https://github\.com/user-attachments/[^\s)\"']+|https://\S+\.(?:png|jpe?g|webp)", body)
    price = parse_chf(get("prix promo"))
    if not price or not get("produit"):
        print("formulaire incomplet (produit et prix requis)")
        return 1
    e = _add_manual(store, cfg, _now(cfg, None), get("produit"), price, parse_chf(get("prix habituel")),
                    ("s" + sid.group(1)) if sid else None, get("valable jusqu") or None, None,
                    get("contenance"), get("remarque"), photo.group(0) if photo else None)
    store.save()
    print("ajoutée :", e)
    return 0


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(prog="radar", description="Denner Deal Radar — St. Gallen")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("scan")
    p.add_argument("--dry-run", action="store_true", help="aucune écriture, messages affichés au lieu d'être envoyés")
    p.add_argument("--force", action="store_true", help="ignore l'intervalle minimal entre collectes")
    p.add_argument("--no-notify", action="store_true")
    p.add_argument("--out", default="site/data")
    p.add_argument("--out-dry", default=None, help="en dry-run, écrire quand même l'export ici")
    p.add_argument("--now", default=None, help="date ISO simulée (tests)")
    p.set_defaults(fn=cmd_scan)
    p = sub.add_parser("export")
    p.add_argument("--out", default="site/data")
    p.add_argument("--now", default=None)
    p.set_defaults(fn=cmd_export)
    p = sub.add_parser("stores")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(fn=cmd_stores)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    p = sub.add_parser("watchdog")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--no-save", action="store_true", help="envoie l'alerte sans modifier data/")
    p.add_argument("--now", default=None)
    p.set_defaults(fn=cmd_watchdog)
    sub.add_parser("notify-test").set_defaults(fn=cmd_notify_test)
    sub.add_parser("telegram-chat-id").set_defaults(fn=cmd_chat_id)
    p = sub.add_parser("add-manual", help="offre observée en magasin (étiquette)")
    p.add_argument("--name", required=True)
    p.add_argument("--price", type=float, required=True)
    p.add_argument("--regular", type=float)
    p.add_argument("--store", help="ID Denner, ex. s1145081")
    p.add_argument("--until", help="AAAA-MM-JJ")
    p.add_argument("--start", help="AAAA-MM-JJ")
    p.add_argument("--size", help="ex. 500 g")
    p.add_argument("--note")
    p.add_argument("--photo", help="URL de la photo de l'étiquette")
    p.set_defaults(fn=cmd_add_manual)
    p = sub.add_parser("add-manual-from-issue")
    p.add_argument("--body-file", required=True)
    p.set_defaults(fn=cmd_add_from_issue)
    from . import ucli
    ucli.register(sub)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
