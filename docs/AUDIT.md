# Audit des sources — 13/14 octobre 2026

Toutes les constatations ci-dessous ont été vérifiées par requêtes réelles.

## robots.txt (www.denner.ch)

`User-agent: * / Allow: /`, interdits uniquement : `/headless-brick-preview/`,
`/*/checkout`, `/*/shopping-list`, `open-id-connect`. Aucun `Crawl-delay`.
Tous les chemins utilisés sont autorisés (contrôlé à chaque collecte toutes les
20 h et chaque dimanche par `scripts/check_robots.py`).

## API promotions — `POST /nuxt-api/promotions`

| `promoFlag` | Résultat (13.10.2026) | Remarque |
|---|---|---|
| `promo_current_week` | 225 offres | 08.10.–14.10 (jeu.→mer.), + 01.10.–14.10 et 01.10.–28.10 |
| `promo_next_week` | 256 offres | 15.10.–21.10, 15.10.–28.10, 16.10.–18.10… |
| `weekend_highlight` | 0 (mercredi : week-end terminé) | « Wochenend-Knaller » |
| `weekend_highlight_next_week` | 6 | 15.10.–18.10 (jeu.→dim.) |
| `start_of_the_week_highlight` | 8 | « Bis 14.10.2026 », publiées lundi 12.10 02:03 |
| `start_of_the_week_highlight_next_week`, autres | HTTP 400 | n'existe pas |

* **Les flux « highlight » ne sont PAS inclus dans les flux hebdomadaires** :
  le scraper d'origine (grocery-discount) rate donc les Wochenend- et
  Wochenstart-Knaller.
* `hitsPerPage=100` est accepté (3 requêtes au lieu de 10).
* `includeHighlights=true` renvoie la liste des flux mis en avant : utilisé
  pour découvrir automatiquement un nouveau type d'offre.
* `storeId`, `store`, `zip`, `lang` : **aucun effet** sur les résultats (hash
  identique). Le catalogue est national ; aucune donnée par succursale.
* Restrictions régionales publiées dans `footnote` :
  « Nur in der französischen Schweiz erhältlich » (23 offres exclues pour St-Gall).
* `footnote = Konkurrenzvergleich` (133 offres) : le prix barré est un prix
  **concurrent**, pas un ancien prix Denner.
* `insteadPriceText` (« statt 15.– ») = prix habituel Denner ; `SPECIAL` sans
  prix barré (66 offres) = aucune référence vérifiable.
* `promotionLabel` fait foi pour les dates ; `promotionFrom` = heure de
  publication ; `promotionTo` = minuit au début du dernier jour.
* `content_size_text` contient des clés i18n non résolues : `0.185 unit.g` =
  185 g, `0.75 unit.ml` = 750 ml.
* Même article en flux courant et suivant (offre multi-semaines) : `refCode`
  différent, `articleId` + dates identiques → dédupliqué.

**Calendrier observé** : semaine jeudi→mercredi (conforme au changement du
5.2.2026), week-end jeudi→dimanche, début de semaine lundi→mercredi.
L'hypothèse « mardi » du dépôt grocery-discount est obsolète et n'est pas utilisée.

## Couverture vs pages HTML officielles

`/de/aktionen/aktuelle-aktionen` et `/de/aktionen/aktionen-ab-donnerstag` :
les seules offres rendues absentes des flux hebdomadaires étaient exactement les
8 Wochenstart-Knaller et les 6 Wochenend-Knaller. Avec les 5 flux : **0 offre
manquante**. Audit refait automatiquement toutes les 20 h.

Aucun prospectus PDF en ligne. Le Weinshop (`/de/weinshop/...online-specials`)
est de la vente en ligne, hors périmètre magasin. L'application Denner n'expose
pas de flux public documenté ; elle n'est pas utilisée.

## Succursales

Sources : `sitemap.store.xml` (886 magasins, tous types) et localisateur
`/de/filialen?lat=47.4239&lng=9.3748&circularSearch=10` (payload Nuxt).

Commune de St-Gall — **7 succursales actives confirmées** (toutes « Denner Filiale ») :

| ID | Adresse |
|---|---|
| s1145123 | Kornhausstrasse 28, 9000 (Neumarkt) |
| s1145081 | Langgasse 26, 9008 |
| s1145228 | Zürcherstrasse 41, 9013 |
| s1144945 | Rorschacherstrasse 152-154, 9006 (Silberturm) |
| s1145508 | Lukasstrasse 69, 9016 |
| s1145534 | Fürstenlandstrasse 157, 9014 |
| s1146069 | Rorschacherstrasse 292, 9016 (Neudorf) |

**Pas de 8e point de vente actif** : aucun magasin (Filiale, Express, Partner,
Satellit) d'un NPA 9000–9016 n'apparaît ailleurs dans le sitemap ni dans le
rayon de 10 km. Le Denner Satellit Kräzernstrasse 96 n'est plus référencé :
traité comme fermé (le 8e point de vente de 2025 était vraisemblablement celui-ci).

Voisins détectés, désactivés par défaut : Wittenbach (s1145891), Abtwil
Säntispark (s1144891), Bühler Partner (s1145727), Gossau SG (s1145037),
Herisau (s1145735), Rorschacherberg Partner (s6305112, s2920784 — même adresse,
doublon côté Denner).

## Dépôt grocery-discount (MIT)

Réutilisé : principe de l'endpoint, aplatissement `attributeInfo`, contrôle
robots via protego. Remplacé : dates (timestamps → libellé), unités (supprimées
dans l'original → normalisées), flux highlight manquants, distinction prix
concurrent, régions, identifiants stables, pagination à 100.
