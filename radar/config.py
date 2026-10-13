"""Chargement de la configuration (TOML, bibliothèque standard)."""
from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Config:
    settings: dict
    prefs: dict
    root: Path

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.settings["general"]["timezone"])

    @property
    def data_dir(self) -> Path:
        return Path(os.environ.get("RADAR_DATA_DIR", self.root / "data"))

    def s(self, section: str, key: str, default=None):
        return self.settings.get(section, {}).get(key, default)

    @property
    def dashboard_url(self) -> str:
        return os.environ.get("DASHBOARD_URL") or self.s("general", "dashboard_url", "")


def load(root: Path | None = None) -> Config:
    root = root or ROOT
    with open(root / "config" / "settings.toml", "rb") as f:
        settings = tomllib.load(f)
    with open(root / "config" / "preferences.toml", "rb") as f:
        prefs = tomllib.load(f)
    # Extensions V3 (facultatives) : sources universelles et watchlists.
    for name, key in (("sources.toml", "sources"), ("watchlists.toml", "watchlists")):
        p = root / "config" / name
        if p.exists():
            with open(p, "rb") as f:
                data = tomllib.load(f)
            settings[key] = data.get(key, data)
    return Config(settings=settings, prefs=prefs, root=root)
