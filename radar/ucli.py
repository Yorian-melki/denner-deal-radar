"""Commandes du moteur universel (s'ajoutent à celles de Denner V2).

    u-scan [--source ID ...] [--due] [--dry-run] [--no-notify]   collecte universelle
    u-sources                                                    registre + santé
    u-export [--out site/data]                                   JSON du dashboard
    u-health                                                     santé (code 1 si problème)
"""
from __future__ import annotations

import datetime as dt
import json
import logging
from pathlib import Path

from . import notify as N
from .config import load
from .connectors import REGISTRY, enabled_connectors
from .connectors import denner_v2
from .core import engine, ualerts
from .core.deal import FAMILIES
from .core.store import UStore
from .storage import Store

log = logging.getLogger("radar.u")


class _Box:
    """Adaptateur : la file Telegram universelle réutilise notify.enqueue/flush."""

    def __init__(self, state: dict):
        self.state = state


def _now(cfg, override):
    if override:
        n = dt.datetime.fromisoformat(override)
        return n if n.tzinfo else n.replace(tzinfo=cfg.tz)
    return dt.datetime.now(cfg.tz)


def cmd_uscan(args) -> int:
    from .cli import _http
    cfg = load()
    now = _now(cfg, args.now)
    store = UStore(cfg.data_dir)
    http = _http(cfg)
    conns = enabled_connectors(cfg)
    if args.source:
        conns = [c for c in conns if c.id in args.source] or [REGISTRY[s]() for s in args.source if s in REGISTRY]
    if args.due:
        conns = [c for c in conns if engine.is_due(c, store.source_state(c.id), now)]
    raw_dir = Path(args.raw_dir) if args.raw_dir else None
    runs = [engine.run_connector(c, store, cfg, http, now, raw_dir) for c in conns]

    radar_store = Store(cfg.data_dir)
    den = denner_v2.deals(radar_store, now)
    live = engine.enrich(store, cfg, cfg.prefs, now, extra=den)
    store.archive_old(now)

    msgs = ualerts.build(live + den, cfg, now, store) if not args.no_notify else []
    msgs += _technical(store, cfg, conns, now)
    box = _Box(store.notify_state)
    if msgs:
        N.enqueue(box, msgs, now.isoformat())
    res = N.flush(box, cfg, now, dry_run=args.dry_run) if not args.no_notify else {}
    log.info("u-scan : %d connecteurs, %d deals vivants, Telegram %s", len(runs), len(live), res)
    if args.dry_run:
        if args.out_dry:
            write_export(store, radar_store, cfg, now, Path(args.out_dry), live, den)
        return 0
    store.save()
    write_export(store, radar_store, cfg, now, Path(args.out), live, den)
    failed = [r for r in runs if r["state"] == "SCRAPE_FAILURE"]
    return 0 if len(failed) < max(1, len(runs)) else 2


def _technical(store: UStore, cfg, conns, now) -> list[dict]:
    th = int(cfg.s("health", "failure_alert_after", 2))
    out = []
    for c in conns:
        st = store.source_state(c.id)
        n = st.get("consecutive_failures", 0)
        if n >= th and not st.get("failure_alerted"):
            st["failure_alerted"] = now.isoformat()
            out.append(N.technical(f"tech:u:{c.id}:{now.date()}",
                                   f"⚠️ Source <b>{N.esc(c.name)}</b> en échec depuis {n} collectes : "
                                   f"{N.esc(st.get('last_error') or st.get('last_state'))}\n"
                                   "Ses dernières données valides restent affichées."))
        if n == 0 and st.get("failure_alerted"):
            st.pop("failure_alerted")
            out.append(N.technical(f"tech:u:{c.id}:ok:{now.isoformat()}", f"✅ Source <b>{N.esc(c.name)}</b> rétablie."))
    return out


# --------------------------------------------------------------------------
# Export dashboard
# --------------------------------------------------------------------------

KEEP_FIELDS_DROP = {"raw", "http_cache"}


def write_export(store: UStore, radar_store: Store, cfg, now, out: Path, live=None, den=None) -> None:
    if live is None:
        den = denner_v2.deals(radar_store, now)
        live = engine.enrich(store, cfg, cfg.prefs, now, extra=den)
    recent = (now - dt.timedelta(days=30)).isoformat()
    deals = [d for d in store.all_deals()
             if d.get("lifecycle") not in ("EXPIRED", "REMOVED") or (d.get("last_seen_at") or "") >= recent]
    allx = deals + (den or [])
    ranked = sorted((d for d in store.all_deals() if d.get("best_score") is not None),
                    key=lambda d: d["best_score"], reverse=True)[:150]
    ids = {d["deal_id"] for d in allx}
    ranked_ids = {d["deal_id"] for d in ranked}
    for d in ranked:
        if d["deal_id"] not in ids:
            allx.append(d)
    for d in allx:
        d["record"] = d["deal_id"] in ranked_ids or d.get("record", False)
    payload = {"generated_at": now.replace(microsecond=0).isoformat(),
               "deals": [{k: v for k, v in d.items() if k not in KEEP_FIELDS_DROP} for d in allx]}
    out.mkdir(parents=True, exist_ok=True)
    (out / "universal.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str), "utf-8")
    (out / "sources.json").write_text(json.dumps(sources_report(store, cfg, now, radar_store, allx), ensure_ascii=False,
                                                 indent=1, default=str), "utf-8")


def sources_report(store: UStore, cfg, now, radar_store: Store, deals: list[dict]) -> dict:
    reg = json.loads((cfg.root / "docs" / "source_registry.json").read_text("utf-8")) \
        if (cfg.root / "docs" / "source_registry.json").exists() else []
    conns = {c.id: c for c in enabled_connectors(cfg)}
    health = []
    for cid, c in conns.items():
        st = store.source_state(cid)
        last_ok = st.get("last_success")
        age_h = (now - dt.datetime.fromisoformat(last_ok)).total_seconds() / 3600 if last_ok else None
        health.append({"id": cid, "name": c.name, "family": c.family, "tier": c.tier, "interval_min": c.min_interval,
                       "last_attempt": st.get("last_attempt"), "last_success": last_ok,
                       "state": st.get("last_state"), "items": st.get("last_items"), "error": st.get("last_error"),
                       "warnings": st.get("last_warnings"), "latency_s": st.get("last_latency_s"),
                       "reliability": st.get("reliability"),
                       "stale": age_h is None or age_h > max(6, 3 * c.min_interval / 60)})
    rs = radar_store.state
    health.insert(0, {"id": "denner", "name": "Denner (moteur V2)", "family": "grocery", "tier": "DAILY",
                      "last_success": rs.get("last_success"), "last_attempt": rs.get("last_attempt"),
                      "state": "OK" if not rs.get("consecutive_failures") else "SCRAPE_FAILURE",
                      "items": len(radar_store.offers), "reliability": 1.0 if not rs.get("consecutive_failures") else 0.5})
    # Promotion des statuts selon la santé réelle : INTEGRATED -> FUNCTIONAL -> MONITORED.
    by_conn = {h["id"]: h for h in health}
    for s in reg:
        h = by_conn.get(s.get("connector") or "")
        if not h:
            continue
        runs = len(store.source_state(h["id"]).get("recent", [])) if h["id"] != "denner" else 99
        if h.get("state") in ("OK", "EMPTY_VALID", "NOT_MODIFIED") and not h.get("stale"):
            s["status"] = "MONITORED" if runs >= 10 and (h.get("reliability") or 0) >= 0.8 else "FUNCTIONAL"
        elif h.get("state") == "PARTIAL":
            s["status"] = "PARTIAL"
    status_count: dict[str, int] = {}
    for s in reg:
        status_count[s.get("status", "DISCOVERED")] = status_count.get(s.get("status", "DISCOVERED"), 0) + 1
    live = [d for d in deals if d.get("lifecycle") not in ("EXPIRED", "REMOVED")]
    return {
        "generated_at": now.replace(microsecond=0).isoformat(),
        "health": health, "registry": reg, "registry_status_counts": status_count,
        "families": FAMILIES,
        "deal_counts": {"live": len(live), "unique": sum(1 for d in live if not d.get("duplicate_of")),
                        "duplicates": sum(1 for d in live if d.get("duplicate_of")),
                        "possible_duplicates": sum(1 for d in live if d.get("possible_duplicate_of")),
                        "scored": sum(1 for d in live if d.get("deal_score") is not None),
                        "by_family": {f: sum(1 for d in live if d["family"] == f) for f in FAMILIES}},
        "coverage_gaps": json.loads((cfg.root / "docs" / "coverage_gaps.json").read_text("utf-8"))
        if (cfg.root / "docs" / "coverage_gaps.json").exists() else [],
    }


def cmd_uexport(args) -> int:
    cfg = load()
    now = _now(cfg, getattr(args, "now", None))
    write_export(UStore(cfg.data_dir), Store(cfg.data_dir), cfg, now, Path(args.out))
    print("export universel écrit dans", args.out)
    return 0


def cmd_usources(args) -> int:
    cfg = load()
    store = UStore(cfg.data_dir)
    for c in enabled_connectors(cfg):
        st = store.source_state(c.id)
        print(f"{c.id:24} {c.family:12} {c.tier:8} every {c.min_interval:4}min  state={st.get('last_state')} "
              f"items={st.get('last_items')} last_ok={st.get('last_success')} rel={st.get('reliability')}")
    return 0


def cmd_uhealth(args) -> int:
    cfg = load()
    now = _now(cfg, None)
    rep = sources_report(UStore(cfg.data_dir), cfg, now, Store(cfg.data_dir), [])
    bad = [h for h in rep["health"] if h.get("stale") or h.get("state") == "SCRAPE_FAILURE"]
    for h in rep["health"]:
        print(f"{'❌' if h in bad else '✅'} {h['id']:24} {h.get('state')} last_ok={h.get('last_success')}")
    return 1 if bad else 0


def register(sub) -> None:
    p = sub.add_parser("u-scan", help="collecte universelle")
    p.add_argument("--source", nargs="*")
    p.add_argument("--due", action="store_true", help="seulement les sources dont l'intervalle est écoulé")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--no-notify", action="store_true")
    p.add_argument("--out", default="site/data")
    p.add_argument("--out-dry")
    p.add_argument("--raw-dir", default="raw")
    p.add_argument("--now")
    p.set_defaults(fn=cmd_uscan)
    p = sub.add_parser("u-export")
    p.add_argument("--out", default="site/data")
    p.add_argument("--now")
    p.set_defaults(fn=cmd_uexport)
    sub.add_parser("u-sources").set_defaults(fn=cmd_usources)
    sub.add_parser("u-health").set_defaults(fn=cmd_uhealth)
