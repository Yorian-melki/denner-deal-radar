"""tutti.ch — objets « zu verschenken » / gratuits dans le canton de St-Gall.

Méthode (audit 14.10.2026) : pages publiques de recherche ``/de/q/<slug>/<token>``
(autorisées par robots.txt ; ``/api/`` — dont GraphQL — est INTERDIT et n'est
jamais appelé). Les annonces sont lues dans le ``__NEXT_DATA__`` rendu côté
serveur : ``props.pageProps.dehydratedState.queries[0].state.data.listings``.

Jeton de recherche (non documenté) : ``'A' + base64url_sans_padding(msgpack(
[requête, catégorie, [textes, prix, intervalles, lieux]]))``. Un filtre
« gratuit seulement » n'a PAS pu être encodé : on interroge des mots-clés
(« verschenken », « gratis »), page 1 seulement (tri : plus récentes d'abord),
puis on ne garde que ``formattedPrice == 'Gratis'``. Le sous-ensemble msgpack
nécessaire (None, str, petits int, listes) est implémenté ici sans dépendance ;
il reproduit exactement le jeton vérifié par l'audit.

Aucune valeur n'est inventée : ``market_price`` reste absent -> l'objet est
listé mais « non évalué ». Pas d'alias vendeur stocké (donnée personnelle).
"""
from __future__ import annotations

import base64
import json
import re

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import iso_local, text

LOCATION = [["location", "geo-canton-st-gallen", None]]
QUERIES = ("verschenken", "gratis")
# Codes postaux de la ville de St-Gall (9000–9017) -> LOCAL ; reste du canton -> NEARBY.
CITY_ZIPS = range(9000, 9018)
_PHONE = re.compile(r"(\+?\d[\d ./-]{7,}\d)")
_MAIL = re.compile(r"\S+@\S+")


def _mp(o) -> bytes:
    """Sous-ensemble msgpack (spécification officielle) suffisant pour le jeton."""
    if o is None:
        return b"\xc0"
    if isinstance(o, bool):
        return b"\xc3" if o else b"\xc2"
    if isinstance(o, int) and 0 <= o < 128:
        return bytes([o])
    if isinstance(o, int) and 0 <= o < 65536:
        return b"\xcd" + o.to_bytes(2, "big")
    if isinstance(o, str):
        b = o.encode()
        if len(b) < 32:
            return bytes([0xA0 | len(b)]) + b
        if len(b) < 256:
            return b"\xd9" + bytes([len(b)]) + b
        return b"\xda" + len(b).to_bytes(2, "big") + b
    if isinstance(o, (list, tuple)):
        if len(o) >= 16:
            raise ValueError("liste trop longue pour ce sous-ensemble msgpack")
        return bytes([0x90 | len(o)]) + b"".join(_mp(x) for x in o)
    raise TypeError(f"type non pris en charge : {type(o).__name__}")


def search_token(query: str | None, location=LOCATION, category: str | None = None) -> str:
    return "A" + base64.urlsafe_b64encode(_mp([query, category, [None, None, None, location]])).decode().rstrip("=")


def parse_listings(html: str) -> tuple[list[dict], int | None]:
    """HTML d'une page de recherche -> (nœuds d'annonces, totalCount). Lève ValueError
    si la structure attendue est absente."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise ValueError("__NEXT_DATA__ absent (structure de page changée ?)")
    queries = json.loads(m.group(1))["props"]["pageProps"]["dehydratedState"]["queries"]
    for q in queries:
        data = (q.get("state") or {}).get("data") or {}
        if isinstance(data, dict) and isinstance(data.get("listings"), dict):
            lst = data["listings"]
            return [e["node"] for e in lst.get("edges", []) if e.get("node")], lst.get("totalCount")
    raise ValueError("listings absent du __NEXT_DATA__")


def price_of(formatted: str | None) -> float | None:
    """'Gratis' -> 0 ; "1'200.-" -> 1200 ; 'Auf Anfrage' / autre texte -> None."""
    s = (formatted or "").strip()
    if s.lower() == "gratis":
        return 0.0
    m = re.fullmatch(r"([\d']+)(?:\.(\d{2}|-))?", s.replace("’", "'"))
    if not m:
        return None
    cents = m.group(2) if m.group(2) and m.group(2) != "-" else "0"
    return float(m.group(1).replace("'", "")) + int(cents) / 100


def is_free(node: dict) -> bool:
    return (node.get("formattedPrice") or "").strip().lower() == "gratis"


def scope_of(node: dict) -> str:
    pc = node.get("postcodeInformation") or {}
    canton = ((pc.get("canton") or {}).get("shortName") or "").upper()
    try:
        zip_ = int(pc.get("postcode") or 0)
    except ValueError:
        zip_ = 0
    if zip_ in CITY_ZIPS:
        return "LOCAL"
    return "NEARBY" if canton == "SG" else "REGIONAL"


def _clean_body(s: str | None) -> str | None:
    body = text(s)
    body = _MAIL.sub("[e-mail]", _PHONE.sub("[tél.]", body))
    return body[:240] or None


@register
class TuttiFree(Connector):
    id = "tutti_free"
    name = "tutti.ch – gratuit (canton SG)"
    family = "free"
    tier = "REALTIME"
    window_ttl_hours = 48   # flux limité aux éléments les plus récents
    interval_minutes = 25
    base_url = "https://www.tutti.ch"
    platform = "tutti"
    expected_min_items = 1
    documentation = ("Pages /de/q/st-gallen/<token> (robots OK, /api/ interdit), __NEXT_DATA__ ; "
                     "mots-clés verschenken+gratis, page 1, filtre formattedPrice=='Gratis'")

    def search_url(self, query: str) -> str:
        return f"{self.base_url}/de/q/st-gallen/{search_token(query)}"

    def fetch(self, ctx):
        seen: dict[str, dict] = {}
        warnings, ok_pages, totals = [], 0, {}
        for q in QUERIES:
            try:
                r = ctx.get(self.search_url(q), headers={"Accept": "text/html"})
                nodes, total = parse_listings(r.text)
            except Exception as e:  # noqa: BLE001 — une requête ratée n'annule pas l'autre
                warnings.append(f"{q}: {type(e).__name__}: {e}"[:200])
                continue
            ok_pages += 1
            totals[q] = total
            for n in nodes:
                if is_free(n) and n.get("listingID"):
                    seen.setdefault(str(n["listingID"]), n)
        if not ok_pages:
            return FetchResult(error="; ".join(warnings) or "aucune page lue", warnings=warnings)
        # Fenêtre « page 1 des plus récentes » (~1–2 jours) : un objet gratuit qui en sort
        # est presque toujours déjà parti ; complete=True pour que le moteur le retire
        # (sinon il resterait ACTIF indéfiniment). Voir rapport : notion de fenêtre/TTL.
        return FetchResult(items=list(seen.values()), window=True, complete=ok_pages == len(QUERIES), warnings=warnings,
                           empty_valid=False, raw={"totals": totals, "items": list(seen.values())},
                           meta={"totals": totals})

    def normalize(self, n, ctx):
        tz = ctx.cfg.tz
        pc = n.get("postcodeInformation") or {}
        loc = n.get("localization") or {}
        thumb = (n.get("thumbnail") or {}).get("normalRendition") or {}
        lid = str(n["listingID"])
        return make_deal(
            deal_id=f"{self.id}:{lid}", source_id=self.id, source_type="community", source_offer_id=lid,
            source_url=f"{self.base_url}/de/vi/{lid}", merchant=f"{self.platform} (particulier)",
            title=text(loc.get("title")) or "Annonce gratuite", description=_clean_body(loc.get("body")),
            family="free", offer_type="giveaway", condition="used",
            category=(n.get("primaryCategory") or {}).get("categoryID"),
            current_price=price_of(n.get("formattedPrice")), price_text=n.get("formattedPrice"),
            published_at=iso_local(n.get("timestamp"), tz), postcode=pc.get("postcode"),
            city=pc.get("locationName"), canton=(pc.get("canton") or {}).get("shortName"),
            lat=n.get("lat") or (n.get("coordinates") or {}).get("latitude"),
            lng=n.get("lng") or (n.get("coordinates") or {}).get("longitude"),
            image_url=thumb.get("src"), geographic_scope=scope_of(n), delivery_scope="PICKUP",
            access="PUBLIC", platform_source=(n.get("source") or {}).get("id"))
