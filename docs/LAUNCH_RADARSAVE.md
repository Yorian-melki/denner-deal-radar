# Lancement de Radarsave : étapes pour Yorian

État au 06.11.2026 : le site s'appelle **Radarsave** (DE, FR, EN : titres, meta, manifest, logo, OG, icônes « R »).
Il tourne sur https://savradar.pages.dev, en **noindex**, sans domaine propre. Le nom vient de
`SITE_NAME` (défaut `Radarsave` dans `web/lib/site.ts`, variable GitHub `SITE_NAME` facultative).
Les slugs et les URLs n'ont pas changé.

Ordre conseillé : 1 → 2 → 3, puis 5 (lever le noindex), puis 4 (Tradedoubler), car Tradedoubler
a refusé le site le 28.10 pour « Too low quality » : *.pages.dev, noindex, aucun trafic.

Chaque étape dit ce que tu fais toi-même (achat, signature, compte) et ce que je peux faire ensuite.

---

## 1. Acheter radarsave.ch et radarsave.com

Disponibilité vérifiée le 06.11.2026 : `radarsave.com` donne « No match » au whois Verisign, et
`radarsave.ch` donne 404 au RDAP de SWITCH (donc non enregistré). Revérifie juste avant d'acheter.

| Domaine | Registraire conseillé | Prix 1re année | Renouvellement | Remarque |
|-|-|-|-|-|
| radarsave.com | **Cloudflare Registrar** | ~10.5 USD | ~10.5 USD (prix coûtant) | Le DNS est déjà chez Cloudflare : branchement Pages en 1 clic, pas de transfert. |
| radarsave.ch | **Infomaniak** (Genève) | ~4.60 EUR (promo) | ~9.90 EUR/an | Registraire suisse. |
| radarsave.ch (alternative) | Hostpoint | CHF 5 | CHF 15/an | Plus cher au renouvellement. |
| radarsave.ch (si proposé) | Cloudflare Registrar | prix coûtant | prix coûtant | Vérifie dans le tableau de bord (Domain Registration → Register) si `.ch` est proposé. Si oui, prends les deux chez Cloudflare. |

Prix relevés le 06.11.2026 (pages des registraires et tld-list.com). Ils changent : regarde le total
TTC au panier. Budget réaliste : **CHF 20 à 30 par an pour les deux**.

À faire toi-même (paiement) :
1. Cloudflare → *Domain Registration* → *Register Domains* → `radarsave.com` → 1 an, renouvellement auto ON.
2. Si `.ch` n'y est pas : Infomaniak → Domaines → `radarsave.ch` → 1 an. **Refuse** les options payantes
   (hébergement, mail, « protection » : la confidentialité WHOIS du `.ch` est gratuite par défaut).
3. Titulaire : ton nom, ou celui de la micro-entreprise une fois immatriculée (étape 3). Pour l'adresse,
   mets la domiciliation : elle n'est pas publiée dans le RDAP `.ch`, et elle est masquée chez Cloudflare.

## 2. Brancher le domaine sur Cloudflare Pages (projet `savradar`)

Domaine principal conseillé : **radarsave.ch** (public suisse, `.ch` inspire confiance). `radarsave.com` le redirige en 301.

1. Si le `.ch` est chez Infomaniak : Cloudflare → *Add a site* → `radarsave.ch` → plan Free.
   Cloudflare donne 2 serveurs de noms. Infomaniak → Domaine → *Serveurs DNS* → remplace par ces 2.
   Le changement prend 1 à 24 h.
2. Cloudflare → *Workers & Pages* → `savradar` → *Custom domains* → *Set up a custom domain* →
   `radarsave.ch`, puis `www.radarsave.ch`. Les CNAME et le certificat sont créés tout seuls.
3. `radarsave.com` : *Rules* → *Redirect Rules* → « tout `radarsave.com/*` et `www.radarsave.com/*` vers
   `https://radarsave.ch/${1}` », en 301, en gardant la requête. Il faut au moins un enregistrement
   DNS proxifié (orange), par exemple `A @ 192.0.2.1` proxifié, pour que la règle s'applique.
4. GitHub → *Settings* → *Secrets and variables* → *Actions* → *Variables* :
   `SITE_URL = https://radarsave.ch`. C'est la base de canonical, og:url, sitemap et partage.
   Le registre des slugs est relu depuis cette URL : pour que l'ancien registre ne soit pas perdu,
   **attends que radarsave.ch serve le site** (étape 2) avant de poser la variable.
5. Relance le workflow `web` (Actions → web → *Run workflow*), puis contrôle :
   `curl -sI https://radarsave.ch/de/st-gallen` (200) et `scripts/check-legacy.sh https://radarsave.ch`.
6. `*.pages.dev` reste en noindex (`lib/edgeHeaders`). Pas de contenu dupliqué.

Je peux faire les étapes 4 et 5 dès que tu me dis que le domaine répond.

## 3. Impressum : micro-entreprise et adresse de domiciliation (jamais ton adresse personnelle)

Aujourd'hui, `/impressum` décrit « une personne physique, pas de société ». Le site n'affiche ni
adresse ni monétisation tant que `OPERATOR_NAME`, `OPERATOR_ADDRESS` et `OPERATOR_EMAIL` sont vides
(`web/lib/operator.ts`). C'est voulu : **aucune pub, aucun lien affilié et aucune indexation sans Impressum complet.**

À faire toi-même :
1. **Micro-entreprise** (France, guichet unique INPI, gratuit) : activité « édition de site web /
   apporteur d'affaires en ligne » (code APE probable 63.12Z, à confirmer au guichet). Tu reçois un
   SIREN/SIRET sous 1 à 4 semaines. Ensuite, déclare le chiffre d'affaires sur autoentrepreneur.urssaf.fr.
   Pour Tradedoubler, Awin et CJ, c'est ce numéro (et le n° de TVA intracommunautaire si tu en demandes un) qui sert d'identifiant fiscal.
2. **Adresse de domiciliation** : prends une société de domiciliation **agréée par la préfecture**
   (en France, obligatoire pour domicilier une entreprise). Ordre de prix : 10 à 30 EUR par mois,
   courrier scanné inclus. Le contrat de domiciliation sert de justificatif au guichet INPI.
   Garde le même nom et la même adresse partout : INPI, Impressum, registraires, Tradedoubler.
3. **Téléphone** : le code ne publie jamais de numéro. La LCEN (art. 6-III) demande un numéro de
   téléphone pour l'éditeur professionnel. Si tu en veux un, prends un numéro virtuel, pas ton
   portable. Je dois alors ajouter une variable (le code ne l'a pas encore). **À trancher par toi.**
4. **E-mail** : une adresse sur le domaine (par ex. `kontakt@radarsave.ch`, transfert gratuit avec
   Cloudflare Email Routing vers ta boîte).
5. GitHub → *Variables* :
   - `OPERATOR_NAME` = « Yorian Melki, Radarsave (micro-entreprise), SIRET … » ;
   - `OPERATOR_ADDRESS` = l'adresse de domiciliation, lignes séparées par `|` ;
   - `OPERATOR_EMAIL` = l'adresse ci-dessus.

Ce que je fais ensuite (une PR) : réécrire le texte de `/impressum` (DE, FR, EN) pour une
micro-entreprise. Il dira « exploité par … (micro-entreprise, SIRET …) » à la place de « natürliche
Person, kein Unternehmen ». J'ajouterai le responsable du traitement dans `/datenschutz` (revDSG
art. 19) et j'incrémenterai `LEGAL_REVISION`. Les mentions exactes sont à valider par toi, ou par un
juriste si tu veux une certitude : je ne suis pas juriste.

## 4. Relancer la demande Tradedoubler (site 3505384)

Ne relance pas avant : domaine propre (étape 2), Impressum complet (étape 3), noindex levé
(étape 5), et **2 à 4 semaines** d'indexation avec un peu de trafic. Le refus du 28.10 venait
justement de l'absence de ces quatre points.

Le jour venu (toi, connecté à Tradedoubler) :
1. Tradedoubler → *Sites* → *Ajouter un site* (ou modifier 3505384) → URL `https://radarsave.ch`,
   nom « Radarsave », catégorie « Coupons & Deals / Comparateur », pays Suisse, langues DE/FR/EN.
2. Description (en anglais, courte et factuelle) : « Radarsave lists current promotions from Swiss
   retailers for students in St. Gallen (DE/FR/EN), with verifiable reference prices and a public
   ranking method (radarsave.ch/de/transparenz). Ranking never depends on commissions. »
3. Joins une capture de l'accueil et le lien `/de/transparenz`.
4. Une fois accepté, postule dans l'ordre : Galaxus, Digitec, Microspot, Interdiscount, Nettoshop
   (liste dans `docs/MARCHANDS_AFFILIATION.md`). Après chaque acceptation, pose
   `AFF_TRADEDOUBLER_GALAXUS_P`, `AFF_TRADEDOUBLER_DIGITEC_P`… : les liens se réécrivent au build suivant.

## 5. Lever le noindex

Le noindex ne tombe que si **trois** conditions sont vraies au build (`web/lib/site.ts`, `INDEXABLE`) :
`SITE_INDEXABLE=1`, `SITE_URL` posée (domaine propre), et Impressum complet. Sinon, il reste.

1. Après les étapes 2 et 3 : GitHub → *Variables* → `SITE_INDEXABLE = 1` → relance `web`.
2. Contrôle : `curl -s https://radarsave.ch/de/st-gallen | grep -o 'name="robots"[^>]*'` doit afficher `index`.
   `curl -s https://radarsave.ch/robots.txt` doit autoriser l'accès et lister le sitemap.
   `curl -sI https://savradar.pages.dev/de/st-gallen | grep -i x-robots` doit rester `noindex`.
3. Google Search Console → propriété *Domaine* `radarsave.ch` (vérification par TXT dans Cloudflare
   DNS) → *Sitemaps* → `https://radarsave.ch/sitemap.xml`. Même chose dans Bing Webmaster Tools
   (import depuis Search Console).
4. Note la date du jour : elle ouvre la fenêtre de 2 à 4 semaines de l'étape 4.

## Récapitulatif : ce qui t'attend

| # | Action | Qui | Coût |
|-|-|-|-|
| 1 | Acheter radarsave.com (Cloudflare) et radarsave.ch (Cloudflare ou Infomaniak) | Yorian (paiement) | ~CHF 20 à 30/an |
| 2 | Changer les serveurs DNS, ajouter le custom domain, poser `SITE_URL` | Yorian (DNS), puis moi | 0 |
| 3 | Micro-entreprise (INPI), domiciliation agréée, variables `OPERATOR_*` | Yorian | domiciliation 10 à 30 EUR/mois |
| 3b | Texte Impressum et Datenschutz pour une micro-entreprise | moi (PR), validé par Yorian | 0 |
| 5 | `SITE_INDEXABLE=1`, Search Console | Yorian (compte Google), puis moi | 0 |
| 4 | Nouvelle demande Tradedoubler, 2 à 4 semaines après l'étape 5 | Yorian (compte) | 0 |
