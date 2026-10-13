"""Contrôles d'angles morts : couverture vs pages officielles, robots.txt."""
from __future__ import annotations

import re

from protego import Protego

from .http import Http

PAGES = ["/de/aktionen/aktuelle-aktionen", "/de/aktionen/aktionen-ab-donnerstag"]
KNOWN_SECTIONS = {"aktuelle aktionen", "aktionen ab donnerstag", "wochenaktionen", "wochenstart-knaller",
                  "wochenend-knaller", "getränke", "lebensmittel", "nicht-lebensmittel",
                  "zertifizierungen", "filter"}
ENDPOINTS = ["/nuxt-api/promotions", "/de/aktionen/aktuelle-aktionen", "/de/aktionen/aktionen-ab-donnerstag",
             "/de/filialen", "/sitemap.store.xml"]


def html_coverage(http: Http, base: str, known_refs: set[str]) -> dict:
    """Chaque offre rendue dans les pages officielles doit être connue de l'API.

    Les pages ne rendent côté serveur que la première page de résultats et les
    blocs mis en avant : c'est précisément là qu'apparaissent les familles
    d'offres que l'API hebdomadaire ne contient pas.
    """
    report = {"pages": {}, "missing": [], "unknown_sections": []}
    for path in PAGES:
        html = http.get(base + path).text
        variants = set(re.findall(r'variant=([0-9a-f-]{36})', html))
        missing = sorted(v for v in variants if v not in known_refs)
        for v in missing:
            m = re.search(r'href="(/de/aktionen/[^"]*' + v + ')"', html)
            report["missing"].append(base + m.group(1) if m else v)
        heads = {re.sub(r"<[^>]+>", "", h).strip() for h in re.findall(r"<h2[^>]*>(.*?)</h2>", html, re.S)}
        unknown = [h for h in heads if h and h.lower() not in KNOWN_SECTIONS]
        # Les titres de produits sont en <h3> ; un <h2> inconnu = nouvelle section.
        report["unknown_sections"] += [h for h in unknown if len(h) < 60]
        report["pages"][path] = {"offers_rendered": len(variants), "missing": len(missing)}
    report["unknown_sections"] = sorted(set(report["unknown_sections"]))
    report["ok"] = not report["missing"]
    return report


def robots(http: Http, base: str) -> dict:
    txt = http._raw("GET", f"{base}/robots.txt").text
    rules = Protego.parse(txt)
    ua = http.s.headers["User-Agent"]
    res = {p: rules.can_fetch(base + p, ua) and rules.can_fetch(base + p, "*") for p in ENDPOINTS}
    http._robots.pop(base.split("//")[1], None)
    return {"ok": all(res.values()), "paths": res, "crawl_delay": rules.crawl_delay("*")}
