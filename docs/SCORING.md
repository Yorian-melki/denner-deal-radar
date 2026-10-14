# Notation — échelle ABSOLUE 0–10

Une note ne dépend que de l'offre elle-même (et de son propre historique). Jamais
de percentile, de normalisation hebdomadaire ni de quota. Une semaine peut avoir
4,3 comme meilleure note, une autre vingt offres > 8.

## Dimensions indépendantes

| Dimension | Échelle | Rôle |
|---|---|---|
| Deal Score | 0–10 | qualité économique absolue |
| Confiance | 0–100 % | fiabilité des données et du calcul |
| Pertinence personnelle | 0–100 % | utilité pour moi (n'altère JAMAIS la note) |
| Urgence | LOW → CRITICAL | faut-il agir maintenant ? |
| Accessibilité | 0–100 % | compte, code, parrainage, statut étudiant, distance |
| Anomalie | 0–10 + confiance | écart statistique vs historique (erreur de prix possible) |
| Intégrité | ok / inflated_reference / above_usual_price | détection de fausses promos |

## Courbe fixe réduction → note (commune à toutes les familles « prix »)

| réduction réelle | 0 % | 5 % | 10 % | 20 % | 30 % | 40 % | 50 % | 60 % | 75 % | 90 % | 95 % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| note | 0 | 1 | 2 | 3,5 | 5 | 6,2 | 7,3 | 8 | 9 | 9,7 | 10 |

## Réduction « réelle » (`uscoring._discount_based`)

1. Coût total = prix + livraison + frais obligatoires + déplacement estimé
   (les coûts inconnus ne sont pas inventés : listés comme hypothèses).
2. Référence pondérée selon sa nature :

| Type de référence | Facteur | Confiance |
|---|---|---|
| ancien prix du même marchand | 1,00 | 85 % |
| prix de marché (comparateur/historique) | 1,00 | 80 % |
| prix catalogue | 0,95 | 70 % |
| prix conseillé fabricant (PVC) | 0,85 | 50 % |
| prix concurrent cité | 0,80 | 50 % |
| référence communautaire | 0,85 | 40 % |
| valeur annoncée (anti-gaspi) | 0,65 | 40 % |

   Puis × état : neuf 1 · open-box 0,95 · retour 0,92 · reconditionné fabricant 0,90 ·
   reconditionné tiers 0,85 · occasion 0,75 · endommagé 0,5.
3. Référence gonflée : si elle dépasse de > 10 % la plus basse référence déjà
   observée pour cette entité, on utilise cette dernière (`inflated_reference`).
4. Médiane historique (≥ 3 relevés comparables, même contenance) : seconde
   réduction candidate. **On retient la plus prudente.** Un prix ≥ médiane
   habituelle marque l'offre `above_usual_price` (fausse promo probable).
5. Sans aucune référence ni historique : **non évaluée**.

## Ajustements bornés

| Situation | Effet |
|---|---|
| achat minimum 2 / ≥ 3 unités | −8 % / −15 % de la note de base |
| plus bas prix jamais observé | +0,3 |
| économie absolue ≥ CHF 100 / ≥ CHF 300 | +0,3 / +0,5 |
| économie absolue < CHF 5 / < 15 / < 30 (hors supermarché, anti-gaspi) | note plafonnée à 6 / 7,5 / 8,5 (biais de pourcentage) |
| supermarché : économie < CHF 1 | note plafonnée à 6 |
| référence faible (PVC, concurrent, communauté, valeur annoncée) non confirmée | note plafonnée à 7,5 |
| anti-gaspi à plus de 5 km | −0,5 |
| cashback non garanti | non déduit (affiché séparément) |

## Familles particulières

* **Gratuit / gratuit numérique** : note sur la VALEUR NETTE (valeur utile × état
  − coûts de récupération), courbe fixe : CHF 5 → 1,5 · 15 → 3 · 30 → 5 · 80 → 7 ·
  200 → 8 · 500 → 9 · 1500 → 10. Valeur inconnue → non évalué. Un canapé gratuit
  nécessitant CHF 150 de transport n'est pas 10/10.
* **Abonnement** : coût total sur la période d'engagement (promo puis prix normal,
  frais d'activation ; rabais « à vie » : 24 mois) vs prix catalogue × durée × 0,6 —
  les prix catalogue des opérateurs suisses sont rarement payés (« Aktionen »
  quasi permanentes). Confiance 40 %, note plafonnée à 7,5 sans historique.
* **Concours** : jamais la valeur du lot. Espérance = probabilité × lot − coût,
  seulement si la probabilité est publiée ; sinon non évalué.
* **Denner** : modèle V2 conservé tel quel (`score_model = denner_v2`).

## Anomalies (`analytics.anomaly`)

Score = (1 − prix / médiane) / 0,7 × 10, à partir de 15 % sous la médiane.
La confiance baisse si l'historique est court, la quantité invérifiable, le prix
conditionnel, ou si l'écart est extrême (< 50 % du minimum) sans seconde source.

## Tests

`tests/test_scoring.py` (Denner : 0→95 %), `tests/test_core.py` (familles, fausse
promo, baisse silencieuse, gratuit, abonnement, concours, cashback, anomalies,
urgence, dédup, anti-spam, watchlists).
