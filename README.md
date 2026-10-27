# 📡 St. Gallen Deal Radar (V3) — anciennement Denner Deal Radar

Moteur de détection d'opportunités économiques exploitables depuis Saint-Gall :
supermarchés, ventes flash, tech, reconditionné, gratuit, coupons, étudiants,
événements, abonnements, voyage. Chaque offre reçoit une note **absolue** (0–10),
une confiance, une urgence et une pertinence personnelle séparées. Alertes
Telegram, application web installable (PWA). Fonctionne seul sur GitHub Actions :
**0 CHF, 0 token LLM**.

**V3 :** 28 sources actives (Denner V2 + 27 connecteurs), 122 sources auditées.
Documentation : [ARCHITECTURE](docs/ARCHITECTURE.md) · [SCORING](docs/SCORING.md) ·
[COVERAGE](docs/COVERAGE.md) · [SOURCE_AUDIT](docs/SOURCE_AUDIT.md) ·
[COSTS](docs/COSTS.md) · [ADDING_A_SOURCE](docs/ADDING_A_SOURCE.md).
Point de restauration de la V2 : tag `v2-denner-baseline`.

**Site public (v0, preview)** : `web/` (Next.js) + plan [MONETISATION_MVP](MONETISATION_MVP.md).

### Commandes V3

```bash
python -m radar u-scan --dry-run                 # toutes les sources, rien n'est écrit ni envoyé
python -m radar u-scan --source qoqa daydeal     # sources précises
python -m radar u-scan --due                     # seulement les sources dont l'intervalle est écoulé
python -m radar u-sources                        # registre des connecteurs et santé
python -m radar u-health                         # code 1 si une source est en panne ou obsolète
python -m radar u-export                         # régénère les données du dashboard
python -m radar notify-test                      # test Telegram
```

Watchlists (sans LLM) : `config/watchlists.toml` (ex. poulet ≤ 12 CHF/kg).
Préférences : `config/preferences.toml`. Seuils d'alerte : `config/settings.toml`.

---

## Denner (moteur V2, inchangé)

* Dashboard : https://yorian-melki.github.io/denner-deal-radar/
* Audit des sources : [docs/AUDIT.md](docs/AUDIT.md)

## Fonctionnement

```
GitHub Actions (cron) ──► python -m radar scan
   1. robots.txt (≤ 1×/20 h)          5. diff vs état précédent → événements
   2. succursales (≤ 1×/6 j)          6. notation absolue + confiance + pertinence
   3. 5 flux API, ~9 requêtes         7. Telegram (file d'attente, heures calmes)
   4. audit HTML (≤ 1×/20 h)          8. data/ commité dans git → Pages redéployé
```

Une seule collecte nationale ; les offres éligibles sont associées aux 7
magasins avec le statut « éligible — stock non vérifié ». Rien n'est jamais
présenté comme « disponible en magasin » sans saisie manuelle.

## Commandes

```bash
pip install -r requirements.txt
python -m radar scan --dry-run --force   # scan réel, rien n'est écrit ni envoyé
python -m radar scan --force             # scan manuel complet
python -m radar status                   # santé des sources
python -m radar stores                   # succursales détectées
python -m pytest -q                      # tests
```

Depuis le téléphone : onglet **Actions → scan → Run workflow**.

## Notation (radar/scoring.py)

| Réduction réelle | 0 % | 10 % | 20 % | 30 % | 40 % | 50 % | 60 % | 75 % | 90 % | 95 % |
|---|---|---|---|---|---|---|---|---|---|---|
| Note | 0 | 2 | 3,5 | 5 | 6,2 | 7,3 | 8 | 9 | 9,7 | 10 |

* Prix « statt » Denner → réduction directe (confiance élevée).
* « Konkurrenzvergleich » → prix habituel Denner supposé 20 % sous le prix
  concurrent cité : −60 % affichés = 50 % retenus ; −20 % affichés = 0.
* « ab 2 Stück » ×0,92 ; « ab 3 Stück » ×0,85.
* Prix de référence > 10 % au-dessus du plus bas observé → recalculé (rabais gonflé).
* Historique du même article : +0,3 (plus bas prix vu) / −0,5 (au-dessus de la médiane).
* Aucune référence vérifiable → **non évaluée**.
* Jamais de percentile ni de normalisation hebdomadaire. La pertinence
  personnelle (sans porc / fruits de mer, priorité protéines) est séparée et ne
  modifie jamais la note.

## Calendrier des collectes (heure de Zurich, CET/CEST)

4 relevés/jour (~07h, 12h, 17h, 21h30) + créneaux de rattrapage 30 min plus
tard (exécutés seulement si le précédent a échoué ou n'a pas tourné), lundi
~02h45/05h (Wochenstart), mardi/mercredi midi et soir (avant-premières), jeudi
~04h45/05h45/08h40/10h (bascule de semaine). Watchdog 4×/jour : si aucune
collecte réussie depuis 14 h → alerte + relance forcée.

## Robustesse

* Timeout 30 s, 4 essais, backoff exponentiel ; 0,8 s entre requêtes.
* Pagination vérifiée (`reçus == totalResults`, refCodes uniques).
* Collecte incomplète, en échec ou anormalement basse (< 40 % de la médiane)
  → aucune offre n'est marquée retirée ; retrait seulement après 2 collectes
  complètes consécutives.
* Statuts recalculés à l'heure courante (export et navigateur) : une offre
  expirée n'est jamais affichée comme actuelle, même si les collectes s'arrêtent.
* Alertes techniques : échecs répétés, structure modifiée, nouveau flux,
  offres visibles sur denner.ch mais absentes de l'API, robots.txt, magasins.

## Offres vues en magasin (sans LLM)

Issues → New issue → **Offre vue en magasin** (photo de l'étiquette en pièce
jointe). L'offre est enregistrée « vérifiée en magasin » et un scan est relancé.
Ou : `python -m radar add-manual --name "..." --price 3.95 --regular 5.90 --store s1145081 --until 2026-10-21`.

## Données (data/, versionnées)

`offers/AAAA-MM.json`, `events/AAAA-MM.ndjson`, `price_history.json` (jamais
purgé), `stores.json`, `manual.json`, `runs/`, `state.json`. Texte JSON plutôt
que SQLite : diffs git minimes, aucun cache éphémère.

## Concurrence (Aldi, Lidl, Coop)

Non implémenté. Le modèle est prêt (`unit_price`, `total_quantity`,
`scoring.FAMILIES`) : un collecteur concurrent peut alimenter
`family_prices` sans rendre Denner dépendant de ces sources.

## Coûts

| Poste | Coût |
|---|---|
| GitHub Actions (dépôt public) | 0 CHF (minutes illimitées) |
| GitHub Pages | 0 CHF |
| Telegram Bot API | 0 CHF |
| LLM | 0 token |

~25 exécutions/semaine × ~1 min. ~9 requêtes vers denner.ch par collecte.

## Limites connues

* Stock et assortiment par succursale : non publiés → impossible.
* Démarques en rayon, offres de réouverture locales : non publiées → saisie manuelle.
* GitHub désactive les crons d'un dépôt public après 60 jours **sans activité** ;
  les commits automatiques de données comptent comme activité, et GitHub
  prévient par e-mail avant toute désactivation.

Basé partiellement sur [grocery-discount](https://github.com/LYL010-ADELA/grocery-discount)
(MIT, © 2026 Yilin Lin).
