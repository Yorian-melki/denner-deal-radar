"""Stockage durable en fichiers texte versionnés dans git.

Pourquoi pas SQLite ? Un fichier binaire recommité 6 fois par jour gonfle
l'historique git de plusieurs Go par an. Des JSON triés et partitionnés ne
produisent que de petits diffs, restent lisibles et survivent à toute
suppression de cache GitHub Actions.

    data/offers/YYYY-MM.json      offres (partition = mois de début)
    data/events/YYYY-MM.ndjson    journal des changements (append-only)
    data/runs/YYYY-MM.ndjson      journal des collectes (append-only)
    data/price_history.json       historique des prix par article (jamais purgé)
    data/stores.json              succursales + historique des changements
    data/manual.json              offres saisies à la main (vérifiées en magasin)
    data/state.json               état technique (santé, file d'attente, rappels)
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path


def _dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=True) + "\n"


def _read(path: Path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def _write_if_changed(path: Path, text: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)
    return True


class Store:
    def __init__(self, data_dir: Path):
        self.dir = Path(data_dir)
        self.offers: dict[str, dict] = {}
        for p in sorted((self.dir / "offers").glob("*.json")):
            self.offers.update(_read(p, {}))
        self.prices: dict[str, list] = _read(self.dir / "price_history.json", {})
        self.stores: dict = _read(self.dir / "stores.json", {"stores": {}, "history": []})
        self.manual: list = _read(self.dir / "manual.json", [])
        self.state: dict = _read(self.dir / "state.json", {})
        self._events: list[dict] = []
        self._runs: list[dict] = []

    # -- journaux --------------------------------------------------------
    def event(self, kind: str, at: str, offer_id: str | None = None, **data) -> dict:
        ev = {"at": at, "type": kind, **({"offer_id": offer_id} if offer_id else {}), **data}
        self._events.append(ev)
        return ev

    @property
    def new_events(self) -> list[dict]:
        return list(self._events)

    def log_run(self, run: dict) -> None:
        self._runs.append(run)

    def read_events(self, months: int = 2) -> list[dict]:
        out = []
        for p in sorted((self.dir / "events").glob("*.ndjson"))[-months:]:
            out += [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]
        return out + self._events

    def read_runs(self, months: int = 1) -> list[dict]:
        out = []
        for p in sorted((self.dir / "runs").glob("*.ndjson"))[-months:]:
            out += [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]
        return out + self._runs

    # -- historique des prix --------------------------------------------
    def record_price(self, o: dict, at: str) -> None:
        obs = {
            "offer_id": o["offer_id"], "seen": at[:10], "price": o.get("discounted_price"),
            "regular": o.get("regular_price"), "ref_type": o.get("reference_price_type"),
            "unit_price": o.get("unit_price"), "unit": o.get("unit_price_unit"),
            "price_basis": o.get("price_basis"), "starts": (o.get("starts_at") or "")[:10],
            "ends": (o.get("ends_at") or "")[:10], "kind": o.get("kind"),
        }
        hist = self.prices.setdefault(o["article_id"], [])
        if hist and hist[-1]["offer_id"] == obs["offer_id"] and hist[-1]["price"] == obs["price"] \
                and hist[-1]["regular"] == obs["regular"]:
            return
        hist.append(obs)

    # -- persistance ------------------------------------------------------
    @staticmethod
    def partition(o: dict) -> str:
        return (o.get("starts_at") or o.get("ends_at") or o.get("first_seen_at") or "unknown")[:7]

    def save(self) -> list[str]:
        changed: list[str] = []
        parts: dict[str, dict] = {}
        for oid, o in self.offers.items():
            parts.setdefault(o.get("_partition") or self.partition(o), {})[oid] = o
        for name, content in parts.items():
            p = self.dir / "offers" / f"{name}.json"
            if _write_if_changed(p, _dump(content)):
                changed.append(str(p))
        for name, obj in (("price_history.json", self.prices), ("stores.json", self.stores),
                          ("manual.json", self.manual), ("state.json", self.state)):
            if _write_if_changed(self.dir / name, _dump(obj)):
                changed.append(name)
        for sub, rows in (("events", self._events), ("runs", self._runs)):
            by_month: dict[str, list] = {}
            for r in rows:
                by_month.setdefault(r["at"][:7], []).append(r)
            for month, lines in by_month.items():
                p = self.dir / sub / f"{month}.ndjson"
                p.parent.mkdir(parents=True, exist_ok=True)
                with open(p, "a", encoding="utf-8") as f:
                    for r in lines:
                        f.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
                changed.append(str(p))
        self._events, self._runs = [], []
        return changed


def now_iso(tz) -> str:
    return dt.datetime.now(tz).replace(microsecond=0).isoformat()
