"""Schéma universel d'une opportunité (« deal »).

Un deal est un ``dict`` JSON-sérialisable. Tous les champs sont facultatifs
sauf ``deal_id``, ``source_id``, ``title`` et ``family`` : une valeur inconnue
est ABSENTE, jamais inventée. :func:`make_deal` valide et nettoie.
"""
from __future__ import annotations

import hashlib
import re

# Familles de scoring (chaque famille a son modèle déterministe, cf. scoring.py)
FAMILIES = {
    "grocery": "🛒 Supermarché",
    "retail": "🏷️ Commerce",
    "tech": "💻 Tech",
    "flash": "⚡ Vente flash",
    "surplus": "🥡 Anti-gaspi",
    "free": "🎁 Gratuit",
    "secondhand": "♻️ Seconde main",
    "refurbished": "🔁 Reconditionné",
    "restaurant": "🍔 Restauration",
    "student": "🎓 Étudiant",
    "transport": "🚆 Transport",
    "travel": "✈️ Voyage",
    "event": "🎟️ Événement",
    "subscription": "📱 Abonnement",
    "cashback": "💸 Cashback",
    "coupon": "🏷️ Coupon",
    "contest": "🎲 Concours",
    "digital_free": "🎮 Gratuit numérique",
    "local_news": "📍 Ouverture / fermeture",
}

REFERENCE_TYPES = {
    "merchant_previous",     # ancien prix du même marchand (« statt »)
    "competitor",            # prix concurrent cité
    "msrp",                  # prix conseillé fabricant
    "catalog",               # prix catalogue
    "declared_value",        # valeur annoncée (panier anti-gaspi…)
    "market",                # médiane de marché observée (comparateur, historique)
    "stated_percent_only",   # seul un % est connu
    "community_claimed",     # référence affirmée par une communauté
    "none",
}
CONDITIONS = {"new", "open_box", "returned", "refurbished_manufacturer", "refurbished_third_party",
              "used", "damaged", "unknown"}
ACCESS = {"PUBLIC", "MEMBER", "PERSONALIZED", "UNKNOWN"}
GEO_SCOPES = ("LOCAL", "NEARBY", "REGIONAL", "NATIONAL", "ONLINE", "TRAVEL_ACCESSIBLE")
LIFECYCLE = ("UPCOMING", "ACTIVE", "CHANGED", "LOW_STOCK", "ENDING_SOON", "EXPIRED", "REMOVED",
             "UNKNOWN", "SOURCE_FAILURE")
URGENCY = ("LOW", "MEDIUM", "HIGH", "VERY_HIGH", "CRITICAL")

NUMERIC = {"regular_price", "reference_price", "current_price", "checkout_price", "cashback",
           "effective_price", "shipping_cost", "mandatory_fees", "unit_price", "quantity",
           "minimum_quantity", "discount_absolute", "discount_percentage", "historical_median",
           "historical_low", "market_price", "declared_value", "stock_remaining", "stock_percent_sold",
           "estimated_transport_cost", "distance_km"}

REQUIRED = ("deal_id", "source_id", "title", "family")


def slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s[:80]


def short_hash(*parts) -> str:
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:12]


def make_deal(**kw) -> dict:
    """Construit un deal propre. Lève ValueError si un champ obligatoire manque
    ou si une valeur est incohérente (prix négatif, famille inconnue…)."""
    d = {k: v for k, v in kw.items() if v is not None and v != "" and v != []}
    for k in REQUIRED:
        if not d.get(k):
            raise ValueError(f"champ obligatoire manquant: {k}")
    if d["family"] not in FAMILIES:
        raise ValueError(f"famille inconnue: {d['family']}")
    for k in NUMERIC & d.keys():
        try:
            d[k] = round(float(d[k]), 4)
        except (TypeError, ValueError):
            raise ValueError(f"{k} non numérique: {d[k]!r}") from None
        if d[k] < 0:
            raise ValueError(f"{k} négatif: {d[k]}")
    rt = d.get("reference_price_type")
    if rt and rt not in REFERENCE_TYPES:
        raise ValueError(f"reference_price_type inconnu: {rt}")
    if d.get("condition") and d["condition"] not in CONDITIONS:
        raise ValueError(f"condition inconnue: {d['condition']}")
    d.setdefault("access", "PUBLIC")
    if d["access"] not in ACCESS:
        raise ValueError(f"access inconnu: {d['access']}")
    # Dérivations sûres uniquement.
    cur, ref = d.get("current_price"), d.get("reference_price")
    if cur is not None and ref and ref > cur and "discount_percentage" not in d:
        d["discount_percentage"] = round((1 - cur / ref) * 100, 1)
    if cur is not None and ref and ref > cur and "discount_absolute" not in d:
        d["discount_absolute"] = round(ref - cur, 2)
    if cur is not None and "checkout_price" not in d and "shipping_cost" in d:
        d["checkout_price"] = round(cur + d["shipping_cost"] + d.get("mandatory_fees", 0), 2)
    return d


def total_acquisition_cost(d: dict) -> tuple[float | None, list[str]]:
    """Prix + frais obligatoires connus. Les coûts inconnus ne sont PAS ajoutés,
    mais signalés dans les hypothèses."""
    cur = d.get("current_price")
    if cur is None:
        return None, ["prix inconnu"]
    total, notes = cur, []
    for k, label in (("shipping_cost", "livraison"), ("mandatory_fees", "frais"),
                     ("estimated_transport_cost", "déplacement estimé")):
        if k in d:
            total += d[k]
            notes.append(f"{label} {d[k]:.2f} inclus")
    if "shipping_cost" not in d and d.get("geographic_scope") == "ONLINE":
        notes.append("frais de livraison inconnus (non inclus)")
    if d.get("cashback") and d.get("cashback_certain"):
        total -= d["cashback"]
        notes.append(f"cashback certain {d['cashback']:.2f} déduit")
    return round(max(total, 0.0), 2), notes
