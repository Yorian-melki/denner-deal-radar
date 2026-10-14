"""Notation universelle ABSOLUE par famille (voir docs/SCORING.md).

Principes communs
-----------------
* Même courbe fixe réduction -> note que Denner V2 (radar.scoring.CURVE).
* La réduction retenue est la plus prudente parmi les références crédibles :
  référence affichée (pondérée selon sa nature) et médiane historique observée.
* Chaque ajustement est explicité dans ``components`` (pourquoi 8,4/10 ?).
* Aucune donnée -> ``score = None`` (« non évalué »), jamais une économie inventée.
* Le « gratuit » est noté sur la VALEUR NETTE absolue, pas sur « −100 % ».
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..scoring import curve
from .analytics import history_stats

# Crédibilité d'un prix de référence : (facteur appliqué à la référence, confiance)
REFERENCE_MODEL = {
    "merchant_previous": (1.00, 0.85),
    "market": (1.00, 0.80),
    "catalog": (0.95, 0.70),
    "msrp": (0.85, 0.50),          # PVC souvent gonflé : marché supposé 15 % plus bas
    "competitor": (0.80, 0.50),    # identique au « Konkurrenzvergleich » Denner
    "community_claimed": (0.85, 0.40),
    "declared_value": (0.65, 0.40),  # valeur annoncée d'un panier anti-gaspi
}
CONDITION_FACTOR = {  # valeur d'un article par rapport au neuf de référence
    "new": 1.0, "open_box": 0.95, "returned": 0.92, "refurbished_manufacturer": 0.90,
    "refurbished_third_party": 0.85, "used": 0.75, "damaged": 0.5,
}
WEAK_REFERENCE_CAP = 7.5
# Valeur nette (CHF) -> note pour le gratuit / gratuit numérique (seuils fixes)
FREE_CURVE = [(0, 0.0), (5, 1.5), (15, 3.0), (30, 5.0), (80, 7.0), (200, 8.0), (500, 9.0), (1500, 10.0)]


def free_curve(net: float) -> float:
    if net <= 0:
        return 0.0
    for (x0, y0), (x1, y1) in zip(FREE_CURVE, FREE_CURVE[1:]):
        if net <= x1:
            return y0 + (y1 - y0) * (net - x0) / (x1 - x0)
    return 10.0


@dataclass
class UScore:
    score: float | None
    confidence: float
    effective_discount: float | None = None
    net_savings: float | None = None
    components: list[tuple[str, float | None]] = field(default_factory=list)
    integrity: str | None = None   # ok | inflated_reference | above_usual_price | unknown

    def as_dict(self) -> dict:
        return {"deal_score": self.score, "score_confidence": round(self.confidence, 2),
                "effective_discount": None if self.effective_discount is None else round(self.effective_discount, 1),
                "net_savings": None if self.net_savings is None else round(self.net_savings, 2),
                "score_components": [[c, None if v is None else round(v, 2)] for c, v in self.components],
                "promotion_integrity": self.integrity}


def _total(deal: dict) -> float | None:
    p = deal.get("current_price")
    if p is None:
        return None
    return p + deal.get("shipping_cost", 0) + deal.get("mandatory_fees", 0) + deal.get("estimated_transport_cost", 0)


def score_deal(deal: dict, history: list[dict] | None = None) -> UScore:
    fam = deal.get("family")
    if fam == "contest":
        return _contest(deal)
    if fam in ("free", "digital_free"):
        return _free(deal)
    if fam == "subscription":
        return _subscription(deal, history)
    return _discount_based(deal, history)


# --------------------------------------------------------------------------

def _discount_based(deal: dict, history: list[dict] | None) -> UScore:
    comps: list[tuple[str, float | None]] = []
    total = _total(deal)
    ref, rtype = deal.get("reference_price"), deal.get("reference_price_type") or "none"
    stats = history_stats(history or [], exclude_deal=deal.get("deal_id"))
    integrity = "unknown"
    candidates: list[tuple[float, float, str]] = []   # (d, conf, libellé)

    if total is not None and ref and rtype in REFERENCE_MODEL:
        factor, conf = REFERENCE_MODEL[rtype]
        ref_eff = ref * factor * CONDITION_FACTOR.get(deal.get("condition", "new"), 1.0)
        # Référence gonflée : supérieure de > 10 % au plus bas prix de référence déjà observé.
        prior_refs = [h["reference_price"] for h in (history or [])
                      if h.get("reference_price") and h.get("deal_id") != deal.get("deal_id")
                      and h.get("reference_price_type") == rtype]
        if prior_refs and ref > min(prior_refs) * 1.10:
            ref_eff = min(prior_refs) * factor
            integrity = "inflated_reference"
            comps.append((f"référence {ref:.2f} gonflée (déjà vue à {min(prior_refs):.2f})", None))
        ref_eff += deal.get("shipping_cost", 0) if deal.get("shipping_cost") else 0
        d = max(0.0, (1 - total / ref_eff) * 100) if ref_eff > 0 else 0.0
        label = {"merchant_previous": "ancien prix marchand", "market": "prix de marché",
                 "msrp": "prix conseillé (−15 %)", "competitor": "prix concurrent (−20 %)",
                 "declared_value": "valeur annoncée (−35 %)", "catalog": "prix catalogue",
                 "community_claimed": "référence communautaire (−15 %)"}[rtype]
        candidates.append((d, conf, f"réduction vs {label}"))
    elif deal.get("discount_percentage") and rtype == "stated_percent_only":
        candidates.append((deal["discount_percentage"], 0.55, "pourcentage annoncé seul"))

    if total is not None and stats.get("n", 0) >= 3:
        d_hist = max(0.0, (1 - total / stats["median"]) * 100)
        conf_h = min(0.9, 0.5 + stats["n"] * 0.04)
        candidates.append((d_hist, conf_h, f"vs médiane observée ({stats['n']} relevés)"))
        if total >= stats["median"] * 0.98:
            integrity = "above_usual_price"

    if not candidates:
        return UScore(None, 0.2, components=[("aucune référence vérifiable", None)], integrity="unknown")

    # La plus prudente des réductions crédibles, sauf baisse silencieuse sans badge.
    d, conf, why = min(candidates, key=lambda c: c[0])
    if len(candidates) > 1:
        conf = min(0.95, max(c[1] for c in candidates) + 0.05)
    if integrity == "unknown":
        integrity = "ok"
    base = curve(d)
    comps.insert(0, (f"{why} : {d:.0f} %", round(base, 2)))
    adj = 0.0

    mq = int(deal.get("minimum_quantity") or 1)
    if mq >= 2:
        pen = base * (0.08 if mq == 2 else 0.15)
        adj -= pen
        comps.append((f"achat minimum {mq} unités", -pen))
    if stats.get("n", 0) >= 2 and total is not None and total < stats["min"] * 0.98:
        adj += 0.3
        comps.append(("record : plus bas prix jamais observé", 0.3))
    saving = (ref * REFERENCE_MODEL.get(rtype, (1, 0))[0] - total) if (ref and total is not None) else None
    if saving is not None:
        if saving >= 300:
            adj += 0.5
            comps.append((f"économie absolue élevée (~CHF {saving:.0f})", 0.5))
        elif saving >= 100:
            adj += 0.3
            comps.append((f"économie absolue notable (~CHF {saving:.0f})", 0.3))
        elif saving < 1.0 and base + adj > 6:
            cap = 6 - (base + adj)
            adj += cap
            comps.append(("économie absolue < CHF 1 : note plafonnée à 6", cap))
    if deal.get("family") == "surplus" and (deal.get("distance_km") or 0) > 5:
        adj -= 0.5
        comps.append((f"retrait à {deal['distance_km']:.0f} km", -0.5))
    if deal.get("cashback") and not deal.get("cashback_certain"):
        comps.append(("cashback incertain : non déduit du prix", 0.0))

    score = 0.0 if d <= 0 else max(0.0, min(10.0, base + adj))
    # Une référence faible (PVC, concurrent, communauté, valeur annoncée) non
    # confirmée par l'historique ne peut pas suffire à une note « exceptionnelle ».
    weak = rtype in ("msrp", "competitor", "community_claimed", "declared_value")
    if weak and stats.get("n", 0) < 3 and not deal.get("corroborated_by") and score > WEAK_REFERENCE_CAP:
        comps.append((f"référence {rtype} non confirmée : note plafonnée à {WEAK_REFERENCE_CAP}", WEAK_REFERENCE_CAP - score))
        score = WEAK_REFERENCE_CAP
    return UScore(round(score, 1), conf, d, saving, comps, integrity)


def _free(deal: dict) -> UScore:
    value = deal.get("market_price") or deal.get("reference_price") or deal.get("declared_value")
    cost = (deal.get("current_price") or 0) + deal.get("estimated_transport_cost", 0) + deal.get("mandatory_fees", 0)
    if not value:
        return UScore(None, 0.2, components=[("valeur inconnue : gratuit non évalué", None)])
    factor = CONDITION_FACTOR.get(deal.get("condition", "new"), 0.75)
    net = value * factor - cost
    s = free_curve(net)
    comps = [(f"valeur utile estimée CHF {value * factor:.0f} − coûts CHF {cost:.0f}", round(s, 2))]
    conf = 0.6 if deal.get("reference_price_type") in ("msrp", "market", "merchant_previous") else 0.35
    if "estimated_transport_cost" not in deal and deal.get("family") == "free":
        comps.append(("coût de récupération inconnu (non inclus)", None))
        conf -= 0.1
    return UScore(round(s, 1), max(conf, 0.1), 100.0 if cost == 0 else None, net, comps, "ok")


def _subscription(deal: dict, history) -> UScore:
    months = deal.get("commitment_months")
    promo, regular = deal.get("current_price"), deal.get("regular_monthly_price")
    if not (months and promo is not None and regular):
        return _discount_based(deal, history)
    after = deal.get("price_after_promo", regular)
    promo_months = deal.get("promo_months", months)
    tco = promo * min(promo_months, months) + after * max(0, months - promo_months) + deal.get("activation_fee", 0)
    tco_ref = regular * months
    d = max(0.0, (1 - tco / tco_ref) * 100)
    s = curve(d)
    return UScore(round(s, 1), 0.7, d, tco_ref - tco,
                  [(f"coût total sur {months} mois {tco:.2f} vs {tco_ref:.2f}", round(s, 2))], "ok")


def _contest(deal: dict) -> UScore:
    p, prize, cost = deal.get("win_probability"), deal.get("prize_value"), deal.get("participation_cost", 0)
    if p is None or prize is None:
        return UScore(None, 0.1, components=[("probabilité de gain inconnue : aucune espérance inventée", None)])
    ev = p * prize - cost
    return UScore(round(free_curve(ev), 1), 0.3, None, ev, [(f"espérance {ev:.2f} CHF", None)], "ok")


def accessibility(deal: dict, prefs: dict) -> tuple[float, list[str]]:
    a, why = 1.0, []
    rules = [("requires_account", 0.1, "compte requis"), ("requires_coupon", 0.05, "code requis"),
             ("requires_membership", 0.15, "adhésion requise"), ("requires_referral", 0.2, "parrainage requis")]
    for k, pen, label in rules:
        if deal.get(k):
            a -= pen
            why.append(label)
    if deal.get("requires_student") and not prefs.get("profile", {}).get("student", False):
        a -= 0.5
        why.append("réservé aux étudiants")
    dkm = deal.get("distance_km")
    if dkm is not None and dkm > 10:
        a -= min(0.4, dkm / 200)
        why.append(f"à {dkm:.0f} km")
    if deal.get("access") == "PERSONALIZED":
        a -= 0.3
        why.append("offre personnalisée")
    return round(max(0.0, a), 2), why
