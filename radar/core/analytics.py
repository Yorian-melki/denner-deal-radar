"""Statistiques d'historique, anomalies de prix, géographie, urgence."""
from __future__ import annotations

import datetime as dt
import math
import statistics

CENTER = (47.4239, 9.3748)  # St. Gallen, Marktplatz (jamais la position de l'utilisateur)
GEO_RADII = (("LOCAL", 5.0), ("NEARBY", 20.0), ("REGIONAL", 60.0))


# --------------------------------------------------------------------------
# Historique
# --------------------------------------------------------------------------

def history_stats(obs: list[dict], exclude_deal: str | None = None, field: str = "current_price") -> dict:
    """Statistiques sur les observations comparables (même unité/quantité/état
    que la dernière observation, pour ne pas mélanger 500 ml et 1 l)."""
    vals = [o for o in obs if o.get(field) is not None and o.get("deal_id") != exclude_deal]
    if not vals:
        return {"n": 0}
    ref = vals[-1]
    comparable = [o for o in vals if o.get("quantity") == ref.get("quantity")
                  and o.get("unit") == ref.get("unit") and o.get("condition") == ref.get("condition")]
    p = [o[field] for o in comparable]
    out = {"n": len(p), "min": min(p), "max": max(p), "median": statistics.median(p),
           "mean": round(statistics.fmean(p), 2), "last": p[-1],
           "distinct_deals": len({o.get("deal_id") for o in comparable})}
    if len(p) >= 2 and out["mean"]:
        out["volatility"] = round(statistics.pstdev(p) / out["mean"], 3)
    return out


def shrinkflation(obs: list[dict]) -> dict | None:
    """Même entité, quantité réduite, prix stable ou en hausse -> prix unitaire en hausse."""
    q = [o for o in obs if o.get("quantity") and o.get("current_price")]
    if len(q) < 2:
        return None
    a, b = q[0], q[-1]
    if b["quantity"] < a["quantity"] * 0.98 and b["current_price"] >= a["current_price"] * 0.99:
        up_a, up_b = a["current_price"] / a["quantity"], b["current_price"] / b["quantity"]
        return {"old_quantity": a["quantity"], "new_quantity": b["quantity"],
                "unit_price_change_pct": round((up_b / up_a - 1) * 100, 1)}
    return None


# --------------------------------------------------------------------------
# Anomalies
# --------------------------------------------------------------------------

def anomaly(deal: dict, stats: dict, source_reliability: float = 0.8,
            corroborated: bool = False) -> dict:
    """Score d'anomalie (0–10) et confiance (0–1).

    Une anomalie forte mais peu fiable reste signalée comme telle : la confiance
    baisse si l'historique est court, si l'unité/la quantité est incertaine, si
    le prix est conditionnel, ou si aucune seconde source ne corrobore un écart
    extrême.
    """
    price = deal.get("current_price")
    if price is None or stats.get("n", 0) < 3 or not stats.get("median"):
        return {}
    ratio = price / stats["median"]
    if ratio >= 0.85:
        return {}
    score = round(min(10.0, (1 - ratio) / 0.7 * 10), 1)
    conf = 0.35 + min(stats["n"], 10) * 0.04
    checks = []
    if deal.get("quantity") is None and deal.get("unit_price") is None:
        conf -= 0.1
        checks.append("quantité non vérifiable")
    if deal.get("minimum_quantity", 1) > 1 or deal.get("requires_coupon") or deal.get("requires_membership"):
        conf -= 0.15
        checks.append("prix conditionnel")
    if price < stats["min"] * 0.5:
        if corroborated:
            checks.append("écart extrême corroboré par une seconde source")
        else:
            conf -= 0.2
            checks.append("écart extrême sans seconde source : possible erreur de prix ou de collecte")
    conf *= source_reliability
    silent = deal.get("reference_price") is None and not deal.get("discount_badge")
    return {"anomaly_score": score, "anomaly_confidence": round(max(0.05, min(conf, 0.99)), 2),
            "anomaly_ratio_to_median": round(ratio, 3), "silent_drop": silent,
            "anomaly_checks": checks}


# --------------------------------------------------------------------------
# Géographie
# --------------------------------------------------------------------------

def distance_km(lat: float | None, lng: float | None, origin: tuple = CENTER) -> float | None:
    if lat is None or lng is None:
        return None
    la1, lo1, la2, lo2 = map(math.radians, (origin[0], origin[1], lat, lng))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return round(6371 * 2 * math.asin(math.sqrt(h)), 2)


def geo_scope(deal: dict) -> str:
    if deal.get("geographic_scope") in ("ONLINE", "NATIONAL", "TRAVEL_ACCESSIBLE"):
        return deal["geographic_scope"]
    dkm = deal.get("distance_km")
    if dkm is None:
        dkm = distance_km(deal.get("lat"), deal.get("lng"))
    if dkm is None:
        return deal.get("geographic_scope") or "NATIONAL"
    for scope, r in GEO_RADII:
        if dkm <= r:
            return scope
    return "TRAVEL_ACCESSIBLE"


# --------------------------------------------------------------------------
# Urgence
# --------------------------------------------------------------------------

LEVELS = ("LOW", "MEDIUM", "HIGH", "VERY_HIGH", "CRITICAL")


def urgency(deal: dict, now: dt.datetime, typical_lifetime_min: float | None = None) -> tuple[str, list[str]]:
    """Urgence indépendante de la note : expiration, stock publié, vitesse
    habituelle de disparition, type de source."""
    signals: list[tuple[int, str | None]] = []
    end = deal.get("ends_at")
    if end:
        hours = (dt.datetime.fromisoformat(end) - now).total_seconds() / 3600
        if hours <= 1:
            signals.append((4, "se termine dans moins d'1 h"))
        elif hours <= 6:
            signals.append((3, f"se termine dans {hours:.0f} h"))
        elif hours <= 24:
            signals.append((2, "se termine dans moins de 24 h"))
        elif hours <= 72:
            signals.append((1, None))
    sold = deal.get("stock_percent_sold")
    if sold is not None and sold >= 70:
        signals.append((4 if sold >= 90 else 3, f"{sold:.0f} % vendus"))
    if deal.get("stock_remaining") is not None and deal["stock_remaining"] <= 3:
        signals.append((3, f"plus que {deal['stock_remaining']:.0f} en stock"))
    if typical_lifetime_min is not None:
        if typical_lifetime_min <= 30:
            signals.append((4, f"disparaît en ~{typical_lifetime_min:.0f} min d'habitude"))
        elif typical_lifetime_min <= 180:
            signals.append((3, f"disparaît en ~{typical_lifetime_min / 60:.1f} h d'habitude"))
    if deal.get("family") == "flash":
        signals.append((2, "vente flash"))
    level = max((lvl for lvl, _ in signals), default=0)
    return LEVELS[level], [r for _, r in signals if r]


def typical_lifetime_minutes(deals: list[dict]) -> float | None:
    """Durée médiane de visibilité des deals retirés avant leur fin annoncée."""
    spans = []
    for d in deals:
        if d.get("lifecycle") == "REMOVED" and d.get("first_seen_at") and d.get("removed_at"):
            a, b = dt.datetime.fromisoformat(d["first_seen_at"]), dt.datetime.fromisoformat(d["removed_at"])
            spans.append((b - a).total_seconds() / 60)
    return round(statistics.median(spans), 1) if len(spans) >= 5 else None
