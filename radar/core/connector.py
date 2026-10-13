"""Contrat commun des connecteurs.

Un connecteur ne fait que deux choses :
  ``fetch(ctx)``      -> FetchResult (éléments bruts + diagnostic de complétude)
  ``normalize(raw)``  -> deal universel (``make_deal``) ou None

Tout le reste (historique, déduplication, scoring, urgence, alertes) est
générique. Un connecteur ne doit JAMAIS lever d'exception non gérée vers le
runner : celui-ci l'isole de toute façon, mais un FetchResult précis permet de
distinguer ``EMPTY_VALID`` (la source n'a réellement aucune offre) de
``SCRAPE_FAILURE`` (on ne sait pas).
"""
from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass, field
from typing import Any

import requests

from ..http import Http

log = logging.getLogger("radar.core")

TIERS = {  # intervalle minimal par défaut (minutes)
    "REALTIME": 15, "FAST": 30, "DAILY": 180, "SLOW": 480, "EVENT": 720, "DYNAMIC": 360,
}


@dataclass
class FetchResult:
    items: list[Any] = field(default_factory=list)
    complete: bool = False          # pagination entière, réponse structurellement valide
    empty_valid: bool = False       # 0 élément ET la source le confirme explicitement
    error: str | None = None
    warnings: list[str] = field(default_factory=list)
    not_modified: bool = False      # 304 : rien n'a changé depuis la dernière collecte
    raw: Any = None                 # instantané brut (pour débogage, non versionné)
    meta: dict = field(default_factory=dict)

    @property
    def state(self) -> str:
        if self.error:
            return "SCRAPE_FAILURE"
        if self.not_modified:
            return "NOT_MODIFIED"
        if not self.items:
            return "EMPTY_VALID" if self.empty_valid else "SCRAPE_FAILURE"
        return "OK" if self.complete else "PARTIAL"


@dataclass
class Context:
    http: Http
    cfg: Any
    now: dt.datetime
    source_state: dict            # état persistant propre au connecteur (ETag, curseurs…)

    def get(self, url: str, conditional: bool = False, **kw) -> requests.Response:
        """GET poli ; avec ``conditional``, envoie ETag / If-Modified-Since mémorisés."""
        headers = kw.pop("headers", {}) or {}
        cache = self.source_state.setdefault("http_cache", {}).get(url, {})
        if conditional:
            if cache.get("etag"):
                headers["If-None-Match"] = cache["etag"]
            if cache.get("last_modified"):
                headers["If-Modified-Since"] = cache["last_modified"]
        r = self.http.get(url, headers=headers, **kw) if headers else self.http.get(url, **kw)
        if conditional and r.status_code == 200:
            entry = {k: v for k, v in (("etag", r.headers.get("ETag")),
                                         ("last_modified", r.headers.get("Last-Modified"))) if v}
            if entry:
                self.source_state["http_cache"][url] = entry
        return r


class Connector:
    id: str = ""
    name: str = ""
    family: str = "retail"
    tier: str = "DAILY"
    interval_minutes: int | None = None
    base_url: str = ""
    # Garde-fous de santé : nombre d'éléments minimum attendu quand tout va bien.
    expected_min_items: int = 1
    documentation: str = ""

    @property
    def min_interval(self) -> int:
        return self.interval_minutes or TIERS.get(self.tier, 180)

    def fetch(self, ctx: Context) -> FetchResult:  # pragma: no cover - abstrait
        raise NotImplementedError

    def normalize(self, raw: Any, ctx: Context) -> dict | None:  # pragma: no cover - abstrait
        raise NotImplementedError
