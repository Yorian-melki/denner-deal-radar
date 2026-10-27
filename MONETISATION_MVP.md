# Monétisation — MVP (v0, 27.10.2026)

Objectif : transformer le radar personnel en **site public de deals** qui gagne
de l'argent, d'abord à Saint-Gall, puis dans d'autres villes suisses, puis à
l'étranger, sans casser le scanner gratuit existant.

> Résumé en une ligne : **SEO + Telegram public → clics sortants → commissions
> d'affiliation** ; la pub display vient en complément quand le trafic dépasse
> ~10 000 pages vues/mois ; l'abonnement « alertes instantanées » vient en dernier.

---

## 1. Modèle de revenus, classé par ROI réaliste au début

Hypothèses de départ (prudentes, à remplacer par les vrais chiffres dès le mois 1) :
1 000 → 10 000 pages vues/mois la première année, 3–6 % des visiteurs cliquent
vers un marchand, 1–3 % des clics marchands convertissent.

| # | Levier | Pourquoi ce rang | Revenu réaliste an 1 | Effort | Prérequis |
|---|---|---|---|---|---|
| 1 | **Affiliation tech / reconditionné / flash** (Galaxus, Digitec, BRACK, Revendo…) | Paniers élevés (100–1 000 CHF), commissions 2–12 %, nos deals tech ont déjà une vraie note | 20–300 CHF/mois | faible : la couche de réécriture est faite | Acceptation dans chaque programme (à son nom) |
| 2 | **Affiliation étudiants / abonnements / voyage** (UNiDAYS, Student Beans, opérateurs mobiles, Booking via CJ/Awin) | Forte intention, audience étudiante = notre cible | 10–100 CHF/mois | faible | Idem ; Booking : commission seulement sur séjour effectué |
| 3 | **Amazon.de / AliExpress** | Pas de source dans le radar aujourd'hui → zéro lien à réécrire tant qu'on n'ajoute pas de source | ~0 au début | moyen (nouvelle source) | Amazon PartnerNet exige 3 ventes en 180 jours, sinon compte fermé |
| 4 | **Pub display** (AdSense, puis Ezoic/Mediavine au-delà de 10k–50k sessions) | RPM 1–5 CHF en Suisse → 10 CHF/mois à 5 000 pages vues ; dégrade l'UX et le SEO si trop tôt | 5–50 CHF/mois | faible (emplacements prêts) | Site en production, CMP certifiée TCF (obligatoire en CH/EEE/UK), Impressum |
| 5 | **Premium « alertes instantanées »** (Telegram privé, filtres perso, 3–5 CHF/mois) | Marche quand il y a déjà une audience gratuite fidèle (≥ 1 000 abonnés) | 0 avant mois 6 | moyen (paiement Stripe/Twint, bot) | Société ou raison individuelle, CGV, TVA si > 100 kCHF |
| 6 | **B2B** : flux de données / widget pour associations étudiantes, sponsor local | Effet levier quand plusieurs villes sont couvertes | ponctuel | élevé | Volume et marque |

**Ce qui ne rapportera pas** : les ~60 % de deals supermarchés (Denner, Aldi,
Lidl, Migros, Coop, Volg) — aucun de ces distributeurs n'a de programme
d'affiliation. Ils servent à **attirer le trafic** (SEO « Aktionen St. Gallen »,
habitude hebdomadaire), pas à le monétiser.

**État vérifié des programmes (27.10.2026, à reconfirmer à l'inscription)** :
* Galaxus : programme sur **Tradedoubler** (DE/FR/IT/BE listés ; contact
  affiliate@galaxus.* ; jusqu'à 12 %, cookie 30 j). Le programme **Suisse** n'est pas
  listé publiquement : écrire à Galaxus pour le .ch. Digitec : idem, à demander.
* Booking.com : depuis 2025, plus de portail propre ; Europe → **CJ**, reste du
  monde → Awin ; ~4 % sur séjour effectué, suivi par session.
* BRACK, Interdiscount, Revendo, QoQa, DayDeal : aucun programme public confirmé
  → vérifier dans l'annuaire Awin/Tradedoubler ou écrire au marketing.
* Awin domine en Suisse (~30 % des sites affiliés), puis Impact, puis Tradedoubler.

## 2. Plan d'audience

| Canal | Mise en œuvre | Coût | Quand |
|---|---|---|---|
| **SEO** | Pages générées : `/st-gallen`, `/st-gallen/<catégorie>` (10), `/deal/<slug>` (~1 000 notés), sitemap, JSON-LD Product/Offer, canonical, noindex des pages vides et des deals non notés | 0 | **fait (v0)** |
| Mots-clés cibles | « Aktionen St. Gallen », « Denner Aktionen diese Woche », « Gratis St. Gallen », « Studentenrabatt Schweiz », « Handy Abo Aktion » | 0 | contenu des pages catégories |
| **Telegram public** | Canal `@DealRadarSG` : top 3 du jour + alertes ≥ 8/10, lien vers la page du deal (pas directement vers le marchand → page vue + mention). Réutilise `radar/notify.py` avec un 2ᵉ chat_id | 0 | semaine 1 après GO |
| **Instagram / TikTok** | Visuel « Top 3 du jour » généré automatiquement (image 1080×1350 depuis l'export) ; publication **manuelle** au début (API Instagram = compte pro + app Meta validée ; TikTok = audit d'app) | 0 | mois 1, automatisation mois 2–3 |
| Bouche-à-oreille HSG | Associations étudiantes, groupes WhatsApp de l'échange, affiche QR à la cafétéria | 0 | dès le GO |
| Reddit / Jodel | r/askswitzerland, r/stgallen : participer, pas spammer | 0 | ponctuel |

Règle anti-spam : jamais de publication automatique sur un compte public sans
GO explicite de Yorian pour ce canal.

## 3. Architecture

```
            (inchangé, 0 CHF)                                (nouveau)
GitHub Actions cron ─► python -m radar u-scan ─► data/ (git)
                    └► u-export ─► GitHub Pages /data/universal.json ──fetch (ISR 30 min)──► Next.js web/ (Vercel)
                                                                                         ├─ lib/project.ts   liste blanche publique + garde-fous
                                                                                         ├─ lib/affiliate/   réécriture des liens (pure, testée)
                                                                                         ├─ app/[city]/[category], app/deal/[slug]  pages SEO
                                                                                         ├─ AdSlot + Consent (pub seulement après accord)
                                                                                         └─ Vercel Web Analytics (sans cookie) + track("outbound_click")
```

**Pourquoi ce découpage** : le scanner reste gratuit et inchangé ; le site ne
fait que lire un JSON public. Un flux en panne → l'ISR garde la dernière page
(jamais de page vide publiée). Aucune base de données.

### Multi-villes / multi-pays (`web/config/cities.ts`)
* `FEEDS` : un flux JSON par zone (même schéma que `universal.json`). Ajouter
  Zurich = déployer le même scanner avec d'autres connecteurs locaux (ou une
  matrice GitHub Actions `city: [sg, zh]`) qui publie `.../zh/universal.json`.
* `CITIES` : `launched: false` tant qu'une ville n'a pas de vraie source locale
  (sinon pages dupliquées « nationales » = contenu mince pour Google).
* Rattachement : deals `LOCAL/NEARBY/REGIONAL` → villes du flux ; `NATIONAL/ONLINE` → toutes les villes du pays.
* Nouveau pays : `country` + `currency` + `locale` ; les programmes d'affiliation
  sont par hôte, donc Amazon.fr, Galaxus.de, etc. s'ajoutent dans `programmes.ts`.
* Côté scanner, chaque connecteur déclare déjà sa portée géographique ; il faut
  ajouter un champ `city`/`feed` au registre (`docs/source_registry.json`).

### Couche d'affiliation (`web/lib/affiliate/`)
* `rewriteUrl(url, env)` : fonction pure, testée (10 tests). Un programme ne
  s'active que si ses identifiants sont dans l'environnement Vercel → sans
  compte, le site fonctionne avec les liens d'origine.
* Ne réécrit **jamais** un lien déjà affilié par un tiers (tag Amazon existant,
  awin1, tradedoubler, CJ…) : détournement de commission interdit.
* Liens rémunérés : `rel="sponsored nofollow"` + astérisque + mention en pied de page.
* Le classement ne dépend **jamais** de la commission (tri = note absolue). Écrit
  sur `/transparenz`.

### Mesure
* Vercel Web Analytics : pages vues sans cookie (pas de bannière nécessaire).
* `track("outbound_click", {deal, source, affiliate, programme})` : les
  **événements personnalisés exigent le plan Pro**. En Hobby, les clics se lisent
  dans les rapports des réseaux d'affiliation.

### ⚠️ Hébergement : Vercel Hobby interdit l'usage commercial
Les règles Vercel classent explicitement **pub (AdSense) et sites dont
l'affiliation est le but principal** comme usage commercial → plan **Pro
(~20 USD/mois)** obligatoire dès que pub ou affiliation sont activées en
production. Alternatives gratuites autorisant le commercial : Cloudflare Pages
(export statique + rebuild déclenché par le workflow après chaque scan) ou
Netlify. **Décision à prendre par Yorian avant le lancement** (voir §6).
La preview actuelle (aucun identifiant d'affiliation, aucune pub) n'est pas commerciale.

## 4. Check-list légale

| Point | Statut | Détail |
|---|---|---|
| robots.txt par source | ✅ scanner | `scripts/check_robots.py`, vérif ≤ 1×/20 h, Crawl-delay respecté ; voir SOURCE_AUDIT.md |
| CGU par source (réutilisation **publique**) | ⚠️ à faire avant lancement | L'audit a vérifié l'accès, pas le droit de republier. Risque suisse : **art. 5 let. c LCD** (reprise d'un « résultat de travail prêt à être mis sur le marché » par procédé technique). Mitigation : on publie des faits (prix, dates) + notre note, titre court, lien vers l'original, pas de description complète, **pas d'images marchandes** (non affichées en v0). Lire les CGU de Rappn, Preispirat, Migros, Lidl, Aldi, Denner, 20min ; retirer toute source qui interdit la réutilisation. |
| Attribution | ✅ v0 | « Quelle : marchand (domaine) » + lien sur chaque deal |
| Données perso | ✅ v0 | Liste blanche : `personal_relevance`, `distance_km`, favoris… ne sortent jamais (test dédié) |
| Cookies / nLPD / RGPD | ✅ v0 partiel | Analytics sans cookie ; pub chargée **seulement** après « Akzeptieren ». Pour AdSense en CH/EEE/UK, Google exige une **CMP certifiée TCF** → utiliser « Confidentialité et messages » d'AdSense (gratuit) à l'activation et retirer la bannière maison |
| Mention d'affiliation | ✅ v0 | Astérisque + pied de page + `/transparenz` ; `rel="sponsored"` |
| Impressum | ❌ bloque le lancement | Obligatoire pour un site commercial suisse (art. 3 al. 1 let. s LCD) : nom, adresse postale, e-mail → variables `NEXT_PUBLIC_OPERATOR_*` |
| Exactitude des prix | ✅ v0 | « massgebend ist die Seite des Anbieters » ; garde-fou : réduction invraisemblable (> 80 % épicerie, > 85 % tech…) → pas de note (19 deals concernés au 27.10, ex. « Coop Äpfel 0.05 statt 2.95 ») |
| Impôts / statut | à faire au premier revenu | Revenus d'affiliation = revenu imposable (déclaration à Saint-Gall/France selon domicile fiscal de l'échange) ; raison individuelle si activité régulière ; TVA seulement > 100 kCHF/an |

## 5. KPIs (revue chaque lundi)

| KPI | Mois 1 | Mois 3 | Mois 6 |
|---|---|---|---|
| Pages indexées (Search Console) | 100 | 500 | 1 500 |
| Visiteurs uniques / mois | 300 | 2 000 | 10 000 |
| Abonnés Telegram public | 50 | 300 | 1 000 |
| Taux de clic sortant (clics / visites) | ≥ 3 % | ≥ 5 % | ≥ 6 % |
| Part des clics sur liens affiliés | mesure | ≥ 20 % | ≥ 30 % |
| Revenu (affiliation + pub) | 0–20 CHF | 20–100 CHF | 100–500 CHF |
| Fraîcheur données (âge du flux) | < 2 h | < 2 h | < 1 h |
| Erreurs de prix signalées | < 5/sem | < 2/sem | < 1/sem |

Critère d'arrêt/pivot honnête : si au mois 3 le site a < 1 000 visiteurs/mois
malgré Telegram + SEO, l'audience ne viendra pas du SEO local → miser sur le
canal étudiant (B2B associations / app) plutôt que la pub.

## 6. Ce que Yorian doit faire lui-même (je ne crée aucun compte, ne paie rien, ne tape aucun mot de passe)

Ordre recommandé :
1. **Choisir l'hébergement de production** : Vercel Pro (~20 USD/mois, le plus simple) ou Cloudflare Pages (gratuit, je migre le build en statique). → réponse : « Pro » ou « Cloudflare ».
2. **Choisir et acheter un nom de domaine** (~10–15 CHF/an, ex. un .ch court) — paiement par lui.
3. **Fournir l'Impressum** : nom, adresse postale, e-mail de contact (ou adresse c/o).
4. **Créer les comptes d'affiliation à son nom** puis me donner uniquement les identifiants publics :
   * Tradedoubler (éditeur) → postuler au programme Galaxus ; écrire à affiliate@galaxus.ch pour le programme suisse/Digitec.
   * Awin (éditeur, frais d'inscription remboursable possible) → chercher BRACK, Revendo, UNiDAYS, Student Beans, opérateurs mobiles.
   * CJ → Booking.com (Europe).
   * (Plus tard, si on ajoute une source Amazon/AliExpress) Amazon PartnerNet .de, AliExpress Portals.
5. **AdSense** (après le lancement et ≥ ~30 pages de contenu indexées) : compte à son nom, activer « Confidentialité et messages » (CMP TCF).
6. **Telegram** : créer le canal public et m'ajouter le bot comme admin (je n'y publie rien sans GO).
7. **Search Console** : vérifier le domaine (enregistrement DNS) et soumettre `/sitemap.xml`.
8. **GO production** : je mets `NEXT_PUBLIC_SITE_URL`, les identifiants, et je promeus.

## 7. Prochaines étapes techniques (après GO)

1. Export public allégé côté scanner (`u-export --public` → ~1 Mo au lieu de 15 Mo) : moins de transfert, build plus rapide.
2. Corriger côté scanner les prix aberrants Rappn (même article 6× par magasin, prix unitaire vs lot).
3. Image « Top 3 du jour » (OG image + Instagram) via `next/og`.
4. Canal Telegram public dans `ualerts` (2ᵉ destination, seuil 8/10).
5. Matrice multi-villes dans `universal.yml` + flux `zh/` dès qu'une source locale zurichoise est intégrée.
6. Page FR/EN (Genève/Lausanne = `locale: fr`) avec `hreflang`.

Sources consultées : [Galaxus affiliate (Tradedoubler)](https://www.galaxus.de/en/page/17259) ·
[Tradedoubler Galaxus.be](https://directory.tradedoubler.com/en/programs/339729-Galaxus-be) ·
[Booking → Awin/CJ](https://www.netinfluencer.com/booking-com-moves-all-affiliates-to-awin-what-to-know-about-termination-notices) ·
[Vercel fair use (usage commercial)](https://vercel.com/docs/limits/fair-use-guidelines) ·
[Parts de marché affiliation CH](https://www.wmtips.com/technologies/affiliate-marketing/country/ch/)
