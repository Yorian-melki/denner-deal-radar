# Architecture — St. Gallen Deal Radar (V3)

## Principe de migration

`V3 = Denner V2 (inchangé, en production) + moteur universel additif`.

* Le moteur Denner V2 (`radar/cli.py scan`, `radar/denner.py`, `radar/diff.py`,
  `radar/scoring.py`, `radar/notify.py`) continue de collecter, noter et
  alerter Denner exactement comme avant. IDs, données (`data/offers`, …),
  URLs Telegram (`#semaine`, `#nouveautes?since=…`) et workflows sont préservés.
* Le moteur universel (`radar/core/`, `radar/connectors/`) lit Denner via un
  adaptateur en lecture seule (`connectors/denner_v2.py`) : `deal_id =
  denner:<offer_id>`, note V2 conservée (`score_model = denner_v2`).
* Point de restauration : tag git `v2-denner-baseline`.

## Pipeline

```
SOURCE ─► CONNECTOR.fetch ─► RAW SNAPSHOT (raw/, artefact 14 j) ─► VALIDATION (make_deal)
      ─► NORMALIZATION ─► ENTITY RESOLUTION (canonical_entity_id) ─► DEDUP (entity.deduplicate)
      ─► HISTORY (UStore.observe) ─► CHANGE DETECTOR (engine.apply) ─► ANOMALY (analytics.anomaly)
      ─► GEO (analytics.geo_scope) ─► DEAL SCORING (uscoring) ─► RELEVANCE ─► URGENCY
      ─► ALERTS (ualerts → Telegram) ─► EXPORT (site/data/*.json) ─► PWA GitHub Pages
```

| Module | Rôle |
|---|---|
| `core/deal.py` | Schéma universel, validation, coût total d'acquisition |
| `core/connector.py` | Contrat `Connector` (fetch/normalize), `FetchResult` (OK / PARTIAL / EMPTY_VALID / SCRAPE_FAILURE / NOT_MODIFIED), GET conditionnel ETag |
| `core/engine.py` | Exécution isolée, cycle de vie, garde-fous, fiabilité de source, enrichissement |
| `core/entity.py` | GTIN (somme de contrôle) > MPN > SKU > titre ; fusion seulement si prix et dates concordent, sinon `possible_duplicate_of` |
| `core/analytics.py` | Statistiques d'historique, shrinkflation, anomalies, géographie, urgence |
| `core/uscoring.py` | Notation absolue par famille (voir SCORING.md) |
| `core/ualerts.py` | Politique d'alerte, anti-spam, état de notification, watchlists, digest |
| `core/store.py` | Persistance JSON versionnée (`data/universal/`) |
| `connectors/*.py` | Un fichier par source, isolé |

## Données (`data/universal/`, versionnées dans git)

* `deals/<source>.json` — deals actifs et récents (90 j), puis `archive/<source>/<année>.json`.
* `history/<source>.json` — observations de prix par entité canonique (jamais purgées).
* `events/`, `runs/` — journaux append-only (provenance, délais, erreurs).
* `state.json` — santé par source (dernière exécution/réussite, latence, fiabilité,
  ETag), état des notifications (première/dernière alerte, raison, note, prix).

Pourquoi des fichiers JSON et pas une base hébergée : 0 CHF, survit à tout
redéploiement, diffable, sauvegardé par git (chaque commit est une sauvegarde).

## Workflows GitHub Actions

| Workflow | Rôle | Fréquence |
|---|---|---|
| `scan.yml` | Denner V2 (inchangé) + export universel | 4×/j + créneaux jeudi/lundi + rattrapage |
| `universal.yml` | Toutes les autres sources, `--due` selon le tier de chaque connecteur | 30 min le jour, 2 h la nuit |
| `watchdog.yml` | Données obsolètes → alerte + relance | 4×/j |
| `tests.yml` | Tests + robots.txt | push + hebdo |
| `manual-offer.yml` | Offre vue en magasin via formulaire | à la demande |

Tous partagent le groupe de concurrence `radar-data` (pas de commits concurrents).

## Tiers de fréquence (par connecteur)

`REALTIME` 15 min · `FAST` 30 min · `DAILY` 3 h · `SLOW` 8 h · `EVENT` 12 h · `DYNAMIC` 6 h.
Après un échec, la source est retentée au plus tard 30 min plus tard.

## Modes de défaillance traités

| Défaillance | Comportement |
|---|---|
| Source en panne / exception | `SCRAPE_FAILURE`, deals conservés, alerte technique après 2 échecs, retour à la normale notifié |
| 0 résultat sans confirmation | `SCRAPE_FAILURE` (jamais « toutes les promos sont finies ») |
| 0 résultat confirmé par la source | `EMPTY_VALID` → retrait après 2 collectes complètes |
| Chute < 40 % de la médiane | `PARTIAL`, aucune disparition enregistrée |
| Pagination incomplète | `PARTIAL` |
| > 50 % d'éléments invalides | avertissement « structure changée » |
| Données obsolètes | bandeau dans l'app + watchdog |
| Cache hors ligne (PWA) | statut recalculé à l'heure courante, bandeau « hors ligne » |
| Commit concurrent | concurrence sérialisée + rebase avec 5 essais |
