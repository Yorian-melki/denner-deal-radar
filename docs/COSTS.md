# Coûts

| Poste | Usage estimé | Coût |
|---|---|---|
| GitHub Actions (dépôt public) | ~45 exécutions/jour × ~1 min | 0 CHF (minutes illimitées pour les dépôts publics) |
| GitHub Pages | site statique < 5 Mo, déploiements ~50/j | 0 CHF (limite 100 Go/mois de bande passante, 10 builds/h souple) |
| Stockage | dépôt git (JSON texte) : ~50–150 Mo/an estimés | 0 CHF (recommandation GitHub < 1–5 Go) |
| Artefacts bruts | 14 jours de rétention | 0 CHF (dépôt public) |
| Telegram Bot API | quelques dizaines de messages/jour | 0 CHF |
| APIs/sources | uniquement publiques et gratuites | 0 CHF |
| Leaflet + OpenStreetMap (carte) | chargé seulement sur l'onglet Carte | 0 CHF (usage personnel, attribution) |
| **LLM en fonctionnement** | **aucun appel** | **0 token/mois** |

**Total récurrent : 0 CHF/mois, 0 token LLM/mois.**

Seuils de vigilance : dépôt > 1 Go (archiver `data/universal/archive` dans une
release annuelle) ; > 10 déploiements Pages/heure (regrouper les exports). Aucun
service payant n'est souscrit sans autorisation explicite.
