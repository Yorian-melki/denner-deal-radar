"""Export JSON statique consommé par le dashboard GitHub Pages."""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from .categories import GROUP_LABELS
from .diff import status_at
from .scoring import CURVE

DROP = {"raw", "_partition"}

COVERAGE = [
    ("Promotions hebdomadaires (jeu.→mer.) + multi-semaines", "récupéré", "API promo_current_week"),
    ("Avant-premières de la semaine suivante", "récupéré", "API promo_next_week (visible dès ~mardi)"),
    ("Wochenend-Knaller (jeu.→dim.)", "récupéré", "API weekend_highlight[_next_week] — absent des flux hebdo"),
    ("Wochenstart-Knaller (lun.→mer.)", "récupéré", "API start_of_the_week_highlight — pas d'avant-première publiée"),
    ("Rabais sur assortiment (« auf alle … »)", "partiel", "% connu, prix individuels non publiés"),
    ("Restrictions régionales (Suisse romande/italienne)", "récupéré", "mention « Nur in der … Schweiz » analysée"),
    ("Nouveaux types d'offres mis en avant", "surveillé", "découverte auto via includeHighlights + audit HTML"),
    ("Stock / disponibilité par magasin", "impossible", "aucune donnée publique par succursale"),
    ("Offres propres à une succursale (démarque, réouverture)", "impossible", "non publié en ligne — saisie manuelle possible"),
    ("Réductions en rayon (étiquettes jaunes, date courte)", "impossible", "non publié en ligne — saisie manuelle possible"),
    ("Prospectus PDF", "non trouvé", "aucun prospectus en ligne ; son contenu = les flux API"),
    ("Weinshop online specials", "hors périmètre", "vente en ligne uniquement, pas en magasin"),
    ("Application Denner", "non utilisé", "pas de flux public documenté ; le site expose les mêmes offres"),
]


def compact(o: dict) -> dict:
    return {k: v for k, v in o.items() if k not in DROP and v not in (None, "", [])}


def build(store, cfg, now: dt.datetime) -> tuple[dict, dict]:
    recent = (now - dt.timedelta(days=int(cfg.s("export", "recent_days", 30)))).isoformat()
    keep: dict[str, dict] = {}
    for oid, o in store.offers.items():
        st = status_at(o, now)
        if st in ("active", "announced") or (o.get("ends_at") or o.get("last_seen_at") or "") >= recent:
            keep[oid] = compact({**o, "status": st})
    ranked = sorted((o for o in store.offers.values() if o.get("best_score") is not None),
                    key=lambda o: (o["best_score"], o.get("score_confidence") or 0), reverse=True)
    for o in ranked[: int(cfg.s("export", "records_top_n", 150))]:
        keep.setdefault(o["offer_id"], compact({**o, "status": status_at(o, now)}))
        keep[o["offer_id"]]["record"] = True

    st = store.state
    last_ok = st.get("last_success")
    stale_h = float(cfg.s("health", "stale_after_hours", 14))
    stale = (not last_ok) or (now - dt.datetime.fromisoformat(last_ok)) > dt.timedelta(hours=stale_h)
    stores = [s for s in store.stores.get("stores", {}).values()]
    meta = {
        "generated_at": now.replace(microsecond=0).isoformat(),
        "last_success": last_ok,
        "last_attempt": st.get("last_attempt"),
        "last_new_at": st.get("last_new_at"),
        "stale": stale,
        "consecutive_failures": st.get("consecutive_failures", 0),
        "sources": st.get("sources", {}),
        "audit": st.get("audit", {}),
        "robots": st.get("robots", {}),
        "coverage": [{"family": a, "status": b, "detail": c} for a, b, c in COVERAGE],
        "stores": sorted(stores, key=lambda s: (s.get("scope") != "city", s.get("distance_km") or 99)),
        "store_history": store.stores.get("history", [])[-30:],
        "groups": GROUP_LABELS,
        "scoring_curve": CURVE,
        "counts": {
            "total_in_db": len(store.offers),
            "active": sum(1 for o in keep.values() if o["status"] == "active"),
            "announced": sum(1 for o in keep.values() if o["status"] == "announced"),
            "articles_with_history": len(store.prices),
        },
        "dashboard_url": cfg.dashboard_url,
    }
    return {"generated_at": meta["generated_at"], "offers": list(keep.values())}, meta


def write(store, cfg, now: dt.datetime, out_dir: Path) -> None:
    offers, meta = build(store, cfg, now)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "offers.json").write_text(json.dumps(offers, ensure_ascii=False, separators=(",", ":")), "utf-8")
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
