"""Registre des connecteurs universels.

Ajouter une source : créer ``radar/connectors/<id>.py`` avec une classe
``Connector`` puis l'enregistrer ici et dans ``config/sources.toml``
(voir docs/ADDING_A_SOURCE.md). Denner n'est PAS ici : il reste collecté par le
moteur V2 et exposé via ``denner_v2.deals``.
"""
from __future__ import annotations

from ..core.connector import Connector

REGISTRY: dict[str, type[Connector]] = {}


def register(cls: type[Connector]) -> type[Connector]:
    REGISTRY[cls.id] = cls
    return cls


def enabled_connectors(cfg) -> list[Connector]:
    _load_all()
    conf = cfg.settings.get("sources", {})
    out = []
    for sid, cls in sorted(REGISTRY.items()):
        c = conf.get(sid, {})
        if not c.get("enabled", True):
            continue
        inst = cls()
        if c.get("interval_minutes"):
            inst.interval_minutes = int(c["interval_minutes"])
        out.append(inst)
    return out


def _load_all() -> None:
    import importlib
    import pkgutil
    for m in pkgutil.iter_modules(__path__):
        if m.name not in ("denner_v2",) and not m.name.startswith("_"):
            importlib.import_module(f"{__name__}.{m.name}")
