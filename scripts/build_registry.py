#!/usr/bin/env python3
"""Construit le Source Registry à partir des audits (docs/audit/*.json).

    python scripts/build_registry.py

Produit docs/source_registry.json (lisible par machine, servi au dashboard) et
docs/SOURCE_AUDIT.md. Le statut d'une source qui a un connecteur devient
INTEGRATED ; l'export runtime le promeut FUNCTIONAL / MONITORED selon la santé
réelle (radar/ucli.sources_report).

Priorité (score interne, PAS une note de deal) :
    expected_value × fréquence × pertinence locale × détectabilité × fiabilité
    ÷ coût d'intégration et de maintenance
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

AUDITS = ["supermarkets", "antigaspi_aggregators", "flash_tech", "local_secondhand_mobility"]
# id d'audit -> id de connecteur (radar/connectors) ; "denner" = moteur V2
CONNECTOR = {
    "denner": "denner", "daydeal": "daydeal", "qoqa": "qoqa", "digitec_daily_deal": "digitec_daily",
    "galaxus_daily_deal": "galaxus_daily", "brack_sale": "brack", "revendo": "revendo",
    "migros": "migros", "lidl": "lidl", "aldi-suisse": "aldi", "volg": "volg", "rappn_offers": "rappn",
    "tutti_free_stgallen": "tutti_free", "anibis_free_stgallen": "anibis_free", "epic_free_games": "epic_free",
    "gamerpower_rss": "gamerpower", "preispirat_rss": "preispirat", "preispirat_freebies_rss": "preispirat",
    "preispirat_gutscheine": "preispirat", "gutscheine_20min": "gutscheine_20min", "poinz": "poinz",
    "saiten_kalender": "saiten_events", "grabenhalle_minasa": "grabenhalle_events",
    "konzertundtheater_sg": "kut_events", "dschungelkompass_handy_aktionen": "dschungelkompass",
    "ferienpiraten_ch": "ferienpiraten", "secretflying_departures": "secretflying", "unidays_ch": "unidays",
    "studentbeans_ch": "studentbeans", "stadt_sg_news": "stadtsg_news",
}
FREQ = {"REALTIME": 1.0, "FAST": 0.9, "DAILY": 0.7, "SLOW": 0.5}
LOCAL_FAMILIES = ("supermarket", "grocery", "free", "second", "local", "event", "anti", "food", "student")


def norm_family(f: str) -> str:
    return (f or "").replace("_", " ").strip()


def priority(s: dict) -> float:
    ev = float(s.get("expected_value") or 1)
    diff = float(s.get("integration_difficulty") or 3)
    rel = float(s.get("reliability") or 3) / 5
    local = 1.2 if any(k in str(s.get("family", "")).lower() + str(s.get("geographic_relevance", "")).lower()
                       for k in LOCAL_FAMILIES + ("st. gallen", "st.gallen", "sg")) else 1.0
    poll = str(s.get("recommended_poll", "")).lower()
    freq = 1.0 if "min" in poll else 0.8 if "h" in poll or "daily" in poll or "day" in poll else 0.6
    detect = 0.2 if s.get("status") == "BLOCKED" else 0.6 if s.get("status") in ("PARTIAL", "ASSESSED", "DISCOVERED") else 1.0
    return round(ev * freq * local * detect * rel / max(diff, 1) * 2, 2)


def build() -> list[dict]:
    from radar.connectors import REGISTRY, _load_all
    _load_all()
    reg = []
    for a in AUDITS:
        for s in json.loads((ROOT / "docs" / "audit" / f"{a}.json").read_text("utf-8")):
            conn = CONNECTOR.get(s["id"])
            status = s.get("status", "DISCOVERED")
            if conn and (conn in REGISTRY or conn == "denner"):
                status = "INTEGRATED"
            robots = s.get("robots")
            reg.append({
                "id": s["id"], "name": s.get("name"), "family": norm_family(s.get("family")), "url": s.get("url"),
                "geographic_relevance": s.get("geographic_relevance"), "data": s.get("data_available"),
                "method": s.get("method"), "frequency": s.get("publication_frequency"),
                "recommended_poll": s.get("recommended_poll"), "auth": s.get("auth"),
                "robots": robots if isinstance(robots, str) else json.dumps(robots, ensure_ascii=False)[:300],
                "constraints": s.get("constraints") or s.get("constraints_terms"),
                "expected_value": s.get("expected_value"), "integration_difficulty": s.get("integration_difficulty"),
                "reliability": s.get("reliability"), "audit_status": s.get("status"), "status": status,
                "status_reason": s.get("status_reason"), "alternative": s.get("alternative"),
                "notes": s.get("notes"), "connector": conn if status == "INTEGRATED" else None,
                "priority": priority(s), "last_verified": s.get("last_verified"), "audit_file": a,
            })
    reg.sort(key=lambda r: (r["status"] != "INTEGRATED", -r["priority"]))
    return reg


def md(reg: list[dict]) -> str:
    def c(x, n=90):
        x = x if isinstance(x, str) else json.dumps(x, ensure_ascii=False) if x is not None else ""
        return x.replace("|", "/").replace("\n", " ")[:n]
    counts: dict[str, int] = {}
    for r in reg:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    out = ["# Source Audit — St. Gallen Deal Radar", "",
           f"Audit réel du 14.10.2026 : **{len(reg)} sources**. " +
           " · ".join(f"{k} {v}" for k, v in sorted(counts.items())), "",
           "Une source découverte n'est jamais automatiquement intégrée. Données complètes "
           "(endpoints, parser_spec, robots) : `docs/audit/*.json` ; registre : `docs/source_registry.json`.", "",
           "| Source | Famille | Pertinence géo | Données | Méthode | Fréquence | Auth | Robots / contraintes | Valeur | Difficulté | Statut | Priorité | Notes |",
           "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in reg:
        out.append("| " + " | ".join([
            c(r["name"], 40), c(r["family"], 25), c(r["geographic_relevance"], 50), c(r["data"], 60),
            c(r["method"], 20), c(r["recommended_poll"] or r["frequency"], 30), c(r["auth"], 25),
            c(((r["robots"] or "") + " " + c(r["constraints"], 60)), 90), str(r["expected_value"] or ""),
            str(r["integration_difficulty"] or ""), r["status"], str(r["priority"]),
            c(r["status_reason"] or r["notes"], 120)]) + " |")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    reg = build()
    (ROOT / "docs" / "source_registry.json").write_text(json.dumps(reg, ensure_ascii=False, indent=1), "utf-8")
    (ROOT / "docs" / "SOURCE_AUDIT.md").write_text(md(reg), "utf-8")
    print(len(reg), "sources ;", sum(r["status"] == "INTEGRATED" for r in reg), "intégrées")
