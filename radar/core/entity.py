"""Résolution d'entités et déduplication inter-sources.

Ordre de confiance des identifiants : GTIN/EAN > référence fabricant (+marque)
> SKU marchand > titre normalisé (+contenance, même marchand). La similarité
textuelle ne FUSIONNE jamais : elle ne produit qu'un ``possible_duplicate_of``.
"""
from __future__ import annotations

import re
import unicodedata

from .deal import slug

# Priorité d'une source comme « enregistrement principal » d'un doublon.
SOURCE_TYPE_PRIORITY = {"merchant": 0, "official": 0, "comparator": 1, "aggregator": 2, "community": 3}
STOP = {"der", "die", "das", "und", "mit", "für", "the", "and", "de", "la", "le", "et", "x", "pack", "cm", "inkl"}


def norm_text(s: str) -> str:
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("ß", "ss")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def tokens(s: str) -> set[str]:
    return {t for t in norm_text(s).split() if t not in STOP and len(t) > 1}


def jaccard(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    return len(ta & tb) / len(ta | tb) if ta and tb else 0.0


def valid_gtin(code: str) -> bool:
    d = re.sub(r"\D", "", str(code or ""))
    if len(d) not in (8, 12, 13, 14):
        return False
    # Poids 3,1,3… en partant du chiffre situé juste avant la clé de contrôle.
    total = sum(int(c) * (3 if i % 2 == 0 else 1) for i, c in enumerate(reversed(d[:-1])))
    return (10 - total % 10) % 10 == int(d[-1])


def canonical_entity_id(d: dict) -> str:
    gtin = d.get("gtin") or d.get("ean")
    if gtin and valid_gtin(gtin):
        return "gtin:" + re.sub(r"\D", "", str(gtin)).zfill(14)
    if d.get("manufacturer_sku") and d.get("brand"):
        return f"mpn:{slug(d['brand'])}:{slug(d['manufacturer_sku'])}"
    if d.get("merchant_sku"):
        return f"sku:{slug(d.get('merchant') or d['source_id'])}:{slug(str(d['merchant_sku']))}"
    size = d.get("package_size") or ""
    return f"t:{slug(d.get('merchant') or d['source_id'])}:{slug(norm_text(d['title'] + ' ' + size))}"


def _overlap(a: dict, b: dict) -> bool:
    a0, a1 = a.get("starts_at") or "", a.get("ends_at") or "9999"
    b0, b1 = b.get("starts_at") or "", b.get("ends_at") or "9999"
    return a0 <= b1 and b0 <= a1


def _price_close(a: dict, b: dict, tol: float = 0.02) -> bool:
    pa, pb = a.get("current_price"), b.get("current_price")
    if pa is None or pb is None:
        return pa == pb
    return abs(pa - pb) <= tol * max(pa, pb, 0.01)


def deduplicate(deals: list[dict]) -> dict:
    """Marque les doublons en place. Retourne des statistiques."""
    live = [d for d in deals if d.get("lifecycle") not in ("EXPIRED", "REMOVED")]
    for d in live:
        d.pop("duplicate_of", None)
        d.pop("possible_duplicate_of", None)
        d["corroborated_by"] = []
    by_entity: dict[str, list[dict]] = {}
    for d in live:
        by_entity.setdefault(d.get("canonical_entity_id") or d["deal_id"], []).append(d)
    merged = possible = 0
    for group in by_entity.values():
        if len(group) < 2:
            continue
        group.sort(key=lambda x: (SOURCE_TYPE_PRIORITY.get(x.get("source_type", "merchant"), 9),
                                  x.get("first_seen_at") or ""))
        primary = group[0]
        for other in group[1:]:
            if other["source_id"] == primary["source_id"]:
                continue
            if _overlap(primary, other) and _price_close(primary, other):
                other["duplicate_of"] = primary["deal_id"]
                primary["corroborated_by"].append(other["deal_id"])
                merged += 1
            else:
                other["possible_duplicate_of"] = primary["deal_id"]
                primary.setdefault("divergent_sources", []).append(other["deal_id"])
                possible += 1
    # Similarité textuelle prudente, uniquement entre sources différentes et même marchand.
    by_merchant: dict[str, list[dict]] = {}
    for d in live:
        if d.get("merchant") and not d.get("duplicate_of"):
            by_merchant.setdefault(norm_text(d["merchant"]), []).append(d)
    for group in by_merchant.values():
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if a["source_id"] == b["source_id"] or b.get("possible_duplicate_of"):
                    continue
                if jaccard(a["title"], b["title"]) >= 0.8 and _price_close(a, b) and _overlap(a, b):
                    b["possible_duplicate_of"] = a["deal_id"]
                    possible += 1
    for d in live:
        if not d["corroborated_by"]:
            d.pop("corroborated_by")
    return {"merged": merged, "possible": possible}
