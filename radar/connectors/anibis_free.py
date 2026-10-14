"""anibis.ch — objets gratuits dans le canton de St-Gall.

Même plateforme technique que tutti.ch (robots.txt et format de jeton identiques,
``/api/`` interdit) mais inventaire DISTINCT (identifiants 107xxxxxxx, source
« anibis ») : connecteur séparé, même analyseur (voir ``tutti_free``).
"""
from __future__ import annotations

from . import register
from .tutti_free import TuttiFree


@register
class AnibisFree(TuttiFree):
    id = "anibis_free"
    name = "anibis.ch – gratuit (canton SG)"
    base_url = "https://www.anibis.ch"
    platform = "anibis"
    interval_minutes = 30
    documentation = ("Pages /de/q/st-gallen/<token> (robots OK, /api/ interdit), __NEXT_DATA__ ; "
                     "mots-clés verschenken+gratis, page 1, filtre formattedPrice=='Gratis'")
