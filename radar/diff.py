"""Comparaison d'une collecte avec l'état précédent.

Événements produits (un seul « new » par offre, jamais deux) :
  new              première apparition (``announced`` = pas encore commencée)
  became_active    une offre annoncée vient de commencer (pas une nouveauté)
  price_drop       prix promotionnel baissé
  price_increase   prix promotionnel augmenté
  extended / shortened   date de fin modifiée
  modified         autre changement (référence, conditions…)
  withdrawn        absente de N collectes COMPLÈTES consécutives avant sa fin
  reappeared       revenue après un retrait
  expired          date de fin dépassée
"""
from __future__ import annotations

import datetime as dt

from . import scoring
from .storage import Store

TRACKED = ("discounted_price", "regular_price", "reference_price_type", "ends_at", "starts_at",
           "min_purchase_quantity", "stated_discount_pct", "conditions", "eligible_home")
REFRESH = ("product_name", "subline", "image_url", "source_url", "sku", "package_size",
           "total_quantity", "quantity_unit", "pack_count", "price_basis", "unit_price",
           "unit_price_unit", "regular_unit_price", "discount_percentage", "discount_text",
           "offer_type", "group", "tags", "category", "brand", "regions", "geographic_scope",
           "online_only", "store_ids", "availability_confidence", "validity_label", "raw", "kind")


def status_at(o: dict, now: dt.datetime) -> str:
    if o.get("withdrawn"):
        return "withdrawn"
    end = o.get("ends_at")
    start = o.get("starts_at")
    if end and dt.datetime.fromisoformat(end) < now:
        return "expired"
    if start and dt.datetime.fromisoformat(start) > now:
        return "announced"
    return "active"


def apply_scan(store: Store, fresh: dict[str, dict], now: dt.datetime, trusted_complete: bool,
               missing_threshold: int = 2) -> dict:
    at = now.replace(microsecond=0).isoformat()
    stats = {"new": 0, "updated": 0, "withdrawn": 0}
    for oid, o in fresh.items():
        old = store.offers.get(oid)
        if old is None:
            rec = dict(o)
            rec.update(first_seen_at=at, last_seen_at=at, last_changed_at=at, missing_scans=0,
                       withdrawn=False)
            rec["_partition"] = Store.partition(rec)
            rec["status"] = status_at(rec, now)
            store.offers[oid] = rec
            store.record_price(rec, at)
            store.event("new", at, oid, announced=rec["status"] == "announced",
                        name=rec["product_name"], price=rec.get("discounted_price"))
            stats["new"] += 1
            continue

        changes = {k: (old.get(k), o.get(k)) for k in TRACKED if old.get(k) != o.get(k)}
        if old.get("withdrawn"):
            old["withdrawn"] = False
            store.event("reappeared", at, oid, name=o["product_name"])
        for k in REFRESH:
            old[k] = o.get(k)
        old["sources"] = sorted(set(old.get("sources", [])) | set(o["sources"]))
        old["last_seen_at"] = at
        old["missing_scans"] = 0
        if changes:
            for k, (_, new) in changes.items():
                old[k] = new
            old["last_changed_at"] = at
            store.record_price(old, at)
            stats["updated"] += 1
            p0, p1 = changes.get("discounted_price", (None, None))
            if p0 and p1:
                store.event("price_drop" if p1 < p0 else "price_increase", at, oid,
                            name=o["product_name"], old=p0, new=p1)
            if "ends_at" in changes and changes["ends_at"][0] and changes["ends_at"][1]:
                store.event("extended" if changes["ends_at"][1] > changes["ends_at"][0] else "shortened",
                            at, oid, name=o["product_name"], old=changes["ends_at"][0], new=changes["ends_at"][1])
            rest = {k: v for k, v in changes.items() if k not in ("discounted_price", "ends_at")}
            if rest:
                store.event("modified", at, oid, name=o["product_name"],
                            fields={k: [str(a), str(b)] for k, (a, b) in rest.items()})

    # Disparitions : uniquement si la collecte est complète et jugée fiable.
    if trusted_complete:
        for oid, rec in store.offers.items():
            if oid in fresh or rec.get("source") != "denner_api" or rec.get("withdrawn"):
                continue
            if status_at(rec, now) in ("active", "announced"):
                rec["missing_scans"] = int(rec.get("missing_scans", 0)) + 1
                if rec["missing_scans"] >= missing_threshold:
                    rec["withdrawn"] = True
                    rec["withdrawn_at"] = at
                    store.event("withdrawn", at, oid, name=rec["product_name"])
                    stats["withdrawn"] += 1

    refresh_statuses(store, now)
    return stats


def refresh_statuses(store: Store, now: dt.datetime) -> None:
    at = now.replace(microsecond=0).isoformat()
    for oid, rec in store.offers.items():
        new = status_at(rec, now)
        old = rec.get("status")
        if old == new:
            continue
        if old == "announced" and new == "active":
            store.event("became_active", at, oid, name=rec["product_name"])
        elif new == "expired" and old in ("active", "announced"):
            store.event("expired", at, oid, name=rec["product_name"])
        rec["status"] = new


def rescore(store: Store, cfg, now: dt.datetime, only_live: bool = True) -> None:
    haircut = float(cfg.s("scoring", "competitor_reference_haircut", 0.20))
    families: dict[tuple, list[float]] = {}
    cutoff = (now - dt.timedelta(days=365)).date().isoformat()
    for rec in store.offers.values():
        fam = scoring.family_of(rec.get("product_name", ""), rec.get("subline", ""))
        if fam and rec.get("unit_price") and (rec.get("starts_at") or "9")[:10] >= cutoff:
            families.setdefault((fam, rec.get("unit_price_unit")), []).append(rec["unit_price"])
    for rec in store.offers.values():
        if only_live and rec.get("status") in ("expired", "withdrawn") and rec.get("deal_score") is not None:
            continue
        hist = [h for h in store.prices.get(rec.get("article_id", ""), []) if h.get("seen", "") >= cutoff]
        fam = scoring.family_of(rec.get("product_name", ""), rec.get("subline", ""))
        fam_prices = None
        if fam:
            fam_prices = [p for p in families.get((fam, rec.get("unit_price_unit")), [])]
            if rec.get("unit_price") in fam_prices:
                fam_prices.remove(rec["unit_price"])
        r = scoring.score_offer(rec, hist, fam_prices, haircut)
        rec["deal_score"] = r.score
        rec["score_confidence"] = r.confidence
        rec["score_confidence_label"] = r.confidence_label
        rec["effective_discount"] = r.effective_discount
        rec["score_notes"] = r.notes
        rec["score_label"] = scoring.label(r.score)
        rec["personal_relevance"] = scoring.personal_relevance(rec, cfg.prefs)
        rec["favorite"] = scoring.is_favorite(rec, cfg.prefs)
        if r.score is not None:
            best = rec.get("best_score")
            if best is None or r.score > best:
                rec["best_score"] = r.score
