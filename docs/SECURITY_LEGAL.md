# Sécurité & juridique — site public (web/)

État au 28.10.2026. Périmètre : export statique Next.js 16 sur Cloudflare Pages
(+ Pages Functions `web/functions/**`). Exploitant : personne physique (étudiant
français, en Suisse pour l'échange, domicile fiscal France), pas de société.
Audience : Suisse d'abord, puis UE.

> **Rien ici n'est un avis juridique.** Les points marqués `LAWYER-CHECK` dans le
> code (`grep -rn LAWYER-CHECK web/`) et la section 4 doivent être relus par un
> juriste (permanence juridique HSG / Legal Clinic, ou avocat FR) avant le lancement
> public avec revenus.

---

## 1. Modèle de menace

| # | Menace | Vecteur concret | Impact | Mitigation en place | Reste à faire |
|---|---|---|---|---|---|
| T1 | **XSS via données scrapées** | Titre, marchand, conditions, coupon venant d'une source compromise ou malveillante (`<script>`, `"><img onerror>`) | Exécution JS chez les visiteurs, vol de rien (pas de session) mais défacement / redirection / injection de liens affiliés tiers | React échappe tout texte ; un seul `dangerouslySetInnerHTML` (JSON-LD, `<` → `<`) ; titres tronqués à 160 car. (`lib/project.ts`) ; CSP : aucun script **externe** hors `static.cloudflareinsights.com`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-src 'none'` | `script-src 'unsafe-inline'` est inévitable en export statique (scripts inline Next différents à chaque page/build). Option : passer en rendu à la volée avec nonce, ou générer des hashes au build (post-build script). Priorité basse tant qu'aucune donnée n'est injectée en HTML brut |
| T2 | **URL `javascript:` / schéma dangereux** dans `offer_url` | Source qui publie `javascript:alert(1)` ou `data:` | XSS au clic | `projectDeal` n'accepte que `^https?://` ; `rewriteUrl` revérifie le protocole (sinon `#`) | — |
| T3 | **Open redirect** | Un endpoint `/go?url=` réutilisable par des spammeurs | Phishing sous notre domaine, blacklist Google Safe Browsing | **Il n'existe aucun endpoint de redirection** : les liens sortants sont écrits en dur au build ; `/api/click` ne redirige jamais et ne renvoie rien | Ne jamais ajouter de `/go?url=` ; si un jour nécessaire : liste blanche de domaines + id de deal, jamais d'URL en paramètre |
| T4 | **Falsification de lien affilié** | (a) Source qui met déjà un lien affilié d'un tiers ; (b) modification du flux publié ; (c) extension navigateur | Commission détournée, tromperie du visiteur | (a) `isForeignAffiliate` neutralise les liens affiliés tiers ; (b) flux lu en HTTPS depuis GitHub Pages du dépôt (`DATA_URL_CH_SG`) ; réécriture faite au build avec nos identifiants publics ; `rel="sponsored nofollow noopener noreferrer"` | (b) Protéger la branche `main`/`radar-data` (règles de branche, 2FA GitHub obligatoire) ; (c) hors de notre contrôle |
| T5 | **Abus de `/api/click`** | Bots qui gonflent les clics, payload géant, injection dans les logs, CSRF depuis un autre site | Stats faussées, coût, logs pollués | POST seulement (405 + `Allow`, OPTIONS compris → pas de CORS) ; même origine obligatoire (`Sec-Fetch-Site` ou `Origin`, sinon 403) ; Content-Type json/text (415) ; corps ≤ 1 Ko lu de façon bornée même en chunked (413) ; champs connus seulement + regex strictes (400) ; aucune réflexion, réponses vides ; budget 600 points/min/isolate (429) ; pas d'IP stockée | Ajouter **1 règle WAF Rate limiting gratuite** : `/api/click`, 30 req / 10 s par IP → block 10 s (Cloudflare → Security → WAF). Lier Analytics Engine `CLICKS` |
| T6 | **DDoS / coût** | Flood HTTP | Indisponibilité ; facture | Site 100 % statique sur le CDN Cloudflare (gratuit, illimité en requêtes statiques) ; Functions = 100 000 req/jour gratuites puis **erreur, pas facturation** sur le plan Free | Rester sur le plan Free (pas de carte bancaire liée = pas de facture surprise) ; activer « Bot Fight Mode » (gratuit) ; alerte e-mail Cloudflare sur pics de trafic |
| T7 | **Clickjacking / embedding** | Site encadré dans une iframe tierce | Clics trompés | `X-Frame-Options: DENY` + `frame-ancestors 'none'` | — |
| T8 | **Fuite de données perso du scanner** | Champs privés (`personal_relevance`, `distance_km`, favoris) publiés | Vie privée de Yorian | Liste blanche explicite `projectDeal` + test dédié | — |
| T9 | **Compromission de la chaîne CI / dépendances** | Paquet npm malveillant, jeton Cloudflare volé | Défacement, injection de script | Versions épinglées (`package-lock.json`), `npm ci` ; jeton API Cloudflare limité à « Pages: Edit » | Activer Dependabot alerts ; jeton Cloudflare à portée minimale + rotation annuelle ; 2FA GitHub et Cloudflare |
| T10 | **Contenu dupliqué / indexation des previews** | `*.pages.dev` indexé | SEO | `X-Robots-Tag: noindex` sur `*.pages.dev` ; `robots.txt` = Disallow tant que `SITE_INDEXABLE≠1` | — |

### Risque juridique du scraping, par pays

| Pays | Fondement | Risque pour nous | Mitigation |
|---|---|---|---|
| **Suisse** | **Art. 5 let. c LCD** (reprise par procédé technique, sans sacrifice correspondant, d'un résultat de travail prêt à être mis sur le marché) ; CGU (contrat, rarement opposable sans acceptation) ; droit d'auteur (LDA) seulement pour textes/images originaux | **Moyen** pour les agrégateurs (Rappn, Preispirat, aktionis, 20min Gutscheine) dont la *sélection* est le produit ; **faible** pour les prix publiés par les enseignes elles-mêmes (faits non protégés) | Faits seulement, titre court, pas d'image, pas de description, lien vers l'original, note propre (valeur ajoutée), retrait sous 7 jours, robots.txt |
| **UE / France** | **Droit sui generis des bases de données** (directive 96/9/CE art. 7 ; CPI art. L.342-1) : extraction/réutilisation d'une partie **substantielle**, ou répétée et systématique de parties non substantielles ; CJUE *Ryanair c. PR Aviation* (C-30/14) : CGU opposables si la base n'est pas protégée ; CJUE *CV-Online* (C-762/19) : le scraping n'est illicite que s'il porte atteinte à l'investissement | **Moyen à élevé** pour une source unique aspirée en entier (ex. Revendo `products.json`, Lidl 700 produits) ; faible pour quelques offres | Ne publier que les offres **en promotion** (pas le catalogue), plafonner par source, fréquence basse ; relire les CGU de chaque source UE avant expansion ; ne jamais contourner un blocage (403/Cloudflare challenge = on arrête, déjà la règle du scanner) |
| **Allemagne** (expansion) | Idem UE + § 4 Nr. 4 UWG (entrave ciblée) ; BGH *Automobil-Onlinebörse* (2014) : le scraping sans contournement technique est en principe licite | Faible à moyen | Idem |

---

## 2. Ce qui est implémenté (ce lot)

| Élément | Fichier | Vérification |
|---|---|---|
| En-têtes de sécurité : CSP stricte (scripts externes = CF Insights seulement), HSTS 6 mois sans preload, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy (tout désactivé), COOP/CORP same-origin, nosniff, cache immutable `/_next/static`, `noindex` sur `*.pages.dev` ; ligne CSP AdSense **commentée** prête à activer | `web/public/_headers` | `wrangler pages dev out` : en-têtes présents ; navigateur : hydratation OK, navigation client OK, beacon `/api/click` 204, **0 erreur CSP** ; avec AdSense accepté, le script Google est **bloqué par la CSP** tant que la ligne n'est pas activée (défense en profondeur) |
| Build fixture analysé | `web/out/**` | HTML : 0 script externe hors `_next`, 0 gestionnaire `on*=`, 0 `javascript:`, 0 attribut `style` ; scripts inline = `<script>` Next + `id="_R_"` + JSON-LD (non exécuté) → `'unsafe-inline'` requis, rien d'autre |
| `/api/click` durci | `web/functions/api/click.ts` | 11 cas testés en local : 204 / 403 (sans origine, cross-site) / 400 (champ en trop, `<script>`) / 413 (gros corps, chunked) / 415 / 405 (GET, OPTIONS). Regex validées sur **7 537** `deal_id` réels : 0 rejet |
| `security.txt` (RFC 9116) dynamique : Contact = `mailto:` si `OPERATOR_EMAIL` est défini **dans les variables runtime Cloudflare Pages**, sinon lien `/impressum` ; Expires toujours à +180 j | `web/functions/.well-known/security.txt.ts` | `wrangler pages functions build` : route `/.well-known/security.txt` ; sortie vérifiée en local |
| Consentement : aucun script pub ni cookie tiers avant « Akzeptieren » ; « Ablehnen » au même niveau/style ; choix daté, expiré à 13 mois ; retrait = recharge la page si la pub était acceptée ; `ConsentLink` pour le pied de page ; **switch `NEXT_PUBLIC_CMP_MODE=google-tcf`** (CMP Google certifiée TCF) | `web/components/Consent.tsx`, `AdSlot.tsx` | Testé en navigateur avec un faux `ca-pub` : bannière → aucune ressource externe ni cookie ; refus → rien ; retrait depuis /datenschutz → bannière ; acceptation → balise insérée ; retrait après acceptation → rechargement, balise disparue. Identifiants AdSense validés par regex avant d'entrer dans l'URL du script |
| Pages juridiques bilingues DE + FR (ancres `#de` / `#fr`) | `web/app/impressum`, `datenschutz`, `transparenz`, `agb` (nouveau), `quellen` (nouveau) | Build OK, `tsc` OK, tests OK |
| Quellen : liste générée **au build** depuis `docs/source_registry.json` (INTEGRATED + PARTIAL « Connecteur prêt », dédupliqué par domaine → 28 sources) ; bouton e-mail de retrait pré-rempli ; réponse sous 7 jours | `web/app/quellen/` | 28 domaines rendus dans `out/quellen.html` |
| Identité de l'exploitant centralisée (env `NEXT_PUBLIC_OPERATOR_NAME/ADDRESS/EMAIL` + **nouveau** `NEXT_PUBLIC_OPERATOR_PHONE`), hébergeur, date de révision | `web/app/impressum/operator.ts` | Sans variables : bannière « Vorschau » sur chaque page |

---

## 3. Ce qui reste (propriétaire)

| # | Action | Qui | Bloquant lancement ? |
|---|---|---|---|
| R1 | Ajouter dans le pied de page (`web/components/SiteChrome.tsx`, `foot-nav`) : liens `/quellen` et `/agb` + `<ConsentLink />` (import depuis `@/components/Consent`) | dev (hors périmètre de ce lot) | **Oui** (retrait du consentement accessible partout) |
| R2 | Ajouter `NEXT_PUBLIC_OPERATOR_PHONE` (et `NEXT_PUBLIC_CMP_MODE`) à `web/.env.example` et à `.github/workflows/web.yml` (`vars.OPERATOR_PHONE`, `vars.CMP_MODE`) | dev | Oui pour FR (LCEN) |
| R3 | Fournir nom, **adresse postale** (c/o accepté), e-mail de contact (`contact@<domaine>` via Cloudflare Email Routing), **téléphone** → variables GitHub `OPERATOR_*` ; et `OPERATOR_EMAIL` aussi dans Cloudflare Pages → Settings → Variables (runtime, pour security.txt) | **Yorian** | **Oui** |
| R4 | Relecture juridique des `LAWYER-CHECK` (représentant UE art. 27 RGPD ? art. 5 let. c LCD par source ; clauses de responsabilité ; LCEN pour un éditeur personne physique résidant en Suisse) | **Yorian** (prendre RDV) | Oui avant revenus |
| R5 | Lire les CGU des sources agrégatrices (Rappn, Preispirat, 20min Gutscheine, aktionis, poinz) et retirer celles qui interdisent la réutilisation | **Yorian** (lecture) + dev (retrait) | Oui |
| R6 | Cloudflare : règle WAF Rate limiting gratuite sur `/api/click` ; Bot Fight Mode ; liaison Analytics Engine `CLICKS` ; 2FA ; jeton API à portée « Pages: Edit » | **Yorian** (clics dashboard) | Non (recommandé) |
| R7 | Domaine définitif : HSTS `preload` seulement après vérification de tous les sous-domaines ; soumettre hstspreload.org | dev + Yorian (GO) | Non |
| R8 | AdSense : activer « Confidentialité et messages » (CMP TCF), mettre `NEXT_PUBLIC_CMP_MODE=google-tcf`, décommenter la CSP AdSense dans `_headers`, vérifier la console | Yorian (compte) + dev | Oui avant toute pub |
| R9 | Tests unitaires pour `parseClick` / `isSameOrigin` / `securityTxt` / `publicSources` (fonctions exportées pour ça) dans `web/tests/` | dev | Non |
| R10 | Ajouter `web/.wrangler/` à `.gitignore` (état local créé par `wrangler pages dev`) | dev | Non |
| R11 | Statut fiscal : revenus d'affiliation = revenus imposables (France si domicile fiscal FR) ; micro-entreprise si activité régulière → ajouter SIREN à l'Impressum | **Yorian** | Au premier revenu |
| R12 | Option CSP sans `'unsafe-inline'` : hashes générés par un script post-build et écrits dans `_headers` (limite : taille du fichier) | dev | Non |

---

## 4. Check-list pré-lancement

- [ ] `OPERATOR_NAME/ADDRESS/EMAIL/PHONE` renseignés ; plus aucun bandeau « Vorschau » sur `/impressum`, `/datenschutz`, `/quellen`
- [ ] Pied de page : Transparenz · Datenschutz · Impressum · **Nutzungsbedingungen · Quellen · Cookie-Einstellungen**
- [ ] `curl -sI https://<domaine>/` montre CSP, HSTS, XFO DENY, COOP, CORP, Permissions-Policy
- [ ] `curl -s https://<domaine>/.well-known/security.txt` → `Contact: mailto:…`
- [ ] `curl -X POST https://<domaine>/api/click -d '{}'` → 403 ; depuis le site, un clic sortant → 204 (onglet Réseau)
- [ ] Console navigateur sur `/`, une page ville, une page deal : **aucune** violation CSP
- [ ] Sans consentement : onglet Réseau = aucun appel `google*`/`doubleclick` ; `document.cookie` vide
- [ ] `*.pages.dev` renvoie `X-Robots-Tag: noindex` ; le domaine définitif non
- [ ] Règle WAF rate limiting `/api/click` active ; Bot Fight Mode actif
- [ ] Relecture juridique faite (R4) ; CGU sources vérifiées (R5)
- [ ] Adresse de retrait testée : l'e-mail pré-rempli arrive bien dans la boîte de Yorian ; procédure : répondre < 7 jours, retirer la source dans `config/` du scanner, rebuild
- [ ] `LEGAL_REVISION` (`web/app/impressum/operator.ts`) mis à jour si un texte change
