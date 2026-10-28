# Site public — passe « masterclass » (28.10.2026)

Captures avant/après dans ce dossier (`before-*.jpg` / `after-*.jpg`, mobile 375 px et desktop 1366 px, clair + sombre).
Mesures : build local de `web/` avec le flux réel, servi par `wrangler pages dev` (applique `_headers` / CSP), Lighthouse 13.6 (mobile = 4G simulée + CPU ×4).

## Lighthouse (mobile / desktop)

| Page | Avant perf · a11y · BP · SEO | Après perf · a11y · BP · SEO | LCP mobile avant → après | CLS | TBT mobile |
|---|---|---|---|---|---|
| Accueil | 81*/100 · 100 · 100 · 63 | 100/100 · 100 · 100 · 66 | 1,0 s → 1,0 s | 0 | 780* → 40 ms |
| Catégorie (Tech) | 100/100 · **98** · 100 · 66 | 100/100 · **100** · 100 · 66 | 0,9 s → 1,0 s | 0 | 10 → 50 ms |
| Page deal | 100/100 · 100 · 100 · 66 | 100/100 · 100 · 100 · 66 | 0,8 s → 0,8 s | 0 | 40 → 50 ms |

\* 1re mesure à froid ; deux nouvelles mesures de l'accueil « avant » donnent 40 ms de TBT (perf ≈ 100). Le gain de perf réel est donc faible : le site était déjà rapide (police système, aucune image, HTML statique).
SEO 63–66 : **seul** échec = `is-crawlable` (noindex voulu, `SITE_INDEXABLE` reste désactivé). Tout le reste passe.

Objectifs : LCP < 1,5 s en 4G mobile ✔ (0,8–1,0 s) · CLS ≈ 0 ✔ · WCAG AA ✔ (Lighthouse a11y 100 partout).

## Problèmes trouvés à l'audit

1. **Mobile : aucune carte deal visible au premier écran** — le hero (≈ 430 px) poussait la 1re carte à ~620 px.
2. **« Pourquoi c'est un bon deal » pas lisible d'un coup d'œil** : une note « 8.2 » sans échelle ni mot, l'économie en CHF et la fiabilité cachées derrière « Warum diese Note? ».
3. Puces de catégorie non collantes, sans catégorie active ni « Toutes ».
4. Page catégorie : titres `h1 → h3` (échec a11y `heading-order`).
5. Catégorie vide : simple phrase grise, aucune piste.
6. Page deal : pas de phrase d'économie, aucune suite (cul-de-sac), « Teilen » seul sur une ligne en mobile, pied de page qui flotte au milieu de l'écran sur les pages courtes.
7. ~50 liens de cartes préchargés (prefetch) dès qu'ils entrent à l'écran.
8. Pages légales : titres trop grands sur mobile.
9. Données structurées : `Offer` sans `availability`, pas de fil d'Ariane ni de liste.

## Ce qui a changé

**Cartes (commit 2)** — en haut : note + **verdict** (Top-Deal ≥ 8,5 · Sehr gut ≥ 7 · Gut ≥ 5,5 · Okay ≥ 4 · Schwach) + **barres de fiabilité** (hohe ≥ 0,85 · mittlere ≥ 0,7 · geringe). Sous le prix : **« Du sparst CHF 22.70 · vs. früherer Shop-Preis »**. Tout est dérivé des données ; « fiabilité élevée/moyenne » n'apparaît jamais sous le seuil des vitrines (0,7). Explication complète toujours à un tap (`<details>`, sans JS). Partage en icône (nom accessible conservé), titre limité à 3 lignes.

**Hero** — mobile ~40 % plus bas (accroche + montant + méta ; le texte long n'apparaît qu'à partir de 640 px) : la 1re carte est visible au premier écran. Desktop : **légende « So liest du die Note »** (7–10 / 4–6,9 / 0–3,9 / – = pas de référence vérifiable).

**Navigation** — puces de catégorie **collantes** sous l'en-tête, « Alle » + catégorie active (`aria-current`), fondu à droite pour signaler le défilement.

**Page catégorie** — en-tête de résultats « 90 Angebote · sortiert nach Note — nie nach Provision » (corrige l'ordre des titres), **état vide utile** (raison + liens vers les catégories non vides).

**Page deal** — verdict + « 8,2 von 10 » + fiabilité, phrase d'économie complète (« Du sparst CHF 22.70 — Vergleich: früherer Preis beim selben Shop. »), **3 deals similaires** de la même catégorie (mêmes règles que les vitrines : notés, fiabilité ≥ 0,7, ≤ 2 par shop), bouton + partage sur une ligne en mobile, pied de page toujours en bas.

**Perf** — `prefetch={false}` sur les liens de cartes ; le reste était déjà optimal (pas de police web ni d'image, CLS 0).

**SEO (sans indexer)** — `Product/Offer` + `availability`, `BreadcrumbList` (catégorie, deal), `ItemList` (catégorie, 20 premiers), `WebSite` (accueil), canonical de l'accueil. Image OG par ville inchangée. `noindex` inchangé.

**i18n** — toutes les nouvelles chaînes en DE/FR/EN (type `Dict` = complétude vérifiée par TypeScript + test dédié).

## Règles d'honnêteté (inchangées, tests verts)

Pas de fausse rareté, de minuterie ou de preuve sociale ; compte à rebours seulement pour une fin publiée ; vitrines = notés + fiabilité ≥ 0,7, ≤ 2 par marchand. Nouveaux tests : `scoreTier`, `confidenceTier`, `unitSaving` (jamais d'économie sans référence), complétude des libellés par langue.
Tests : `npm test` 46/46 · `tsc` OK · `pytest` 223/223. CSP / en-têtes : `_headers` intact, aucune erreur console sous CSP.

## Restes / pistes

- **Données** : la catégorie « Tech » contient des articles DayDeal non tech (casseroles, litière) car la famille `flash` y est rattachée — à corriger côté scanner (`lib/categories.ts` / classification), pas dans l'UI.
- Image OG par deal ou par catégorie (aujourd'hui une seule par ville).
- Avant d'indexer : logo raster pour `Organization`, puis `SITE_INDEXABLE=1` sur le domaine définitif seulement.
