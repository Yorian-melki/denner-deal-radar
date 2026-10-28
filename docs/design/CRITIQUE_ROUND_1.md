# Critique — Round 1 (backlog unique, dédupliqué)

Source : 194 constats de 10 personas (apple-design, brand-type, ux-research, hsg-student, a11y, perf-eng, security, legal-ethics, value-strategist, i18n-content) + agent recherche. Vérifié en live le 28.10.2026 : `localhost:3000` présent dans le HTML de https://savradar.pages.dev/, et `/fr`, `/en`, `/de/` renvoient tous 404.

**Arbitrages (quand les personas se contredisent, la simplicité et l'honnêteté l'emportent)**
- Bouton CTA : on n'en garde **aucun par carte**. La carte entière ouvre la page deal, et cette page porte **un seul** bouton primaire. Ceux qui voulaient garder un CTA pleine largeur sur chaque carte sont écartés.
- Couleur des notes : badge **neutre** accompagné du mot du verdict. Une seule teinte, réservée à « Top » (≥ 8.5). On rejette à la fois le feu tricolore et la rampe verte multi-teintes.
- Hero : **pas de montant agrégé**, ni en grand ni en médiane. À la place : un H1 factuel, une ligne de faits, puis directement les deals.
- Prix de référence non vérifiables (UVP, catalogue, valeur déclarée, % du vendeur) : pas de prix barré, pas de « Du sparst », pas de note au-dessus de « Gut ».
- Langue : préfixe d'URL `/de|/fr|/en`, mêmes slugs dans les trois langues. Pas de `?lang=` et pas de redirection automatique sur un lien profond.
- Police : Inter variable, auto-hébergée (une seule famille).

---

## P0 — à livrer dans ce round

**P0-1. Toutes les URL absolues pointent vers `http://localhost:3000`**
- Problème : canonical, og:url, og:image, sitemap, JSON-LD et chaque lien de partage WhatsApp mènent à une adresse morte. Toute la boucle de partage est cassée et le site ressemble à une arnaque.
- Preuve : curl de `/` donne `<link rel="canonical" href="http://localhost:3000">`. `/st-gallen` contient 30 occurrences, `sitemap.xml` 823 `<loc>` en localhost. Cause : `lib/site.ts:6` (fallback), `.github/workflows/web.yml:29` (`vars.SITE_URL` vide).
- Correctif : définir la variable `SITE_URL`/`NEXT_PUBLIC_SITE_URL=https://savradar.pages.dev` dans GitHub et dans Pages. Dans `lib/site.ts`, `throw` si `CI`/`CF_PAGES`/`NODE_ENV=production` et que l'URL est absente, ne commence pas par `https://` ou contient `localhost`. Ajouter une étape post-build `! grep -rl localhost out/`.
- Acceptation : `grep -r localhost out/` = 0 et `curl / | grep canonical` donne `https://savradar.pages.dev`. Un build CI sans la variable échoue.
- Personas : toutes (11/11).

**P0-2. Changement de langue inexistant (DE/FR/EN)**
- Problème : il n'y a aucun sélecteur de langue. La langue est déduite de la ville, donc St. Gallen est toujours en allemand. Les dictionnaires FR et EN ne sont jamais rendus. Les pages légales empilent DE et FR, sans EN. La bannière consentement, le libellé pub et l'affTitle sont codés en dur. `<html lang="de">` est fixe, il n'y a pas de hreflang et la 404 est toujours en allemand.
- Preuve : `config/cities.ts:43-47` (`localeForPath`), `SiteChrome.tsx:10-37`, `app/layout.tsx:44`, `Consent.tsx:72-120`, `AdSlot.tsx:44-45`, `OutLink.tsx:12`, `app/not-found.tsx:8`. En live, `/fr`, `/en` et `/de/` renvoient 404.
- Correctif :
  - Routes : tout passe sous `app/[locale]/` avec `generateStaticParams` sur locales × villes × catégories × deals, et des slugs identiques entre langues. `<html lang={de-CH|fr-CH|en}>` est posé dans `app/[locale]/layout.tsx`. Chaque `generateMetadata` émet `alternates.languages` (de-CH, fr-CH, en, x-default), et le sitemap les reprend.
  - Sélecteur `DE · FR · EN` dans le header : 3 `<a hreflang lang>`, `aria-current` sur la langue active, zone cliquable ≥ 44 px. Le href remplace uniquement le premier segment de `usePathname()` et conserve query et hash. Jamais de lien vers `/`.
  - Redirections : `/` mène à `/de` (lien statique, sans détection forcée). `public/_redirects` fait un 301 des anciennes URL non préfixées vers `/de/…`.
  - Pages légales : une langue par URL. Si l'EN n'est pas relu par un juriste, afficher la note « la version DE fait foi ».
  - Textes codés en dur : consentement, `adLabel`, `cookieSettings` et `affTitle` passent dans `Dict`. Ajouter `react/jsx-no-literals` en CI.
  - 404 : localisée, avec deux messages (deal ou page) et un retour vers `/${locale}/${ville}`.
  - Limite Cloudflare Pages (20 000 fichiers) : arrêter les fichiers RSC par deal (`.txt` et segments). Ajouter un check CI `find out -type f | wc -l < 18000`.
- Acceptation : un test parcourt toutes les routes de `out/` et vérifie que chaque `/de/X` a ses équivalents `/fr/X` et `/en/X`, que le href du sélecteur existe dans `out/` et qu'aucune page ne mélange deux langues d'UI. Un passage manuel du sélecteur sur home, catégorie, deal, légal et 404 reste toujours sur la page équivalente.
- Personas : apple-design, brand-type, ux-research, hsg-student, a11y, perf-eng, legal-ethics, value-strategist, i18n-content, research.

**P0-3. Prix barrés, « Du sparst » et notes élevées sur des références non vérifiables**
- Problème : le site barre et note des prix d'ancrage que le droit suisse n'accepte pas (UVP, catalogue, valeur déclarée, % annoncé par le vendeur). Il affiche aussi « −x % » sans référence et des remises sur des deals que le scanner classe `above_usual_price`. Résultat : les notes contredisent la propre légende du site.
- Preuve :
  - ExpressVPN est noté 9.3 « Top-Deal » avec une confiance de 55 % et une référence « nur Prozentangabe des Anbieters », alors que `/transparenz` dit « ohne überprüfbaren Referenzpreis keine Note ».
  - Tefal est affiché à 99.90 avec 199 barré, « vs. Katalogpreis », « Sehr gut » (`after-category-mobile-light.jpg`).
  - Massagepraxis : 60 barré à 120 (prix catalogue du praticien).
  - PostFinance : bonus présenté comme « Du sparst CHF 100 » avec une confiance de 25 %.
  - Quickline affiche « −5 % » sans aucune référence.
  - 2 146 deals sont `promotion_integrity=above_usual_price` mais restent barrés. `projectDeal` (`lib/project.ts:74-111`) ignore ce champ, et `PriceRow`/`SaveLine` (`DealCard.tsx:105-155`) ne filtrent rien.
  - Erreur de donnée : « Mövenpick Himmlische 500g » est comparé à la référence d'un pack 3×500 g et reçoit 8.2 « hohe Sicherheit ».
- Correctif :
  - Projeter `promotion_integrity`.
  - Afficher le prix barré, le −% et l'économie **seulement si** `referenceType ∈ {merchant_previous, competitor, market}`, `integrity==='ok'` et `confidence ≥ 0.7`.
  - Pour UVP, catalogue et valeur déclarée : afficher la ligne neutre « Preisangabe des Anbieters: CHF 199 », plafonner la note à 6.9, sans mot de verdict au-dessus de « Gut ».
  - Pour `vendor_pct` : `score=undefined` et le libellé « Rabatt laut Anbieter ». Ne jamais afficher de −% sans référence ou sous 1 %.
  - Créer un type de deal `bonus/signup` sans prix barré ni note.
  - Garde de cohérence quantité : parser `NxM g` dans le titre, et si l'écart avec le prix unitaire dépasse 5 %, `score=undefined`.
  - `pickTop` exclut `score===0`.
- Acceptation : des tests unitaires couvrent chacun de ces cas avec les titres réels cités. Aucune carte en ligne n'affiche à la fois « Schwach/0.0 » et un prix barré, ni « Top-Deal/Sehr gut » avec une confiance < 0.7.
- Personas : ux-research, hsg-student, legal-ethics, value-strategist, research.

**P0-4. Hero = chiffre vanité « CHF 12'937 geprüfte Ersparnis entdeckt »**
- Problème : c'est le plus grand objet de la page. Le chiffre est inatteignable pour un utilisateur, et 63 % du total vient de deals à confiance 0.5. Le mot « geprüft » est faux. Le slab noir, le glow lime, le point pulsant et le kicker en majuscules relèvent de codes marketing « vibe-coded ». Le titre « … — ehrlich bewertet » est de l'auto-éloge.
- Preuve : `CityDashboard.tsx:43-60`, `lib/select.ts:162-188` (`isVerifiedSaving` ignore la confiance), `i18n.ts:13,16,148,271,396`, `globals.css:106-112`, captures `after-home-*`.
- Correctif :
  - Supprimer l'agrégat, `.hero::after`, `.dot` et `.hero-kicker`.
  - Remplacer par un H1 sur fond `--bg` : « Aktionen in St. Gallen » (FR « Actions à Saint-Gall », EN « Deals in St. Gallen »), suivi d'une ligne muted : « 699 Aktionen mit belegtem Vergleichspreis · aktualisiert heute 12:34 · Methode → ».
  - Retirer « geprüft/vérifié/verified » et « ehrlich » dans les 3 langues (titre, intros, OG).
  - Titre de page : `%s – SITE_NAME` (tiret demi-cadratin espacé, une seule fois).
  - Appliquer la même chose à `og.png`.
- Acceptation : sur mobile 390×844, la première carte deal commence à ≤ 200 px. `grep -i "geprüft\|vérifié\|verified\|ehrlich"` dans `lib/i18n.ts` = 0.
- Personas : apple-design, brand-type, ux-research, hsg-student, legal-ethics, value-strategist, i18n-content, research.

**P0-5. Carte deal surchargée (≈14 éléments, la même idée dite 6 fois, un mur de CTA verts)**
- Problème :
  - La qualité d'un deal est codée 6 fois : carré de note, verdict, « Warum? », barres de confiance, −% et « Du sparst ».
  - Le titre n'arrive qu'en 3e ligne.
  - Chaque carte porte un bouton vert pleine largeur et un bouton de partage, ce qui donne 9 CTA visibles sur desktop. Ce poids visuel favorise le futur clic affilié.
  - Le `<details>` dupliqué par carte provoque un reflow à l'ouverture.
  - On compte 4 arrêts de tabulation par carte, soit environ 300 par page.
- Preuve : `DealCard.tsx:82-187`, `globals.css:188,220-221`, captures `after-home-desktop-light.jpg` et `after-category-mobile-light.jpg`. En live sur `/st-gallen` : 244 `<a>` et 62 `<summary>`.
- Correctif : la carte passe à 4 lignes.
  1. Titre (`--t-headline`, sans line-clamp).
  2. Prix (`--t-title`, tabular), suivi de « statt CHF 35.85 » en muted, uniquement si la référence est vérifiée selon P0-3.
  3. Méta 13 px : « Coop · −CHF 22.70 vs. früherer Preis · bis Mi 29.10. ».
  4. Badge de note 32 px neutre en haut à droite, avec un nom accessible « Note 8.2 von 10, sehr gut ».
  - La carte entière est un lien : `.card{position:relative}` et `.card-title a::after{inset:0}` vers `/[locale]/deal/slug`.
  - Supprimer de la carte `OfferButton`, `ShareButton`, `<details>`, les barres de confiance (affichées seulement si confiance < 0.85, comme exception), la pastille −%, et le tag de catégorie dans les listes déjà filtrées.
  - Le h3 vient en premier dans le DOM, avec `aria-labelledby` sur l'`<article>`.
- Acceptation :
  - ≤ 2 arrêts de tabulation par carte, 3 tailles de texte et 2 graisses par carte.
  - Ouvrir une carte ne provoque aucun décalage de layout.
  - HTML de la catégorie ≤ 150 Ko brut, ≤ 1 200 nœuds DOM.
  - Pixels de couleur primaire au premier écran réduits d'environ 90 %.
- Personas : apple-design, brand-type, ux-research, hsg-student, a11y, perf-eng, value-strategist, research.

**P0-6. Design system : typo, graisses, couleurs, rayons, police d'identité**
- Problème : 14 tailles de police, 12 règles à 800, 5 verts différents plus lime, ambre, bleu Telegram et bleu focus, 8 rayons. La police système change d'un appareil à l'autre, et l'OG utilise encore une autre police.
- Preuve : `globals.css:13-47` (tokens), toutes les `font-size`/`font-weight` littérales, `after-deal-desktop-dark.jpg` (3 verts adjacents), `--top-h`.
- Correctif :
  - Échelle de texte : `--t-caption 12/16`, `--t-footnote 13/18`, `--t-body 15/22` (17 à partir de 640), `--t-headline 17/22 600`, `--t-title 22/28 700`, `--t-large 34/40 700 −0.022em`.
  - Graisses 400/600/700 uniquement, plus aucun 800.
  - Couleurs : un seul accent vert (`#0a7a50` en clair, `#34c27a` en sombre), réservé aux éléments interactifs. Les notes sont en `--fg` sur `--fill`, avec une teinte unique pour ≥ 8.5. Supprimer `--lime`, `--pct`, `--mid`, `--mid-fg` et `--low-bg`. Le lime ne sert plus qu'à la marque, s'il est conservé.
  - Rayons : `--r-lg 20` (cartes, padding 16), `--r-md 12` (boutons), `--r-sm 8` (éléments internes), `--r-full` (chips).
  - Police : Inter variable, sous-ensemble latin en woff2 dans `/public/fonts`, `font-display:swap` avec `size-adjust`, préchargée, et la même police chargée dans `og.png` via `ImageResponse({fonts})`.
  - Chiffres : `proportional-nums` pour les prix d'affichage, `tabular-nums` pour les listes.
  - Mode sombre : 3 niveaux d'élévation (`#0b0c0e`, `#16181c`, `#1f2227`) plus `inset 0 1px rgba(255,255,255,.06)`.
  - Mettre un tableau des tokens en tête de `globals.css`.
- Acceptation : une règle stylelint autorise seulement `var(--t-*)` pour `font-size` et `var(--w-*)` pour `font-weight`. Un script de contraste en CI vérifie texte ≥ 4.5:1 et bordures de contrôle ≥ 3:1 sur chaque paire de tokens, clair et sombre.
- Personas : apple-design, brand-type, a11y, hsg-student, research.

**P0-7. Abos mobiles/internet : prix mensuel présenté comme ponctuel, engagement et frais cachés**
- Problème : « GGA Maur CHF 39.00 » s'affiche sans « /Monat ». La carte ne dit pas que c'est 12 mois, puis 49.00, plus 49.00 de frais d'activation, alors que `net_savings` vaut −58.6. L'intro « Preis über die ganze Laufzeit gerechnet » est fausse. Les conditions (Lidl Plus, compte requis, « ab 2 Stück », code promo) ne sont jamais montrées sur les cartes et apparaissent en français brut sur les pages DE (« prix Lidl Plus : application Lidl Plus requise », « CHF/pièce »).
- Preuve : `/st-gallen/handy-abos`, `lib/project.ts:73-111` (champs abandonnés), `DealCard.tsx:146-155` (`unit` ignoré), `deal/[slug]/page.tsx:123-129`.
- Correctif :
  - Projeter `commitment_months`, `activation_fee`, `price_after_promo`, `regular_monthly_price`, `total_acquisition_cost`, `net_savings`, `requires_membership/account/coupon`, `minimum_quantity` et `minimum_order_value`.
  - Afficher le suffixe « /Monat ».
  - Ajouter une ligne obligatoire pour les abonnements : « Mindestlaufzeit 24 Mte · danach CHF 49.00 · Aufschaltung CHF 49.00 · Total CHF X ».
  - Trier par coût total.
  - Masquer l'économie si `net_savings ≤ 0`.
  - Ajouter une puce de condition sur la carte, traduite via des codes i18n (« nur mit Lidl Plus »).
  - Faire passer unités et conditions du scanner par une table de correspondance en attendant les codes. Le build échoue si une page DE contient `pièce|requise|prix`.
- Acceptation : aucun abonnement sans « /Monat » ni sans durée minimale. Les conditions sont visibles sur la carte dans la langue de la page, et le test anti-fuite FR passe.
- Personas : legal-ethics, i18n-content, value-strategist.

**P0-8. Liens sortants trompeurs : « bei Coop » ouvre rappn.ch, liens d'affiliation de tiers non marqués**
- Problème :
  - Le bouton « Zum Angebot bei Coop » mène à rappn.ch. Côté Gratis, « bei preispirat » envoie vers un agrégateur concurrent.
  - Des liens d'affiliation de Dschungelkompass (tradedoubler, awin, ct0) sont publiés sans `*` ni `rel=sponsored`, et le code partenaire KOMPASS26 est republié.
  - Le JSON-LD `Product` indique `brand: Coop` et `InStock`.
- Preuve : HTML de la home (`href="https://rappn.ch/de/aktionen/coop/…"`), `/st-gallen/handy-abos` (`clk.tradedoubler.com…`), `lib/affiliate/rewrite.ts:40`, `DealCard.tsx:128-137`, `deal/[slug]/page.tsx:73-87`.
- Correctif :
  - Si l'hôte de l'URL n'est pas celui du marchand, le libellé devient « Bei rappn.ch ansehen ↗ » avec la mention « Coop-Aktion, gefunden über rappn.ch ».
  - `isForeignAffiliate` : désemballer l'URL marchande, sinon exclure le deal.
  - Ne pas republier les codes partenaires de tiers.
  - Allowlist d'hôtes sortants (`config/hosts.ts`) : passer `http:` en `https:`, et faire échouer le build si plus de 2 % des deals sont rejetés.
  - JSON-LD : supprimer `brand` (ou utiliser la vraie marque) et `availability`. `offers.url` doit toujours pointer vers le marchand.
- Acceptation : un test vérifie que l'hôte du libellé du bouton est égal à l'hôte du href, ou qu'une mention « via » est présente. 0 domaine d'affiliation tiers dans `out/`. Le JSON-LD est valide sans `brand` erroné.
- Personas : ux-research, hsg-student, legal-ethics, value-strategist, research, security.

**P0-9. Site public sans identité de l'exploitant**
- Problème : `/impressum` affiche « Vorschau — Angaben folgen ». `/datenschutz` renvoie à une « oben genannte Adresse » qui n'existe pas. `security.txt` pointe vers cet Impressum vide et vers `/quellen`, qui n'est pas une politique de divulgation.
- Preuve : curl de `/impressum` et `/datenschutz`, `functions/.well-known/security.txt.ts:14,20`, `app/impressum/operator.ts:19`.
- Correctif :
  - Soit renseigner `NEXT_PUBLIC_OPERATOR_NAME/ADDRESS/EMAIL` (alias contact@ via Cloudflare Email Routing), soit placer `savradar.pages.dev` derrière Cloudflare Access jusqu'à ce que ce soit fait. Le choix revient à Yorian.
  - Retirer `Policy:` de `security.txt` tant que la page `/sicherheit` n'existe pas.
  - Ajouter une garde CI : l'indexation, les variables `AFF_*` ou `ADSENSE` sont impossibles si les données exploitant manquent.
- Acceptation : l'Impressum contient un nom et un e-mail joignable, ou le site est derrière Access. Le build échoue si `INDEXABLE` ou `AFF_*` est actif sans données exploitant.
- Personas : legal-ethics, security, research.

---

## P1

**P1-1. Doublons de promotion et compteurs incohérents**
- Problème : Mövenpick Crema et Il Divino occupent les places #1 et #2 du Top, alors que le site promet « gleiche Produkte zusammengefasst ». Les chips et le texte « Alle N » ne concordent pas : « Supermarkt 1349 » à côté de « Alle 1350 ».
- Preuve : `select.ts:22-24` (`variantKey` construit sur 3 mots), `select.ts:144` et `select.ts:152`.
- Correctif : construire une clé de promotion `marchand|marque|prix|référence|fin`, et afficher une seule carte « 3 Sorten ». Limiter `pickTop` à 1 deal par marchand+marque. Les « Mehr … » excluent la même clé. Tous les compteurs viennent d'une liste canonique unique par ville.
- Acceptation : test fixture sur les 3 Mövenpick → 1 carte. Test de compteurs : chip = section = page catégorie.
- Personas : ux-research, hsg-student, legal-ethics, value-strategist, research.

**P1-2. Catégorisation par source au lieu du produit**
- Problème : de la litière pour chat et un set de casseroles apparaissent dans Tech. Vanish et Finish sont dans Shopping. Une consultation en psychologie nutritionnelle est rangée sous « Shopping ».
- Preuve : `lib/categories.ts:7`, `after-category-mobile-light.jpg`.
- Correctif : utiliser le champ `category` du scanner, puis un classifieur par mots-clés. Créer les catégories « Haushalt » et « Lokal & Services », et exclure les services du Top. Les enseignes de supermarché vont dans Supermarkt.
- Acceptation : test fixture avec les titres cités. Aucun item visible en tête de Tech qui ne soit pas de la tech.
- Personas : apple-design, ux-research, hsg-student, legal-ethics, value-strategist, research.

**P1-3. Home et chips non orientées étudiants**
- Problème : la section Shopping de la home affiche des deals à 3.3 « Schwach ». Gratis et Studis n'apparaissent pas. Les chips sont triées par volume, avec de gros compteurs, et coupées à « Refurl ».
- Preuve : `select.ts:119-149`, `CityDashboard.tsx:82-85,148-152`, captures home.
- Correctif :
  - Home : note ≥ 5.5 exigée, et une section n'apparaît que si elle compte au moins 2 cartes.
  - Ordre : Studis (libellé « Rabatt laut Anbieter », ordre neutre), Gratis, Supermarkt, Tech, …
  - Chips sans compteur, puce active en `--fill`, retour à la ligne à partir de 900 px, masque de fondu sur mobile.
  - Dédupliquer et nettoyer les titres (`[Neukunden]`, marques répétées).
  - Les essais gratuits à renouvellement automatique prennent le tag « Testabo » et quittent « Gratis ».
- Acceptation : 0 carte < 5.5 sur la home. Studis est visible au premier écran sur mobile.
- Personas : ux-research, hsg-student, value-strategist, apple-design, research.

**P1-4. Impossible de trouver un deal (60 sur 1 350, ni recherche ni filtre)**
- Problème : 1 290 offres sont inaccessibles, le texte « + 1290 weitere » n'est pas un lien, et il n'y a aucune recherche.
- Preuve : `app/[city]/[category]/page.tsx:22,84-87`.
- Correctif :
  - Pagination statique à 24 par page (`/…/2`).
  - JSON compact par ville chargé au focus du champ de recherche (MiniSearch) : recherche, puces de magasin, tri Note/Prix/Ersparnis.
  - État dans l'URL (`?q=&shop=`), conservé lors d'un changement de langue.
  - En-tête « 24 von 1’350 ».
- Acceptation : « Kaffee » et « Migros » donnent des résultats. Le lien avec `?q=` se partage, et le sélecteur de langue garde la query.
- Personas : ux-research, research, perf-eng.

**P1-5. Barres sticky mobiles (≈110 px, double flou) et header incohérent**
- Problème : deux barres translucides empilées. L'item ville alterne entre texte simple et pilule noire. Le focus clavier passe sous les barres.
- Preuve : `globals.css:76-84,131`, `SiteChrome.tsx:30`, captures mobile.
- Correctif :
  - Une seule barre sticky de 56 px ou moins sur mobile, fond plein à 97 %, sans `backdrop-filter`.
  - Header : wordmark, « St. Gallen ▾ » (popover listant les villes), sélecteur de langue. Même apparence sur toutes les routes.
  - `html{scroll-padding-top}`, et barres statiques sous `max-height:500px`.
  - `content-visibility:auto` sur `.card`.
- Acceptation : chrome persistante ≤ 56 px à 390 px de large. Le focus n'est jamais masqué en Shift+Tab.
- Personas : apple-design, a11y, perf-eng.

**P1-6. Page deal : hiérarchie et preuves**
- Problème : le H1 et le prix se disputent l'attention. « 8.2 · 8.2 von 10 » est affiché deux fois. Une liste à puces ne contient qu'un élément. La source flotte hors des cartes. L'historique « Median 13.90 · 1 Preisbeobachtungen » est vide de sens. « ab 05.03. » s'affiche sans année.
- Preuve : `deal/[slug]/page.tsx:98-147`, `DealCard.tsx:43-51`, `i18n.ts:62`.
- Correctif :
  - Titre en `--t-title` 600, puis le prix à 48 px, seul élément dominant, avec une ligne d'économie dessous.
  - « Sehr gut · 8.2/10 » affiché une seule fois.
  - Faits en `<dl>` 2 colonnes, source comme dernière ligne.
  - Historique seulement si `historyN ≥ 3`, sinon « noch zu wenig Daten ». Sparkline SVG si `historyN ≥ 5`.
  - Économie toujours au format « CHF x (−y %) » via `unitSaving`.
  - Un seul bouton primaire, la mention affiliation dessous, le partage en icône.
  - Afficher l'année si la date sort de l'année courante ou est à plus de 60 jours. Pas de « ab » pour une date passée.
- Acceptation : un seul élément à 700 au-dessus de la ligne de flottaison. Aucune donnée d'historique avec n < 3.
- Personas : apple-design, brand-type, ux-research, legal-ethics, value-strategist.

**P1-7. Deals expirés et liens partagés morts**
- Problème : le #1 « bis 28.10. » reste en tête après minuit. Une URL expirée tombe sur une 404 qui affirme « Deal abgelaufen » pour n'importe quel chemin.
- Preuve : `EndsIn.tsx:20-24`, `app/not-found.tsx`.
- Correctif :
  - Les cartes avec `data-ends` passé sont masquées par un petit script avant hydratation.
  - Rebuild à 00:05 et 06:00.
  - Tombstone pendant 30 jours (« Abgelaufen am … » + 3 deals similaires, noindex).
  - 404 générique localisée.
  - Plus de compte à rebours sur les cartes : date fixe « bis Mi 29.10. » sans gras. Compte à rebours seulement sur la page deal d'une vente flash à moins de 6 h.
- Acceptation : 0 deal terminé visible au chargement. Un slug expiré renvoie 200 avec le tombstone. Pas de `.ends-soon` sur les cartes.
- Personas : ux-research, hsg-student, value-strategist, a11y, perf-eng, research.

**P1-8. Mention d'affiliation invisible (`*` avec infobulle au survol)**
- Problème : le `*` s'explique par un `title` que le tactile n'affiche jamais. L'explication n'est que dans le footer.
- Preuve : `OutLink.tsx:27`, `globals.css:101`.
- Correctif : un libellé visible « Werbelink · Preis für dich gleich » (« Lien commercial » / « Ad link »), ≥ 12 px, contraste ≥ 4.5:1, avec lien vers `/transparenz#provision`, placé sous le bouton de la page deal.
- Acceptation : un test vérifie que chaque OutLink avec `affiliate=true` affiche le libellé. 0 `title` porteur d'information.
- Personas : a11y, legal-ethics, value-strategist, research.

**P1-9. `/transparenz` ne décrit pas les vraies règles de classement**
- Problème : la page dit « nur nach Note, dann Rabatt ». En réalité le classement applique un seuil de confiance ≥ 0.7, 2 deals maximum par magasin, des plafonds par catégorie, un top 12 et une coupe à 60. La liste des types de référence est incomplète.
- Preuve : `select.ts:81-147` comparé à la page en live.
- Correctif : générer le texte à partir des constantes de `select.ts`. Ajouter `tests/neutrality.test.ts` (même ordre avec ou sans `AFF_*`) et une allowlist des `score_components` (ni cashback ni commission).
- Acceptation : le texte cite chaque règle avec son nombre, et le test de neutralité passe.
- Personas : legal-ethics, value-strategist.

**P1-10. Trop de JS et de payload RSC pour un site statique**
- Problème : environ 147 Ko brotli et 490 Ko bruts de JS. 60 % du HTML est du flight RSC (367 à 420 Ko). Le dictionnaire 3 langues est envoyé au client. Le prefetch récupère environ 16 liens.
- Preuve : chunks en live, `SiteChrome.tsx:1 "use client"`, `CityDashboard` chips.
- Correctif : header, footer, `LangScope` et `DealCard` en composants serveur. Un seul îlot délégué (beacon, partage, horloge). `import 'server-only'` dans `lib/i18n.ts`. `prefetch={false}` sur chips, footer et header. `inlineCss`. Browserslist moderne. Budget size-limit et Lighthouse CI.
- Acceptation : JS first-load ≤ 90 Ko br. HTML de liste ≤ 120 Ko brut. LCP < 2 s, TBT < 200 ms, CLS < 0.05 en mobile émulé.
- Personas : perf-eng, hsg-student, research.

**P1-11. Formats numériques, pluriels et dates**
- Problème : « 5252 » côtoie « 12’937 ». La légende écrit « 4–6,9 » alors que les badges écrivent « 8.2 ». « −63% » et « (−63 %) » coexistent. On lit « 1 Preisbeobachtungen » et « 2 T 5 Std ».
- Preuve : `i18n.ts:24,29,62,71,130-135`, `DealCard.tsx:44,152`.
- Correctif : helpers `fmtInt/fmtPct/fmtScore` sur `Intl` avec `PluralRules`. La légende est générée depuis les seuils de `scoreTier`. Durées « noch 2 Tage 5 Std. ». ICU complet au build (’ typographique).
- Acceptation : test unitaire sans `\d,\d` dans le DE et sans nombre ≥ 1 000 dépourvu de séparateur. Pluriels corrects pour n=1 dans les 3 langues.
- Personas : brand-type, i18n-content, a11y, hsg-student, ux-research.

**P1-12. Qualité des textes FR/EN et terminologie**
- Problème : le FR mélange « tu » et « vous », emploie « bons plans » (franco-français) et le point médian. Les noms de villes ne sont pas localisés (« Genève » sur une page DE). Les intitulés de catégorie divergent entre chip et H1. « Note » évoque l'échelle scolaire suisse 1–6. Le jargon « Bewertungssicherheit » est obscur.
- Preuve : `i18n.ts:145-238`, `config/cities.ts:19-25`, `i18n.ts:437-439`.
- Correctif :
  - FR en « tu » partout, avec « actions » et « Conditions d'utilisation ».
  - `City.name` passe en `Record<Locale,string>` (Genf/Genève/Geneva).
  - Pour chaque catégorie, un `label` et un `title` par langue. « AGB » devient « Nutzungsbedingungen ».
  - « Note » devient « Bewertung/Score ».
  - « Bewertungssicherheit » devient « Datenqualität: gut/mittel/dünn ».
  - Relecture par un francophone romand.
- Acceptation : un test vérifie l'absence de « bons plans », de « · » inclusif et de « vous » dans l'UI FR.
- Personas : i18n-content, a11y.

**P1-13. Marque, OG et favicons**
- Problème : le logo radar en 5 éléments devient illisible à 26 px et disparaît en mode sombre. L'OG utilise un autre logo, un faux gras, une apostrophe droite et répète la ville. Il manque `favicon.ico`, `apple-touch-icon` et `manifest`.
- Preuve : `SiteChrome.tsx:19-26`, `og.png/route.tsx:33-35`, `public/icon.svg`. curl renvoie 404 sur `/apple-touch-icon.png`.
- Correctif : wordmark texte seul (`SITE_NAME`, 17/700, −0.02em) en attendant le nom définitif. Un composant `<BrandMark/>` unique sert d'une seule source au header, à l'icône et à l'OG. Ajouter `apple-icon` 180, `favicon.ico`, `manifest.ts`, et une icône SVG compatible mode sombre.
- Acceptation : renommer = changer une variable d'environnement. Les 3 icônes répondent 200. L'OG utilise la même police et le même format de nombre que le site.
- Personas : apple-design, brand-type, research.

**P1-14. Sécurité de la chaîne CI et des données**
- Problème :
  - CSP `script-src 'unsafe-inline'`.
  - `/api/click` falsifiable (Origin usurpable, pas de règle WAF, n'importe quel deal accepté).
  - Le token Cloudflare est exposé aux scripts npm, les actions ne sont pas épinglées et Dependabot est absent.
  - Le flux de 12 Mo n'a ni schéma ni limite de taille.
- Preuve : `public/_headers:28`, `functions/api/click.ts:18-113`, `.github/workflows/web.yml:49-73`, `lib/data.ts:18-20`.
- Correctif :
  - Script post-build qui calcule les hash sha256 des scripts inline et les injecte en `<meta CSP>`.
  - Règle WAF de 20 requêtes par 10 s sur `/api/click`, plus un manifeste `deal-ids.json` côté fonction.
  - Séparer build (`npm ci --ignore-scripts`, sans secrets) et deploy (`wrangler-action` épinglé par SHA). Dependabot npm + actions, `npm audit signatures`.
  - Validation de schéma du flux, plafond à 25 Mo, allowlist d'hôtes (voir P0-8).
- Acceptation : aucun script inline hors hash. Un POST usurpé avec un deal inconnu n'est pas écrit. Le job de build n'a aucun secret.
- Personas : security, research.

**P1-15. Accessibilité : sémantique des prix, contrastes de contrôle, cibles tactiles**
- Problème : `<s>` n'est pas annoncé par les lecteurs d'écran, qui lisent « CHF 13.15 CHF 35.85 63% ». Les bordures de chips et de boutons fantômes sont entre 1.19 et 1.55:1. Les chips font 36 px. Il y a du texte en 11–12 px, et des titres et boutons tronqués par ellipse.
- Preuve : `DealCard.tsx:149-153`, `globals.css` (`--line`, `.chip min-height:36px`, line-clamp, nowrap).
- Correctif : textes sr-only « jetzt / statt / 63 % günstiger ». `--control-border` à ≥ 3:1. Chips et liens méta à 44 px de hauteur minimum. Texte méta ≥ 13 px. Pas de line-clamp ni d'ellipse. `forced-colors` et `reduced-motion` complets.
- Acceptation : axe à 0 violation sur home, catégorie et deal dans les 3 langues. Textes lisibles à 200 % de zoom texte et avec le bookmarklet d'espacement.
- Personas : a11y, research.

---

## P2

**P2-1. Jeu d'icônes SVG unique.** Problème : des glyphes texte (↗ → › ↓) sont mélangés à des SVG et se désalignent. Correctif : `components/Icon.tsx` avec 6 icônes (20×20, trait 1.75, `currentColor`) et des chaînes i18n sans symbole. Acceptation : 0 flèche dans `i18n.ts`. Personas : apple-design.

**P2-2. Footer.** Problème : surface blanche plus claire que la page, aucune structure. Preuve : `globals.css:85`, `SiteChrome.tsx:44-59`. Correctif : fond transparent avec filet, muted 13 px, 2 colonnes à partir de 640 px. Ligne « Partnerprogramme aktiv: 0 · Bezahlte Platzierungen: 0 · Stand … » générée depuis la config. Acceptation : le footer n'est jamais la surface la plus claire. Personas : apple-design, brand-type, value-strategist.

**P2-3. Emplacements publicitaires (avant activation).** Problème : l'emplacement est placé juste après le Top, ne réserve que 100 px, et son libellé est codé en dur en DE/FR. Preuve : `AdSlot.tsx:44-46`, `CityDashboard.tsx:165`, `globals.css:253`. Correctif : jamais dans la liste classée ; après la 2e section sur la home, après les résultats sur une catégorie. Hauteur réservée réelle (250/280), format fixe, libellé localisé, lien « Warum Werbung? ». Acceptation : CLS 0 avec la pub, aucune pub entre le prix et le CTA. Personas : apple-design, perf-eng, value-strategist.

**P2-4. Consentement Google TCF.** Problème : AdSense se charge avant tout choix et la Suisse n'est pas garantie dans le périmètre. Preuve : `AdSlot.tsx:25`. Correctif : attendre `__tcfapi` (`tcloaded/useractioncomplete`), mettre la CH dans R8, bannière native en `<dialog>` avec focus. Acceptation : depuis une IP CH, aucun cookie Google avant le choix. Personas : security, legal-ethics, a11y.

**P2-5. Durcissement des en-têtes.** Correctifs : `functions/_middleware.ts` (HSTS, XFO, noindex `*.pages.dev`, CSP `default-src 'none'` hors HTML), `! Access-Control-Allow-Origin`, CORP cross-origin pour `og.png` et `icon.svg`, hôtes Insights seulement si le token est présent, CSP Report-Only plus `/api/csp-report`, puis Trusted Types. Acceptation : `securityheaders` A+ sur HTML et fonctions. Personas : security.

**P2-6. Cache et réseau.** Correctifs : `max-age=60, stale-while-revalidate=600` pour HTML et `.txt`, `og.png` à 3 600 s, URL sans slash final partout. Acceptation : une visite répétée ne fait pas d'aller-retour bloquant, et 0 href interne ne finit par `/`. Personas : perf-eng.

**P2-7. Politique de confidentialité.** Problème : DPF/SCC non mentionnés pour Cloudflare, NEL non mentionné, analytics décrites alors qu'elles ne sont pas chargées. Correctif : compléter le §1, désactiver NEL ou le documenter, et rendre le §2 conditionnel au token. Acceptation : le texte correspond aux en-têtes et scripts réellement servis. Personas : legal-ethics.

**P2-8. Rétention honnête.** Correctifs : un bouton « Merken » en localStorage avec `/merkliste` (statut beendet / neuer Tiefstpreis), un flux RSS par ville et catégorie, un badge « Neu seit letztem Besuch ». Ouvrir Telegram, ou retirer le composant. Aucun streak, aucune fausse urgence. Acceptation : un deal sauvegardé reste consultable après expiration. Personas : ux-research, value-strategist.

**P2-9. Ancres visuelles.** Problème : 0 `<img>`, les cartes ne sont que du texte. Correctif : sprites SVG des logos de marchands en auto-hébergement (environ 20), 20 px à côté du nom. Vignettes produit seulement si la licence le permet, servies depuis l'origine. Prix au kilo sur les cartes Supermarkt. Acceptation : la CSP reste `img-src 'self'`, et un prix unitaire s'affiche si la taille est parsable. Personas : hsg-student, value-strategist.

**P2-10. Langue des titres de produit.** Problème : des titres FR et IT sont lus avec la phonétique allemande. Correctif : `titleLang` dans le flux, `<h3 lang>`, « 3 × 500 g ». Acceptation : la carte QoQa porte `lang="fr"`. Personas : a11y, i18n-content.

**P2-11. Honnêteté du discours « ville par ville ».** Problème : un flux national est présenté sous « Diese Woche in St. Gallen ». Correctif : bloc « Lokal in St. Gallen » seulement s'il y a au moins 4 deals locaux, sinon la ligne « inkl. schweizweite Aktionen ». 10 à 15 avantages étudiants permanents suisses avec un badge « Dauerangebot ». Acceptation : aucune revendication locale sans donnée locale. Personas : value-strategist, hsg-student.

---

### Ce qui attend Yorian (bloque P0-9)
- Choisir entre renseigner les données exploitant (nom, adresse c/o, e-mail) et protéger le site derrière Cloudflare Access en attendant.
- Définir les variables GitHub et Pages `SITE_URL` (accès au compte requis).
