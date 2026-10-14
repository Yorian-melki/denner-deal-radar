"""Pipeline universel :

SOURCE -> CONNECTOR -> RAW SNAPSHOT -> VALIDATION -> NORMALIZATION -> ENTITY
RESOLUTION -> DEDUP -> HISTORY -> CHANGE DETECTOR -> ANOMALY -> GEO -> SCORING
-> RELEVANCE -> URGENCY -> (alertes, export)

Chaque connecteur est isolé : son échec n'affecte ni les autres, ni ses deals
déjà connus (dernier état valide conservé, aucune disparition enregistrée).
"""
from __future__ import annotations

import datetime as dt
import gzip
import json
import logging
import time
from pathlib import Path

from ..categories import classify
from . import analytics as A
from .connector import Connector, Context, FetchResult
from .entity import canonical_entity_id, canonical_game_id, deduplicate
from .store import UStore
from .uscoring import accessibility, score_deal

log = logging.getLogger("radar.core")
TRACKED = ("current_price", "reference_price", "ends_at", "starts_at", "stock_remaining",
           "stock_percent_sold", "conditions", "minimum_quantity", "shipping_cost")
SEEN_GRANULARITY = dt.timedelta(hours=6)
REFRESH_SKIP = {"first_seen_at", "deal_id", "missing_scans", "lifecycle", "removed_at"}


def iso(now: dt.datetime) -> str:
    return now.replace(microsecond=0).isoformat()


def is_due(c: Connector, st: dict, now: dt.datetime) -> bool:
    last = st.get("last_attempt")
    if not last:
        return True
    interval = c.min_interval if st.get("last_state") in ("OK", "EMPTY_VALID", "NOT_MODIFIED") \
        else min(c.min_interval, 30)
    return now - dt.datetime.fromisoformat(last) >= dt.timedelta(minutes=interval * 0.9)


def lifecycle(d: dict, now: dt.datetime) -> str:
    if d.get("lifecycle") == "REMOVED":
        return "REMOVED"
    end, start = d.get("ends_at"), d.get("starts_at")
    if end and dt.datetime.fromisoformat(end) < now:
        return "EXPIRED"
    if start and dt.datetime.fromisoformat(start) > now:
        return "UPCOMING"
    if (d.get("stock_percent_sold") or 0) >= 80 or (d.get("stock_remaining") is not None and d["stock_remaining"] <= 3):
        return "LOW_STOCK"
    if end and dt.datetime.fromisoformat(end) - now <= dt.timedelta(hours=24):
        return "ENDING_SOON"
    return "ACTIVE"


def run_connector(c: Connector, store: UStore, cfg, http, now: dt.datetime, raw_dir: Path | None) -> dict:
    at = iso(now)
    st = store.source_state(c.id)
    st["last_attempt"] = at
    t0 = time.monotonic()
    ctx = Context(http=http, cfg=cfg, now=now, source_state=st, deadline=t0 + c.time_budget_s)
    req0 = http.requests_made
    try:
        res = c.fetch(ctx)
    except Exception as e:  # noqa: BLE001 — isolation stricte
        res = FetchResult(error=f"{type(e).__name__}: {e}")
    latency = round(time.monotonic() - t0, 2)

    if raw_dir is not None and res.raw is not None:
        raw_dir.mkdir(parents=True, exist_ok=True)
        with gzip.open(raw_dir / f"{c.id}.json.gz", "wt", encoding="utf-8") as f:
            json.dump(res.raw, f, ensure_ascii=False, default=str)

    fresh: dict[str, dict] = {}
    rejected: list[str] = []
    for raw in res.items:
        try:
            d = c.normalize(raw, ctx)
        except Exception as e:  # noqa: BLE001
            rejected.append(f"{type(e).__name__}: {e}"[:200])
            continue
        if d is None:
            continue
        if d.get("family") == "digital_free" and not d.get("gtin"):
            d["canonical_entity_id"] = canonical_game_id(d["title"])   # Epic + GamerPower = même jeu
        d.setdefault("canonical_entity_id", canonical_entity_id(d))
        fresh[d["deal_id"]] = d
    if res.items and len(rejected) > 0.5 * len(res.items):
        res.warnings.append(f"{len(rejected)}/{len(res.items)} éléments rejetés à la validation")

    state = res.state
    # Garde-fou : chute anormale du nombre d'éléments -> collecte non fiable.
    hist_counts = st.get("counts", [])
    if state == "OK" and len(hist_counts) >= 3:
        med = sorted(hist_counts)[len(hist_counts) // 2]
        if med >= 10 and len(fresh) < 0.4 * med:
            state = "PARTIAL"
            res.warnings.append(f"{len(fresh)} éléments vs médiane {med} : disparitions ignorées")
    if state in ("OK", "EMPTY_VALID"):
        st["counts"] = (hist_counts + [len(fresh)])[-12:]

    stats = apply(store, c, fresh, state, now, window_ttl=c.window_ttl_hours if res.window else None)
    ok = state in ("OK", "PARTIAL", "EMPTY_VALID", "NOT_MODIFIED")
    st.update(last_state=state, last_latency_s=latency, last_items=len(fresh),
              last_error=res.error, last_warnings=res.warnings[:5], requests=http.requests_made - req0)
    if ok:
        if not st.get("last_success") and fresh:
            st["bootstrap_at"] = at   # 1re collecte réussie : pas d'avalanche d'alertes
        st["last_success"] = at
        st["consecutive_failures"] = 0
    else:
        st["consecutive_failures"] = st.get("consecutive_failures", 0) + 1
    runs = st.setdefault("recent", [])
    runs.append({"at": at, "state": state, "items": len(fresh), "rejected": len(rejected),
                 "warn": len(res.warnings)})
    st["recent"] = runs[-30:]
    st["reliability"] = reliability(st)
    run = {"at": at, "source": c.id, "state": state, "items": len(fresh), "latency_s": latency,
           "requests": http.requests_made - req0, "rejected": len(rejected), "error": res.error, **stats}
    store.log_run(run)
    log.info("%-22s %-14s %4d deals (%s) %.1fs", c.id, state, len(fresh),
             ", ".join(f"{k}={v}" for k, v in stats.items() if v), latency)
    return run


def apply(store: UStore, c: Connector, fresh: dict[str, dict], state: str, now: dt.datetime,
          window_ttl: float | None = None) -> dict:
    at = iso(now)
    known = store.source_deals(c.id)
    stats = {"new": 0, "changed": 0, "removed": 0}
    for did, d in fresh.items():
        old = known.get(did)
        if old is None:
            rec = {**d, "first_seen_at": at, "last_seen_at": at, "last_changed_at": at, "missing_scans": 0}
            rec["lifecycle"] = lifecycle(rec, now)
            known[did] = rec
            store.observe(rec, at)
            store.event("new", at, rec, price=rec.get("current_price"))
            stats["new"] += 1
            continue
        changes = {k: (old.get(k), d.get(k)) for k in TRACKED if old.get(k) != d.get(k)}
        if old.get("lifecycle") == "REMOVED":
            old["lifecycle"] = "ACTIVE"
            old.pop("removed_at", None)
            store.event("reappeared", at, old)
        for k, v in d.items():
            if k not in REFRESH_SKIP:
                old[k] = v
        for k in set(old) - set(d) - REFRESH_SKIP - DERIVED:
            if k not in ("last_seen_at", "last_changed_at", "canonical_entity_id"):
                old.pop(k)
        # Granularité 6 h : évite de réécrire des milliers d'enregistrements (et de
        # gonfler l'historique git) à chaque collecte toutes les 30 min.
        if not old.get("last_seen_at") or now - dt.datetime.fromisoformat(old["last_seen_at"]) >= SEEN_GRANULARITY:
            old["last_seen_at"] = at
        old["missing_scans"] = 0
        if changes:
            old["last_changed_at"] = at
            store.observe(old, at)
            stats["changed"] += 1
            p0, p1 = changes.get("current_price", (None, None))
            if p0 is not None and p1 is not None:
                store.event("price_drop" if p1 < p0 else "price_increase", at, old, old=p0, new=p1)
            else:
                store.event("changed", at, old, fields=sorted(changes))
    if window_ttl is not None and state in ("OK", "PARTIAL"):
        cutoff = (now - dt.timedelta(hours=window_ttl)).isoformat()
        for did, rec in known.items():
            if did not in fresh and rec.get("lifecycle") not in ("EXPIRED", "REMOVED") \
                    and (rec.get("last_seen_at") or "") < cutoff:
                rec["lifecycle"] = "REMOVED"
                rec["removed_at"] = at
                rec["removed_reason"] = f"non revue depuis {window_ttl:.0f} h (flux à fenêtre)"
                store.event("removed", at, rec, reason="window_ttl")
                stats["removed"] += 1
    elif state in ("OK", "EMPTY_VALID"):
        threshold = 2
        for did, rec in known.items():
            if did in fresh or rec.get("lifecycle") in ("EXPIRED", "REMOVED"):
                continue
            rec["missing_scans"] = rec.get("missing_scans", 0) + 1
            if rec["missing_scans"] >= threshold:
                rec["lifecycle"] = "REMOVED"
                rec["removed_at"] = at
                store.event("removed", at, rec)
                stats["removed"] += 1
    for rec in known.values():
        new = lifecycle(rec, now)
        if new != rec.get("lifecycle"):
            if rec.get("lifecycle") == "UPCOMING" and new in ("ACTIVE", "ENDING_SOON", "LOW_STOCK"):
                store.event("became_active", at, rec)
            elif new == "EXPIRED":
                store.event("expired", at, rec)
            rec["lifecycle"] = new
    return stats


DERIVED = {"deal_score", "score_confidence", "effective_discount", "net_savings", "score_components",
           "promotion_integrity", "personal_relevance", "urgency", "urgency_reasons", "accessibility",
           "accessibility_notes", "anomaly_score", "anomaly_confidence", "anomaly_ratio_to_median",
           "silent_drop", "anomaly_checks", "historical_median", "historical_low", "history_n",
           "duplicate_of", "possible_duplicate_of", "corroborated_by", "divergent_sources",
           "geographic_scope_resolved", "tags", "group", "best_score", "total_acquisition_cost",
           "cost_assumptions", "watchlists"}


def enrich(store: UStore, cfg, prefs: dict, now: dt.datetime, extra: list[dict] | None = None) -> list[dict]:
    """Calcule toutes les dimensions dérivées sur les deals vivants. ``extra`` =
    deals d'autres moteurs (Denner V2) pris en compte pour la déduplication."""
    from .deal import total_acquisition_cost
    live = [d for d in store.all_deals() if d.get("lifecycle") not in ("EXPIRED", "REMOVED")]
    deduplicate(live + (extra or []))
    lifetimes = {}
    for sid, deals in store.deals.items():
        lifetimes[sid] = A.typical_lifetime_minutes(list(deals.values()))
    for d in live:
        hist = store.entity_history(d)
        stats = A.history_stats(hist, exclude_deal=d["deal_id"])
        if stats.get("n"):
            d["historical_median"], d["historical_low"], d["history_n"] = stats["median"], stats["min"], stats["n"]
        else:
            for k in ("historical_median", "historical_low", "history_n"):
                d.pop(k, None)
        rel = store.source_state(d["source_id"]).get("reliability", 0.8)
        an = A.anomaly(d, stats, rel, corroborated=bool(d.get("corroborated_by")))
        for k in ("anomaly_score", "anomaly_confidence", "anomaly_ratio_to_median", "silent_drop", "anomaly_checks"):
            d.pop(k, None)
        d.update(an)
        if d.get("lat") is not None and d.get("distance_km") is None:
            d["distance_km"] = A.distance_km(d["lat"], d["lng"])
        d["geographic_scope_resolved"] = A.geo_scope(d)
        tac, notes = total_acquisition_cost(d)
        if tac is not None:
            d["total_acquisition_cost"], d["cost_assumptions"] = tac, notes
        sc = score_deal(d, hist)
        d.update(sc.as_dict())
        if sc.score is not None and (d.get("best_score") is None or sc.score > d["best_score"]):
            d["best_score"] = sc.score
        d["urgency"], d["urgency_reasons"] = A.urgency(d, now, lifetimes.get(d["source_id"]))
        d["accessibility"], d["accessibility_notes"] = accessibility(d, prefs)
        d["group"], tags = classify(d["title"], d.get("package_size", ""), d.get("category", "")) \
            if d["family"] in ("grocery", "surplus", "restaurant") else (d["family"], [])
        d["tags"] = sorted(set(tags) | set(d.get("extra_tags", [])))
        d["personal_relevance"] = relevance(d, prefs)
    return live


RELEVANCE_PENALTY_TAGS = {"departure_unknown": 0.6, "porc_possible": 0.5}


def relevance(d: dict, prefs: dict) -> float:
    tags = set(d.get("tags") or [])
    if tags & set(prefs.get("exclude_tags", [])):
        return 0.0
    fam_w = prefs.get("family_relevance", {})
    r = float(fam_w.get(d["family"], 0.4))
    if d["family"] in ("grocery", "surplus"):
        r = max(r, float(prefs.get("relevance", {}).get(d.get("group") or "", 0)))
        if "proteines" in tags:
            r = max(r, float(prefs.get("relevance", {}).get("proteines", 1.0)))
    for tag, factor in RELEVANCE_PENALTY_TAGS.items():
        if tag in tags:
            r *= factor
    title = (d.get("title") or "").lower()
    if any(k.lower() in title for k in prefs.get("favorites", {}).get("keywords", [])):
        r += 0.15
    return round(min(1.0, r), 2)


def reliability(st: dict) -> float:
    runs = st.get("recent", [])
    if not runs:
        return 0.8
    # PARTIAL = collecte utilisable mais incomplète (souvent par conception) : réussite, petite pénalité.
    ok = sum(1 for r in runs if r["state"] in ("OK", "EMPTY_VALID", "NOT_MODIFIED", "PARTIAL")) / len(runs)
    partial = sum(1 for r in runs if r["state"] == "PARTIAL") / len(runs)
    items = sum(r["items"] for r in runs) or 1
    rej = min(1.0, sum(r["rejected"] for r in runs) / items)
    warn = sum(1 for r in runs if r["warn"]) / len(runs)
    return round(0.55 * ok + 0.1 * (1 - partial) + 0.2 * (1 - rej) + 0.15 * (1 - warn), 2)
