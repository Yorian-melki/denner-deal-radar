"""Denner — premier connecteur du moteur universel (migration sans perte).

La collecte, l'historique, les IDs, la notation et les alertes Denner restent
ceux du moteur V2 (``radar.cli scan``), validés en production. Cet adaptateur
expose simplement les offres V2 au format universel, en lecture seule :

* ``deal_id`` = ``denner:<offer_id V2>`` (IDs V2 inchangés) ;
* la note V2 est conservée telle quelle (``score_model = denner_v2``) ;
* aucune alerte universelle n'est émise pour Denner (pas de doublon), seules
  les watchlists l'examinent.
"""
from __future__ import annotations

import datetime as dt

from .. import diff as D
from ..core import analytics as A

STATUS = {"announced": "UPCOMING", "active": "ACTIVE", "expired": "EXPIRED", "withdrawn": "REMOVED"}
REF = {"denner_previous": "merchant_previous", "competitor_comparison": "competitor",
       "stated_percent_only": "stated_percent_only", "none": "none"}
UNIT = {"CHF/kg": "CHF/kg", "CHF/l": "CHF/l", "CHF/pièce": "CHF/pièce"}


def to_deal(o: dict, now: dt.datetime, stores: dict) -> dict:
    status = STATUS.get(D.status_at(o, now), "UNKNOWN")
    if status == "ACTIVE" and o.get("ends_at") and \
            dt.datetime.fromisoformat(o["ends_at"]) - now <= dt.timedelta(hours=24):
        status = "ENDING_SOON"
    food = o.get("group") in ("proteines", "laitier_oeufs", "feculents", "fruits_legumes", "nourriture", "boissons")
    d = {
        "deal_id": f"denner:{o['offer_id']}", "source_id": "denner", "source_type": "merchant",
        "source_offer_id": o["offer_id"], "source_url": o.get("source_url"), "merchant": "Denner",
        "title": o["product_name"], "description": o.get("subline"), "brand": o.get("brand"),
        "category": o.get("category"), "subcategory": o.get("group"),
        "family": "grocery" if food else "retail", "offer_type": o.get("offer_type"),
        "condition": "new", "merchant_sku": o.get("article_id"),
        "canonical_entity_id": f"sku:denner:{o.get('article_id')}",
        "image_url": o.get("image_url"),
        "current_price": o.get("discounted_price"), "reference_price": o.get("regular_price"),
        "regular_price": o.get("regular_price") if o.get("reference_price_type") == "denner_previous" else None,
        "reference_price_type": REF.get(o.get("reference_price_type"), "none"),
        "discount_percentage": o.get("discount_percentage") or o.get("stated_discount_pct"),
        "unit_price": o.get("unit_price"), "unit": UNIT.get(o.get("unit_price_unit")),
        "quantity": o.get("total_quantity"), "package_size": o.get("package_size"),
        "minimum_quantity": o.get("min_purchase_quantity"),
        "starts_at": o.get("starts_at"), "ends_at": o.get("ends_at"),
        "first_seen_at": o.get("first_seen_at"), "last_seen_at": o.get("last_seen_at"),
        "last_changed_at": o.get("last_changed_at"),
        "store_ids": o.get("store_ids"), "geographic_scope": "LOCAL" if o.get("eligible_home") else "NATIONAL",
        "availability_status": "ELIGIBLE_NOT_VERIFIED" if o.get("availability_confidence") == "national_eligible" else o.get("availability_confidence"),
        "availability_confidence": o.get("availability_confidence"), "eligible_home": o.get("eligible_home"),
        "conditions": o.get("conditions"), "access": "PUBLIC",
        "deal_score": o.get("deal_score"), "score_confidence": o.get("score_confidence"),
        "effective_discount": o.get("effective_discount"),
        "score_components": [[n, None] for n in (o.get("score_notes") or [])],
        "score_model": "denner_v2", "personal_relevance": o.get("personal_relevance"),
        "tags": o.get("tags"), "group": o.get("group"), "favorite": o.get("favorite"),
        "best_score": o.get("best_score"), "lifecycle": status, "kind": o.get("kind"),
        "engine": "denner_v2",
    }
    d = {k: v for k, v in d.items() if v not in (None, "", [])}
    if stores:
        d["distance_km"] = min((s.get("distance_km") or 99) for s in stores.values()
                               if s.get("enabled") and s.get("active", True)) if any(
            s.get("enabled") for s in stores.values()) else None
    d["geographic_scope_resolved"] = d["geographic_scope"]
    d["urgency"], d["urgency_reasons"] = A.urgency(d, now)
    d["accessibility"] = 1.0 if d.get("eligible_home") else 0.0
    return d


def deals(radar_store, now: dt.datetime, live_only: bool = True, recent_days: int = 30) -> list[dict]:
    stores = radar_store.stores.get("stores", {})
    cutoff = (now - dt.timedelta(days=recent_days)).isoformat()
    out = []
    for o in radar_store.offers.values():
        st = D.status_at(o, now)
        if live_only and st not in ("active", "announced") and (o.get("ends_at") or "") < cutoff:
            continue
        out.append(to_deal(o, now, stores))
    return out
