# Critique, round 3 : backlog unique (29.10.2026)

Ce backlog regroupe 180 constats bruts (10 personas et 1 agent de recherche) en 44 items, dédoublonnés et arbitrés.

Abréviations des personas :

| Code | Persona |
|---|---|
| AD | apple-design |
| BT | brand-type |
| UX | ux-research |
| ST | hsg-student |
| A11Y | a11y |
| PERF | perf-eng |
| SEC | security |
| LEG | legal-ethics |
| VAL | value-strategist |
| I18N | i18n-content |
| RES | research |

**Limites de la machine.** L'implémenteur dispose de 8 Go de RAM.
- Avant chaque build, lancer `df -h /`. Le 29.10 à 01:00, il restait 8.7 Gi libres.
- Arrêter le build si l'espace libre tombe sous 1 Go.
- Builder avec `NEXT_BUILD_CPUS=2`.
- Ne jamais lancer wrangler, Chrome et le build en même temps.
- Prendre les captures sur le site LIVE, après le déploiement.

**Points réservés au propriétaire, à NE PAS faire :**
- remplir l'Impressum ;
- activer l'affiliation et la publicité ;
- purger l'historique du feed public ;
- activer « Private vulnerability reporting » sur GitHub ;
- régler le NEL dans le dashboard Cloudflare.

Les items concernés le signalent avec la mention « (gated) ».

## Arbitrages du round 3

1. **Note visible seulement si sa base est visible.** Un badge n'apparaît que si la même carte affiche un `.was`. Il n'y a aucune note quand `confidence < 0.7` ni quand `kind==='vendor'` (UVP). On ne plafonne plus à 6.9 : on retire la note. La règle « masquer tous les badges si moins de 50 % » est rejetée : avec un prédicat unique, les cartes notées se regroupent d'elles-mêmes en tête.
2. **Un « statt » marchand non observé n'est pas un historique.** On écrit « unter dem Statt-Preis von Denner » et jamais « als zuvor ». La formule « als zuvor » est réservée à `refObserved`. Plafond `unchecked` à 6.9 tant que rien n'est observé.
3. **En-tête mobile.** On supprime le menu ville tant qu'une seule ville existe et on garde les 3 liens de langue (switch direct, un seul tap). On rejette le menu « DE ▾ » et le masquage du wordmark. Le wordmark n'est jamais tronqué.
4. **404 et changement de langue sans Function.** On sert des 404 statiques imbriquées générées au postbuild, et des tombstones pour les deals expirés. Le HEAD-probing côté client est écarté, car il est inutile si les 404 imbriquées existent.
5. **Ordre de la page d'accueil calculé selon les preuves.** Sections avec `.was` d'abord, Studis ensuite, Gratis en dernier. La vitrine reste en tête lorsqu'elle existe.
6. **Slugs.** Les slugs allemands restent dans toutes les langues. Les slugs localisés, comme `/fr/.../supermarche`, sont rejetés : le switch fonctionne déjà, et les traduire coûterait des redirects pour un gain nul.
7. **Tombstone.** Elle affiche le dernier prix barré, marqué « damals, laut Denner ». Elle n'a aucun CTA, aucun JSON-LD Offer, et porte `noindex`. Au-delà de 30 jours, l'URL renvoie 404.

---

## P0 : à livrer ce round

### 1. Le middleware tourne sur chaque page vue (ouvert depuis le round 2, R3)
- **Problème :** chaque vue HTML consomme une invocation de Function. Une fois le quota gratuit de 100k/jour épuisé, tout le site tombe. Un simple `?x=1` contourne le cache, et une 404 profonde déclenche jusqu'à 900 sous-requêtes ASSETS.
- **Preuve :**
  - `web/scripts/postbuild.mjs:115-118` contient `include ['/', '/api/*', '/.well-known/*', '/de/*', '/fr/*', '/en/*']`.
  - `functions/_middleware.ts:25-35,46-63` est en cause.
  - Une URL de 300 segments répond en 0.72 s, contre 0.135 s normalement.
  - La CSP et le Cache-Control proviennent déjà de `public/_headers`.
- **Correctif :**
  1. Fixer `_routes.json` à `include ['/', '/api/*']` et ajouter une assertion postbuild qui échoue sur toute autre entrée.
  2. Supprimer `functions/_middleware.ts`. Déplacer `HSTS`, `X-Robots-Tag: noindex, nofollow` (*.pages.dev), `Permissions-Policy`, `CORP` et `X-Permitted-Cross-Domain-Policies` dans `public/_headers`. Envelopper `functions/index.ts`, `api/click.ts` et `.well-known/security.txt.ts` (ou le rendre statique) dans `secure()`.
  3. Faire générer par le postbuild des 404 imbriquées : `out/<l>/404.html`, `out/<l>/deal/404.html`, `out/<l>/st-gallen/404.html` et `out/<l>/st-gallen/<cat>/404.html`. Leurs liens `a[data-lang]` pointent vers le parent équivalent le plus profond qui existe (logique `candidates()` reprise au build).
  4. Revérifier les 301 de `_redirects` (liste R2).
- **Acceptation :**
  - `curl -sI /de/st-gallen` renvoie la CSP et HSTS.
  - `wrangler pages deployment tail` montre 0 invocation sur les pages vues.
  - Le lien FR de `/de/st-gallen/tech-deals/99` pointe vers `/fr/st-gallen/tech-deals`.
  - Le TTFB d'une 404 profonde est inférieur à 120 ms.
- **Personas :** PERF, SEC, UX, ST, VAL, I18N, LEG, RES, AD

### 2. Notes sans base visible, et Big Brain 6.9 classé premier (ouvert depuis le round 2)
- **Problème :** des badges s'affichent sur des données « ungenügend », sans prix de comparaison visible. La règle de tri unique n'est pas en place.
  - Sur Tech, la carte 1 est Big Brain 6.9, sans `.was`.
  - Shopping affiche 24 badges 6.9, tous Otto's.
  - Refurbished affiche une série de 6.9 chez Revendo (UVP).
  - Le pied de liste affirme « Mit Statt-Preis zuerst » alors qu'aucune carte n'a de `.was`.
- **Preuve :**
  - Live `/de/st-gallen/tech-deals`, `/shopping`, `/refurbished`, `/handy-abos` (CHmobile 5.4 et Salt 6.8 au milieu de cartes sans badge).
  - `project.ts:201,212-216` (`cap('confidence')`), `project.ts:304-312`, `DealCard.tsx:20,33`.
  - La page deal HP affiche « 4.6 /10 okay » alors que /transparenz annonce « unter 5.0 keine Zahl ».
- **Correctif :**
  - Dans `projectDeal`, fixer `score = undefined` dans trois cas : `(confidence ?? 0) < VERIFY_MIN_CONFIDENCE`, `kind==='vendor'`, ou `kind==='competitor'` sans prix concurrent rendu. Supprimer la branche `confidence` de ScoreCap et la clé i18n `capReason.confidence`.
  - Créer `showsRef(d)` dans `lib/select.ts`. Le badge, sur la carte comme sur la page deal, exige `showsRef(d) && score >= 5`.
  - Utiliser un comparateur unique, exporté et employé par `rankDeals`, `better()`, `pickTop`, `orderCategory` et le bloc « Mehr aus » : `showsRef` desc, puis `score` desc, puis l'économie en CHF desc, puis `title.localeCompare`.
  - Dans `categories.ts`, passer `handy-abos` à `unrated: true`.
  - Générer la phrase de tri à partir des données : « Mit Statt-Preis zuerst » uniquement si `list.some(showsRef)`, sinon « Neueste zuerst ». La placer au-dessus de la grille dans `<p id=results-desc>`, référencée par `aria-describedby` sur le `<ul>`.
- **Acceptation :**
  - Vitest : aucun PublicDeal n'a à la fois `score` défini et `confidence < 0.7`.
  - Postbuild : chaque `.badge` dans `out/` a un `.was` frère ; aucune page deal ne contient à la fois « ungenügend » et `aria-label="Bewertung`.
  - Pages `/shopping`, `/refurbished`, `/handy-abos` et `/tech-deals` page 1 : 0 badge aujourd'hui.
  - Fixture « Big Brain non vérifié vs HP vérifié » : HP est classé premier.
- **Personas :** AD, BT, UX, ST, A11Y, LEG, VAL, I18N, RES, PERF

### 3. « günstiger als zuvor » et notes « sehr gut » reposent sur un « statt » non vérifié
- **Problème :** les cartes Denner et Lidl affichent 7.7 « sehr gut » et « CHF 15.40 günstiger als zuvor ». Or la page deal du même produit dit « laut Denner, von uns nicht überprüft » et « Preisverlauf: noch zu wenig Daten ». Le plafond `unchecked` prévu par l'arbitrage 1 du round 2 ne se déclenche jamais. Le Statt-Preis apparaît deux fois sur la page deal.
- **Preuve :**
  - `/de/deal/finish-geschirrspulcaps-ultra-all-in-1-u9ah2d` et `/de/deal/coca-cola-classic-1rnj95b`.
  - `project.ts:207-219`.
  - `i18n.ts:76,108,290,466` (savingLine), `i18n.ts:166,346,522` (ogDescription).
  - Scanner `core/uscoring.py:130-131`, où `unknown` devient `ok`.
  - Feed : 196 deals `merchant_previous` ≥ 7, dont 0 avec `history_n` ≥ 3.
- **Correctif :**
  - **Scanner :** `integrity='ok'` seulement si `prior_refs` ou `n>=3`, sinon `'unchecked'`.
  - **Web :** dans `project.ts`, appeler `cap('unchecked')` quand `!refObserved && integrity ∈ {undefined,'unknown','unchecked'}`. Cela vaut aussi pour Denner.
  - **savingLine, cas `!refObserved` :**
    - DE : « CHF 15.40 unter dem Statt-Preis von Denner »
    - FR : « CHF 15.40 de moins que le prix barré de Denner »
    - EN : « CHF 15.40 below Denner’s was price »
  - **Carte :** une seule économie par carte. Retirer le % du sr-only si la ligne CHF est présente.
  - **Hero deal :** afficher « statt 27.35 laut Denner ».
  - **Libellé `refTypes.merchant_previous` :**
    - DE : « Statt-Preis laut Händler »
    - FR : « prix barré selon le commerçant »
    - EN : « was price as stated by the retailer »
  - Supprimer la ligne « Statt-Preis » du panneau : le hero porte le chiffre.
  - « Datenqualität » ne doit plus afficher « gut » quand `historyN < 3` : afficher « Händlerangabe ».
  - `ogDescription(date, source, hasRef)` : la clause « Statt-Preis laut Händler » n'apparaît que si `.was` est rendu.
- **Acceptation :**
  - Vitest : `refObserved !== true` implique `score ≤ 6.9` et aucune occurrence de « zuvor|qu’avant|than before ».
  - `grep` sur `out/` : « als zuvor » n'apparaît que sur des cartes `data-observed`.
  - « CHF 27.35 » apparaît une seule fois dans le `<main>` de la page Finish.
  - Aucune meta description ne mentionne « Statt-Preis|Prix barré|Was price » sur une page sans `.was`.
- **Personas :** LEG, VAL, UX, ST, AD, I18N, RES

### 4. L'accueil n'affiche aucun prix au-dessus de la ligne de flottaison, et la vitrine disparaît
- **Problème :**
  - `pickShowcase()` renvoie une liste vide, car `PER_MERCHANT=2` et le plafond d'un tiers par catégorie la ramènent sous 3 cartes. L'ordre fixe Studis → Gratis → Supermarkt ouvre alors la page sur des pourcentages sans CHF.
  - Le premier `.price` se trouve à y=925 sur un écran de 390×844.
  - Sur les cartes « code » et « pourcentage », la valeur est affichée en méta de 13 px grisée.
- **Preuve :**
  - Live `/de/st-gallen` (Stand 29.10 00:27).
  - `select.ts:112,162-165`, `CityDashboard.tsx:15,114`.
  - Captures `round2-after-home-mobile-light.jpg` et `round2-after-home-desktop-light.jpg`.
- **Correctif :**
  1. Dans `pickTop`, n'appliquer le plafond d'un tiers par catégorie que si au moins 2 catégories sont éligibles. Sinon, ne garder que la limite par marchand.
  2. Quand la vitrine est vide, ordonner les sections de `CityDashboard` à partir d'une constante `HOME_ORDER` calculée : nombre de cartes `showsRef` desc (Supermarkt aujourd'hui), puis Studis, puis Gratis en dernier.
  3. Titre de la première section : « Diese Woche im Supermarkt » / « Cette semaine au supermarché » / « This week at the supermarket ».
  4. Variante de carte « code » : la valeur passe dans le slot `.price` (« −35% », en FR « −35 % » avec U+202F, « bis −60% » si `upTo`), suivie de « laut Anbieter » en style `.was`.
  5. /transparenz décrit ce repli à partir du même tableau `HOME_ORDER`.
- **Acceptation :**
  - Sur `/de`, `/fr` et `/en/st-gallen` en 390×844, le premier `.price` a un `top` ≤ 400.
  - Vitest sur une fixture où la vitrine est vide : la première section contient un `.was`.
  - Toute carte visible dans le premier viewport porte une valeur d'au moins 22 px.
- **Personas :** AD, BT, UX, ST, VAL, RES, A11Y

### 5. Mobile : la première carte est à 265 px et la marque est tronquée en « Deal … » (ouvert depuis le round 2)
- **Problème :** l'empilement en-tête 53 + H1 34 + méta 18 + chips 52 + section-head 44 place la première carte à 265 px, au-delà de la cible de 200. Sur les pages catégorie, elle est à environ 323 px. Le `.wordmark` mesure 94 px pour 83 visibles.
- **Preuve :**
  - Mesure live à 390×844.
  - `globals.css:106` (`text-overflow:ellipsis`), `SiteChrome.tsx:32-45` (le menu ville ne contient qu'une ville), `CategoryListing.tsx:112` (lead sur 3 lignes).
  - Capture `round2-after-home-mobile-light.jpg`.
- **Correctif :**
  1. Ne rendre `details.city-menu` que si `launchedCities().length > 1`. La liste « bald » passe dans le footer.
  2. Sur `.wordmark`, retirer `overflow:hidden` et `text-overflow`, et ajouter `flex:none`. Sous 360 px, `.lang a{min-width:40px}` avec une zone de clic étendue par `::after`.
  3. `.intro` : padding-top 8 ; H1 en 28/34, 22/28 sous 640 px ; `.intro-facts` sur la même ligne que le H1 ou déplacé sous la dernière section.
  4. Chips : hauteur visuelle de 36 px, zone de clic de 44 px via `::before{inset:-4px 0}`, margin-block 4.
  5. `.section-more` : `min-height` de 28 px, avec une zone de clic de 44 px via `::after`.
  6. Appliquer la classe `.sr-mobile` à l'en-tête de la première section rendue, quelle qu'elle soit.
  7. Pages catégorie : sous 640 px, limiter `.lead` à 2 lignes avec `-webkit-line-clamp:2`. Le texte complet reste dans la meta description.
- **Acceptation :**
  - Sur le site live à 375×812 et 390×844 : `top` de la première `.card` ≤ 200 sur `/de|fr|en/st-gallen`, et ≤ 240 sur une page catégorie.
  - `.wordmark` : `scrollWidth === clientWidth` à 320, 375 et 390 px sur toutes les routes.
- **Personas :** AD, BT, UX, ST, A11Y, PERF, VAL, I18N, RES

### 6. Les titres conservent le marketing et l'urgence des sources, alors que /transparenz affirme le contraire
- **Problème :** les titres gardent « Erhöht 35% » (en tête des 3 langues), « nur noch heute », « zum besten Preis », « neuer Bestpreis », « Exklusiv! », « (Abholung) » et « … bei MediaMarkt » (déjà dans `.seller`). On trouve aussi « Nexode20000 », des guillemets mélangés et le slug `…-zum-tiefstpreis-abholung-…`.
- **Preuve :**
  - `project.ts:125-135` : la regex est ancrée en début de chaîne et sensible à la casse, et le title-case est appliqué avant le strip.
  - `project.ts:34,233` : le slug est construit sur le titre brut.
  - Live `/de/st-gallen/tech-deals` et `out/de/deal/*`.
- **Correctif :** dans `cleanTitle`, appliquer dans l'ordre :
  - (a) séparer le préfixe de marque `/^([^:]{1,40}:\s*)/` ;
  - (b) retirer, avec le flag `/iu` et AVANT le title-case : `(^|[:–-]\s*)(ERHÖHT|NEU|EXKLUSIV(DEAL)?|HOT|TOP)\b[:!]?` ;
  - (c) retirer les tournures d'urgence : `nur (noch )?(heute|bis morgen)`, `letzte Chance`, `solange es geht`, et en FR/EN « aujourd’hui seulement », « dernier jour », « today only » ;
  - (d) retirer les superlatifs : `(zum )?(neuen? )?(besten Preis|Bestpreis|Tiefstpreis|Toppreis)( CHF …)?`, sauf si `provenLowest` ;
  - (e) retirer le suffixe `\s+(bei|im|chez|at)\s+<merchant>( Store)?$` lorsqu'il correspond au marchand résolu (voir item 7) ;
  - (f) transformer `(Abholung)` en condition « nur Abholung / retrait uniquement / pick-up only » ;
  - (g) insérer une espace dans `([A-Za-z])(\d{4,})\s?mAh` ;
  - (h) unifier les guillemets par locale (« » en DE/FR, “ ” en EN) ;
  - (i) espacer le pourcentage selon la langue : `$1%` en DE/EN, `$1 %` en FR ;
  - (j) supprimer le préfixe de marque s'il est doublé (« Fnac: Fnac-Karte: »).

  Construire le slug à partir du titre nettoyé et le hacher sur une clé produit stable : source + SKU, sans le suffixe `-week-YYYYMMDD`.
- **Acceptation :**
  - Test postbuild sur les H1 et `.card-title` de `out/{de,fr,en}` : la regex `/nur (noch )?heute|bis morgen!|bestpreis|besten preis|tiefstpreis|exklusiv!|erh(ö|o)ht/i` ne renvoie aucun résultat (hors `provenLowest`).
  - Aucun slug ne contient `zum-neuen`, `tiefstpreis` ou `erhoht`.
  - Vitest : « Brand: ERHÖHT 35% … » donne « Brand: 35% … ».
- **Personas :** LEG, UX, ST, AD, BT, VAL, I18N, RES

### 7. L'agrégateur est affiché comme marchand (« preispirat (preispirat.ch) ») (ouvert depuis le round 2, item 25)
- **Problème :**
  - Page 1 de Tech : 6 vendeurs sur 24 sont affichés « preispirat (preispirat.ch) ».
  - Page Gratis et accueil : « Pakete abholen lassen », qui est un service de la Poste.
  - « Sky Show » est attribué au vendeur « Apple ».
  - Big Brain : la page indique « MediaMarkt » comme vendeur, mais le CTA mène à preispirat.ch.
  - La mention « gefunden über … » promise par /transparenz n'est jamais rendue (`t.via` est inutilisé).
- **Preuve :** `project.ts:276` (attribution), `DealCard.tsx`, `deal/[slug]/page.tsx:122`, `i18n.ts:127`. Dans le feed, 78 deals agrégés sur 419 ont `merchant=null`.
- **Correctif :**
  - **Scanner** (`radar/connectors/preispirat.py`, rappn) : suivre le lien sortant « Zum Deal » et mapper l'hôte final vers un marchand (fnac.ch donne Fnac, hp.com donne HP Store). En repli, utiliser le suffixe du titre `\b(bei|im|chez|at)\s+([A-Z][\w&.’' -]{1,30}?)(\s+Store)?$`. Émettre `merchant` et `via`, et parser `ends_at` dans la description.
  - **Web** (`lib/sources.ts`) :
    - Définir `AGGREGATORS = {preispirat, rappn, gamerpower, dealdoktor}` et `BRAND_NOT_MERCHANT = {Apple, Sky, Samsung}`.
    - La valeur de `.seller` ne contient jamais d'agrégateur ni de domaine entre parenthèses. Si le marchand est inconnu, afficher « Händler unbekannt » et exclure le deal de la vitrine et des sections de l'accueil.
    - Ajouter « gefunden über Preispirat » dans la méta via `t.via`.
    - Libellé du CTA : « Zum Angebot · über preispirat.ch » lorsque l'hôte est un agrégateur.
- **Acceptation :**
  - `grep -E '\((preispirat\.ch|gamerpower\.com)\)'` dans `out/` ne renvoie rien.
  - Aucun `.seller` n'est égal à un agrégateur.
  - Sur chaque carte, l'entité nommée par `.seller` est la même que celle du CTA.
- **Personas :** AD, BT, UX, ST, LEG, VAL, I18N, RES, PERF

### 8. Studis : marque adulte, titres allemands sur FR/EN, titres anglais sur DE
- **Problème :**
  - Lovense est en 4e position sur `/studenten-rabatte`. `NO_SHOWCASE` (`project.ts:50`) ne teste que des mots, jamais les marques.
  - « Erhöht 35% Rabatt » est la première carte sur `/fr` et `/en`.
  - « ExpressVPN: Up to 73% off… » apparaît sur `/de`.
  - 8 titres sur 24 n'ont pas d'attribut `lang` sur `/fr` (WCAG 3.1.2).
  - Les cartes ne mentionnent pas « Konto nötig ».
- **Preuve :** live `/de|fr|en/st-gallen` et `/studenten-rabatte` ; `lib/titleLang.ts:7-13` (studentbeans et unidays absents).
- **Correctif :**
  1. Créer `lib/blocklist.ts` avec `ADULT_BRANDS` (Lovense, We-Vibe, Satisfyer, Womanizer, Amorelie, Eis.de, Orion, Beate Uhse, Amorana) et les mots existants. Les comparer à `brand`, `merchant` et à l'hôte de l'URL. Exclure les correspondances de Studis, de Gratis et de l'accueil.
  2. **Scanner :** émettre les champs `{brand, pct, upTo}`. **Web :** construire le titre par locale :
     - DE : « `${brand}: ${upTo?'bis zu ':''}${pct} Rabatt für Studierende` »
     - FR : « `${brand} : ${upTo?'jusqu’à ':''}${pct} de réduction étudiante` »
     - EN : « `${brand}: ${upTo?'up to ':''}${pct} student discount` »
  3. En attendant, ajouter `studentbeans:'de', unidays:'de'` à `BY_SOURCE`, et faire sortir `de-CH` à `guessLang` si le titre contient `[äöüß]` ou `\bRabatt\b`.
  4. Trier par pourcentage décroissant, puis par `endsAt` croissant. Ajouter sous le H2 : « Sortiert nach Rabatt ».
  5. Méta de carte : « via Student Beans · Konto nötig ».
- **Acceptation :**
  - Aucune marque de la blocklist sur Studis, Gratis ou l'accueil.
  - Aucun titre anglais en page 1 de Studis `/de`.
  - Aucun `lang="de-CH"` parmi les 6 premières cartes de `/fr` et `/en/st-gallen`.
  - Postbuild : sur `/fr` et `/en`, tout `.card-link` ou `h1` qui contient `\b(Rabatt|bei|Abholung|statt)\b` a un ancêtre `lang^=de`.
- **Personas :** AD, UX, ST, VAL, I18N, A11Y, RES

### 9. Un lien publié passe par le traceur Google DoubleClick
- **Problème :** les CTA Swisscom Blue Mobile S, M et L (9 pages, 3 langues) pointent vers `ad.doubleclick.net/ddm/trackclk/…DSCHUNGELKOMPASS…`. C'est un tracking payant non divulgué, avec un cookie Google posé au clic, et cela contredit « jamais la commission d'un autre ».
- **Preuve :**
  - Live `/de/deal/swisscom-blue-mobile-s-aktionspreis-ui09jp`.
  - `lib/outbound.ts:9-14,48` et `lib/affiliate/rewrite.ts:15-19` : deux listes distinctes, et la destination se trouve après `;ltd=?`.
- **Correctif :**
  - Fusionner les deux listes en une seule constante exportée par `lib/outbound.ts`. Y ajouter doubleclick.net, googleadservices.com, dartsearch.net, awin1.com, ct0.ch, adtraction.com, prf.hn, shareasale.com, linksynergy.com, skimresources.com, viglink.com, digidip.net, bit.ly et tidd.ly.
  - Dans `cleanOutbound`, si aucun paramètre ne correspond, tenter `decodeURIComponent(u.search.slice(1))` puis ce qui suit `;ltd=?` lorsqu'il commence par `https?://`.
  - Ajouter `campid|cid|dclid|gclsrc` à `STRIP_PARAMS`.
  - Si l'URL ne peut pas être déballée, retirer le deal.
- **Acceptation :**
  - Vitest sur l'URL Swisscom exacte : le résultat est `https://www.swisscom.ch/de/privatkunden/mobile-handy-abo/blue-mobile-s.html`.
  - Une assertion postbuild échoue si un `href` de `out/` pointe vers un hôte traceur.
- **Personas :** SEC, LEG

### 10. Deals expirés : prix servis comme actuels depuis le cache, 404 nue, pas de tombstone (ouvert depuis le round 2, item 22)
- **Problème :**
  - Mövenpick, expiré le 28.10, est servi en 200 avec `cf-cache-status: HIT` et `age` d'environ 4.4 h, et affiche « jetzt CHF 13.15 ».
  - Les liens partagés sur WhatsApp meurent au bout de 7 jours, car l'id contient la semaine.
  - Le switch de langue sur la 404 renvoie vers l'accueil.
- **Preuve :**
  - `curl -sI …/de/deal/movenpick-bohnenkaffee-caffe-crema-3x500g-z2n9hs`.
  - `/de/deal/does-not-exist-xyz` renvoie 404 avec le message générique.
  - L'id `denner:dn-1101978-week-20261029` sert de clé.
- **Correctif :**
  1. **Slug stable :** voir item 6.
  2. **`data/expired.json`**, côté scanner et persisté entre les builds : `{slug, title, merchant, cat, endedAt, lastPrice, ref, lang}`, purgé au-delà de 30 jours.
  3. **Gabarit tombstone** léger (≤ 3 KB br), avec :
     - `noindex` ;
     - le H1 « {Titel} – abgelaufen am Mi 28.10. » / « terminée le mer. 28.10 » / « ended on Wed 28 Oct » ;
     - le dernier prix barré en `--muted`, accompagné de « damals, laut Denner » ;
     - aucun CTA, aucun JSON-LD Offer, seulement le breadcrumb ;
     - 3 deals vivants de la même catégorie, triés par le comparateur unique, plus un lien vers la catégorie ;
     - des liens de langue vers la même tombstone dans les autres locales.
  4. **Budget de fichiers dans le postbuild :** un compteur par type. Si le total HTML dépasse 16 000, on supprime d'abord les tombstones les plus anciennes, avec un log.
  5. **`_headers`** : pour `/*/deal/*`, `Cache-Control: public, max-age=60, must-revalidate`, sans `stale-while-revalidate`.
  6. **`site.js`** : sur `article.deal[data-ends]` dépassé, remplacer le bloc prix par l'avis d'expiration (filet de sécurité pour le cache).
- **Acceptation :**
  - L'URL Mövenpick renvoie 200 avec un H1 « abgelaufen », sans « jetzt » ni CTA, et avec `noindex`.
  - Le switch FR de cette page mène à `/fr/deal/<même slug>`.
  - Le postbuild affiche les compteurs, avec un total inférieur à 16 000.
- **Personas :** RES, UX, ST, VAL, LEG, PERF, I18N, A11Y

### 11. Disque : `.next` pèse 892 Mo et 7 371 dossiers vides restent dans `out/`
- **Problème :** un rebuild écrit le nouveau `.next` avant que l'ancien soit supprimé, ce qui fait monter le pic d'occupation disque d'environ 1 Go.
- **Preuve :** `du`, avec `.next/server/app` à 853 Mo et 29 624 fichiers `.rsc` ; `find out -type d -empty | wc -l` renvoie 7 371.
- **Correctif :**
  - Dans `package.json`, ajouter `"prebuild": "rm -rf .next out"`.
  - En fin de postbuild, après les gardes, lorsque `!process.env.CI` : supprimer `.next/server/app` avec `rmSync` et purger les dossiers vides de `out/`.
  - Retirer de `out/` les restes `<div hidden=""><!--$--><!--/$--></div>` et `<!-- -->`.
  - Documenter dans `web/README` les commandes `df -h /` et `NEXT_BUILD_CPUS=2`.
- **Acceptation :** après le build, `du -sh .next` est inférieur à 60 Mo et `find out -type d -empty` ne renvoie rien.
- **Personas :** PERF

---

## P1

### 12. Page deal sur desktop : la colonne droite est vide et le panneau « ohne Bewertung » envahit la page (ouvert depuis le round 2)
- **Problème :**
  - `.deal{max-width:720px}` (`globals.css:225`) est collé à gauche, ce qui laisse 352 px vides à 1366 px de large.
  - Le CTA est une barre de 670 px.
  - Les deals non notés montrent 5 à 8 lignes de « ungenügend ».
  - Les deux icônes de partage sont identiques : WhatsApp reprend le pictogramme du partage natif (`page.tsx:100`).
  - « neuer Tab » est lu deux fois par les lecteurs d'écran.
- **Preuve :** captures `round2-after-deal-desktop-light.jpg` et `round2-after-deal-mobile-*.jpg` ; `page.tsx:193-213`.
- **Correctif :**
  - **Au-delà de 1000 px :**
    - `.deal{max-width:none;grid-template-columns:minmax(0,1fr) 360px;grid-template-areas:'head buy' 'score buy' 'more more'}`.
    - `.deal-buy` en `position:sticky; top:calc(var(--top-h)+16px)`. Il contient le prix en 48/700, la mention « statt … laut X », l'économie, la validité, le Grundpreis, les conditions et le CTA (largeur ≤ 360 px).
    - « Mehr aus » s'étend sur toute la largeur.
  - **En dessous de 1000 px :** une seule colonne de 720 px centrée.
  - **Deals en pourcentage :** la valeur s'affiche en `--t-display`.
  - **Si `score===undefined` :** le panneau se réduit à une ligne, « Ohne Bewertung – nur Prozentangabe des Anbieters · So bewerten wir → ». Le détail passe dans un `<details>`. Le titre `whyTitle` devient « Warum keine Bewertung ».
  - **Partage :** un seul bouton, qui utilise `navigator.share` s'il existe et copie le lien sinon (statut « Link kopiert », `role=status`). Il se place sur la ligne du marchand.
  - **CTA :** texte visible « Zum Angebot bei Denner » + ↗ (`aria-hidden`). Mettre `.btn-hint` en `aria-hidden`.
  - Ajouter `<h2 class=sr-only>Preis und Angebot</h2>` et `aria-labelledby` au panneau d'achat.
- **Acceptation :**
  - À 1366 px, aucun vide de plus de 40 px dans `main` au-dessus de la ligne de flottaison.
  - CTA ≤ 360 px, visible sans scroller.
  - Un seul bouton icône au-dessus du hero.
  - La valeur est le plus grand texte de chaque page deal.
- **Personas :** AD, BT, UX, ST, VAL, A11Y, RES

### 13. Chaque page deal a un bloc « Mehr aus … »
- **Problème :** les pages Big Brain et Dell sont des impasses : le seul moyen d'en sortir est le CTA externe.
- **Preuve :** `/de/deal/big-brain-…-eenecg` et `/de/deal/dell-…-pur8wr`.
- **Correctif :** toujours afficher 3 deals de la même catégorie, triés par le comparateur unique et sans le deal courant. S'il y en a moins de 3, ajouter le lien « Alle Tech-Aktionen (76) → ».
- **Acceptation :** chaque `out/*/deal/*.html` contient `#more` avec au moins un lien interne.
- **Personas :** UX

### 14. Supermarkt : pas de quantité, pas de diversité, pas de filtre par magasin, Coop et Migros absents (items 17 et 18 du round 2)
- **Problème :**
  - « CHF 73.20 statt 146.70 » (un carton de vin) et « Heineken CHF 27.60 » n'indiquent aucune quantité.
  - La page 1 n'a ni Coop ni Migros. Sur Shopping, 23 cartes sur 24 sont Otto's.
  - `/supermarkt-aktionen/denner` renvoie 404.
  - « ALDI SUISSE » est en majuscules.
- **Preuve :** live `/de/st-gallen/supermarkt-aktionen` et `/shopping` ; `CategoryListing.tsx` (`interleave` limité à Supermarkt). Sur toutes les pages : ALDI 243, Denner 212, Lidl 193, Migros 26, Volg 25, Coop 0.
- **Correctif :**
  1. Ajouter sous le prix une ligne `.card-unit` : « 6 × 75 cl · CHF 16.27/l », issue de `unitPrice` et `unit` ou de la taille parsée dans le titre, en 13 px `--muted` avec `tabular-nums`. En l'absence de donnée, afficher « Menge: siehe Anbieter ».
  2. Appliquer `interleave` à toutes les catégories notées : au plus 1/3 par marchand et par page, et jamais 3 cartes consécutives du même marchand.
  3. Normaliser les noms de marchands (ALDI SUISSE devient Aldi).
  4. Créer les pages statiques `/<l>/st-gallen/supermarkt-aktionen/<store>` pour les magasins qui ont au moins 12 deals, avec une rangée de chips magasins sous le H1.
  5. Ajouter une ligne de couverture générée : « Diese Woche erfasst: Aldi 243 · Denner 212 · … · Coop 0 (Quelle derzeit ohne Daten) ».
  6. Garde : `merchant ∈ GROCERS` est obligatoire dans supermarkt-aktionen (Office World et SECEND en sortent).
  7. Scanner : alerte si un des 5 plus gros épiciers a 0 deal.
- **Acceptation :**
  - Au moins 80 % des cartes épicerie montrent un prix unitaire ou une quantité.
  - Aucune suite de 3 cartes du même marchand en page 1.
  - `/supermarkt-aktionen/denner` renvoie 200 dans les 3 langues.
- **Personas :** AD, UX, ST, VAL, RES

### 15. Gratis contient des concours, des services et des articles périmés
- **Problème :** on y trouve « Avia Gewinnspiel », « Coop Spielen & Gewinnen », « Interdiscount Glücksrad », « Pakete abholen lassen » (un service, présent aussi sur l'accueil), « 100% Rabatt Games KW43 » (on est en KW44) et « bis zum 29.10. (17 Uhr) » dans un titre.
- **Preuve :** live `/de/st-gallen/gratis`.
- **Correctif :**
  - `/Gewinnspiel|Glücksrad|Spielen\s*&\s*Gewinnen|Wettbewerb|gewinnen|concours/i` devient la famille `contest`, exclue de toutes les listes.
  - Gratis exige un nom de produit ou de jeu. Les services preispirat sont exclus.
  - `/bis (zum )?(\d{1,2})\.(\d{1,2})\.?(\s*\((\d{1,2}) Uhr\))?/` est parsé dans `endsAt` puis retiré du titre.
  - Les articles `KW(\d+)` antérieurs à la semaine ISO courante sont supprimés.
- **Acceptation :** 0 « Gewinnspiel », « Glücksrad », « KW43 » ou « Pakete abholen » sur Gratis et sur l'accueil.
- **Personas :** UX, VAL, LEG

### 16. Une seule source pour les icônes et l'OG : supprimer la cible verte, corriger l'espacement de l'OG
- **Problème :** `icon.svg` et `apple-touch-icon` montrent une cible verte (#0a7a50, ressemblant au logo Target). L'OG est en Geist Regular avec des espaces doublés et affiche « 242 Aktionen » alors que la page en compte 1’600. Les deals réutilisent l'OG de la ville.
- **Preuve :** `/icon.svg`, `/apple-touch-icon.png`, `/de/st-gallen/og.png`, `route.tsx:12,39-43`. Le manifest a `theme_color #f5f5f7` et `display: browser`.
- **Correctif :**
  - Supprimer `public/icon.svg` et `apple-touch-icon.png`.
  - Créer `app/icon.tsx` et `app/apple-icon.tsx` (force-static) avec la même tuile que `.logo-tile` : initiale de `SITE_NAME`, graisse 700, #f5f5f7 sur #1d1d1f, rayon 22 %. Ajouter une variante sombre via `media` et une version maskable 512.
  - Livrer `web/assets/fonts/Inter-{Regular,Bold}.ttf` (OFL) et les passer à `ImageResponse`. Chaque ligne est un seul nœud texte.
  - Tirer le compteur de la même fonction que `.intro-facts`, ou ne pas en afficher.
  - Générer un OG par deal pour la vitrine uniquement (≤ 50) : « CHF 6.95 · statt 14.35 laut Denner · bis Mi 4.11. ».
  - `theme-color` clair et sombre via `media`. Manifest en `standalone`, `start_url` par locale.
  - Ajouter la `<BrandMark/>` sur la 404 globale.
- **Acceptation :**
  - Aucun `circle` dans `out/icon*`.
  - Renommer `SITE_NAME` change les 3 assets.
  - Les espaces entre mots de l'OG sont ≤ 0.3 em.
  - Le compteur de l'OG est égal à celui de la page.
- **Personas :** AD, BT, ST

### 17. Grille et typo des prix : alignement, césure, CHF
- **Problème :**
  - Les lignes de prix ne s'alignent pas quand un titre passe sur 2 lignes (item 38 du round 2).
  - « Ra-batt » et « Multifunkti-onsdrucker » sont coupés à cause de `hyphens:auto` (`live.css:124`).
  - « CHF » est aussi grand que le montant.
  - `.was` n'a aucune règle de chiffres.
- **Preuve :** captures `round2-after-home-desktop-light.jpg`, `round2-after-category-desktop-dark.jpg` et `round2-after-home-mobile-light.jpg`.
- **Correctif :**
  - Grille : `.grid>.card{display:grid;grid-template-rows:subgrid;grid-row:span 5}` (head, price, save, meta, notes). Repli : `.card-title{min-height:calc(2*var(--l-headline))}`.
  - Titres de carte : `.card-title` limité à 2 lignes, avec le titre complet dans `title`.
  - Césure : `hyphens:manual; text-wrap:pretty` sur `.card-title`, `h1` et `h2`. `hyphens:auto` uniquement sous 400 px, avec `hyphenate-limit-chars:10 4 4`.
  - Prix : `<span class=cur>CHF</span>&#8239;<span class=amt>11.95</span>`, avec `.cur{font-size:.58em;font-weight:500;color:var(--muted)}`.
  - Chiffres : `.was`, `.card-save`, `.badge` et les compteurs passent en `tabular-nums lining-nums`.
- **Acceptation :**
  - Dans une rangée à 1366 px, le haut des `.price` diffère d'au plus 1 px.
  - Aucun titre ne coupe un mot de 8 lettres ou moins.
  - La sortie lecteur d'écran est inchangée.
- **Personas :** AD, BT

### 18. Chips : 13 pastilles sur 2 rangées, et la chip active domine la page
- **Problème :** sur desktop, « Lokal & Services » et « Shopping » se retrouvent seuls sur une deuxième rangée. La chip active en fond `--fg` est l'élément le plus contrasté. Les chips inactives ont un contraste de 1.08:1 (item 28 du round 2).
- **Preuve :** captures desktop ; `globals.css:165`.
- **Correctif :**
  - Afficher 6 chips (Supermarkt, Studis, Gratis, Tech, Handy-Abos, Haushalt) suivies de `<details class=chip-more><summary>Mehr</summary>`.
  - Retirer « Alle » de l'accueil.
  - Si la catégorie active est dans « Mehr », la promouvoir dans la rangée au moment du build.
  - Chip active : `background:var(--fill); box-shadow: inset 0 0 0 1.5px var(--fg)`.
  - Chip inactive : bordure de 1 px en #aeaeb2.
  - Bordure de carte : `rgba(0,0,0,.14)`.
  - Toujours en `flex-wrap:nowrap`, avec un masque de fondu à droite.
- **Acceptation :**
  - Une seule rangée à 1024 px dans les 3 langues.
  - Sur mobile, `scrollWidth` ≤ 2 × viewport.
  - Les paires chip et carte sont ajoutées à `tests/contrast.test.ts`.
- **Personas :** AD, BT, A11Y

### 19. Accessibilité, niveau A et socle
- **Problème :**
  - (a) Le visible « FR » est en `aria-hidden` et le nom accessible est « Français », ce qui viole WCAG 2.5.3 (`LangSwitch.tsx:22-23`).
  - (b) Toutes les tailles sont en px, avec des métas à 13 px et `.dd-note` à 12 px (`globals.css:39-46,243,257`).
  - (c) Les dates n'ont pas de `<time>`, et « bis heute » cache une heure de fin réelle (QoQa 12:15).
  - (d) La 404 marque comme `aria-current` des liens qui mènent ailleurs.
- **Preuve :** HTML live ; fichiers cités.
- **Correctif :**
  - (a) `<span>FR</span><span class=sr-only> – Français</span>`. La langue courante devient un `<span aria-current>` et non un lien.
  - (b) Tokens en rem, avec un contenu d'au moins 0.9375rem. Retirer `--t-caption` du contenu.
  - (c) Utiliser `<time dateTime>` avec un sr-only qui donne la date complète. Si la fin est aujourd'hui et qu'il existe une heure réelle autre que 23:59, afficher « bis heute 12:15 » / « jusqu’à 12 h 15 aujourd’hui » / « until 12:15 today ».
  - (d) Pas d'`aria-current` sur les liens de la 404.
- **Acceptation :**
  - Test : pour tout `a[data-lang]`, le nom accessible commence par le texte visible.
  - Avec une taille de police navigateur à 24 px, tout le texte suit.
  - `grep '<time'` sur `/de/st-gallen` renvoie au moins 1 résultat.
- **Personas :** A11Y

### 20. site.js masque les cartes expirées et la page se réarrange (CLS)
- **Problème :** `hideExpired()` applique `hidden` après le premier paint. Les compteurs restent faux et une section peut se retrouver vide.
- **Preuve :** `public/site.js` §1 ; 21 cartes sur 24 portent `data-ends` sur supermarkt-aktionen.
- **Correctif :**
  - Remplacer le masquage par `.card[data-gone]{opacity:.45}`, avec le libellé visible « abgelaufen » à la place de la date et un prix barré. S'exécute au chargement seulement.
  - Ajouter des builds à 00:01 et 18:01, heure de Zurich (cron UTC adapté selon l'heure d'été).
  - Retirer `content-visibility:auto` de `.card` (`globals.css:196-197`) et `text-rendering:optimizeLegibility` du `body`.
- **Acceptation :** Lighthouse à 00:10 sur supermarkt-aktionen mesure un CLS de 0.
- **Personas :** A11Y, PERF

### 21. Termes, dates et microcopie unifiés dans les 3 langues
- **Problème :**
  - Chaque langue utilise 3 noms pour le vendeur (Anbieter/Händler/Shop, vendeur/commerçant/magasin, seller/retailer/shop). /transparenz cite des libellés que l'interface n'affiche pas.
  - Une même page mélange 4 formats de date (« bis Mi 04.11. », « 29.10., 00:27 », « until Wed 4 Nov » à côté de « 29.10, 00:27 »).
  - En FR, on lit « actions mis à jour » et « Dernière vérification » à côté de « non vérifié par nous ».
  - Les deux-points ne suivent pas la typographie FR (`CityDashboard.tsx:127`, `SiteChrome.tsx:33`).
  - « 5 % » est écrit avec une espace normale dans transparenz.
- **Preuve :** `i18n.ts` (lignes citées par I18N), `format.ts:71-87`.
- **Correctif :**
  - **Glossaire** en tête de `i18n.ts` :

    | Rôle | DE | FR | EN |
    |---|---|---|---|
    | Vendeur | Händler | commerçant | retailer |
    | Vendeur, cas abonnements | Anbieter | opérateur | provider |
    | Lieu de découverte | Quelle | source | source |

    Remplacer toutes les autres variantes.
  - **Dates** : 2 helpers.
    - Validité : « bis Mi 4.11. » / « jusqu’au mer. 4 nov. » / « until Wed 4 Nov ».
    - Horodatage : « heute, 00:27 » ou « Di 27.10., 00:27 ». EN : « 29 Oct, 00:27 ». FR : « mise à jour le 29.10 à 00:27 ».
  - **Libellés :**
    - `lastChecked` : « Zuletzt aktualisiert » / « Dernière mise à jour » / « Last updated ».
    - FR : « Abos mobiles », « adhésion requise », « cadeaux » au lieu de « freebies », « Achats ».
    - EN : « was 27.35 », « Legal notice », « View offer at Denner ».
    - DE : `aria-label` du breadcrumb « Navigationspfad ».
  - **Ponctuation et pourcentages :** passer par `colon()` et `fmtPct` partout.
- **Acceptation :**
  - Snapshot des helpers de date (aujourd'hui, demain, +6 j, +40 j, an prochain) dans les 3 langues.
  - Test grep : seuls les termes du glossaire apparaissent dans `out/`.
  - Lint postbuild FR des espaces avant `: ; ! ? %`.
- **Personas :** I18N, BT, AD, A11Y

### 22. Copie des catégories et doublons
- **Problème :**
  - L'intro Tech promet « Digitec, Galaxus… mit Statt-Preis », alors que la page 1 n'a aucun `.was` et provient surtout de MediaMarkt et preispirat.
  - Le ThinkPad X13 apparaît 2 fois.
  - Une montre Tissot est classée en Tech.
  - Revendo (protections d'écran) est classé en Refurbished.
  - « Ragbatt » contient une faute.
- **Preuve :** live `/tech-deals` et `/refurbished`.
- **Correctif :**
  - Intro générée : « N Angebote, davon M mit Statt-Preis · häufigste Händler: X, Y, Z ».
  - Dédoublonner par `normTitle + merchant`. Garder le moins cher et ajouter « +1 Konfiguration ».
  - Christ et Tissot (montres, bijoux) passent en Shopping.
  - Revendo sans `/Outlet|refurbished|generalüberholt|Zustand|Grade/i` passe en Shopping.
  - Titres de la forme `^\d+%\s+auf` : `kind vendor_pct`, sans prix unique.
- **Acceptation :**
  - Aucune paire de cartes avec le même titre normalisé et le même marchand.
  - Aucune intro ne promet un « Statt-Preis » quand M = 0.
  - Refurbished ne contient que des appareils.
- **Personas :** UX, ST, VAL, RES, AD

### 23. Événements : sémantique des dates et ordre
- **Problème :**
  - « ab Mi 09.12. » est affiché pour un concert d'un seul soir, sans heure.
  - L'événement le plus proche arrive en 6e position.
  - Des avis communaux (« Nachsammlung Kehricht ») sont classés comme événements.
- **Preuve :** live `/de/st-gallen/events` ; `DealCard.tsx:83`.
- **Correctif :**
  - Si l'événement tient dans la même journée ou dure 18 h au plus : afficher « Mi 9.12., 20:00 » / « mer. 9.12, 20 h » / « Wed 9 Dec, 8 pm ».
  - Réserver « ab » aux événements sur plusieurs jours.
  - Trier par `startsAt` croissant, avec la mention « nach Datum ».
  - `stadtsg_news` passe dans « lokal ».
- **Acceptation :** la liste est triée par date et aucun événement d'un seul soir ne porte « ab ».
- **Personas :** I18N

### 24. Moins de churn au déploiement : précision au jour
- **Problème :** les 2 386 pages deal partagent le même « Zuletzt abgeglichen 29.10., 00:27 ». Chaque build toutes les 2 h réécrit donc les 7 160 pages, sans 304 possible, et renvoie 108 Mo.
- **Preuve :** `deal/[slug]/page.tsx:78` ; `web.yml:7`.
- **Correctif :** sur les pages deal, afficher « Zuletzt aktualisiert: Do 29.10. » au format jour. La minute est réservée à l'intro ville et catégorie.
- **Acceptation :** deux builds le même jour sur un feed inchangé modifient moins de 5 % des pages deal, et wrangler uploade moins de 500 fichiers.
- **Personas :** PERF

### 25. Lien cookies factice et texte de confidentialité inexact
- **Problème :**
  - « Cookie-Einstellungen » n'ouvre rien : pas de bannière, pas de pub.
  - §4 affirme « nichts gespeichert », alors que `site.js:118` écrit dans `localStorage`.
  - Le NEL de Cloudflare n'est pas mentionné.
  - La bannière, une fois activée, provoquerait un CLS d'environ 0.21 (`position:sticky` en tête).
- **Preuve :** footer live ; `/de/datenschutz` ; en-têtes `nel` et `report-to` ; `layout.tsx:61`.
- **Correctif :**
  - N'afficher le lien et le JS de consentement que si `NEXT_PUBLIC_ADSENSE_CLIENT` est défini. Sinon, afficher le lien « Datenschutz ».
  - Nouveau §4 : « Keine Cookies. Erst wenn Werbung aktiv ist, speichern wir deine Werbe-Entscheidung lokal (localStorage, 13 Monate). »
  - Ajouter une phrase sur le NEL dans §1, en DE, FR et EN. La désactivation dans le dashboard est (gated).
  - `.consent` en `position:fixed; bottom:…`, placé après `.shell`.
  - Assertion postbuild : `data-consent-open` ⇔ `data-consent-banner`.
- **Acceptation :** aucun lien cookie tant que la pub est désactivée, et les 3 langues sont équivalentes.
- **Personas :** SEC, RES, LEG, PERF

### 26. Des promesses de contact sans canal (préparation non gated)
- **Problème :**
  - /transparenz, /datenschutz §7 et /quellen renvoient à l'Impressum, qui est vide, et promettent une réponse sous 7 jours.
  - `security.txt` pointe vers `/impressum`.
- **Preuve :** pages live ; `functions/.well-known/security.txt.ts:15`.
- **Correctif :**
  - Tant que `NEXT_PUBLIC_OPERATOR_EMAIL` est vide, remplacer ces promesses par « Kontaktadresse folgt vor dem öffentlichen Start ».
  - Assertion de build : échec si `SITE_INDEXABLE=1` et que l'email est vide.
  - `security.txt` : `Contact: https://github.com/yorian-melki/denner-deal-radar/security/advisories/new` (l'activation par un clic est gated), plus `Policy: /de/sicherheit`.
  - Remplir l'Impressum : (gated).
- **Acceptation :**
  - Aucune page ne promet de délai de réponse.
  - Vitest : `Contact` ne contient jamais `/impressum`.
- **Personas :** LEG, SEC, RES

### 27. Liste blanche des hôtes sortants et `/api/click`
- **Problème :**
  - Les URL sortantes du feed ne sont filtrées par aucune liste blanche. Des hôtes comme doubleclick, secretflying ou 20min arrivent en prod sans que personne le voie.
  - `/api/click` peut être falsifié avec un seul en-tête.
  - Il n'y a pas de binding `CLICKS`, donc le endpoint consomme des invocations sans rien enregistrer.
- **Preuve :** `project.ts:169-173` ; un POST curl avec `Origin` renvoie 204 ; pas de `wrangler.toml`.
- **Correctif :**
  - Une assertion postbuild liste les hôtes externes distincts de `out/` et échoue sur tout hôte absent de `MERCHANT_HOSTS` (`lib/sources.ts`).
  - Côté scanner : publier `universal.json.sha256` et le vérifier dans `lib/data.ts`.
  - N'envoyer le beacon que si `<html data-clicks="1">`, attribut posé seulement lorsque le binding existe. Sinon, retirer `/api/*` de `_routes` (la route `/` reste).
  - Avec un domaine propre : règle WAF à 20 requêtes par 10 s par IP (gated pour le domaine).
- **Acceptation :**
  - Un nouvel hôte sortant fait échouer le build.
  - Aucune requête vers `/api/click` tant que `CLICKS` est absent.
- **Personas :** SEC

### 28. CSP et en-têtes des Functions
- **Problème :**
  - La CSP garde `style-src 'unsafe-inline'`, alors que `out/` ne contient ni `<style` ni `style=`.
  - Aucun reporting n'est configuré.
  - Les réponses des Functions n'ont pas de `Permissions-Policy` ni de `CORP`.
  - Le Cache-Control de `og.png` est doublé (`max-age=60` et `max-age=3600`).
- **Preuve :** en-têtes live ; `postbuild.mjs:104` ; `public/_headers`.
- **Correctif :**
  - CSP : `style-src 'self'`, avec `'unsafe-inline'` seulement si les pubs sont activées. Une assertion postbuild interdit `style=` et `<style`.
  - Compléter `SECURITY_HEADERS`. Pour le non-HTML : `default-src 'none'; frame-ancestors 'none'`.
  - Ajouter `! Cache-Control` dans la règle `/*/og.png`.
  - Smoke test post-deploy : aucun en-tête dupliqué.
- **Acceptation :** aucune occurrence de `unsafe-inline` dans la CSP, un seul `max-age` sur `og.png`, et un vitest sur les en-têtes des 3 routes Function.
- **Personas :** SEC, PERF, RES

### 29. Chaîne d'approvisionnement CI
- **Problème :**
  - Les actions sont référencées par tag (`@v4`) dans des workflows qui ont accès aux secrets Cloudflare et Telegram.
  - `npx wrangler` tourne sans lockfile.
  - `pip` est installé sans hash.
  - Il n'y a pas de Dependabot (items 34 et 44 du round 2).
- **Preuve :** `.github/workflows/*.yml`, `nametest.yml:26`.
- **Correctif :**
  - Épingler les actions par SHA, avec le tag en commentaire.
  - Ajouter `.github/dependabot.yml` (github-actions, npm `/web` et `/name-test`, pip).
  - Créer `name-test/package-lock.json` et lancer `npm ci`.
  - `pip-compile --generate-hashes`, puis `--require-hashes` à l'installation.
  - Utiliser un token Pages:Edit uniquement, et un token séparé pour name-test.
- **Acceptation :** `grep -E 'uses: .*@v[0-9]'` ne renvoie rien et Dependabot est actif.
- **Personas :** SEC, RES

### 30. Score du scanner : facteurs propres au propriétaire
- **Problème :**
  - `uscoring.py:167-169` retire 0.5 aux deals situés à plus de 5 km du domicile du propriétaire, et ce score est publié.
  - `uscoring.py:146-148` accorde le bonus « record » dès `n>=2`, alors que le site exige 3 observations.
  - Les bonus selon le montant de l'économie ne sont pas expliqués.
- **Preuve :** fichiers cités ; `select.ts` (`LOWEST_MIN_OBSERVATIONS=3`).
- **Correctif :**
  - `score_deal(public=True)` sans pénalité de distance. La distance reste dans `personal_relevance`.
  - Bonus « record » à partir de `n>=3`.
  - /transparenz liste les ajustements générés à partir des constantes : bonus +0.5 et +0.3, plafonds 6.0, 7.5 et 8.5, pénalités −8 % et −15 %.
  - Pytest : `score_components` ne contient aucun champ `commission|payout|epc|affil`.
  - Test de neutralité étendu à `orderCategory` et au bloc « Mehr aus », plus un test statique qui interdit l'import de `@/lib/affiliate` dans `select`, `project` et `CategoryListing`.
- **Acceptation :** le score public ne dépend pas de `distance_km`, et /transparenz est généré à partir des constantes (snapshot).
- **Personas :** LEG, UX

### 31. Garde-fou spiritueux et tabac (AlkG art. 42b, TabPG)
- **Problème :** rien n'empêche une promo de gin chez Lidl ou QoQa d'afficher un « statt », un « −x % » ou une note. Le feed contient déjà 6 spiritueux.
- **Preuve :** `out/de/deal/gordon-s-london-dry-gin-ovrnlh.html` ; aucune règle dans `project.ts` ni dans `categories.ts`.
- **Correctif :**
  - Définir les regex `SPIRITS` et `TOBACCO` dans `project.ts`, en excluant Kirschstengeli et Ginger.
  - SPIRITS : pas de score, pas de `referencePrice` ni de `discount`, `noShowcase`, et jamais dans Gratis.
  - TOBACCO : non publié.
  - Ajouter une ligne dans /transparenz, section « Was wir nicht zeigen ».
- **Acceptation :** sur une fixture de gin Lidl avec `oldPrice`, ni `.was`, ni `.card-save`, ni badge.
- **Personas :** LEG

### 32. Handy-Abos : comparer à prestations égales
- **Problème :**
  - Les cartes n'indiquent ni le volume de données, ni le roaming, ni le réseau.
  - Le prix catalogue de l'opérateur est étiqueté « früherer Preis » (`dschungelkompass.py:214`).
  - Des abos avec une durée minimale de 2 mois sont présentés avec un total sur 24 mois sans préciser l'hypothèse.
- **Preuve :** live `/handy-abos`.
- **Correctif :**
  - `reference_price_type='catalog'`, affiché « Preisangabe des Anbieters ».
  - Ajouter à la méta : `data_gb` ou « unlimitiert », `eu_roaming` et `network`. Si `data_gb` manque : « Datenvolumen: siehe Anbieter », et ces lignes passent en fin de liste.
  - Note de tri : « Nach Gesamtkosten über 24 Monate – Leistungen unterscheiden sich ».
  - `unrated` est traité dans l'item 2.
- **Acceptation :** 0 badge sur `/handy-abos`, et chaque carte affiche son volume de données ou « siehe Anbieter ».
- **Personas :** LEG, VAL

### 33. Feed public : la position du propriétaire est exposée (gated pour la purge)
- **Problème :** `universal.json` contient `distance_km`, `favorite`, `eligible_home`, `store_ids`, `watchlists`, `personal_relevance`, `image_url` et `description`. Cela contredit /quellen.
- **Preuve :** curl du feed le 29.10 à 00:59 (8 929 deals).
- **Correctif :**
  - Préparer `radar/export.py` pour écrire une projection publique (même liste blanche que `projectDeal`), derrière un flag désactivé par défaut.
  - Ajouter un test CI qui vérifie qu'aucune de ces clés n'est présente dans la projection.
  - Activer la projection et purger l'historique gh-pages : (gated).
  - En attendant, garder le `noindex`.
- **Acceptation :** la projection existe et passe le test, sans être activée sans GO.
- **Personas :** LEG, SEC

---

## P2

### 34. Sens des couleurs et logo
- **Problème :**
  - Le vert sert à la fois aux liens, au CTA et aux économies.
  - La tuile « D » collée à « Deal » se lit « D Deal Radar ».
  - Le tracking négatif réglé pour SF est appliqué à Segoe UI et à Roboto.
- **Preuve :** `live.css`, `--accent` ; header live.
- **Correctif :**
  - Réserver `--accent` à `.card-save`, `.deal-saving` et `.badge-top`.
  - Liens en `--fg` avec soulignement. CTA neutre (fond `--fg`, texte `--bg`). Focus en #0066cc / #4da3ff.
  - Tuile réservée aux icônes : dans l'en-tête, wordmark seul.
  - Tokens `--track-*` remis à 0 hors Apple (`@supports not (font: -apple-system-body)`).
- **Acceptation :** un scan des styles calculés ne trouve `--accent` que dans les 3 classes autorisées.
- **Personas :** BT

### 35. Rétention honnête
- **Problème :** pas de recherche, pas de marqueur « Neu », pas de RSS. Le lien Telegram est prêt mais incohérent avec le site.
- **Preuve :** `/de/suche` et `/feed.xml` renvoient 404 ; `radar/channel.py:155-199,330`.
- **Correctif :**
  - Puce « Neu » si `firstSeenAt` est postérieur à la dernière visite (stockée en `localStorage` dans un try/catch).
  - RSS statique par ville et par catégorie, filtré par la règle de la vitrine.
  - Index de recherche chargé à la demande (≤ 35 KB br), avec repli `<form>`.
  - Avant d'activer `NEXT_PUBLIC_TELEGRAM_URL`, le canal doit consommer `out/feed.json` (comparateur unique, `cleanTitle`, « laut {Händler} », liens `/${lang}/deal/`).
- **Acceptation :** 0 octet de JS de recherche au premier chargement, et le site fonctionne même si le stockage est bloqué.
- **Personas :** UX, VAL, LEG

### 36. Promesse de valeur sur l'accueil
- **Problème :** « 1’600 Aktionen » est un volume, pas un bénéfice. La mention « 0 bezahlte Platzierungen » n'apparaît que dans le footer.
- **Preuve :** live `/de/st-gallen`.
- **Correctif :** sous le H1, une ligne de 15 px :
  - DE : « Sortiert nach Ersparnis zum Statt-Preis – nie nach Provision. »
  - FR : « Triées selon l’économie par rapport au prix barré – jamais selon une commission. »
  - EN : « Ranked by saving versus the was price – never by commission. »

  Le compteur vient de la même constante que le footer.
- **Acceptation :** la ligne est présente en 3 langues sans dépasser le budget de l'item 5.
- **Personas :** VAL

### 37. Sémantique et lecteurs d'écran (détails)
- **Problème :**
  - `aria-labelledby` est posé sur chaque `li.card` (`DealCard.tsx:145`).
  - Le H2 sr-only répète le H1 (`CategoryListing.tsx:119`).
  - « Zurück » est ambigu.
  - Le footer porte l'`aria-label` « Methode & Transparenz » (`SiteChrome.tsx:70`).
  - La table de faits est en `space-between`.
  - Le séparateur ’ dans « 1’600 » est à vérifier avec VoiceOver et NVDA.
  - « Studis » et le jargon de /transparenz posent problème (phrases de plus de 20 mots).
- **Preuve :** fichiers cités.
- **Correctif :**
  - Retirer `aria-labelledby` des `li`.
  - H2 : « Angebote 25–48 von 76 (Seite 2 von 4) ».
  - Pager : « Vorherige/Nächste Seite ».
  - Footer : `aria-label` « Rechtliches & Methode ».
  - `.facts` en grille `minmax(8em,40%) 1fr` alignée à gauche.
  - « Datenqualität » devient « Wie sicher sind die Daten? ».
  - /transparenz : 20 mots maximum par phrase.
  - Le séparateur ’ passe en sr-only uniquement si le test sur appareil montre une mauvaise lecture.
- **Acceptation :** NVDA lit chaque carte une seule fois, et le script de lisibilité ne trouve aucune phrase de plus de 20 mots.
- **Personas :** A11Y

### 38. Pages EN légales encore en allemand, et SEO
- **Problème :**
  - `/en/agb`, `/en/impressum` et `/en/quellen` ont un `<title>` anglais mais un corps allemand.
  - Le sitemap pointe vers des URL `/de`, `/fr` et `/en` qui redirigent en 302, et n'a pas de `x-default`.
  - « Saint‑Gall » est écrit avec U+2011 dans `<title>` et dans la meta.
- **Preuve :** pages live ; `app/sitemap.ts:20`.
- **Correctif :**
  - Traduire `agb` et `quellen`, et l'Impressum hors identité.
  - Retirer les entrées racine du sitemap et ajouter `x-default`.
  - Utiliser l'ASCII « Saint-Gall » dans les méta et le nowrap dans le texte visible.
- **Acceptation :** chaque `<loc>` renvoie 200, et le corps des pages EN est en anglais.
- **Personas :** I18N

### 39. Performance : budgets, prefetch et redirection
- **Problème :**
  - Le budget ne couvre que la page ville et le JS.
  - Il n'y a pas de prefetch : chaque tap coûte un RTT.
  - Le CSS (4.6 KB br) bloque le rendu.
  - La 302 de `/` porte `max-age=0`.
- **Preuve :** `postbuild.mjs:24` ; `functions/index.ts:27`.
- **Correctif :**
  - Budgets : 40 KB HTML brut, 6 KB br de CSS, 3 KB br de JS.
  - Fichier `speculation-rules.json` avec l'en-tête `Speculation-Rules` (prefetch modéré, prerender conservateur sur `.card-link`).
  - CSS inline sur la page ville, la page 1 des catégories et les pages deal.
  - 302 de `/` en `private, max-age=86400`.
  - LHCI en CI, à titre de rapport.
- **Acceptation :** les budgets échouent en cas de dépassement, et les règles de spéculation apparaissent dans DevTools.
- **Personas :** PERF

### 40. Typo des titres de remise (DE)
- **Problème :** « 15% Rabatt » côtoie « 5 % Rabatt » en DE, et « Fnac: Fnac-Karte: » double le préfixe.
- **Preuve :** live `/studenten-rabatte`.
- **Correctif :** couvert par l'item 6, points (i) et (j). Ajouter un snapshot sur les 3 titres live.
- **Acceptation :** le snapshot passe.
- **Personas :** ST, RES

### 41. Montants ronds au format « CHF 10.– »
- **Problème :** les événements et les frais d'abonnement affichent « CHF 10.00 ».
- **Preuve :** `format.ts:18-22`.
- **Correctif :** `fmtPrice(v, cur, {round:true})` donne « CHF 10.– » uniquement pour les événements, les frais et les totaux. `aria-label` et JSON-LD restent inchangés.
- **Acceptation :** décision documentée dans l'en-tête de `format.ts`.
- **Personas :** I18N, BT

### 42. Audit « vibe-coded » dans le postbuild
- **Problème :** les points forts actuels (pas de dégradés, pas d'emoji dans le chrome, en-têtes de sécurité, JS de 7 KB) ne sont protégés par aucun garde-fou.
- **Preuve :** audit RES du 29.10.
- **Correctif :** `scripts/audit-vibe.mjs` fait échouer le build sur :
  - un `gradient` hors masques de `.chips` ;
  - un `\p{Extended_Pictographic}` hors titres ;
  - un `<script>` inline autre que ld+json ;
  - plus de 10 KB br de JS ;
  - une CSP ou un HSTS manquant.
- **Acceptation :** le script tourne dans le postbuild.
- **Personas :** RES

### 43. Monétisation, à préparer sans activer (gated)
- **Problème :** l'`AdSlot` est sur la page deal (`page.tsx:238`). « lien commercial » en FR est ambigu. « même prix pour toi » est une promesse inconditionnelle.
- **Preuve :** `i18n.ts:337-338` ; `CityDashboard.tsx:133` et `CategoryListing.tsx:133`.
- **Correctif :**
  - Retirer l'`AdSlot` de la page deal. Pas de pub avant la 6e carte.
  - FR : « lien publicitaire (affilié) ».
  - « dein Preis ändert sich nicht » uniquement pour les programmes vérifiés, sinon « wir erhalten ggf. eine Provision ».
  - Le libellé reste dans le bouton.
  - Assertion : tout `rel~=sponsored` a un libellé visible dans le même élément.
  - Activation : (gated).
- **Acceptation :** aucun `AdSlot` dans `out/*/deal/*` ; assertion en place.
- **Personas :** VAL, LEG, RES

### 44. Sponsors futurs face à la mention « 0 bezahlte Platzierungen »
- **Problème :** `EXPANSION_STRATEGIE.md:47` prévoit des « sponsors locaux », alors que le compteur du footer est figé à 0.
- **Preuve :** le document cité.
- **Correctif :**
  - Le compteur lit une constante `SPONSORS`.
  - /transparenz : tout sponsor futur n'apparaît que dans un emplacement « Gesponsert », hors de toute liste classée.
  - La note Supermarkt ajoute « · höchstens ⅓ pro Laden je Seite ».
- **Acceptation :** le compteur et la constante sont liés (test).
- **Personas :** LEG
