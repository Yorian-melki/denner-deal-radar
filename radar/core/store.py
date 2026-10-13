"""Stockage universel (fichiers JSON versionnés, même philosophie que Denner V2).

    data/universal/deals/<source>.json        deals connus de la source (actifs + 90 j)
    data/universal/archive/<source>/AAAA.json deals sortis de la fenêtre (jamais supprimés)
    data/universal/history/<source>.json      observations de prix par entité canonique
    data/universal/events/AAAA-MM.ndjson      journal des changements (append-only)
    data/universal/runs/AAAA-MM.ndjson        journal des exécutions
    data/universal/state.json                 santé des sources, ETag, notifications

Les données Denner V2 (data/offers, data/price_history.json…) ne sont pas
déplacées : le connecteur Denner les lit telles quelles (migration sans perte).
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from ..storage import _dump, _read, _write_if_changed

ARCHIVE_AFTER_DAYS = 90


class UStore:
    def __init__(self, data_dir: Path):
        self.dir = Path(data_dir) / "universal"
        self.deals: dict[str, dict[str, dict]] = {}
        for p in sorted((self.dir / "deals").glob("*.json")):
            self.deals[p.stem] = _read(p, {})
        self.history: dict[str, dict[str, list]] = {}
        for p in sorted((self.dir / "history").glob("*.json")):
            self.history[p.stem] = _read(p, {})
        self.state: dict = _read(self.dir / "state.json", {})
        self._events: list[dict] = []
        self._runs: list[dict] = []
        self._archive: dict[tuple[str, str], dict] = {}

    # -- accès ------------------------------------------------------------
    def source_deals(self, source_id: str) -> dict[str, dict]:
        return self.deals.setdefault(source_id, {})

    def all_deals(self):
        for src in self.deals.values():
            yield from src.values()

    def source_state(self, source_id: str) -> dict:
        return self.state.setdefault("sources", {}).setdefault(source_id, {})

    @property
    def notify_state(self) -> dict:
        return self.state.setdefault("notify", {})

    # -- journaux ---------------------------------------------------------
    def event(self, kind: str, at: str, deal: dict | None = None, **data) -> dict:
        ev = {"at": at, "type": kind, **data}
        if deal:
            ev.update(deal_id=deal["deal_id"], source_id=deal["source_id"], title=deal.get("title"))
        self._events.append(ev)
        return ev

    @property
    def new_events(self) -> list[dict]:
        return list(self._events)

    def log_run(self, run: dict) -> None:
        self._runs.append(run)

    def read_runs(self, months: int = 1) -> list[dict]:
        out = []
        for p in sorted((self.dir / "runs").glob("*.ndjson"))[-months:]:
            out += [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
        return out + self._runs

    # -- historique ---------------------------------------------------------
    def observe(self, deal: dict, at: str) -> None:
        """Ajoute une observation de prix si elle diffère de la précédente."""
        key = deal.get("canonical_entity_id") or deal["deal_id"]
        hist = self.history.setdefault(deal["source_id"], {}).setdefault(key, [])
        obs = {k: deal.get(k) for k in ("current_price", "reference_price", "reference_price_type",
                                         "unit_price", "unit", "quantity", "condition")
               if deal.get(k) is not None}
        obs["deal_id"] = deal["deal_id"]
        obs["at"] = at
        if hist and {k: v for k, v in hist[-1].items() if k != "at"} == {k: v for k, v in obs.items() if k != "at"}:
            return
        hist.append(obs)

    def entity_history(self, deal: dict, all_sources: bool = True) -> list[dict]:
        key = deal.get("canonical_entity_id") or deal["deal_id"]
        if not all_sources:
            return list(self.history.get(deal["source_id"], {}).get(key, []))
        out = []
        for src in self.history.values():
            out += src.get(key, [])
        return out

    # -- persistance --------------------------------------------------------
    def archive_old(self, now: dt.datetime) -> int:
        cutoff = (now - dt.timedelta(days=ARCHIVE_AFTER_DAYS)).isoformat()
        n = 0
        for sid, deals in self.deals.items():
            for did in [d for d, x in deals.items()
                        if x.get("lifecycle") in ("EXPIRED", "REMOVED") and (x.get("last_seen_at") or "") < cutoff]:
                rec = deals.pop(did)
                year = (rec.get("first_seen_at") or "0000")[:4]
                self._archive.setdefault((sid, year), {})[did] = rec
                n += 1
        return n

    def save(self) -> list[str]:
        changed = []
        for sid, deals in self.deals.items():
            if _write_if_changed(self.dir / "deals" / f"{sid}.json", _dump(deals)):
                changed.append(f"deals/{sid}")
        for sid, hist in self.history.items():
            if _write_if_changed(self.dir / "history" / f"{sid}.json", _dump(hist)):
                changed.append(f"history/{sid}")
        for (sid, year), recs in self._archive.items():
            p = self.dir / "archive" / sid / f"{year}.json"
            existing = _read(p, {})
            existing.update(recs)
            _write_if_changed(p, _dump(existing))
        self._archive = {}
        if _write_if_changed(self.dir / "state.json", _dump(self.state)):
            changed.append("state")
        for sub, rows in (("events", self._events), ("runs", self._runs)):
            for r in rows:
                p = self.dir / sub / f"{r['at'][:7]}.ndjson"
                p.parent.mkdir(parents=True, exist_ok=True)
                with open(p, "a", encoding="utf-8") as f:
                    f.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
        self._events, self._runs = [], []
        return changed
