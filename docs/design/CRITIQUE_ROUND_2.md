# Critique — round 2 (backlog unique, 28.10.2026)

Ce backlog fusionne 202 constats bruts (10 personas et 1 agent de recherche) en 44 items.
Avant de l'écrire, j'ai revérifié en direct (curl, 28.10 ~20:00) que les points suivants sont toujours vrais :
- « 1–24 von 78 Angebote » est toujours affiché ;
- les réponses HTML portent `access-control-allow-origin: *` ;
- la CSP contient toujours `'unsafe-inline'` ;
- `project.ts:159-165` est inchangé (le plafond se rabat sur `scoreCap="confidence"`) ;
- `select.ts:106-108` (`topEligible`) ne vérifie jamais `verifiedRef`.

Personas : AD = apple-design, BT = brand-type, UX = ux-research, ST = hsg-student, A11Y = a11y, PERF = perf-eng, SEC = security, LEG = legal-ethics, VAL = value-strategist, I18N = i18n-content, RES = research.

## Arbitrages (en cas de conflit, la simplicité et l'honnêteté l'emportent)

1. **Mot « belegt ».** Un prix « statt » est la déclaration du marchand, pas une observation de notre part. Le site distingue donc deux niveaux, chacun avec un libellé honnête :
   - « Statt-Preis laut Händler » ;
   - « von uns beobachtet » (au moins 3 relevés et un écart de 5 % au plus).

   Le mot « belegt / établi / documented » disparaît partout.
2. **Format des nombres.** Le style suisse unique s'applique aux 3 langues : `CHF 13.15`, note `8.2`, séparateur de milliers `’`. Seul le français prend `63 %` (avec U+202F) et `label :`.
3. **Police.** On retient la pile système (SF Pro sur Apple, Roboto sur Android) : 0 octet, pas de reflow. On abandonne le subset Inter auto-hébergé, plus lourd et plus fragile. L'ambiguïté I/l/1 se traite par la normalisation des titres (`8.4 l` devient `8.4 l` avec NBSP).
4. **Cartes.** Toute carte qui affiche une note a sa page interne (option A). La seule sortie vers un site tiers est le CTA de la page deal.
5. **Urgence.** Aucun compte à rebours sur les promos hebdomadaires. On affiche le texte statique « endet heute ».
6. **`/de`.** Tant qu'une seule ville existe, `/de` redirige en 302 vers `/de/st-gallen`. La racine `/` négocie `Accept-Language`.
7. **Exploitant.** On ne publie jamais l'adresse du propriétaire. Les liens affiliés restent coupés jusqu'au GO du propriétaire.

---

## P0 — à livrer ce round

### 1. Prix « statt » de Denner masqué et faux motif de plafond (régression V-1)
- **Problème :** 594 deals Denner ont un « statt » marchand (conf 0.85). Leur prix barré est masqué, leur note est plafonnée à 6.9, et la page affiche « Die Datenlage ist dünn » à côté de « Datenqualität: gut ».
- **Preuve :** `/de/deal/energizer-max-batterien-aa-nhq092` (et la version `/fr`) ; `web/lib/project.ts:159-165` ; `promotion_integrity` vaut null pour la source denner.
- **Correctif :**
  - Ajouter `scoreCap="unchecked"`, avec ce libellé :
    - DE : « Begrenzt auf «gut»: Vergleichspreis noch nicht auf Plausibilität geprüft »
    - FR : « Limitée à « bien » : plausibilité du prix de comparaison pas encore vérifiée »
    - EN : « Capped at “good”: reference price not yet plausibility-checked »
  - Réserver `"confidence"` au cas confidence < 0.7.
  - Afficher le prix barré dès que `kind==='comparable' && confidence>=0.7`, avec le libellé « laut Denner ».
  - Le scanner (`radar/denner.py`) calcule l'intégrité avec la routine de `uscoring` et émet `'unchecked'`, jamais null.
  - Règle de cohérence : si le hero n'affiche pas de « statt », le panneau n'affiche pas de « Vergleichspreis ».
- **Acceptation :**
  - Vitest : aucun deal n'a à la fois `scoreCap==='confidence'` et un `confidenceTier` élevé.
  - Fixture Energizer : le prix barré est présent et le texte ne contient pas « dünn ».
  - Le hero et le panneau sont d'accord sur la visibilité du prix de référence.
- **Personas :** AD, UX, ST, LEG, VAL, I18N, RES

### 2. Top « Nur belegte Vergleichspreise » contient des deals non vérifiés (régression V-2)
- **Problème :** 5 cartes sur 12 n'ont pas de référence vérifiée : Energizer, Felix, Tefal, Katzenstreu, ibis. La liste descend jusqu'à 5.3. La règle « 1 pro Marke » est en fait appliquée par marchand et par marque.
- **Preuve :**
  - Live : `/de`, `/de/st-gallen`, `/fr/st-gallen` ;
  - `select.ts:106-108` (pas de filtre `verifiedRef`) et `:126` (clé `${merchant}|${brand}`) ;
  - `i18n.ts:35/203/359`.
- **Correctif :**
  - `topEligible` exige `d.verifiedRef===true && score>=7` et un début de validité passé (`startsAt<=now`).
  - La clé de marque devient `brandKey(d)` seul.
  - On affiche au plus 6 cartes, sans remplissage. La section est masquée s'il en reste moins de 3.
  - La note de section est générée depuis la même constante que le filtre : « Mit Statt-Preis des Händlers · Note ab 7 · max. 1 pro Marke » (FR et EN équivalents).
  - `/transparenz` reprend exactement la même règle.
- **Acceptation :** un test sur CityDashboard (fixture) vérifie que chaque carte de `#top` a `verifiedRef` et un élément `.was`, sans « Preisangabe des Anbieters ». On compte 0 marque en double.
- **Personas :** AD, UX, ST, LEG, VAL, I18N, RES

### 3. « belegt / établi / documented » affirme une vérification que nous ne faisons pas
- **Problème :** les 2 204 références « vérifiées » sont toutes de type `merchant_previous`. 1 729 ont `history_n=0`. `uscoring.py:134-135` transforme `unknown` en `ok`. Le site présente ces prix comme un fait établi (risque UWG art. 3 lit. b).
- **Preuve :**
  - feed `universal.json` ;
  - `i18n.ts:28,35` (« 584 mit belegtem Vergleichspreis ») ;
  - `/de/transparenz` (« tatsächlich verlangter Preis ») ;
  - `round1-after-deal-mobile-light.jpg` (« früherer Preis beim selben Shop » au-dessus de « noch zu wenig Daten »).
- **Correctif :**
  - Scanner : `integrity='unchecked'` tant que n<3 et qu'aucune référence antérieure n'existe.
  - Web : `refObserved = history_n>=3 && |median−ref|/ref<=0.05`.
  - Libellés :
    - carte : « statt CHF 35.85 · laut Coop » ;
    - panneau : « Statt-Preis des Händlers, von uns nicht überprüft », ou « von uns beobachtet » seulement si `refObserved`.
  - `factsVerified` devient « {n} Aktionen mit Statt-Preis des Händlers ».
  - Supprimer « belegt/établi/documented » des 3 dictionnaires et de `/transparenz`.
- **Acceptation :** grep de « belegt|établi|documented » sur `out/` : 0 résultat, sauf quand c'est relié à `refObserved`. Un test unitaire couvre les deux libellés.
- **Personas :** LEG, RES

### 4. Le feed public brut divulgue la position du propriétaire et des contenus tiers
- **Problème :** `universal.json` (12 MB) est public. Il contient :
  - `distance_km=0.3` (1 032 deals), `eligible_home`, `favorite`, `personal_relevance`, `watchlists`, `store_ids` : de quoi situer le domicile du propriétaire à quelques rues près ;
  - `image_url` (8 243 deals), `description` (3 927) et `coupon_code` de sources tierces, en contradiction avec `/quellen` et `SECURITY_LEGAL` T8.
- **Preuve :** `curl https://yorian-melki.github.io/denner-deal-radar/data/universal.json` ; `web/config/cities.ts:36`.
- **Correctif :**
  - `radar/export.py` écrit deux fichiers :
    - une projection publique qui ne garde que la liste blanche de `projectDeal`, sans image, description ni code pour `THIRD_PARTY_CODE_SOURCES` ;
    - le fichier complet, en privé (artefact Actions ou R2 privé).
  - `DATA_URL_CH_SG` pointe vers la projection publique.
  - Purger l'historique gh-pages en force-pushant une branche orpheline. **C'est une action destructive : GO du propriétaire requis.**
  - Ajouter un test CI.
- **Acceptation :** le JSON publié ne contient aucune de ces clés : `personal_relevance|distance_km|favorite|eligible_home|watchlists|store_ids|accessibility|image_url|description`, ni de `coupon_code` tiers. Le CI échoue sinon.
- **Personas :** LEG, SEC

### 5. Les deals du top ne sont pas achetables « maintenant »
- **Problème :** 5 cartes sur 12 se terminent aujourd'hui après la fermeture des magasins, et l'une ne commence que demain (« ab Do 29.10. »). Le lecteur d'écran annonce pourtant « jetzt CHF 17.80 ». Un compte à rebours « noch 3 Std. 26 Min. » tourne sur une promo Coop hebdomadaire, ce qui contredit la règle « pas de minuterie » de `select.ts`.
- **Preuve :**
  - `/de/st-gallen` au « Stand 28.10., 19:28 » ;
  - `DealCard.tsx:40` ;
  - `EndsIn.tsx:20` ;
  - `deal/[slug]/page.tsx:156-160` ;
  - `round1-after-deal-mobile-light.jpg`.
- **Correctif :**
  - Supprimer `EndsIn` et `COUNTDOWN_MAX_MS`.
  - `dateText()` produit :
    - « bis heute / jusqu’à aujourd’hui / until today » ;
    - « ab morgen » ;
    - sinon le jour de la semaine et la date ;
    - jamais d'heures ni de minutes.
  - Retirer les deals avec `startsAt>now` du top et du classement. Ils vont dans une rangée « Ab morgen ».
  - Le préfixe de prix devient « ab Do 29.10. » au lieu de « jetzt ».
  - Retail en magasin : à partir de 18:00 heure de Zurich le jour J, retirer le deal du top (au build, et via `expired.js` côté client). Il reste en catégorie avec le libellé « heute letzter Tag ».
- **Acceptation :**
  - Aucun « Std. »/« Min. » dans `out/`.
  - Aucun deal futur dans `#top`.
  - Aucun « jetzt » sur une carte dont `startsAt>now`.
  - Snapshot de `dateText` pour aujourd'hui et demain dans les 3 langues.
- **Personas :** AD, UX, ST, LEG, VAL, BT, RES

### 6. Badges « 0.0 » et notes affichées sans base
- **Problème :**
  - Handy-Abos affiche « 0.0 » pour Lidl, Post Mobile, Teleboy : cela se lit comme un jugement dénigrant.
  - Ailleurs, des badges de 2.8 à 4.9 apparaissent sur des cartes externes.
  - Shopping montre un mur de 6.9 non vérifiés.
- **Preuve :** `/de/st-gallen/handy-abos`, `/de/st-gallen/shopping`, `/de/st-gallen/tech-deals` ; `project.ts:157-158`.
- **Correctif :**
  - `if (score<=0) score=undefined`.
  - `handy-abos` marqué `unrated`, donc aucun badge.
  - Badge rendu seulement si `score>=5 && (verifiedRef || kind==='comparable')`. En dessous, prix et marchand seulement.
  - Seuil `HOME_MIN_SCORE` 5.5 aussi sur les sections de la ville.
  - Les notes plus basses passent derrière `moreLower` (page 2 et suivantes).
- **Acceptation :** 0 badge « 0.0 » ou < 5 dans `out/`. Dans une même liste, soit toutes les cartes ont un badge, soit aucune.
- **Personas :** AD, UX, ST, LEG, VAL, I18N, RES

### 7. Classement : un 6.9 non vérifié passe devant un 6.7 vérifié (V-3)
- **Problème :** sur Tech, « Big Brain Academy » 6.9 (sans référence) est classé devant HP LaserJet 6.7 (vérifié). Le plafond à 6.9 « blanchit » un prix catalogue (UVP).
- **Preuve :** `/de/st-gallen/tech-deals` ; `project.ts:226-232 rankDeals` ; `select.ts better()`.
- **Correctif :**
  - Comparateur unique `(verifiedRef desc, score desc, économie CHF desc, titre)` dans `rankDeals`, `better()`, `pickTop` et `CategoryListing`.
  - `/transparenz` : « Belegte… stehen immer zuerst ». Reformuler selon l'item 3.
- **Acceptation :** un test sur toutes les listings de `out/` : aucun deal non vérifié ne précède un deal vérifié.
- **Personas :** UX, ST, LEG, VAL, RES

### 8. Mentions légales fausses : analytics fantôme, astérisque, note EN mensongère
- **Problème :**
  - La politique de confidentialité, §2 (DE, FR et EN), dit que les vues sont comptées avec Cloudflare Web Analytics, mais aucune balise n'est chargée.
  - L'AGB et la politique de confidentialité, §5, parlent de liens « marqués * », alors que l'UI n'affiche jamais d'astérisque.
  - `/en/transparenz` dit « German version is authoritative, shown below », alors que le texte est en anglais.
  - `/en/datenschutz` est entièrement en allemand, alors que la bannière de consentement est en anglais.
- **Preuve :**
  - 0 « cloudflareinsights » dans le HTML ;
  - `datenschutz/page.tsx:42-43,50` ;
  - `agb/page.tsx:34,51` ;
  - `Legal.tsx:28` ;
  - `Consent.tsx:17` ;
  - CSP `_headers:28`.
- **Correctif :**
  - Analytics : remplacer §2 par « Derzeit findet keine Reichweitenmessung statt » (FR et EN équivalents), rendu conditionnellement à `NEXT_PUBLIC_CF_BEACON_TOKEN`. Retirer cloudflareinsights de la CSP, qui est générée en postbuild.
  - Astérisque : remplacer « * » par la clé unique `t.adLinkName` (« Werbelink » / « lien commercial » / « Ad link »).
  - Note EN : `LegalHead` reçoit `fallbackLang` et n'affiche la note que si le corps n'est pas dans la langue de la page.
  - Traduire `/en/datenschutz`.
  - Ajouter base légale et DPF : « berechtigtes Interesse », « Swiss-US/EU-US DPF ».
- **Acceptation :**
  - Assertion postbuild : la page contient « Web Analytics » si et seulement si `beacon.min.js` est présent.
  - 0 « * » dans les pages légales.
  - `/en/datenschutz` a `lang=en`.
- **Personas :** LEG, SEC, UX, ST, VAL, I18N, RES

### 9. Contenu nuisible ou trompeur dans les listes
- **Problème :**
  - Le Gratis n°1 de la page ville est « Begleiterin für eine Nacht » : effet spam.
  - L'essai Audible est présenté comme « gratis ».
  - « Netflix über Bulgarien » (contournement des CGU) est noté 6.9.
  - Titres marketing repris tels quels : « ERHÖHT 35% », « zum neuen Tiefstpreis/Bestpreis », « nur heute », « 100% … Gutschein » sur un deal à 10 %, emoji 🍿, majuscules (LIVARNO).
- **Preuve :** `/de/st-gallen` (Gratis, Studis), `/shopping`, `/tech-deals` ; `project.ts:97-104 cleanTitle`.
- **Correctif :**
  - `cleanTitle` (testé) retire :
    - `/\b(ERHÖHT|NEU|HOT|TOP|EXKLUSIV)\b:?\s*/` ;
    - `/\s*zum\s+(neuen\s+)?(Tiefst|Best|Top)preis.*$/i`, sauf si `isLowestSeen` ;
    - `/nur heute.*$/i` ;
    - `\p{Extended_Pictographic}` ;
    - un « N% » qui diffère de plus d'un point de `discountPct`.
  - Il passe en casse titre les tokens en majuscules de plus de 3 lettres.
  - « (Abholung) » devient la condition « nur Abholung ».
  - Exclusions dans `isPlausible` :
    - géo-contournement `/(über|via)\s+(Bulgarien|Türkei|Argentinien|Indien)|VPN/i` ;
    - liste de blocage pour aperçus `/Begleiter(in)?|Escort|Erotik/i` (exclu des sections d'accueil) ;
    - essais `/Audible|Probeabo|Trial/i` étiquetés « Probeabo, danach CHF X/Monat ».
  - Lister ces règles sur `/transparenz` dans une section « Was wir nicht zeigen ».
- **Acceptation :** test sur 10 titres live. 0 occurrence de ERHÖHT, Tiefstpreis, emoji, Bulgarien ou Begleiterin sur les pages d'accueil et de ville.
- **Personas :** ST, UX, LEG, VAL, I18N, A11Y, RES

### 10. Grammaire allemande : « 1–24 von 78 Angebote »
- **Problème :** il faut le datif, « Angeboten ».
- **Preuve :** live `/de/st-gallen/tech-deals` ; `CategoryListing.tsx:96` ; `i18n.ts:45,50`.
- **Correctif :** une seule clé `shownRange(a,b,n)` :
  - DE : « 1–24 von 78 Angeboten » ;
  - FR : « 1–24 sur 78 offres » ;
  - EN : « 1–24 of 78 offers ».
  
  Le compteur passe en note de bas de liste en 13 px muted, plus en titre H2.
- **Acceptation :** un snapshot vitest contient exactement « 1–24 von 78 Angeboten ».
- **Personas :** AD, BT, UX, ST, I18N, RES

### 11. Changement de langue sur 404 / page expirée : renvoi à l'accueil
- **Problème :** sur une 404, les `href` statiques valent `/de`, `/fr`, `/en`. Seul le JS conserve le chemin, donc sans JS, au clic du milieu ou avant hydratation, on atterrit sur l'accueil. Les 404 émettent aussi des hreflang vers les accueils. La cible tactile mesure 36×40.
- **Preuve :** `/fr/st-gallen/nexiste-pas` ; `LangSwitch.tsx:10` ; `globals.css:106`.
- **Correctif :**
  - `functions/_middleware.ts` : sur une 404 sous `/(de|fr|en)/`, `HTMLRewriter` réécrit `a[data-lang]` vers `/<lang><reste>` si `env.ASSETS.fetch` confirme que la cible existe, sinon vers la catégorie ou la ville parente.
  - Retirer canonical et alternates des not-found.
  - `.lang a{min-width:44px;min-height:44px}`.
  - Les pages pierre tombale (item 22) existent dans les 3 langues.
- **Acceptation :** `curl` sur une 404 avec un chemin : les `href` contiennent ce chemin. Test Playwright avec JS désactivé. 0 `rel=alternate` sur une 404.
- **Personas :** AD, A11Y, I18N, SEC, ST, RES

### 12. /api/click accepte les clics falsifiés
- **Problème :** un POST avec un faux `deal`, `affiliate:true`, `programme` arbitraire et `Sec-Fetch-Site` ou `Origin` forgé renvoie 204. 25 requêtes sur 25 passent. Le champ `page` accepte `%3Cscript%3E`. (Note : un vérificateur a obtenu un 400 sur un faux id, mais SEC, LEG et RES obtiennent 204 avec des en-têtes forgés.)
- **Preuve :** `functions/api/click.ts:37-68`.
- **Correctif :**
  - Le postbuild écrit `functions/api/_deals.json` sous la forme `{id: programme|null}`.
  - Id inconnu : 204 sans écriture.
  - `affiliate` et `programme` sont dérivés côté serveur, plus jamais lus du client.
  - `page` doit correspondre à `^/(de|fr|en)(/[a-z0-9-]+){0,4}$`.
  - Exiger `Sec-Fetch-Mode: no-cors` et `Sec-Fetch-Dest: empty`.
  - Règle WAF gratuite : 20 requêtes / 10 s / IP sur `/api/click`.
  - Supprimer le repli `console.log`.
  - Ajouter `wrangler.toml` avec la liaison `CLICKS`.
- **Acceptation :** un POST forgé avec un id inconnu n'écrit rien. La 21e requête en 10 s reçoit 429 ou 403. Test unitaire « pas de liaison, aucune écriture ».
- **Personas :** SEC, LEG, RES

### 13. Mobile : la première carte est à ~315 px (cible ≤ 200)
- **Problème :** le H1 est en 34/40, la méta tient sur 3 lignes, les lignes coupées commencent par « · », s'ajoutent un H2 et une note. « St. Gallen » se coupe après « St. ».
- **Preuve :** `round1-after-home-mobile-light.jpg` (y≈628 @2x) ; `globals.css:131,193-197` ; `cities.ts:21` (espace ordinaire 0x20).
- **Correctif :**
  - H1 mobile `--t-title` 28/34.
  - Méta sur une seule ligne non coupée : « 584 Aktionen · Stand 19:28 · Methode ». « inkl. schweizweite Aktionen » part vers `/transparenz`.
  - H2 du premier bloc `.sr-only` sur mobile.
  - `.section` margin-top 16 px.
  - Séparateurs `·` en `::after` sur chaque élément sauf le dernier, avec `content:"·"/""`, pour qu'ils ne soient pas lus.
  - `St. Gallen` (NBSP), FR `Saint‑Gall`.
  - `h1,h2{text-wrap:balance}`.
- **Acceptation :**
  - Playwright 390×844 : `#top ~ .grid .card` a top ≤ 200.
  - Aucune ligne ne commence par « · » à 320 px et à 390 px.
  - `od -c` du H1 montre U+00A0.
- **Personas :** AD, BT, UX, ST, VAL, A11Y, I18N, RES

### 14. Exploitant anonyme et contact inexistant
- **Problème :**
  - L'Impressum est en « Vorschau ».
  - « Verantwortlich: der oben genannte Betreiber » renvoie à un nom qui n'existe pas.
  - Le FR cite la LCEN française.
  - `/quellen` dit « Ein Klick genügt », mais il n'y a ni mailto ni bouton.
  - `security.txt` pointe vers l'Impressum, ce qui n'est pas conforme à RFC 9116.
  - La politique de confidentialité parle d'une « oben genannte Adresse ».
- **Preuve :** `/de/impressum`, `/fr/impressum`, `/de/quellen` ; `security.txt.ts:17` ; `datenschutz/page.tsx:54`.
- **Correctif (sans publier l'adresse) :**
  - Alias Cloudflare Email Routing `kontakt@` / `security@`, défini dans `OPERATOR_EMAIL`. **GO propriétaire requis pour créer l'alias.**
  - En attendant, `security.txt` pointe vers le signalement privé GitHub (private vulnerability reporting).
  - Retirer « oben genannt / nommé ci-dessus » et la LCEN.
  - Remplacer « Ein Klick genügt » par le mécanisme réel.
  - Garde CI : les flags de monétisation ne peuvent pas être vrais tant que l'Impressum contient « Vorschau ».
- **Acceptation :** `security.txt` a un `Contact:` joignable. 0 « oben genannt » sans nom. Le CI échoue si `AFF_*` est actif alors que « Vorschau » est présent.
- **Personas :** ST, LEG, SEC, RES

---

## P1

### 15. Comportement des cartes incohérent (page interne ou site tiers dans un nouvel onglet)
- **Problème :** les cartes sont identiques. Les unes ouvrent `/deal`, les autres preispirat.ch ou lidl.ch dans un nouvel onglet. La seule différence est un « (öffnet x) » réservé aux lecteurs d'écran et placé dans le h3.
- **Preuve :** `/de/st-gallen/tech-deals` ; `DealCard.tsx:102` ; `project.ts:263 hasPage` ; `OutLink.tsx:16,26`.
- **Correctif :**
  - Toute carte publiée a `hasPage=true` (option A). Les cartes ouvrent toujours la page interne.
  - Le CTA de la page deal est la seule sortie. Il porte un « ↗ neuer Tab » visible et une note sr « öffnet x in neuem Tab », hors du titre, via `aria-describedby`.
- **Acceptation :** 0 `target=_blank` dans les grilles de cartes. Chaque carte avec badge mène à une page qui contient « So kommt die Bewertung zustande ».
- **Personas :** AD, UX, ST, A11Y, RES

### 16. Denner et les autres supermarchés classés dans Shopping, et « Mehr aus » qui montre la même promo
- **Problème :** 233 deals de retail Denner sont dans Shopping. « Mehr aus » montre les variantes Il Divino et AAA de la même promo, et des pages externes.
- **Preuve :** `/de/deal/energizer-max-batterien-aa-nhq092` (fil d'Ariane Shopping) ; `categories.ts:67-72` ; `deal/[slug]/page.tsx:113`.
- **Correctif :**
  - Si le marchand ou la source correspond à `SUPERMARKETS` (denner, coop, migros, lidl, aldi, aligro, spar, volg), classer en `supermarkt-aktionen` avant les règles par mot-clé, sauf lexique électronique explicite.
  - `related()` exclut `promoKey` et `brandKey` égaux, ne garde que `hasPage`, et masque « +N Sorten ».
- **Acceptation :** test « aucun deal Denner, Coop ou Migros dans shopping ». Energizer et Felix sont en supermarkt. « Mehr aus » ne contient aucun `promoKey` identique.
- **Personas :** AD, UX, ST, I18N, VAL, RES

### 17. Supermarkt inutilisable : 1 225 deals, pas de filtre par magasin, page 1 à 22/24 Coop
- **Preuve :** `/de/st-gallen/supermarkt-aktionen` (51 pages).
- **Correctif :**
  - Sous-pages statiques par magasin `/…/supermarkt-aktionen/coop|migros|denner|lidl|aldi`, sous forme de chips sans JS, mappées par le sélecteur de langue.
  - Page 1 non filtrée entrelacée : au plus 1/3 de chaque marchand sur les 24 premiers.
- **Acceptation :** page 1 avec au plus 8 Coop. Les sous-pages existent dans les 3 langues. `switchPath` est testé.
- **Personas :** UX, VAL

### 18. Deals d'enseignes absentes de St. Gall, et biais de couverture Coop contre Migros
- **Problème :**
  - Aligro est classé en tête alors qu'il n'a aucune filiale à St. Gall.
  - Coop : 1 216 deals, tous avec référence. Migros : 22 sur 165. Aldi : 18 sur 692. Le classement donne donc l'impression que « Migros n'a pas de bonnes offres ».
- **Preuve :** `/de` (Aligro n°3 en Supermarkt, n°1 en Haushalt) ; feed.
- **Correctif :**
  - Carte de présence des enseignes dans `config/cities.ts`. Pour les enseignes en magasin uniquement, exclure si aucune filiale n'est à moins de 15 km (filiales Aligro à confirmer).
  - Afficher la couverture sur Supermarkt et `/quellen` : « Erfasst: Coop 1’216 (alle mit Vergleichspreis) · Migros 165 (22) … ».
  - Ajouter une source Migros avec « statt » avant le lancement.
- **Acceptation :** aucun Aligro sur `/de/st-gallen`. La ligne de couverture est générée depuis le feed.
- **Personas :** VAL

### 19. Biais de scoring non divulgués (scanner)
- **Problème :**
  - `SAVINGS_CAPS` n'est pas appliqué à grocery/surplus : CHF 5 d'économie donne 7.7 en épicerie contre 6.0 en tech.
  - Bonus de +0.5 / +0.3 pour les gros montants.
  - Bonus « record » dès n>=2, alors que le site exige 3.
  - Pénalité de distance calculée depuis le domicile du propriétaire.
  - Aucun de ces paramètres n'est sur `/transparenz`.
- **Preuve :** `radar/core/uscoring.py:34,145,150-157,167-169,263-280`.
- **Correctif :**
  - Une seule table de plafonds pour les listes mixtes.
  - Bonus record à n>=3.
  - Les ajustements personnels (distance, éligibilité, accessibilité) vont dans un `personal_score` non publié.
  - Exporter les constantes dans `meta` du feed. `/transparenz` génère un tableau « Was die Note beeinflusst ».
  - `test_neutrality.py` vérifie que `score_deal(d)` est identique avec ou sans `affiliate/commission/epc/programme/distance_km/favorite`.
  - Garde grep CI : `commission|epc|payout` interdit dans `uscoring.py`, `project.ts`, `select.ts`.
- **Acceptation :** les tests Python passent. Le tableau `/transparenz` correspond aux constantes.
- **Personas :** LEG

### 20. Hydratation inutile : 138 KB br de JS et un flight RSC qui pèse 65 % du HTML
- **Problème :** environ 450 KB bruts de React pour environ 2 KB de logique. Le flight pèse 79.5 KB sur les 122 KB de la page ville. C'est aussi la cause de `'unsafe-inline'`. Les clics avant hydratation ne sont pas comptés.
- **Preuve :** chunks live `/de/st-gallen` ; `postbuild.mjs:6-7,37-46` ; `OutLink.tsx:20-25`.
- **Correctif :**
  - Supprimer tous les composants `use client` :
    - `OutLink` devient `<a data-deal ping="/api/click?d=…">` ;
    - `Share`, `LangSwitch` et `Consent` deviennent du balisage avec attributs `data-*`.
  - `public/site.<hash>.js` (≤ 5 KB, vanilla), avec un écouteur délégué.
  - Le postbuild retire `/_next/static/chunks/*.js`, les preloads et `self.__next_f`.
  - Budget CI : HTML ≤ 60 KB brut, JS ≤ 5 KB br par page, 0 `__next_f`.
- **Acceptation :** HTML ville ≈ 43 KB. Lighthouse mobile TBT < 50 ms. Garde de build verte.
- **Personas :** PERF, RES, SEC

### 21. CSP `'unsafe-inline'`, ACAO `*`, en-têtes absents sur les Functions
- **Preuve :**
  - `curl -I /de` montre `access-control-allow-origin: *` et `script-src 'unsafe-inline'` ;
  - `security.txt` et `/api/click` n'ont ni HSTS ni noindex ;
  - commentaire faux en `_headers:9-13`.
- **Correctif :**
  - Après l'item 20 : `script-src 'self'`. Sinon, hashes sha256 des scripts inline injectés via `<meta>` CSP en postbuild.
  - `! Access-Control-Allow-Origin` sous `/*`, avec une exception explicite pour `og.png`.
  - `functions/_middleware.ts` ajoute HSTS, XFO, `X-Robots-Tag noindex` (`*.pages.dev`), et le canonical depuis `SITE_URL`.
  - Le postbuild échoue si un `<script>` inline n'est pas du ld+json.
- **Acceptation :** `curl -I` ne montre ni `unsafe-inline` ni `access-control`. `security.txt` a HSTS et noindex.
- **Personas :** SEC, PERF, UX, RES

### 22. Pas de pierre tombale pour les deals expirés (lien partagé, puis 404)
- **Preuve :** `/de/deal/movenpick-…-z2n9hX` renvoie 404, sans contexte. Le partage WhatsApp est le principal vecteur.
- **Correctif :**
  - Manifeste des deals expirés depuis moins de 30 jours.
  - Page 200 noindex : H1 « Diese Aktion ist am Mi 28.10. abgelaufen », ancien prix barré, et 3 deals actuels de la même catégorie ou du même magasin.
  - Rendue dans les 3 langues.
- **Acceptation :** un slug expiré renvoie 200, noindex, et `hreflang` vers les tombes équivalentes. Après 30 jours : 404.
- **Personas :** UX, ST, I18N, RES

### 23. Formats numériques incohérents (FR « 8,2 » à côté de « 13.15 CHF », « 63% »)
- **Preuve :** `/fr/st-gallen` ; `lib/format.ts:10-23` ; le commentaire `:15` contredit la sortie réelle.
- **Correctif :**
  - `fmtPrice` : `'CHF'+NBSP+montant` (de-CH, `’`) dans les 3 langues.
  - `fmtScore = toFixed(1)`.
  - FR : `n+' %'` et `label+' :'` (clé `dict.colon`, corrige « Prix unitaire: » et « bientôt: »).
  - Séparateurs fixés indépendamment de l'ICU.
- **Acceptation :** snapshot par langue du prix, de la note, du % et de l'entier. Même chaîne de prix sur `/de`, `/fr`, `/en`. Le FR ne contient ni `/\d%/` ni `/[^\s ]:\s/`.
- **Personas :** AD, BT, UX, ST, I18N, RES

### 24. `lang` manquant sur les titres allemands des pages FR/EN (WCAG 3.1.2)
- **Preuve :** 9 h3 sur 37 ont `lang` sur `/fr/st-gallen`. Le H1 deal FR n'en a pas. `DealCard.tsx:118-119 guessLang` ; `page.tsx:142`.
- **Correctif :**
  - `titleLang` par source dans `lib/sources.ts` (rappn, coop, denner, aligro, digitec, preispirat, studentbeans : `de`). `guessLang` ne sert plus que de repli.
  - `<span lang>` autour du texte du titre seulement, pour que la note sr garde la langue de la page, sur h3, H1, « Mehr aus » et JSON-LD `inLanguage`.
- **Acceptation :** test sur `out/fr` et `out/en` : chaque titre de source DE contient un élément `lang="de-CH"`.
- **Personas :** A11Y, BT, I18N, UX, RES

### 25. Le CTA envoie vers un agrégateur concurrent (rappn.ch, preispirat.ch) et le marchand affiché est faux
- **Problème :**
  - Le CTA « Bei rappn.ch ansehen » pour un produit Coop.
  - Le marchand affiché est « preispirat (preispirat.ch) », ou « Apple » pour Sky.
- **Preuve :** `/de/deal/movenpick-…` ; `/de/st-gallen/tech-deals`.
- **Correctif :**
  - Retail en magasin : CTA principal « Im Laden bei Coop · bis Mi 28.10. ». Le lien « Quelle: rappn.ch » passe en texte secondaire.
  - Scanner : extraire « bei <Marchand> » des titres preispirat. L'agrégateur n'est jamais le marchand ; à défaut, « gefunden über preispirat.ch », une seule fois.
  - Liste noire des marques-produits comme marchand (Apple, Sky).
- **Acceptation :** 0 carte où le marchand est égal à l'hôte agrégateur. Les deals Coop n'ont pas « rappn » dans le CTA principal.
- **Personas :** UX, ST, VAL

### 26. Le gain n'est pas le héros de la carte, et l'économie est répétée 3 à 4 fois
- **Preuve :** `round1-after-home-mobile-light.jpg` ; `round1-after-deal-desktop-dark.jpg` (prix de comparaison et économie en double dans les deux panneaux).
- **Correctif :**
  - Grammaire fixe de carte :
    1. titre ;
    2. « CHF 13.15 statt 35.85 » (avec prix unitaire pour l'épicerie) ;
    3. accent « CHF 22.70 günstiger als zuvor » (FR « de moins qu’avant », EN « less than before »), seulement si une référence existe ;
    4. méta « Coop · bis Mi 28.10. ».
  - La page deal énonce chaque fait une seule fois : le panneau garde Basis, Preisverlauf, Erfasst seit et Quelle.
  - « vs. » est supprimé.
- **Acceptation :** l'économie apparaît une fois par carte et une fois par page deal. 0 « vs. » ou « vs » dans `out/`.
- **Personas :** AD, VAL, I18N, A11Y

### 27. Page deal : note affichée deux fois, colonne gauche vide, deux CTA concurrents, `<ul>` d'un seul élément, `<dd>` orphelin
- **Preuve :** `round1-after-deal-desktop-*.jpg` ; `page.tsx:73,79-80,183-187` ; `ShareButton.tsx:9-25`.
- **Correctif :**
  - Une colonne (max 720) : hero, puis note, puis « Mehr aus ».
  - Bloc note : « 8.2 » 34/700 + « /10 » + « sehr gut ». Le badge est en `aria-hidden`.
  - Une seule condition s'affiche en `<p>`.
  - `<dt>Preisverlauf</dt><dd>noch zu wenig Daten</dd>`.
  - Partage :
    - `<button>` si `navigator.share` existe ;
    - sinon « Link kopieren » et « Per WhatsApp teilen (neuer Tab) » ;
    - icône de 44×44 près du H1.
- **Acceptation :** la note est lue une fois par le lecteur d'écran. Aucun vide de plus de 40 px sous le hero à 1366 px. HTML valide (dl).
- **Personas :** AD, BT, A11Y, ST, RES

### 28. Chips : 13 pilules contournées, la chip active hors écran
- **Preuve :** `globals.css:146-149` ; `/de/st-gallen/shopping` (13e chip) ; focus masqué par le fondu.
- **Correctif :**
  - Chips inactives en `--fill` sans bordure, chip active en `--fg/--bg`.
  - 7 chips visibles + « Mehr ▾ ».
  - Script de 3 lignes : `scrollIntoView({inline:'center',block:'nearest'})`, intégré à `site.js`.
  - `scroll-padding-inline: var(--gutter) 48px`.
  - `.chips:focus-within{mask-image:none}`.
- **Acceptation :** à 390 px, la chip active est visible au chargement. L'anneau de focus n'est jamais estompé.
- **Personas :** AD, A11Y, UX, RES

### 29. En-tête : la ville ressemble à un bouton mais n'en est pas un, la marque est plus faible que le sélecteur de langue, segment actif à 1.18:1
- **Preuve :** `globals.css:101,103,105-116` ; `round1-after-deal-mobile-dark.jpg`.
- **Correctif :**
  - Ville : `<button aria-haspopup>` qui ouvre un popover « St. Gallen » + « bald: Zürich, Bern… » (désactivés), avec un chevron.
  - Langue : texte « DE FR EN » 13/600, cible de 44×44, l'actif en `--fg` souligné (inset 2 px).
  - Logotype : tuile monogramme de 24 px + mot 19/700.
  - Tests de contraste : ajouter les paires d'état `surface/fill` et lien/texte (≥ 3:1).
- **Acceptation :** l'état actif a un contraste ≥ 3:1. Les cibles mesurent ≥ 44 px. Le test de contraste couvre les paires d'état.
- **Personas :** AD, BT, A11Y, I18N

### 30. Icône en cible blanche sur vert : ressemble au logo de Target, et 3 signes d'identité différents
- **Preuve :** `public/icon.svg` (anneau + point) ; `/apple-touch-icon.png` ; barre verte dans l'OG ; `SiteChrome.tsx:9-11`.
- **Correctif :**
  - `app/icon.tsx` et `apple-icon.tsx` (ImageResponse) : initiale de `SITE_NAME`, 700, #1d1d1f sur #f5f5f7, rayon 22 %, variante sombre.
  - L'OG reprend la même tuile et le mot-symbole.
- **Acceptation :** renommer `SITE_NAME` régénère les 3 visuels. Aucune géométrie concentrique.
- **Personas :** BT

### 31. Partage : OG générique, « 584 avec … » sans nom, titres incohérents
- **Preuve :**
  - les deals ont `og:image=/de/st-gallen/og.png`, `og:description="Denner"`, `twitter:*` générique ;
  - `<title>` met la marque tantôt en tête, tantôt en fin ;
  - la tagline « nach belegter Ersparnis sortiert » est fausse.
- **Correctif :**
  - Motif `%s – SITE_NAME`.
  - Deal : `og:title` « Produkt: CHF 17.80 statt 35.80 bei Denner ». `og:description` localisée : validité, source, « keine Werbung ».
  - OG par deal pour le top (≤ 12 × 3).
  - Tagline : « Aktionen in deiner Stadt – mit Quelle und Vergleichspreis » (FR et EN équivalents).
- **Acceptation :** `og:image` et `twitter:title` sont propres au deal. 0 « belegter Ersparnis ».
- **Personas :** BT, ST, I18N

### 32. Studis : la promesse centrale est la page la plus faible
- **Preuve :** `/de/st-gallen/studenten-rabatte` : titres en anglais, marques non pertinentes en Suisse, aucune valeur en CHF, aucun justificatif indiqué. Cartes « Code » d'anatomie différente.
- **Correctif :**
  - Bloc vérifié à la main « Studi-Basics St. Gallen » : valeur CHF par an, justificatif (Legi HSG, ISIC, < 26), source, date de vérification.
  - Variante de carte « Code » : titre = marque, valeur « −35 % laut Anbieter » dans l'emplacement du prix, méta « via studentbeans.com · bis 30.11. ».
  - Garder seulement les offres valides en Suisse.
  - Titre reconstruit par langue depuis les champs structurés : `${brand}: ${pct} Rabatt` / `de réduction` / `off`.
- **Acceptation :** 0 titre anglais sur `/de` Studis. Mêmes hauteurs de lignes que les cartes produit.
- **Personas :** VAL, AD, I18N

### 33. Abos : comparaison qui n'est pas à périmètre égal et total 24 mois présenté comme un fait
- **Preuve :** `project.ts:115` (`fee ?? 0`) ; données (Go) absentes.
- **Correctif :**
  - `total24` seulement si la taxe et le prix suivant sont connus. Sinon « ab CHF 237.60 (Aufschaltgebühr unbekannt) ».
  - Champs GB/mois, réseau, roaming UE (parsés par le scanner).
  - Filtres statiques « ≥ 20 GB » et « unbegrenzt ».
- **Acceptation :** aucun total affiché avec une taxe inconnue.
- **Personas :** VAL, LEG, ST

### 34. Chaîne d'approvisionnement CI : jeton Cloudflare exposé à `node_modules`
- **Preuve :** `web.yml:60-79` (`npm ci` avec scripts, puis `wrangler` local avec `CLOUDFLARE_API_TOKEN`) ; actions épinglées par tag ; pas de Dependabot ; jeton partagé avec `nametest.yml`.
- **Correctif :**
  - Job `build` sans secret (`npm ci --ignore-scripts`, artefact `out/`).
  - Job `deploy` : `cloudflare/wrangler-action@<SHA>`.
  - Tous les `uses:` épinglés par SHA.
  - `.github/dependabot.yml` (npm, pip, actions).
  - `npm audit signatures`.
  - Un jeton par projet, limité à Pages:Edit.
- **Acceptation :** aucun secret dans le job qui exécute le code des dépendances. Tous les `uses:` ont un SHA de 40 caractères.
- **Personas :** SEC

### 35. Libellé « Werbelink » loin du lien, et wording unique quand l'affiliation sera activée
- **Preuve :** `DealCard.tsx:150-153` (note en fin de `card-notes`).
- **Correctif :**
  - `note-ad` dans `card-meta` juste après le vendeur.
  - Le CTA lit « Bei Galaxus ansehen · Werbelink ».
  - Test : chaque `rel~=sponsored` a un libellé visible dans la même carte.
  - **Rester OFF jusqu'au GO du propriétaire.**
- **Acceptation :** le test passe avec un `AFF_*` factice.
- **Personas :** LEG, RES

### 36. FR : CGU au « vous », calques (« établi », « minces »), et la racine `/` ignore la langue du navigateur
- **Preuve :** `/fr/agb` (« entre vous et le marchand ») ; `i18n.ts` FR ; `_redirects:4 '/ /de 302'`.
- **Correctif :**
  - Réécrire les CGU au « tu ».
  - « données insuffisantes », « l’économie réelle », « total sur 24 mois : ».
  - `functions/index.ts` : `Accept-Language` (`fr*` vers `/fr`, `en*` vers `/en`, sinon `/de`), avec `Vary: Accept-Language`. Les URL explicites ne sont jamais redirigées.
- **Acceptation :** `curl -H 'Accept-Language: fr-CH' /` renvoie 302 vers `/fr/st-gallen`. 0 « vous » dans `/fr`.
- **Personas :** I18N, UX, ST, RES

### 37. Une page d'accueil sans fin et `/de` en double de `/de/st-gallen`
- **Preuve :** 40 cartes sur 8 sections de même poids ; même H1 sur `/de` et `/de/st-gallen`, chacune en canonical d'elle-même.
- **Correctif :**
  - `/{lang}` redirige en 302 vers `/{lang}/st-gallen`.
  - Accueil ville = top (≤ 6), puis Studis, Gratis et Supermarkt (3 cartes chacune et « Alle N → », lien unique avec contexte sr).
  - Haushalt, Gutscheine et Shopping ne restent que dans les chips.
  - Annonce placée après la dernière section, avec un emplacement réservé dès le build (CLS 0).
- **Acceptation :** HTML ville ≤ 60 KB. Un seul lien par section. CLS = 0 avec consentement préaccordé.
- **Personas :** AD, UX, ST, VAL, I18N, A11Y, PERF, RES

---

## P2

### 38. Typographie fine
- **Correctif :**
  - Pile système et suppression du preload Inter, voir l'arbitrage 3 (`lib/font.ts:5-15`).
  - Devise : `.cur` à 0.5em muted.
  - « 195.– » en affichage, mais pas dans `aria-label` ni JSON-LD.
  - Prix CHF entiers.
  - Échelle : H2 20/26, prix 24/28, H1 tous en 700, au plus 5 tailles par page.
  - `hyphens:auto` et `overflow-wrap:break-word` à la place de `anywhere`.
  - Chiffres tabulaires seulement dans les colonnes.
  - Subgrid pour aligner les lignes de base des prix.
  - Badge à 28 px.
- **Acceptation :** à 320 px, aucun mot coupé sans trait d'union. Les lignes de base des prix d'une même rangée sont alignées à 1 px près.
- **Personas :** BT, AD, PERF

### 39. Accessibilité : divers
- **Correctif :**
  - Grilles en `<ul role=list>`.
  - `aria-label` du fil d'Ariane « Brotkrumen », et lien « Zurück zu Supermarkt ».
  - Lien « Methode » souligné (`.intro-facts a`, etc.).
  - Tokens de taille en rem ; méta et conditions à 15 px minimum en `--fg`.
  - `@supports selector(:has(*))` autour de `outline:none`.
  - `<time>` sur les dates des cartes, avec le jour en toutes lettres en sr.
  - Bannière de consentement en region, en tête du DOM, avec `padding-bottom` (avant activation des annonces).
- **Acceptation :** axe 0 violation. Le zoom de police du navigateur s'applique.
- **Personas :** A11Y

### 40. Performance : cache et réseau
- **Correctif :**
  - `og.png` en `max-age=3600` ; icônes et manifeste en `86400`.
  - `expired.js` synchrone, hashé, immutable, dans `<head>`.
  - « Stand » calculé par page (max `lastSeen`) pour des builds byte-identiques.
  - Speculation Rules via en-tête.
  - CSS inline une fois le JS supprimé.
  - Budget de recherche : ≤ 8 KB de code et ≤ 35 KB d'index, chargés au focus.
- **Acceptation :** deux builds sur le même feed donnent des `out/de/deal/*.html` identiques. FCP < 1.2 s sur Moto G4 en 4G.
- **Personas :** PERF

### 41. Recherche et rétention honnête
- **Correctif :**
  - Recherche MiniSearch par ville, avec repli `<form>` sans JS.
  - « Gemerkt » et liste de courses en localStorage (try/catch).
  - Marqueur « Neu seit deinem letzten Besuch » (comparé à `first_seen_at`).
  - RSS statique par ville.
  - Ligne « nur in deinem Browser gespeichert » dans la politique de confidentialité.
  - Pas de push ni de série de visites.
- **Acceptation :** fonctionne avec le stockage bloqué. 0 octet de recherche au chargement initial.
- **Personas :** UX, VAL, PERF, RES

### 42. Preuve de fraîcheur par deal et dates EN
- **Correctif :**
  - Ligne « Erfasst seit 20.10. · zuletzt geprüft 28.10., 19:28 ».
  - Masquer, ou passer en pierre tombale, si la dernière vérification date de plus de 48 h.
  - EN : « until Wed 28 Oct » (en-GB).
- **Acceptation :** la ligne est présente sur 100 % des pages deal.
- **Personas :** VAL, I18N

### 43. Routage : redirections pratiques
- **Correctif :** 301 depuis `/de/st-gallen/tech`, `/supermarkt`, `/studis`, `/fr/saint-gall/*`, `/:lang/st-gallen/:cat/1`. Tests `switchPath`.
- **Acceptation :** `curl` renvoie 301 vers le slug canonique.
- **Personas :** UX, I18N

### 44. Scanner et annonces : dette de sécurité
- **Correctif :**
  - `requests>=2.32.4` (CVE-2024-47081).
  - `pip-compile --generate-hashes`.
  - `contents: write` limité au commit.
  - `validateFeed` avec schéma par champ (rejet si > 2 % des lignes).
  - Mode `google-tcf` : attendre `tcloaded/useractioncomplete` avant `adsbygoogle`.
  - Annonce jamais dans les 2 premiers écrans sur mobile.
  - Garder les contrôles déjà validés : gitleaks, `/.env` et `*.map` en 404, aucun dégradé ni emoji.
- **Acceptation :** pip-audit à 0. Aucune requête vers googlesyndication avant le choix de consentement.
- **Personas :** SEC, VAL, RES

---

## Décisions du propriétaire (GO requis, ne rien publier sans)

- Identité et contact dans l'Impressum : alias email OK, **jamais l'adresse du domicile**.
- Purge de l'historique gh-pages (item 4).
- Activation des liens affiliés et des annonces (items 35 et 44).

---

## Vérification (vérificateur indépendant, 28.10.2026 ~21:35)

**Verdict : rien n'est en ligne.** L'implémenteur s'est arrêté sur ENOSPC. Tout le round 2 reste non commité : 44 fichiers, +1425/−851 (`git diff --stat`). HEAD = `41a2c24`. Le dernier déploiement `web` (run 40755489656, 19:34Z) porte le code du round 1. Le disque n'a plus que 1,1 Gi libres (`df`), et `web/.next` pèse à lui seul 1,5 G. Aucun build complet n'est donc possible pour vérifier, et je n'ai rien supprimé (il faut le GO).

**Ce qui a été vérifié localement :** `npx vitest run` passe 131/131 et `tsc --noEmit` donne 0 erreur. `tests/_count.test.ts` a déjà disparu.

**Ce qui n'a pas pu être vérifié :** aucun item n'a été contrôlé dans une page construite ou servie. Le statut maximal possible est donc « partiel (code seul) ».

### Preuves sur le site en ligne (régressions toujours visibles)

| Point | Preuve en ligne | Statut |
|---|---|---|
| CSP | `curl -I /de/st-gallen` renvoie `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com` | non fait (en ligne) |
| ACAO | `access-control-allow-origin: *` sur le HTML | non fait (en ligne) |
| /api/click | `POST` avec `Origin: https://savradar.pages.dev`, `{"deal":"totally-fake-id","source":"rappn","affiliate":false,"page":"/de/st-gallen"}` renvoie **204** (faux clic compté) | non fait (en ligne) |
| Top « Nur belegte Vergleichspreise » | le libellé est encore présent dans `/de/st-gallen` | non fait (en ligne) |
| Changement de langue sur 404 | `/fr/nope` renvoie 404 et `nav.lang` pointe vers `href="/de"` et `href="/en"` (l'accueil) | non fait (en ligne) |
| /de doublon | `/de` renvoie 200 au lieu de 302 | non fait (en ligne) |
| Flight RSC | le HTML de `/de/st-gallen` contient encore le payload `self.__next_f` (persisted output de 67 KB) | non fait (en ligne) |

### P0, état du code (non construit)

1. **Denner « statt » : partiel.**
   - Ce qui est fait : `lib/project.ts:204-216` affiche la référence quand le type est comparable, que l'intégrité ne figure pas dans `BAD_INTEGRITY` et que la confiance est ≥ 0.7. Les motifs de plafond sont séparés (`vendor`, `confidence`, `integrity`, `unchecked`), et « Datenlage » n'existe plus nulle part dans `app/`, `components/` ni `lib/`.
   - Ce qui manque : le volet scanner (`radar/denner.py`) n'est pas fait.
   - **Point à noter :** `verifiedRef` signifie désormais « prix statt du marchand non contredit », et non plus « vérifié ». Le nom est trompeur. Renommer en `merchantRef` pour qu'aucun futur libellé ne le présente comme vérifié.
2. **Top : partiel.** Le libellé est maintenant honnête : `i18n.ts:36` « Mit Statt-Preis des Händlers · Note ab … · max. 1 pro Marke » (FR l.224, EN l.400). Le filtre `select.ts:122-126` exige `requireRef`, `!upcoming` et `!pastStoreHours`. Il reste à vérifier sur un build que Tefal, Katzenstreu, ibis, Energizer et Felix sont sortis ou que le libellé les couvre.
3. **Wording : partiel (web seulement).** `refByMerchant` est défini en `i18n.ts:92`. Le scanner n'est pas fait.
4. **Fuite du feed : non fait.** GO propriétaire requis.
5. **Achetable maintenant : partiel (code).** `EndsIn.tsx` est supprimé.
6. **0.0 : partiel (code).** `project.ts:199` ; aucune page /plans n'a été construite pour le vérifier.
7. **Tri : partiel (code).** `project.ts:304`, comparateur `verifiedRef` puis score.
8. **Mentions légales : partiel.** `datenschutz/page.tsx:46/75/104` conditionne le paragraphe analytics. L'assertion postbuild n'a pas été exécutée.
9. **Titres : partiel (tests seulement).**
10. **Grammaire : fait dans le code.** `i18n.ts:51` « von ${n} Angeboten » ; `resultsCount` donne « N Angebote », correct au nominatif.
11. **404 et langue : partiel, RISQUE.** Voir R1 et R2.
12. **/api/click : partiel (code).** `functions/api/click.ts:25` n'accepte que `{deal,page}`. Une liste blanche `/click-ids.json` est en place (`app/click-ids.json/route.ts`), ainsi que `Sec-Fetch-Mode/Dest`. Limite résiduelle : curl peut forger `Sec-Fetch-*`. C'est acceptable parce qu'un id inconnu n'est plus compté.
13. **Mobile ≤ 200 px : non mesuré.** Avant le round, la première carte était à 321 px en mobile (`round2-before-home-mobile-*.jpg`).
14. **Impressum : partiel.** Reste en aperçu ; affiliation coupée (correct, GO requis).

### Nouveaux risques bloquants trouvés (à tester avec `wrangler pages dev` AVANT tout déploiement)

- **R1 (P0) : CSP probablement perdue sur toutes les pages.**
  - Constat : `postbuild.mjs:113` route `/de/*`, `/fr/*` et `/en/*` vers `functions/_middleware.ts`. Or la doc Cloudflare Pages indique que `_headers` ne s'applique pas aux réponses générées par une Function, et le commentaire de `public/_headers:2-3` le dit lui-même.
  - Problème : `lib/edgeHeaders.ts:4-10` pose HSTS, XFO, nosniff, Referrer et COOP, mais **aucune `Content-Security-Policy`**. Si `next()` est traité comme une réponse de Function, on passe de `'unsafe-inline'` à pas de CSP du tout.
  - Correctif : soit générer la CSP dans une constante écrite au postbuild et la poser dans `secure()`, soit (préférable) appliquer R3.
- **R2 (P0) : les `_redirects` sont probablement ignorés sur les routes servies par une Function.** La doc Cloudflare dit que les redirections de `_redirects` ne s'appliquent pas aux requêtes servies par des Functions. Sont concernés `/:lang/st-gallen/tech`, `/:lang/saint-gall`, `/:lang/st-gallen/:cat/1` et peut-être `/de` → `/de/st-gallen` (selon que `/de/*` couvre `/de`). Ils tomberaient en 404, ou serviraient l'ancien `de.html`.
- **R3 (correctif recommandé pour R1, R2 et le quota) :** retirer `/de/*`, `/fr/*` et `/en/*` de `_routes.json`, et ne garder que `"/"`, `"/api/*"` et `"/.well-known/*"`. Le middleware HTMLRewriter disparaît. À la place :
  - les liens de langue de la page 404 statique pointent vers `/<l>/st-gallen` (la ville, jamais 404 ni l'accueil nu) ;
  - `site.js` conserve le chemin exact quand il existe ;
  - la page expirée (item 22) résoudra le cas des deals.

  On supprime ainsi 1 invocation de Function par page vue (quota gratuit de 100k/jour) et 3×N `ASSETS.fetch` HEAD par 404 (`_middleware.ts:53-56`).
- **R4 :** la regex de réécriture des liens de langue (`postbuild.mjs:95`) suppose `href` immédiatement suivi de `data-lang`. C'est conforme à l'ordre des props dans `LangSwitch.tsx:21` (`href`, `data-lang`, …), mais ce n'est pas vérifié sur un build. Ajouter une assertion postbuild : 0 `<a href="/(de|fr|en)" data-lang` restant hors 404.
- **R5 (P0 process) : le volume de pages.** 15 300 HTML ont saturé le disque. Avant de relancer, appliquer la recommandation de l'implémenteur : exclure `above_usual_price` des pages et mettre `/transparenz` à jour. Il faut aussi le GO pour supprimer `web/.next` (1,5 G) et `web/out` (112 M), tous deux régénérables et ignorés par git.

### P1 / P2

- **Code seul, rien en ligne :** 15, 16, 18, 20, 21, 23, 24, 26, 27, 33, 36 et 37 sont faits dans le code mais non vérifiés.
  - Vérifié en partie : FR « vous/votre/vos » donne 0 occurrence dans `app/`, `components/` et `lib/`.
  - Pour 20, `public/site.js` fait 7 047 octets bruts, contre ~4 KB annoncés.
- **Non fait :** 17 (sous-pages magasin), 19, 22 (pierre tombale), 25 (scanner), 30, 32, 34, 35 (GO), 41 (recherche), 44.

### Ordre conseillé

1. GO pour libérer `.next` et `out`.
2. R5 (moins de pages).
3. R3 (pas de Function sur les pages).
4. Build complet et postbuild.
5. `wrangler pages dev` : contrôler CSP, redirections, 404 de langue et `/api/click` avec un faux id.
6. Captures « après » ; mesurer la première carte (≤ 200 px).
7. Commit et déploiement, puis revérification en ligne de ce tableau.
