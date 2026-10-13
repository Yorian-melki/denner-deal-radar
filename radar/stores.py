"""Découverte et suivi des succursales Denner autour de St. Gallen.

Deux sources officielles indépendantes, toutes deux publiques :
1. ``sitemap.store.xml`` (1 requête) : liste exhaustive des ~886 magasins
   (Filiale, Express, Partner, Satellit, Bibite) avec ID et NPA-localité.
2. Localisateur ``/de/filialen?lat=..&lng=..&circularSearch=10`` : adresses,
   type de magasin et coordonnées, lus dans le payload Nuxt de la page HTML.

Les ouvertures, fermetures et changements d'adresse produisent des événements.
"""
from __future__ import annotations

import json
import logging
import math
import re

from .http import Http

log = logging.getLogger("radar.stores")

CENTER = (47.4239, 9.3748)          # St. Gallen, Marktplatz
CITY_ZIPS = set(range(9000, 9017))  # NPA de la commune de St. Gallen
NEIGHBOURS = {"Abtwil", "Wittenbach", "Gossau SG", "Gossau", "Bühler", "Engelburg", "Mörschwil",
              "Teufen AR", "Speicher", "Herisau", "Goldach", "Rorschach"}

_LOC = re.compile(r"<loc>https://www\.denner\.ch/de/filialen/(\d{4})-([^<~]+)~s(\d+)</loc>")


def from_sitemap(http: Http, base: str) -> dict[str, dict]:
    xml = http.get(f"{base}/sitemap.store.xml").text
    out = {}
    for zipc, slug, sid in _LOC.findall(xml):
        out[f"s{sid}"] = {"id": f"s{sid}", "zip": zipc, "slug": slug,
                          "url": f"{base}/de/filialen/{zipc}-{slug}~s{sid}"}
    return out


def decode_nuxt(html: str):
    """Décode le format « devalue » de __NUXT_DATA__ (tableau aplati)."""
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise ValueError("__NUXT_DATA__ absent")
    arr = json.loads(m.group(1))
    memo: dict[int, object] = {}
    wrappers = {"Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "Set", "Map", "Date", "NuxtError"}

    def r(i: int):
        if i in memo:
            return memo[i]
        v = arr[i]
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in wrappers:
                out = r(v[1]) if len(v) > 1 and isinstance(v[1], int) else None
            else:
                out = [r(x) if isinstance(x, int) else x for x in v]
        elif isinstance(v, dict):
            out = {k: (r(x) if isinstance(x, int) else x) for k, x in v.items()}
        else:
            out = v
        memo[i] = out
        return out

    return r(0)


def from_geo(http: Http, base: str, radius_km: int = 10) -> dict[str, dict]:
    out: dict[str, dict] = {}
    page = 1
    while page <= 10:
        html = http.get(f"{base}/de/filialen", params={
            "lat": CENTER[0], "lng": CENTER[1], "circularSearch": radius_km, "page": page}).text
        data = decode_nuxt(html)["data"]["store-list-data"]["data"]
        for h in data["hits"]:
            sid = f"s{h['id']}"
            g = h.get("_geo") or {}
            out[sid] = {
                "id": sid, "zip": str(h.get("zip", "")), "city": h.get("city", "").strip(),
                "address": (h.get("address") or "").strip(), "name": (h.get("name") or "").strip(),
                "channel": (h.get("channel") or {}).get("name"), "lat": g.get("lat"), "lng": g.get("lng"),
                "distance_km": round(_km(CENTER, (g.get("lat"), g.get("lng"))), 1) if g else None,
            }
        if page >= int(data.get("totalPages") or 1):
            break
        page += 1
    return out


def _km(a, b) -> float:
    if None in b:
        return float("nan")
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def in_city(s: dict) -> bool:
    try:
        z = int(s.get("zip") or 0)
    except ValueError:
        return False
    return z in CITY_ZIPS and "gallen" in (s.get("city") or s.get("slug") or "").lower().replace(".", "")


def discover(http: Http, base: str) -> tuple[dict[str, dict], list[str], bool]:
    """Retourne (magasins pertinents, avertissements, sources complètes ?)."""
    warnings: list[str] = []
    sm, geo = {}, {}
    try:
        sm = from_sitemap(http, base)
    except Exception as e:  # noqa: BLE001
        warnings.append(f"sitemap magasins indisponible: {e}")
    try:
        geo = from_geo(http, base)
    except Exception as e:  # noqa: BLE001
        warnings.append(f"localisateur indisponible ou structure changée: {e}")
    if not sm and not geo:
        raise RuntimeError("aucune source de magasins disponible")

    stores: dict[str, dict] = {}
    for sid, s in geo.items():
        s = dict(s)
        s["in_sitemap"] = sid in sm if sm else None
        if sid in sm:
            s["url"] = sm[sid]["url"]
        stores[sid] = s
    # Magasins St. Gallen présents dans le sitemap mais absents de la recherche géo.
    for sid, s in sm.items():
        if sid not in stores and int(s["zip"]) in CITY_ZIPS and "gallen" in s["slug"]:
            stores[sid] = {**s, "city": "St. Gallen", "address": None, "channel": None,
                           "in_sitemap": True, "note": "présent dans le sitemap, absent du localisateur"}
            warnings.append(f"{sid} présent dans le sitemap mais pas dans le localisateur")
    for s in stores.values():
        s["scope"] = "city" if in_city(s) else "neighbour"
    return stores, warnings, bool(sm and geo)


def reconcile(known: dict, found: dict[str, dict], at: str, complete: bool = True) -> list[dict]:
    """Met à jour ``known`` (data/stores.json) et retourne les changements.

    Une fermeture n'est déclarée que si les deux sources ont répondu."""
    changes: list[dict] = []
    ks = known.setdefault("stores", {})
    for sid, s in found.items():
        if sid not in ks:
            enabled = s["scope"] == "city"
            ks[sid] = {**s, "enabled": enabled, "active": True, "first_seen": at, "last_seen": at}
            if known.get("initialized"):
                changes.append({"type": "store_opened", "store": sid, "address": s.get("address"),
                                "city": s.get("city"), "scope": s["scope"]})
            continue
        k = ks[sid]
        if not k.get("active", True):
            changes.append({"type": "store_reopened", "store": sid, "address": s.get("address")})
        if s.get("address") and k.get("address") and s["address"] != k["address"]:
            changes.append({"type": "store_address_changed", "store": sid,
                            "old": k["address"], "new": s["address"]})
        enabled = k.get("enabled")
        k.update({kk: v for kk, v in s.items() if v is not None})
        k.update(active=True, last_seen=at, enabled=enabled)
    for sid, k in ks.items():
        if complete and sid not in found and k.get("active", True):
            k["active"] = False
            k["closed_detected"] = at
            changes.append({"type": "store_closed", "store": sid, "address": k.get("address")})
    known["initialized"] = True
    known["checked_at"] = at
    for c in changes:
        known.setdefault("history", []).append({"at": at, **c})
    return changes


def enabled_ids(known: dict) -> list[str]:
    return sorted(sid for sid, s in known.get("stores", {}).items() if s.get("enabled") and s.get("active", True))
