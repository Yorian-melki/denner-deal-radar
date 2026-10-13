"""Notation ABSOLUE des promotions (0–10), déterministe et documentée.

La note ne dépend JAMAIS des autres offres de la semaine : pas de percentile,
pas de normalisation, pas de quota. Une semaine médiocre peut avoir 4,7 comme
meilleure note ; une excellente semaine peut avoir quinze offres > 8.

Étapes
------
1. Réduction effective ``d`` (en %), à partir de la référence la plus fiable :
   * prix « statt » Denner (prix habituel Denner)        -> d = 1 - prix/réf
   * « Konkurrenzvergleich » (prix d'un concurrent)       -> on suppose que le
     prix habituel Denner est ``haircut`` (20 %) plus bas que le prix cité :
     d = 1 - prix / (réf × (1 - haircut)). Un « -20 % vs concurrence » vaut 0.
   * seulement un pourcentage annoncé (rabais sur tout un assortiment)
                                                          -> d = % annoncé
   * aucune référence vérifiable (« SPECIAL » sans prix barré)
                                                          -> NON ÉVALUÉ
   Si le % annoncé et le % calculé divergent de > 3 points, on garde le plus bas.
2. Conditions : achat minimum 2 unités -> d × 0,92 ; 3 unités ou plus -> d × 0,85.
3. Rabais gonflé : si le prix de référence dépasse de > 10 % le plus bas prix
   de référence Denner observé pour le même article, on recalcule d avec ce
   dernier.
4. Courbe FIXE d -> note (interpolation linéaire entre les points) :

       réduction  0 %  5 % 10 % 20 % 30 % 40 % 50 % 60 % 75 % 90 % 95 %
       note       0.0  1.0  2.0  3.5  5.0  6.2  7.3  8.0  9.0  9.7 10.0

5. Ajustements bornés selon l'historique du MÊME article (≥ 2 promos passées) :
   * prix promo le plus bas jamais observé            +0,3
   * prix promo > 5 % au-dessus de sa médiane          -0,5
   et selon le prix unitaire des produits d'une même famille (≥ 5 observations) :
   * ≤ 1er quartile +0,3 ; ≥ 3e quartile -0,3.
   Aucun ajustement ne peut rendre positive une offre sans réduction réelle.

La confiance (0–1) est séparée de la note, de même que la pertinence
personnelle, qui n'influence jamais le Deal Score.
"""
from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field

CURVE: list[tuple[float, float]] = [
    (0, 0.0), (5, 1.0), (10, 2.0), (20, 3.5), (30, 5.0), (40, 6.2),
    (50, 7.3), (60, 8.0), (75, 9.0), (90, 9.7), (95, 10.0), (100, 10.0),
]

SCORE_LABELS = [(9.0, "exceptionnelle"), (8.0, "excellente"), (7.0, "très bonne"),
                (5.0, "correcte"), (2.5, "faible"), (0.0, "insignifiante")]


def curve(d_pct: float) -> float:
    d = max(0.0, min(100.0, d_pct))
    for (x0, y0), (x1, y1) in zip(CURVE, CURVE[1:]):
        if d <= x1:
            return y0 + (y1 - y0) * (d - x0) / (x1 - x0)
    return 10.0


def label(score: float | None) -> str:
    if score is None:
        return "non évaluée"
    for th, name in SCORE_LABELS:
        if score >= th:
            return name
    return "insignifiante"


@dataclass
class ScoreResult:
    score: float | None
    confidence: float
    effective_discount: float | None
    notes: list[str] = field(default_factory=list)

    @property
    def confidence_label(self) -> str:
        c = self.confidence
        return "élevée" if c >= 0.75 else "moyenne" if c >= 0.5 else "faible"


# Familles de produits suffisamment comparables pour le prix unitaire.
FAMILIES = {
    "oeufs": r"\beier\b|\beier$",
    "poulet_morceaux": r"poulet(brust|schnitzel|geschnetzeltes|filet|minifilet)|pouletbrust",
    "poulet_entier_cuisses": r"poulet(schenkel|flügeli|fluegeli|ganz)|ganzes poulet",
    "boeuf_hache": r"(rinds)?hackfleisch(?!.*gemischt)",
    "boeuf_piece": r"rinds?(huft|filet|entrecôte|entrecote|steak|braten|voressen)|black angus",
    "lait": r"\bmilch\b(?!schokolade)|vollmilch|drink",
    "yaourt": r"joghurt|jogurt",
    "fromage": r"käse|gruyère|emmentaler|appenzeller|mozzarella|raclette",
    "pates": r"spaghetti|penne|fusilli|teigwaren|pasta\b|nudeln",
    "riz": r"\breis\b|risotto",
    "pommes_de_terre": r"kartoffel",
    "beurre": r"\bbutter\b",
    "thon": r"\bthon\b",
    "biere": r"\bbier\b|lager",
    "coca": r"coca-cola|cola",
}


def family_of(name: str, subline: str = "") -> str | None:
    t = f"{name} {subline}".lower()
    for fam, rx in FAMILIES.items():
        if re.search(rx, t):
            return fam
    return None


def effective_discount(o: dict, haircut: float = 0.20, min_prior_ref: float | None = None
                       ) -> tuple[float | None, float, list[str]]:
    price, ref = o.get("discounted_price"), o.get("regular_price")
    rtype, stated = o.get("reference_price_type"), o.get("stated_discount_pct")
    notes: list[str] = []
    d: float | None = None
    conf = 0.0

    if rtype == "denner_previous" and price and ref and ref > 0:
        if min_prior_ref and ref > min_prior_ref * 1.10:
            notes.append(f"prix de référence ({ref:.2f}) supérieur au plus bas observé "
                         f"({min_prior_ref:.2f}) : réduction recalculée")
            ref = min_prior_ref
        d = max(0.0, (1 - price / ref) * 100)
        conf = 0.85
        if stated is not None and abs(stated - d) > 3:
            notes.append(f"réduction annoncée {stated:g} % ≠ calculée {d:.0f} %")
            d = min(d, stated)
            conf -= 0.2
    elif rtype == "competitor_comparison" and price and ref and ref > 0:
        raw = (1 - price / ref) * 100
        d = max(0.0, (1 - price / (ref * (1 - haircut))) * 100)
        conf = 0.5
        notes.append(f"référence = prix concurrent (« Konkurrenzvergleich ») : "
                     f"{raw:.0f} % affichés, {d:.0f} % retenus")
    elif stated is not None and stated > 0:
        s = stated / 100
        if rtype == "competitor_comparison":
            d = max(0.0, (1 - (1 - s) / (1 - haircut)) * 100)
            conf = 0.4
        else:
            d = stated
            conf = 0.6
        notes.append("seul le pourcentage annoncé est connu (pas de prix vérifiable)")
    else:
        notes.append("aucun prix de référence vérifiable : non évaluée")
        return None, 0.2, notes

    mq = int(o.get("min_purchase_quantity") or 1)
    if mq >= 3:
        d *= 0.85
        notes.append(f"condition : achat minimum {mq} unités")
    elif mq == 2:
        d *= 0.92
        notes.append("condition : achat minimum 2 unités")
    return d, max(0.05, min(1.0, conf)), notes


def score_offer(o: dict, history: list[dict] | None = None, family_prices: list[float] | None = None,
                haircut: float = 0.20) -> ScoreResult:
    """``history`` : observations passées du même article (autres offres)."""
    history = [h for h in (history or []) if h.get("offer_id") != o.get("offer_id")]
    same_basis = [h for h in history if h.get("price_basis") == o.get("price_basis")
                  and h.get("price")]
    prior_refs = [h["regular"] for h in same_basis
                  if h.get("ref_type") == "denner_previous" and h.get("regular")]
    min_prior_ref = min(prior_refs) if prior_refs else None
    if o.get("reference_price_type") != "denner_previous":
        min_prior_ref = None

    d, conf, notes = effective_discount(o, haircut, min_prior_ref)
    if d is None:
        return ScoreResult(None, conf, None, notes)

    base = curve(d)
    adj = 0.0
    price = o.get("discounted_price")
    if price and len(same_basis) >= 2:
        prices = [h["price"] for h in same_basis]
        conf += 0.05
        if price <= min(prices) * 0.98:
            adj += 0.3
            notes.append(f"plus bas prix observé ({len(prices)} promos précédentes)")
        elif price > statistics.median(prices) * 1.05:
            adj -= 0.5
            notes.append("plus cher que la médiane de ses promos passées")
    up = o.get("unit_price")
    if up and family_prices and len(family_prices) >= 5:
        q = statistics.quantiles(sorted(family_prices), n=4)
        if up <= q[0]:
            adj += 0.3
            notes.append("prix unitaire dans le quart le plus bas de sa famille")
        elif up >= q[2]:
            adj -= 0.3
            notes.append("prix unitaire dans le quart le plus cher de sa famille")

    score = 0.0 if d <= 0 else max(0.0, min(10.0, base + adj))
    return ScoreResult(round(score, 1), round(min(1.0, conf), 2), round(d, 1), notes)


def personal_relevance(o: dict, prefs: dict) -> float:
    """0–1, indépendant du Deal Score."""
    tags = set(o.get("tags") or [])
    if tags & set(prefs.get("exclude_tags", [])):
        return 0.0
    weights = prefs.get("relevance", {})
    r = float(weights.get(o.get("group") or "autres", 0.2))
    if "proteines" in tags:
        r = max(r, float(weights.get("proteines", 1.0)))
    name = (o.get("product_name") or "").lower()
    if any(k.lower() in name for k in prefs.get("favorites", {}).get("keywords", [])):
        r += 0.15
    if "porc_possible" in tags and "porc" in prefs.get("exclude_tags", []):
        r *= 0.5
    return round(min(1.0, r), 2)


def is_favorite(o: dict, prefs: dict) -> bool:
    name = f"{o.get('product_name', '')} {o.get('subline', '')}".lower()
    return any(re.search(rf"\b{re.escape(k.lower())}", name)
               for k in prefs.get("favorites", {}).get("keywords", []))
