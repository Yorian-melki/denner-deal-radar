# Critique, round 4 : backlog unique (29.10.2026)

Sources : 205 constats (apple-design, brand-type, ux-research, hsg-student, a11y, perf-eng, security, legal-ethics, value-strategist, i18n-content, research). Après dédoublonnage : 44 items.
Vérifié en direct le 29.10 : `curl -sI /de/deal/swisscom-blue-mobile-s-aktionspreis-ui09jp` renvoie 200, `cf-cache-status: HIT`, `age: 5911`. N1 n'est donc pas réglé. L'arbre de travail ne modifie que `docs/design/CRITIQUE_ROUND_3.md`, donc aucun travail N1 à N5 n'a été livré.

Personas (abréviations) : AD apple-design, BT brand-type, UX ux-research, ST hsg-student, A11 a11y, PE perf-eng, SEC security, LE legal-ethics, VS value-strategist, I18 i18n-content, RS research.

## Arbitrages du round 4 (la simplicité et l'honnêteté l'emportent)

1. **Accueil sans note ≥ 7 :** on remplace la vitrine vide par un bloc toujours rempli, « Grösste Rabatte – laut Händler ». Il est trié par % sous le prix barré, avec un libellé explicite. Le chemin ≥ 7 reste dans le code pour quand l'historique observé existera. Le bloc « Günstigster Grundpreis » (RS) est reporté au round suivant, car il faut au moins 2 magasins par famille.
2. **Pastille de note sur les cartes :** elle est masquée tant que la note est plafonnée (`scoreCap==='unchecked'`). La pastille « −50 % » neutre prend la place. Si une note est affichée, elle porte un « /10 » visible (A11).
3. **Couleur :** le vert est réservé à l'interactif (liens, CTA, focus). Le texte d'économie passe en `--fg` (AD, BT). La proposition RS « vert pour l'économie, liens en noir » est rejetée.
4. **Police :** on garde la pile système (PE : CLS 0, aucune requête). Une seule police est embarquée, uniquement pour les rendus OG et les icônes. La police de marque sur le web (BT) est reportée tant que le nom n'est pas fixé.
5. **Diversité des magasins :** le quota 1/3 par page est supprimé. On passe à un entrelacement glouton global : jamais 3 cartes du même magasin à la suite, jamais une carte non notée avant une carte notée. La règle est écrite dans la note de tri, générée depuis la constante.
6. **Alcool :** la famille ALCOHOL est exclue de l'accueil, de la vitrine et des « Mehr aus ». Les spiritueux sont retirés entièrement (AlkG art. 42b).
7. **Partage langue-neutre via Function (ST) et cookie de langue (PE) :** reportés. Ils ajoutent des Functions ou un cookie, ce qui contredit le round 3 et /datenschutz. On fait seulement le `no-cache` sur la redirection 302 de `/`.
8. **Owner-gated (ne pas faire) :** Impressum, activation de l'affiliation et des pubs, purge du feed, réglages du tableau de bord Cloudflare (purge du cache, WAF), PVR GitHub, rotation des tokens, protection de branche. Ces points vont dans la liste « en attente de Yorian » avec les URLs exactes.

---

## P0 : à livrer ce round

### 1. N1 : anciennes URLs deal servies depuis le cache (DoubleClick encore présent), et le lien EN mène à une 404
- **Problème :** les slugs du round 2 sont servis en HIT, `age` supérieur à 5 500 s, malgré `max-age=60`. La page Swisscom contient toujours `ad.doubleclick.net/ddm/trackclk/…`, et ses liens /fr et /en renvoient 404. Aucun registre de slugs n'existe. Le slug dépend du titre nettoyé, donc chaque nettoyage de titre (item 9) casse des liens partagés.
- **Preuve :** curl ci-dessus. Aussi `finish-…-u9ah2d` (HIT, âge 5 533 ; `/en/…` en 404) et `coca-cola-classic-1rnj95b` (HIT, âge 5 629). `web/public/_redirects` ne contient aucune règle deal. `web/lib/project.ts:38` calcule `slugify(title)+shortHash(stableKey)`.
- **Correctif :**
  1. Créer `data/slugs-history.json` sur gh-pages, en ajout seul, au format `{slug: {key: source+productId, cat, lastSeen}}`, conservé au moins 30 jours. L'initialiser depuis les sitemaps du round 2 dans l'historique git.
  2. Rendre les slugs immuables : `dealSlug` renvoie le slug déjà enregistré pour une clé connue. Le hash ne dépend jamais du texte du titre (vitest : renommer un titre garde le suffixe).
  3. Postbuild : pour chaque ancien slug absent de `out/`, écrire 3 lignes statiques `/<l>/deal/<old> /<l>/deal/<new> 301`. Si la clé ne correspond plus à aucun deal, pointer vers le tombstone, sinon vers `/<l>/st-gallen/<cat>`. Pas de placeholder `:lang` (limite de 100 règles dynamiques). Assertion : au plus 1 900 lignes statiques.
  4. `_headers`, bloc `/*/deal/*` sans chevauchement : `CDN-Cache-Control: no-store` et `Cache-Control: public, max-age=0, must-revalidate`.
  5. Tester d'abord **une seule** ligne sur le slug Swisscom. Si le HIT persiste, ajouter `functions/deal-legacy.ts`, routé uniquement sur la liste exacte des slugs morts (≤ 95 entrées dans `_routes.json` ; l'assertion de postbuild.mjs:127 est élargie à cette liste). Elle répond 301 avec `no-store`. Si cela ne suffit pas, inscrire la purge du cache sur la liste owner.
- **Acceptation :** `scripts/check-legacy.sh`, lancé en CI après le déploiement. 20 anciens slugs × 3 langues renvoient 301 sans `cf-cache-status: HIT`, et chaque `Location` répond 200. Aucune page servie ne contient `doubleclick`. Chaque `data-lang` et chaque `hreflang` de `out/` mène à un fichier ou à une règle existante.
- **Personas :** AD, UX, ST, PE, SEC, LE, VS, I18, RS.

### 2. Alcool en ouverture de l'accueil (DE, FR, EN), des « Mehr aus » et du haut de la liste Supermarkt ; spiritueux publiés en promotion
- **Problème :** les 3 premières cartes de l'accueil sont Due Lune (vin, CHF 73.20), Leopardo Spumante et Corona. La page Plenty (essuie-tout) propose du vin et de la bière dans « Mehr aus ». La première page de Supermarkt contient 7 alcools sur 12 cartes. QoQa met du vin en tête de Shopping. Gordon's Gin et Captain Morgan ont des pages promotionnelles. Le public comprend des mineurs (Kanti, « für Schüler »).
- **Preuve :** live `/de|fr|en/st-gallen`, `round3-after-home-mobile-light.jpg`, `/de/deal/plenty-haushaltpapier-fu1lgv`, `/de/deal/gordon-s-london-dry-gin-ovrnlh`. `lib/blocklist.ts:33` ne contient que SPIRITS (sans les marques).
- **Correctif :**
  1. Dans `lib/blocklist.ts`, ajouter `ALCOHOL` : vin, bière, mousseux, cidre, appellations DOC/DOCG/IGP/AOC, cépages, marques de bière Heineken, Corona, Feldschlösschen, Calanda, Eichhof. Ajouter aussi les URLs QoQa `/wine|/vin`. Exclusions : `alkoholfrei|sans alcool|0[.,]0 ?%|Ginger Beer|Weinessig|Essig`.
  2. Étendre `SPIRITS` aux marques (Bacardi, Smirnoff, Baileys, Malibu, Captain Morgan, Gordon's, Limoncello, Amaretto, Bourbon, Scotch, Pflümli, Alpenbitter, Breezer) et à `\d{2} ?% ?vol` ≥ 15.
  3. Dans `projectDeal`, poser `d.alcohol`. Les SPIRITS renvoient `null` : pas de page, pas de tombstone, et un 301 vers la catégorie via l'item 1.
  4. Exclure `d.alcohol` dans `balancedSections`, `pickShowcase`, le bloc de l'item 3 et `relatedDeals` (sauf si le deal courant est lui-même de l'alcool). Dans Supermarkt et Shopping, jamais en positions 1 à 6 de la page 1.
  5. Ajouter dans /transparenz « Was wir nicht zeigen » (3 langues) : « Alkohol nie auf der Startseite oder in Vorschlägen ; Spirituosen gar nicht ».
- **Acceptation :** vitest : 0 carte alcool dans les sections d'accueil, la vitrine et les related pour la fixture. Assertion postbuild : aucune correspondance ALCOHOL dans `.card-title` de `out/{de,fr,en}/st-gallen.html` ni dans `#more` d'un deal non alcoolisé. Aucune page `/deal/` ne correspond à SPIRITS.
- **Personas :** AD, BT, UX, ST, A11, LE, VS, I18, RS.

### 3. L'accueil ne montre aucune valeur évidente en 3 s : remplacer la vitrine vide par « Grösste Rabatte – laut Händler »
- **Problème :** `pickShowcase` exige une note ≥ 7, or le plafond est à 6.9. La vitrine est donc vide tous les jours (`select.ts:110-171`, `project.ts:73,322`). L'accueil se réduit à 3 listes de 3 cartes de même poids, et Tech, Handy et Haushalt n'y apparaissent jamais.
- **Preuve :** `CityDashboard.tsx:130` ne s'affiche jamais. Capture `round3-after-home-desktop-light.jpg`.
- **Correctif :** nouveau premier bloc, titre H2 en DE « Grösste Rabatte – laut Händler », FR « Plus fortes baisses – selon le commerçant », EN « Biggest markdowns – as stated by the retailer ».
  - Sous-ligne en 15 px, `--muted`, générée depuis les constantes : « Nach % unter dem Statt-Preis des Händlers – von uns nicht geprüft · ohne Alkohol · höchstens 1 pro Laden ».
  - Pool : `showsRef` avec `referenceType==='merchant_previous'` (ni UVP ni concurrent), `!alcohol`, `!upcoming`, quantité ou unité connue, sans condition de compte (item 25), `savingPct ≤ 70` sauf si un prix unitaire est connu, `confidence ≥ 0.7`.
  - Ordre : `savingPct` décroissant, puis économie unitaire, puis CHF. Au plus 1 carte par magasin et 1 par marque. 6 cartes, 3 sur mobile. Bloc masqué s'il y a moins de 3 cartes.
  - Desktop : grille de 3 colonnes au même format que les autres sections ; le poids vient de la position et du chiffre « −N % », pas d'une carte plus grande.
  - Le chemin « Am besten bewertet ≥ 7 » est conservé au-dessus, et s'affiche automatiquement dès qu'un deal `refObserved` existe.
  - Mettre à jour /transparenz#reihenfolge mot pour mot (supprimer le paragraphe « höchstens 6 Karten … ab 7.0 » tant qu'il ne peut pas s'afficher).
- **Acceptation :** vitest : le bloc n'est pas vide avec la fixture du jour, ne contient aucun alcool, au plus 1 carte par magasin et un `savingPct` non croissant. Live : à 375×812, la première carte de l'accueil affiche « −N % » au-dessus de la ligne de flottaison.
- **Personas :** AD, BT, UX, ST, LE, VS, RS.

### 4. Départage à 6.9 par CHF économisés : les cartons et les packs passent devant
- **Problème :** `project.ts:435` compare `score || savingChf`, donc un carton de vin à CHF 73 bat −50 % sur l'Evian. /transparenz annonce « dann nach Ersparnis in Franken ». `uscoring.py` ajoute aussi un bonus en CHF absolus (+0.3 ou +0.5).
- **Preuve :** ordre live de Supermarkt p.1 : Due Lune, Leopardo, Bellmount, Heineken 24×, Cailler 56× ; Evian et Capri-Sun (−50 %) tombent en p.2.
- **Correctif :** `compareDeals` devient `score → round(savingPct,0.5) → unitSaving → savingChf → title`. `unitSaving` vaut `(ref−price)/qté` en unité de base, ou −1 si la quantité est inconnue. Supprimer le bonus CHF absolu pour les biens non durables dans `uscoring.py`. Mettre à jour i18n `sortedByRef` et /transparenz dans les 3 langues : « dann nach Rabatt in Prozent, dann pro Grundeinheit ».
- **Acceptation :** fixture de neutralité : à note égale, −60 % à CHF 3 passe avant −50 % à CHF 70.
- **Personas :** AD, BT, UX, ST, LE, VS, RS.

### 5. Carte : la valeur est une phrase de 13 px dans le vert des liens, le % est absent, et la note 6.9 ne veut rien dire
- **Problème :**
  - `.card-save` utilise `--accent-strong`, qui est pourtant déclaré « UNIQUEMENT interactif » (globals.css:18, 227, 277).
  - « CHF 73.50 unter dem Statt-Preis von Denner » fait 43 caractères et nomme le magasin pour la deuxième fois.
  - Une pastille grise « 6.9 » sans « /10 » est identique sur 13 cartes. Elle peut se lire comme « CHF 6.90 » ou comme un degré d'alcool.
  - La phrase d'économie est en 13 px.
- **Preuve :** `round3-after-home-mobile-dark.jpg`. 6.9 apparaît 8 fois sur la p.1 Supermarkt (FR). `--t-footnote: 0.8125rem` (globals.css:42), utilisé par `.card-save`, `.was`, `.card-meta`, `.card-unit`, `.lead`, `.intro-facts`, `.section-note`.
- **Correctif :**
  - Ligne prix : « CHF » en 15 px `--muted`, montant en 28 px 700 `tabular-nums lining-nums`, puis une pastille neutre « −50 % » (15 px 600, `--fill` / `--fg`, `r-sm`).
  - Ligne 2 en 15 px muted : « statt 146.70 · laut Denner » (FR « au lieu de 146.70 · selon Denner », EN « was 146.70 · per Denner »).
  - Supprimer la phrase `savingLine` des cartes ; elle ne reste que sur la page deal.
  - `.badge` est masqué tant que `scoreCap==='unchecked'`. Sinon, afficher « 7.4<span class=badge-of>/10</span> ».
  - Ajouter le token `--t-callout: 0.9375rem/1.25rem` pour `.was`, `.card-meta`, `.card-unit`, `.lead`, `.intro-facts` et `.section-note`. Garder 13 px seulement pour le footer et les mentions légales.
  - Supprimer le double `font-variant-numeric` de `.badge` (globals.css:244).
  - Studis et Gratis utilisent le même emplacement pour la valeur.
- **Acceptation :**
  - 0 `.badge` sur /supermarkt-aktionen tant que `refObserved` vaut 0.
  - Chaque carte `showsRef` affiche « −N % ».
  - `tests/contrast.test.ts` vérifie qu'aucun texte non interactif n'utilise `--accent*`.
  - Un test CSS échoue si un sélecteur de carte ou `.lead` est sous 0.9375rem, ou si un sélecteur de montant CHF n'a pas `tabular-nums`.
- **Personas :** AD, BT, UX, ST, A11, LE, VS, RS.

### 6. Mobile : « Alle 702 → » orphelin, et deux rangées de chips qui commencent par « Alle »
- **Problème :** le premier H2 est en `.sr-mobile` (`CityDashboard.tsx:103`, `globals.css:89,208`), alors que la rangée occupe déjà sa hauteur. La page catégorie a deux rangées « Alle | … » qui mènent à des endroits différents. Le chip actif touche le bord de l'écran.
- **Preuve :** `round3-after-home-mobile-light.jpg`, `round3-after-category-mobile-dark.jpg`, live `/fr/st-gallen/supermarkt-aktionen`.
- **Correctif :**
  - Supprimer `srOnlyMobile` et la règle `:has`. Le H2 s'affiche à `--t-headline`, sur la même ligne que le lien. Texte SR du lien : « Alle 702 Supermarkt-Aktionen » / « Les 702 actions de supermarché » / « All 702 grocery deals ».
  - Sur les pages catégorie, retirer « Alle » de la rangée des catégories. La rangée des magasins commence par « Alle Läden / Tous les magasins / All stores » (clé `allStores`).
  - Ajouter `.chips{scroll-padding-inline:var(--gutter)}` et utiliser `scrollIntoView({inline:'nearest'})` dans site.js.
- **Acceptation :** à 375 px, aucun lien de section n'apparaît sans H2 visible. Aucun lien n'a le nom accessible « Alle » seul. Le premier `.price` reste à 400 px ou moins.
- **Personas :** AD, BT, UX, ST, A11, VS, I18, RS.

### 7. Cartes expirées à 0.45 d'opacité : contraste de 2.0 à 2.85:1
- **Problème :** `.card[data-gone]{opacity:.45}` (globals.css:214) ne respecte pas WCAG 1.4.3. Cet état est fréquent avec le cache.
- **Preuve :** calcul : titre à 2.85:1, texte muted à 2.0:1, muted en sombre à 2.43:1.
- **Correctif :** supprimer l'opacité. Le prix passe en `--muted` barré. Ajouter une pastille `.gone-tag` (`--fill` / `--fg`) « abgelaufen / terminée / ended ». Même traitement pour `.deal[data-gone] .deal-price`.
- **Acceptation :** les paires de l'état expiré sont ajoutées à `contrast.test.ts`, à 4.5:1 ou plus dans les deux thèmes.
- **Personas :** A11.

---

## P1

### 8. « Mehr aus Studis » et « Mehr aus Events » sont vides sur toutes les pages
- **Problème / preuve :** `select.ts:208` filtre avec `promoKey(x) !== pk`. Pour un deal sans prix, `undefined !== undefined` vaut faux, donc tous les candidats sont rejetés. Pages concernées : `/de/deal/chani-…-42ncez`, `ray-ban-25-rabatt-7my0d0`, `zuckerbecker-ch-1s1wbma`.
- **Correctif :** `(pk === undefined || promoKey(x) !== pk)`.
- **Acceptation :** vitest : 3 related pour un deal Studis sans prix. Assertion postbuild : aucune section `#more` avec 0 carte quand le total de la catégorie dépasse 1.
- **Personas :** ST.

### 9. Marketing et casse cassée dans les titres
- **Problème :** il reste des formulations commerciales et une casse erronée après apostrophe.
  - Marketing : « Exklusiv – », « QoQa-Exklusiv: », « zu Toppreisen », « - Aktionspreis », « / Schnäppchen », « SmartStudents! », « bei Fust in Aktion », « Spare viel bei », et « gratis » en fin de titre à côté du prix « Gratis ».
  - Casse : « Gordon'S », « Fisher’S ».
  - Métadonnées collées au titre : « (metacritic User-Score: 7.0) ».
- **Preuve :** crawl de 733 cartes (RS). `/de/deal/exklusiv-chf-10-20-oder-30-rabatt-17cmown`. `project.ts:120` (SHOUT).
- **Correctif :** **après** l'item 1 (slugs immuables). Dans `cleanTitle` :
  - `/(^|[:–-]\s*)(?:\p{L}+-)?EXKLUSIV(?:DEAL)?\b[:!–-]?\s*/iu`
  - `/\s*[-–]\s*(Aktionspreis|Prix promo)$/i`
  - `/\s*\/\s*Schn(ä|a)ppchen\b/i`
  - `/\s+zu Toppreisen\b/i`
  - `/\s+(?:bei \S+\s+)?in Aktion$/i`
  - `!+$` (hors titres entre guillemets)
  - `\s+(gratis|kostenlos)$` quand `free`
  - SHOUT : `/(?<![\p{L}\p{N}])(\p{Lu}{4,}(?:['’]\p{Lu}{1,2})?)(?![\p{L}\p{N}])/gu`, puis minuscule après l'apostrophe.

  Déplacer Metacritic et les mentions « Downloadcode » dans un champ `facts`. Typographie : `'` entre lettres devient `’`, `(\d)(ml|cl|g|kg)` devient `$1 $2`, ` - ` devient ` – `, `...` devient `…`.
- **Acceptation :** vitest sur les 8 chaînes live et sur GORDON'S et FISHER’S. Le 95e centile de longueur des titres nettoyés est de 70 caractères ou moins. `audit-vibe` échoue si un H1 contient l'un des jetons interdits.
- **Personas :** AD, UX, ST, LE, VS, I18, RS, A11.

### 10. Les titres FR et EN des premières cartes sont en allemand
- **Problème / preuve :** « Chani: 12 Monate mit 50% Rabatt… » est la carte 1 de Studis sur /fr et /en. « Sweat: 30% Studentenrabatt », « Harry Potter … (Hörbuch, Band 1) gratis », « 10 % cashback chez … (campagne) » apparaît sur DE, et « On: … Trainer für Schüler » est un contresens. `STUDENT_TITLE` (`project.ts:191`) est trop étroit.
- **Correctif :**
  - Ajouter des gabarits pour « N Monate mit X% Rabatt », « X% Studentenrabatt auf … », « X% Student Discount on … » et cashback, générés depuis les champs structurés.
  - Glossaire : trainers → Sneaker / baskets / sneakers ; « Mit 12 Monate » → « 12 Monate lang ».
  - Repli : « {brand} – réduction étudiante » ; le titre d'origine est conservé en `lang` sur la page deal.
  - Accueil et vitrine : préférer les cartes dont le titre est dans la langue de la page (tri stable).
  - Le `lang` est porté par le `h3` et l'attribut `title` est supprimé.
- **Acceptation :** gate postbuild : 0 carte en langue étrangère parmi les 3 premières de `/fr|en/st-gallen` et des pages Studis.
- **Personas :** AD, UX, ST, A11, VS, I18, RS.

### 11. Les doublons ne sont pas fusionnés, alors que /transparenz promet « zählt einmal »
- **Problème / preuve :** MacBook Pro 16" ×8, iPad 8 ×9, iPad 10 ×4, Quickline sur 3 pages, spusu ×2, ThinkPad X13 ×2, Heineken ×2. `promoKey` inclut le prix, et `dedupeProducts` n'est appliqué que dans `pickTop`.
- **Correctif :** extraire l'état Revendo (« Wie neu/Sehr gut/Gut/Gebraucht ») dans `condition`. La clé de dédoublonnage est le titre normalisé (sans « Outlet - », sans le suffixe « / … » ni la couleur) plus le magasin. Appliquer dans `canonical()` avant la pagination. La carte affiche « 3 Angebote ab CHF 296 · Zustand: wie neu – gut », et les variantes sont listées sur la page deal. Les compteurs comptent les groupes.
- **Acceptation :** assertion postbuild : aucun couple titre + magasin identique dans une même catégorie, toutes pages confondues.
- **Personas :** UX, ST, LE, VS, I18, RS.

### 12. « Händler unbekannt » alors que le magasin figure dans le titre, et noms dédoublés
- **Problème / preuve :** 44 cartes concernées : IndieGala, Wingo, HP, Post, « bei fnac », PeachStore, Quickline. Le même magasin apparaît sous « Epic Games » et sous « Epic Games Store ». L'italique de `.seller-unknown` (globals.css:239) passe pour un bug d'affichage.
- **Correctif :** dans `lib/merchant.ts` :
  - table des magasins entre parenthèses : IndieGala, GOG, Steam, Epic, Prime Gaming, Ubisoft, Fanatical ;
  - motifs `bei X` et `im XStore` ;
  - marques en tête de titre : HP → HP Store, Wingo, Quickline, yallo, SBB, Post → Die Post ;
  - alias Epic Games Store → Epic Games ;
  - sinon, l'hôte sortant s'il n'est pas un agrégateur.

  Ne jamais afficher « Händler unbekannt » : afficher seulement « via GamerPower ». Supprimer l'italique.
- **Acceptation :** le build échoue si la part de cartes sans magasin dépasse 2 %. 0 occurrence de « unbekannt / inconnu / unknown seller » dans `out/`.
- **Personas :** AD, BT, UX, ST, LE, VS, I18, RS.

### 13. La note de tri ne décrit pas l'ordre réel (entrelacement et pagination)
- **Problème / preuve :** on lit « par note », mais l'ordre affiché est 6.9, 6.9, 6.6, 6.9… La p.1 se termine sur des cartes sans note, et la p.2 s'ouvre sur des 6.9. Les p.2, 3, 6 et 8 ont des séries de 6 Volg ou Aldi consécutifs, alors que /transparenz dit « nie drei hintereinander ». Cause : `interleave()` dans `CategoryListing.tsx:20-48`.
- **Correctif :** entrelacement glouton sur la liste triée globale (arbitrage 5). Il s'applique aussi à `neutralOrder` (Gratis). Pas d'entrelacement sur les pages filtrées par magasin. Note de tri générée depuis la constante : « …; nie 3 Karten desselben Ladens hintereinander – nie nach Provision ».
- **Acceptation :** `scripts/audit-claims.mjs` en postbuild : séries d'au plus 2, aucune carte non notée avant une carte notée, et la note contient la valeur de la constante.
- **Personas :** UX, ST, LE, VS.

### 14. Gratis : services, villes hors St-Gall, ordre spam, contenu adulte, valeur cachée
- **Problème / preuve :** sur `/de/st-gallen/gratis` :
  - les positions 1 à 4 viennent toutes d'itch.io ;
  - n°5 « Pakete abholen lassen » est un service ;
  - n°6 « Begleiterin für eine Nacht » ;
  - Freibad Bern et Baden en octobre, Auto Zürich ;
  - un seul objet affiche sa valeur (CHF 25.49) ;
  - « jetzt Gratis / maintenant Gratuit » ;
  - Audible n'affiche pas « Konto nötig » ;
  - la note de tri commence par une minuscule et parle de pourcentages qui ne sont pas affichés.
- **Correctif :**
  - Exclure les services avec `SERVICE_NOT_ITEM` (`abholen lassen|Lieferung|WiFi|WLAN`).
  - `inCity` : une autre ville citée dans le titre retire le deal de St-Gall.
  - Saison : les Freibad sont masqués du 15.09 au 15.05.
  - `isAdult` étendu à Erotik, Dark Romance et « für eine Nacht ».
  - Capter le champ GamerPower `worth` → « sonst CHF 25.49 laut Epic ».
  - Ordre : valeur décroissante, puis date de fin, puis nouveauté ; au plus 2 itch.io en p.1.
  - Prix affiché simplement « Gratis / Gratuit / Free ».
  - `requiresAccount` pour Audible, Steam, Epic, GOG, Ubisoft, Kindle.
  - « ab heute » quand la date est aujourd'hui.
  - Note de tri : « Nach Wert laut Anbieter, dann Enddatum ».
  - Supprimer l'Offer JSON-LD pour les services.
- **Acceptation :** `audit-claims` : aucun service, aucune autre ville et au plus 2 itch.io en p.1 de Gratis. Chaque carte Gratis a un magasin connu.
- **Personas :** AD, UX, ST, A11, LE, VS, RS.

### 15. Tech, Shopping, Haushalt : un catalogue de prix sans référence, avec des non-offres mélangées
- **Problème / preuve :** 0 référence sur 24 cartes en p.1 de Tech. « Letzte ‘erschwingliche’ 4K Gaming-PCs? » est un article. « HP Herbst Sale » n'a pas de prix. Les rangées sont désalignées (`round3-after-category-desktop-light.jpg`). Des prix sont collés au titre (« von 899.– Franken »).
- **Correctif :**
  1. Extraire `für CHF x`, `[CHF x …]`, `(statt CHF x)` et `Nächstbester Preis CHF x bei Y` en `ref` de type `curator`. Afficher en texte seulement : « laut Preispirat: sonst CHF 799 ». Pas de %, pas de note, jamais à l'accueil.
  2. Exiger `price ∨ discountPct ∨ free`. Les autres vont dans un `<details>` final « Ohne Preisangabe (n) ».
  3. Ligne de prix à hauteur fixe sur `.card`, avec `grid-template-rows:auto 1fr auto`.
  4. Note de tri : « Neueste zuerst – Preise ohne geprüften Vergleich ».
  5. La ligne « Vergleichsbasis » affiche « keine » quand il n'y a pas de référence.
- **Acceptation :** aucune carte sans prix dans la grille. Toutes les rangées sont alignées à 1366 px et à 375 px.
- **Personas :** AD, BT, UX, ST, VS, RS.

### 16. Mobile : environ 2.5 deals par écran, une carte d'environ 185 pt
- **Problème / preuve :** `round3-after-home-mobile-light.jpg`. La 3e carte se termine à 750 pt.
- **Correctif :** sous 640 px, liste en rangées dans un groupe inset (r-lg) avec des séparateurs fins. À gauche : titre sur 2 lignes (16 px 500), magasin · date (15 px muted). À droite : prix (22 px 700) et pastille « −N % ». Hauteur de rangée de 96 pt au plus. Les cartes restent à partir de 640 px.
- **Acceptation :** au moins 5 deals dans le premier écran à 375×812, CLS 0.
- **Personas :** AD, RS.

### 17. Copie du pied de page et divulgation : « Provision » affiché avec 0 programme, et trois termes FR différents
- **Problème / preuve :** le pied de page dit « Wir erhalten ggf. eine Provision » / « at no extra cost to you » de façon inconditionnelle (i18n.ts:193, 636), alors que 0 programme est actif. En FR on trouve « lien commercial », « lien publicitaire (affilié) » et « liens commerciaux » (transparenz/page.tsx:118, i18n.ts:386).
- **Correctif :** la copie dépend du compteur. Avec 0 programme : « Keine Werbelinks, keine bezahlten Platzierungen. Ändert sich das, steht es hier und an jedem betroffenen Link. » (FR et EN équivalents), et la note de tri ne mentionne plus « Provision ». Avec plus de 0 : « Werbelinks sind im Button als «Werbelink» beschriftet … Die Reihenfolge hängt nie davon ab. » « Dein Preis ändert sich nicht » n'apparaît que si `verifiedNoPriceImpact`. FR : uniquement « lien publicitaire (affilié) ».
- **Acceptation :** vitest : 0 « lien commercial ». Le pied de page change avec le compteur. Tout `rel~=sponsored` contient le libellé visible.
- **Personas :** ST, VS, RS.

### 18. Garantie de neutralité testée : l'affiliation sans aucune influence sur l'ordre
- **Problème / preuve :** `tests/neutrality.test.ts` ne couvre pas l'ordre des catégories, l'entrelacement, « Mehr aus », `alsoAt` ni `dedupeProducts`. Rien n'empêche aujourd'hui une pub dans `DealGrid`.
- **Correctif :** test qui mélange `affiliate` et `programme` et vérifie que les listes d'ids sont identiques pour toutes les catégories, pages, related et winners. Lint : aucun import de `lib/affiliate/*` depuis `select`, `project` ou `categories`. Postbuild : aucun `.ad` dans `ul.deal-grid` ni avant la première carte ; au plus 1 `.ad` par page ; 0 sur `/*/deal/*`.
- **Acceptation :** tests verts. Ils échouent si on injecte un tri par `affiliate`.
- **Personas :** LE, VS.

### 19. Hôtes sortants non contrôlés : URL avec userinfo ou port acceptée, libellé du CTA pris au feed
- **Problème / preuve :** `lib/outbound.ts:57-85` accepte `https://www.denner.ch@evil.example:8443/x`. 39 hôtes CTA, dont gutscheine.20min.ch (38) et secretflying (8). Le CTA dit « bei Bruno Wickart » alors que le lien mène à un portail de coupons. L'indication « öffnet … » n'existe qu'en sr-only (`deal/[slug]/page.tsx:264,272`).
- **Correctif :**
  - `cleanOutbound` renvoie `null` si l'URL contient username ou password, un port autre que 443, une IP littérale, ou un `xn--` non listé.
  - Créer `config/outbound-hosts.json` avec un rôle par hôte : merchant, aggregator ou affiliate-portal. Le postbuild échoue sur tout hôte inconnu et liste les comptes par hôte.
  - `via` est calculé depuis l'hôte final : si celui-ci n'est pas un domaine du magasin, afficher « Zum Angebot bei X · über host », et rendre « öffnet host » visible.
  - Secret Flying est traité comme une source, jamais comme un Händler.
- **Acceptation :** vitest sur les cas userinfo, port 8443, IP littérale et punycode. Le build échoue sur un hôte inconnu.
- **Personas :** SEC, LE, RS, ST.

### 20. La CI des PR ne construit jamais le site (Dependabot TypeScript 7 #10, @types/node 26 #6)
- **Problème / preuve :** `tests.yml`, déclenché sur pull_request, ne lance que pytest. `web.yml` ne tourne que sur push et sur le cron, puis déploie. `dependabot.yml` n'a aucune règle `ignore`.
- **Correctif :** ajouter à `tests.yml` un job `web` (chemins `web/**` et `.github/**`, `permissions: contents: read`, sans secrets) : `npm ci --ignore-scripts && npm test && npx tsc --noEmit && DATA_FIXTURE=1 NEXT_BUILD_CPUS=2 npm run build && node scripts/audit-vibe.mjs out`. Dans `dependabot.yml`, ignorer les montées semver-major de typescript, next et @types/node, et grouper les minor et patch. Fermer #10 avec la raison.
- **Acceptation :** une PR qui casse `tsc` est rouge. #10 est fermée. La protection de branche (check requis) est owner-gated et va sur la liste.
- **Personas :** PE, SEC, UX, VS, RS.

### 21. Le token Cloudflare se trouve dans le job qui exécute `npm ci` et `next build`
- **Problème / preuve :** `web.yml` enchaîne install, build, puis `npx wrangler` (qui résout le binaire dans `node_modules`) avec `CLOUDFLARE_API_TOKEN`. `nametest.yml` partage le même secret.
- **Correctif :** 2 jobs. `build` : sans secret, `--ignore-scripts`, upload de l'artefact. `deploy` : `needs: build`, `environment: production`, `npm i --no-save --ignore-scripts wrangler@4.154.0` dans un dossier vide. Scan : `permissions: contents: read` au niveau du workflow ; `pages` et `id-token` seulement pour le deploy. Requirements avec `--require-hashes`. Les tokens séparés par projet et leur rotation sont owner-gated.
- **Acceptation :** le job qui exécute le code des dépendances n'a accès à aucun secret.
- **Personas :** SEC.

### 22. /datenschutz inexacte : compteur décrit comme actif, « rien n'est stocké », intermédiaires omis
- **Problème / preuve :** §3 dit « Speicherdauer: höchstens 3 Monate » alors que CLICKS n'est pas lié (POST renvoie 405). §4 dit « In deinem Browser wird nichts gespeichert », alors que site.js utilise `localStorage` pour le choix pub. Les portails (studentbeans, gamerpower, preispirat, 20min) ne sont pas mentionnés.
- **Correctif :** §3 conditionné à `CLICKS_BINDING==='1'`, sinon « Derzeit nicht aktiv. » / « Actuellement inactif : nous ne comptons aucun clic. » / « Currently inactive. ». §4 : « Wir setzen keine Cookies. Nur wenn du eine Werbe-Einwilligung gibst oder ablehnst, speichert dein Browser diese Wahl lokal (13 Monate). ». Nouveau §5b sur les sites intermédiaires. Incrémenter `LEGAL_REVISION`. FR : espaces fines insécables, suppression du double espace (ligne 58), « art. 6, al. 1, let. f RGPD ».
- **Acceptation :** vitest : le texte suit le flag. Gate : pas de « ` :` » (espace normal avant deux-points) ni d'espace double dans `out/fr`.
- **Personas :** UX, ST, LE, I18, RS, SEC, VS.

### 23. Glossaire et ponctuation incohérents (Anbieter/Händler, vendeur/commerçant, seller/retailer, « : » codé en dur, élision)
- **Problème / preuve :**
  - Sur une même page : « laut Händler » et « Seite des Anbieters ».
  - EN : « Go to offer » et « View offer ».
  - Majuscule fautive « ; Massgebend » (i18n.ts:171, 395, 615).
  - « : » codé en dur en 9 endroits : `CategoryListing.tsx:111,173,189`, `deal/[slug]/page.tsx:108,150,232`, `CityDashboard.tsx:145`, `SiteChrome.tsx:35`, `project.ts:157`.
  - « prix barré de Aldi » au lieu de « d'Aldi ».
  - « Retour à Supermarché » et « Tout Étudiants (60) ».
  - « Warum keine Bewertung » apparaît deux fois.
- **Correctif :**
  - Glossaire. DE : Händler (commerce), Anbieter (services et abonnements uniquement). FR : commerçant / prestataire. EN : retailer / provider. EN : « View offer at {m} ».
  - Construire les descriptions comme un tableau de phrases complètes.
  - Utiliser `colon(label, locale)` partout. Le lien retour devient « Zurück zu Supermarkt » sans deux-points.
  - Helper `deFr()` pour l'élision.
  - `allInCat` → `seeAll(n)`.
  - Une seule raison « pas de note », et le `<summary>` devient « Details ».
  - Notes de tri avec majuscule initiale.
  - FR : « Abos mobiles », « Offres 1–24 sur 51 » hors Supermarkt.
  - « Diese Woche im Supermarkt » → « Aktuell im Supermarkt ».
- **Acceptation :** vitest sur les synonymes interdits, sur `/[.;] [a-zäöü]/` dans les descriptions, et sur `savingLine('Aldi')` qui doit contenir « d’Aldi ». Gate FR : aucun `[^  ]:` dans les nœuds texte.
- **Personas :** AD, UX, ST, A11, VS, I18, RS.

### 24. Handy-Abos : comparaison de produits non équivalents, total sur 24 mois supposé, « bis heute » qui glisse
- **Problème / preuve :**
  - Fibre et câble mélangés au mobile.
  - Aucun GB, aucun réseau, aucun roaming.
  - `subscription()` met `promoMonths ?? 24`, d'où GoMo à 9.95 × 24, alors que la durée de la promo est inconnue.
  - Salt Start Max affichait « bis 19.10. » et affiche maintenant « bis heute » (fausse urgence, données universal.json du 14.10).
  - spusu apparaît 2 fois.
- **Correctif :**
  - Reclasser `glasfaser|fiber|cable|home` dans une puce « Internet zu Hause ».
  - Parser `data_gb|unlimitiert`, le réseau et `eu_roaming`, avec la méta « unlimitiert · Swisscom-Netz · EU 5 GB », sinon « Datenvolumen: siehe Anbieter », trié en fin de liste.
  - Promo à vie seulement si le texte contient `lebenslang|dauerhaft|à vie`. Sinon `total24` est indéfini : afficher « Dauer des Aktionspreises unbekannt » et trier après.
  - Poser `endsRolling` quand l'historique `ends_at` a été prolongé ; aucune date ni « bis heute » dans ce cas.
  - Note de tri : « Nach Gesamtkosten über 24 Monate – Leistungen unterscheiden sich ».
- **Acceptation :** vitest sur la fixture GoMo (pas de total) et sur 2 snapshots prolongés (pas de date).
- **Personas :** LE, VS, UX, RS.

### 25. Prix Lidl Plus (via app) classés comme des prix normaux ; deals notés sans quantité connue
- **Problème / preuve :** « Milbona Edamer 5.3 … nur mit Lidl Plus », où la condition apparaît en dernier, en 13 px. Mövenpick Kaffee 5.1 et 3BEARS 5.4 sont notés avec « Menge: siehe Händler ».
- **Correctif :** si la condition correspond à `Lidl Plus|Cumulus|Supercard|App-Preis`, le libellé de prix devient « Lidl Plus-Preis », `requiresAccount` est posé, le deal est exclu de l'accueil et trié après à note égale. En épicerie sans quantité ni unité : `score = undefined`, pas d'accueil ni de pastille, et « Menge: siehe Händler » est supprimé. Règle ajoutée dans /transparenz.
- **Acceptation :** vitest sur ces deux cas.
- **Personas :** LE.

### 26. Épicerie : taille du lot absente (carton de 6 × 75 cl), couverture d'unité à 77 %
- **Problème / preuve :** Due Lune affiche « CHF 73.20 · 16.27/l » sans « 6 × 75 cl ». « Flasche: 12.20 statt 24.45 » n'existe qu'en DE. La page deal Finish n'indique pas le nombre de pastilles.
- **Correctif :**
  - Parser `per_unit` dans `conditions.ts` en 3 langues.
  - Déduire la quantité de `price / unitPrice` quand elle tombe à ±2 % d'un format courant (n × 75/70/50/33 cl, nombre de pièces).
  - Ligne 2 de la carte : « 6 × 75 cl · CHF 16.27/l ». Même ligne sur la page deal.
  - Parser `NxM g|ml|cl` pour Volg et Aldi.
- **Acceptation :** métrique postbuild `qtyCoverage` d'au moins 0.80 en Supermarkt, sinon échec.
- **Personas :** UX, A11, VS, RS.

### 27. Page deal : le tableau de méthode écrase le produit, et « ungenügend » s'affiche sur les catégories jamais notées
- **Problème / preuve :** un panneau de 460 px (`round3-after-deal-desktop-light.jpg`). Le magasin est nommé 4 fois. Sur Grabenhalle, Chani et les autres catégories jamais notées : « Wie sicher sind die Daten? ungenügend », ce qui équivaut à la note d'échec en Suisse. CTA « Zum Angebot » pour un concert.
- **Correctif :**
  - Ordre : H1 avec la quantité, puis magasin · fin, puis bloc d'achat (prix 48 px ; « statt 27.35 · −56 % » ; « Statt-Preis laut Denner · bis Mi 4.11. » en muted ; CTA), puis une ligne de note, puis `<details>` « Wie wir bewerten » fermé par défaut.
  - Catégories jamais notées : panneau supprimé, remplacé par une ligne de source.
  - Niveaux de fiabilité : « eigene Beobachtung / Händlerangabe / nicht geprüft ». Jamais « ungenügend ».
  - CTA « Zum Event bei … » pour les événements.
- **Acceptation :** 0 « ungenügend » ou « insuffisant » dans `out/`. À 375 px, le CTA apparaît dans le premier écran.
- **Personas :** AD, BT, ST, RS.

### 28. Budget de fichiers saturé : 1 500 tombstones (le plafond), donc 404 sur des deals expirés depuis moins de 30 jours
- **Problème / preuve :** `lib/data.ts:16,91`. `out/` contient 12 049 fichiers ; la limite Cloudflare est de 20 000. Une 2e ville casserait le build.
- **Correctif :** remplacer les tombstones HTML par `/s/expired.<hash>.json` (environ 45 KB en brotli). La 404 par langue fait le rendu côté client (titre « abgelaufen am … », 3 deals de la même catégorie, liens de langue), avec statut 404 et noindex. Budget postbuild : échec au-delà de 15 000 fichiers.
- **Acceptation :** environ 4 500 fichiers de moins. Un slug expiré depuis 20 jours affiche le tombstone en DE, FR et EN.
- **Personas :** PE.

### 29. Lien de langue des 404 imbriquées et 404 globale
- **Problème / preuve :**
  - `/de/…/supermarkt-aktionen/denner/99` mène en FR vers `/fr/…/supermarkt-aktionen` au lieu de `…/denner`.
  - La 404 globale empile 3 H1.
  - La copie dit « werden automatisch entfernt », ce qui contredit les tombstones.
  - `/404` répond 200.
- **Correctif :**
  - Dans `NotFoundBody`, remonter le chemin segment par segment pour trouver l'ancêtre existant le plus profond (`routes.json` prébâti).
  - 404 globale : un seul H1 et une ligne « Deutsch · Français · English ».
  - Copie : « Diese Adresse gibt es nicht. Abgelaufene Aktionen bleiben {TOMBSTONE_DAYS} Tage als «abgelaufen» sichtbar. » (FR et EN).
  - Ajouter `/404 /de/st-gallen 301`.
- **Acceptation :** smoke test sur 3 cas imbriqués. `/404` ne répond plus 200.
- **Personas :** AD, UX, I18, RS, SEC.

### 30. Partage : OG générique avec double espace, OG des deals identique à celui de la ville, graisse 400 sur les icônes
- **Problème / preuve :** `/de/st-gallen/og.png` affiche « Aktionen␣␣in » (`letterSpacing:-2.4` dans `og.png/route.tsx:44`). Les deals réutilisent l'OG de la ville. og:title et twitter:title diffèrent. next/og rend en 400 alors que 700 est demandé.
- **Correctif :** embarquer une police (TTF 700, sous-ensemble latin) dans `assets/fonts` pour `ImageResponse` uniquement. Pour le titre : `letterSpacing:0` et `whiteSpace:'nowrap'`. Sous-titre : la ligne de valeur, pas un nombre de deals. og:title = twitter:title. Les OG propres à chaque deal sont reportés (environ 48 MB : vérifier `df -h` d'abord).
- **Acceptation :** comparaison de pixels : l'espace inter-mots est inférieur à 0.45 em. Les PNG sont en graisse 700.
- **Personas :** BT, ST, RS, AD.

### 31. Reisen : articles de presse et accroches anglaises Secret Flying mélangés aux deals
- **Problème / preuve :** « Die schönsten Bibliotheken weltweit » (sans prix). 8 cartes « European cities to … from only €161 ».
- **Correctif :** exiger un prix. Garder Secret Flying uniquement au départ de ZRH, BSL, GVA ou de la Suisse. Gabarit de titre « Zürich → Phuket retour · ab € 485 » en 3 langues ; supprimer « only ».
- **Acceptation :** 0 carte Reisen sans prix et 0 titre anglais sur DE.
- **Personas :** ST.

---

## P2

### 32. Manifest DE pour toutes les langues ; pages magasin absentes du sitemap ; lastmod identiques
- **Correctif :** créer `/<l>/manifest.webmanifest` (start_url `/<l>/st-gallen`, description traduite), lié depuis chaque layout. `sitemap.ts` : ajouter les 5 magasins × 3 langues avec hreflang, un lastmod par deal, et exclure les tombstones. Masquer « häufigste Händler » sur les pages magasin et le réduire à « 75 Angebote · Stand … ». Supprimer le `line-clamp` de `.lead` sur mobile.
- **Acceptation :** `grep -c supermarkt-aktionen/denner sitemap.xml` vaut au moins 3. start_url FR = `/fr/st-gallen`.
- **Personas :** AD, UX, PE, VS, I18, RS.

### 32b. Performance : prefetch, Early Hints, budgets du round 3 (item 39)
- **Correctif :**
  - Ajouter `public/speculation-rules.json` (prefetch modéré sur le même domaine sauf `/api`, prerender conservateur sur `.card-link` et `.pager a[rel=next]`) et le header `Speculation-Rules` sur `/de|fr|en/*`.
  - Ajouter `Link: rel=preload` du CSS dans `_headers` via le postbuild.
  - Budgets bloquants : HTML brut ≤ 40 KB pour tous les types de page, CSS ≤ 6 KB en brotli, JS ≤ 3.3 KB en brotli. Pour tenir le JS, extraire le bloc consentement de site.js dans `consent.<hash>.js`.
  - Garde-fous : pas de `@font-face` dans le CSS web, pas de `backdrop-filter`, au plus 800 éléments par liste.
  - Conserver les assets hachés des 3 derniers builds.
- **Acceptation :** le postbuild échoue au-delà des budgets. DevTools « Speculative loads » liste les règles.
- **Personas :** PE, RS.

### 33. Rétention honnête : marqueur « neu », flux RSS, recherche, pagination numérotée (item 35)
- **Correctif :**
  - Pastille « neu seit Mo » quand `firstSeenAt` date de moins de 48 h. `lastVisit` en localStorage, dans un try/catch, avec mention dans /datenschutz.
  - `/<l>/st-gallen/<cat>/feed.xml` (top 50 selon le même comparateur, sans alcool).
  - Index de recherche statique d'au plus 35 KB en brotli, chargé au focus, avec une `<form>` de repli.
  - Pagination « 1 2 3 … 30 ».
- **Acceptation :** les flux sont valides. La recherche « Kaffee » trouve les deals Kaffee. Aucun compteur ni urgence.
- **Personas :** UX, VS, RS.

### 34. Puces : « Mehr » s'ouvre hors écran, état actif peu lisible, contour gris partout
- **Correctif :** puces inactives : fond `--fill`, sans bordure. Puce active : fond `--fg`, texte `--bg`. Supprimer le `<details>` « Mehr » et passer à une rangée qui passe à la ligne (2 rangées au maximum sur mobile). Masque des deux côtés seulement quand `scrollLeft > 0`.
- **Acceptation :** contraste de l'état actif d'au moins 3:1. Toutes les catégories sont atteignables sans défilement caché.
- **Personas :** AD, A11.

### 35. Accessibilité : nom des liens de carte, unités et dates lues, en-tête de hauteur fixe, cibles tactiles
- **Correctif :**
  - `aria-describedby` de `.card-link` vers les ids du prix, de l'économie et de la méta.
  - « /l » en `aria-hidden`, avec en sr-only « pro Liter / par litre / per litre ». Dates : variante parlée « bis Mittwoch, 4. November ».
  - `.top-inner{min-height}` au lieu de `height`.
  - `.foot-nav a` à 44 px sur toutes les largeurs. Sous 360 px, aucun chevauchement des zones de tap des liens de langue.
  - Statut de partage : vider puis réécrire, et effacer après 4 s.
  - Thème clair : `--muted:#4a4a4f` et `--link:#065f3e` (AAA).
- **Acceptation :** VoiceOver lit le prix sur la carte. `contrast.test.ts` vérifie les seuils AAA du texte.
- **Personas :** A11.

### 36. /transparenz : niveau de lecture B1, paliers impossibles, « Datenqualität 70 % » trompeuse
- **Correctif :** encadré « Kurz gesagt » de 5 puces de 15 mots au plus. Les règles longues passent sous `<details>`. Le tableau des paliers ne garde que ceux qui peuvent s'afficher. Remplacer « Datenqualität ≥ 70 % » par « Art des Vergleichspreises: früherer Preis des Händlers (keine Prüfung durch uns) ».
- **Acceptation :** aucune phrase de plus de 25 mots dans l'encadré, et 0 occurrence de « Datenqualität ».
- **Personas :** A11, LE.

### 37. Events : date affichée deux fois, pas de « heute », Events absent des puces principales
- **Correctif :** la date uniquement dans la ligne de prix, le lieu dans la méta. « heute, 21:00 / morgen » calculé en Europe/Zurich et mis à jour par site.js. Puce d'éligibilité (« mit Legi CHF 20 »). Afficher les prix étudiants Saiten et Konzert und Theater. Remplacer `haushalt` par `events` dans `PRIMARY_CHIPS`, avec la justification dans /transparenz.
- **Acceptation :** 1 seule date par carte, et Events visible sur l'accueil.
- **Personas :** ST.

### 38. Studis : 60 codes UNiDAYS mondiaux et « Konto nötig » répété 24 fois
- **Correctif :** afficher « Konto nötig » une seule fois dans l'intro. Prix étudiants locaux en premier (item 37). `config/evergreen-studis.ts` : offres suisses avec `sourceUrl` et `verifiedAt`, masquées après 90 jours, jamais inventées.
- **Acceptation :** au moins une offre locale ou suisse dans les 6 premières cartes, si les données existent.
- **Personas :** ST, VS.

### 39. Le CTA envoie FR et EN vers les pages allemandes des magasins
- **Correctif :** `localizeMerchantUrl` avec une table par hôte (denner, lidl, migros, aldi, galaxus), appliquée seulement si le scanner a vu l'URL dans la langue cible. Sinon, note visible « site en allemand ».
- **Acceptation :** le CTA FR de Due Lune mène à `/fr/`, ou la note s'affiche.
- **Personas :** VS.

### 40. Sécurité secondaire : `/api/click` falsifiable, CSP non observable, `_redirects` en `:lang`, security.txt, name-test
- **Correctif :**
  - `/api/click` : seau par client (hash de l'IP et d'un sel du jour, en mémoire seulement), et le postbuild refuse `CLICKS_BINDING=1` sur `*.pages.dev`.
  - CSP : ajouter `require-trusted-types-for 'script'; trusted-types 'none'` tant que les pubs sont désactivées.
  - `_redirects` : étendre `:lang` en de, fr et en, avec un test qui interdit `:lang`.
  - AdSense : le postbuild refuse un client sans `CMP_MODE='google-tcf'`, et la CSP pub n'est servie que sur les pages qui en ont.
  - name-test : `ADMIN_TOKEN` comparé en temps constant sur export et exclude, `CREATE TABLE` déplacé dans `schema.sql`.
  - security.txt : mailto quand disponible (PVR owner-gated).
- **Acceptation :** chacun de ces points est couvert par un test.
- **Personas :** SEC.

### 41. Format FR et montants arrondis (item 41 du round 3)
- **Correctif :** FR « mis à jour le jeu. 29 oct. à 0 h 27 ». Note avec virgule « 6,6/10 » en FR (montants CHF inchangés). `fmtPrice(v,{round:true})` donne « CHF 40.– » pour les frais, les totaux et les événements ; aria-label et JSON-LD ne changent pas.
- **Acceptation :** vitest sur le format.
- **Personas :** I18, RS.

### 42. Logo : monogramme générique, et favicon invisible sur les barres d'onglets sombres
- **Correctif :** favicon : ajouter `<style>@media (prefers-color-scheme:dark)` dans l'icon.svg, et convertir le texte en tracé. La refonte du symbole (indépendant du nom) est reportée jusqu'au nom final, owner-gated.
- **Acceptation :** favicon lisible sur fond #202124.
- **Personas :** BT, RS.

### 43. audit-vibe ne contrôle que 400 fichiers sur 12 000
- **Correctif :** contrôler tous les HTML (une passe regex). Ajouter les vérifications des items 2, 9, 12, 19 et 1 (jetons interdits, ALCOHOL à l'accueil, hôtes, `data-lang` qui mènent à une 404). Grandes ombres et `border-left` d'accent interdits.
- **Acceptation :** le script parcourt tous les fichiers et échoue sur une injection de test.
- **Personas :** RS.

---

## Liste owner (à ne pas faire, à présenter à Yorian)
- Purge du cache Cloudflare, uniquement si l'item 1 étape 5 ne suffit pas (URLs : les 3 slugs de l'item 1 et le registre).
- Impressum et responsable du traitement (revDSG art. 19), à faire avant tout lancement.
- Activation de l'affiliation et des pubs ; CMP certifiée TCF.
- Tokens Cloudflare par projet et rotation ; check requis dans la protection de branche ; PVR GitHub.
- Lecture des CGU de Dschungelkompass, Preispirat et Rappn (R5).
- Nom de marque, avant la refonte du symbole.
