# Distribution publique — canal Telegram + kit de partage

Les alertes **privées** (bot → propriétaire, `TELEGRAM_CHAT_ID`) ne changent pas.
Ce document couvre la diffusion **publique** : `radar/channel.py`,
`config/channel.toml`, `.github/workflows/channel.yml`.

Nom de marque et URL du site ne sont pas définitifs : ils viennent des
variables `SITE_NAME` et `SITE_URL` (défauts : « Deal Radar », pas d'URL →
les liens pointent vers l'offre source). Aucun code à modifier le jour J.

## 1. Ce qui est publié

| Post | Quand | Contenu |
|---|---|---|
| **Top 3 du jour** | 1 fois/jour, premier passage entre 18:00 et 22:00 (Zurich) | 3 meilleurs deals vivants, note ≥ 6, 1 par source max, jamais déjà postés |
| **Deal exceptionnel** | dès détection, note ≥ 8,5 et confiance ≥ 0,5 | 1 deal par post, aperçu du lien activé |

Chaque message : titre, prix vs référence **nommée** (vorher / UVP /
Konkurrenzpreis… ou « kein Vergleichspreis veröffentlicht »), note /10, date de
fin si connue (« voraussichtlich » si déduite), « Warum » (raison de la note +
qualité des données), restrictions (étudiants, membres, code, condition), lien
vers `SITE_URL/deal/<slug>` (même slug que `web/lib/project.ts`, testé) ou vers
l'offre si le site ne génère pas de page (pas de `SITE_URL`, note < 5).
Pied : « Angaben der Anbieter, Stand HH:MM. Preise können sich ändern. »

**Honnêteté** : aucune fausse urgence (« nur heute », « schnell »… interdits,
vérifié par test) ; deals à réduction invraisemblable (épicerie > 80 %, etc. —
même règle que le site) jamais publiés ; seule la note absolue compte, aucune
donnée personnelle.

**Anti-spam** (`config/channel.toml`) : 3 posts instantanés max/jour, 60 min
min entre deux, heures calmes 22:00–07:30 (rien n'est mis en file : un deal
encore valable le matin passera au premier passage après 07:30), un deal — ou la
même entité canonique vue chez une autre source — n'est jamais reposté
(mémoire 60 jours). État : `data/universal/channel_state.json` (seul fichier
commité par le workflow, `[skip ci]`).

## 2. Mise en route (10 min, par le propriétaire)

1. **Créer le canal** : Telegram → Nouveau canal → nom provisoire → *Public* →
   lien `t.me/<nom>` (ex. `@stgallen_deals`; modifiable plus tard).
2. **Ajouter le bot comme admin** : canal → Administrateurs → Ajouter → chercher
   le bot existant (celui de `TELEGRAM_BOT_TOKEN`) → droit **Publier des
   messages** seulement (décocher le reste).
3. **Secrets / variables GitHub** (Settings → Secrets and variables → Actions) :
   * Secret `TELEGRAM_CHANNEL_ID` = `@nomducanal` (ou l'ID `-100…` pour un canal privé).
   * `TELEGRAM_BOT_TOKEN` : déjà présent.
   * Variables (onglet *Variables*) : `SITE_NAME`, `SITE_URL` (facultatives).
4. **Tester sans publier** : Actions → *channel* → Run workflow (dry_run coché
   par défaut) — mais le job est ignoré tant que l'étape 5 n'est pas faite ; en
   local : `python -m radar u-channel --dry-run --mode daily`.
5. **GO** : variable `CHANNEL_ENABLED` = `true`. Pour couper : la supprimer ou
   la mettre à `false`. Sans `TELEGRAM_CHANNEL_ID`, la commande journalise et
   sort en 0 (rien n'est publié).

Commandes :

```bash
python -m radar u-channel --dry-run [--city st-gallen] [--mode auto|daily|instant] [--now 2026-10-28T18:05]
python -m radar u-channel --send    # publie + écrit channel_state.json
python -m radar u-sharekit [--city st-gallen] [--out-dir DIR]
```

## 3. WhatsApp — état au 28.10.2026

* **WhatsApp Channels n'a pas d'API officielle de publication.** La plateforme
  WhatsApp Business (Cloud API) de Meta envoie des messages *à des
  utilisateurs* (modèles approuvés, opt-in requis) ; la documentation officielle
  de tarification et de l'API ne mentionne aucune publication dans un canal.
  Les « Channel APIs » qui circulent (ex. Whapi.Cloud) sont des passerelles tierces
  qui pilotent un compte WhatsApp connecté par QR code (WhatsApp Web) : usage
  automatisé non autorisé par les conditions de WhatsApp → risque de bannissement
  du numéro. **Non construit, volontairement.**
* **Cloud API (diffusion 1-à-1 à des abonnés)** : facturation **par message
  délivré** depuis le 1.7.2025 (plus par conversation). Depuis le **1.10.2026**,
  les messages de service (au-delà de 1 000 gratuits/mois/numéro) et les messages
  utilitaires dans la fenêtre de 24 h sont aussi payants. Un post « Top 3 » est
  un modèle **Marketing**, toujours payant. La Suisse est dans la zone « Rest of
  Western Europe » (pas de tarif CHF propre ; facturation en EUR/USD). Ordre de
  grandeur selon des grilles de revendeurs : ~0,05–0,07 € par message marketing
  délivré, plus la marge éventuelle du fournisseur → 1 000 abonnés × 1 post/jour
  ≈ 1 500–2 100 €/mois. Exige aussi un compte Meta Business vérifié, un numéro
  dédié, des modèles approuvés et un opt-in explicite de chaque destinataire.
  Conclusion : pas rentable pour un service gratuit ; à revoir seulement avec
  des revenus.
* **Ce qui est fait à la place** : `u-sharekit` écrit chaque jour
  `data/universal/sharekit/<date>.md` (aussi en artefact du workflow, 7 jours) :
  textes prêts à coller pour **WhatsApp** (`*gras*`), **Telegram** (`**gras**`)
  et une **légende Instagram** (sans liens cliquables, « Link in der Bio »,
  hashtags), en DE / FR / EN. Le propriétaire publie à la main dans sa Chaîne
  WhatsApp (manuel = conforme).

Sources : [Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/pricing),
[Whapi.Cloud — Channels (passerelle tierce)](https://support.whapi.cloud/help-desk/channels),
[Grille de tarifs WhatsApp, mai 2026 (Salesforce)](https://www.salesforce.com/en-us/wp-content/uploads/sites/4/WhatsApp-Business-Messaging-Rate-Card-MM-Lite-May-1-2026.pdf),
[eworx — tarifs WhatsApp par pays](https://www.eworx.at/marketing-suite/en/pricing/whatsapp).
À revérifier avant toute décision payante (les tarifs changent chaque trimestre).

## 4. Playbook de croissance

* **Horaires** : Top 3 à 18:00 (retour du travail, avant les courses du soir) ;
  instantanés seulement s'ils sont vraiment exceptionnels (≥ 8,5) — la rareté
  fait la confiance. Jeudi = nouvelles semaines Denner/Coop/Migros : bon jour
  pour relayer le Top dans des groupes.
* **Amorçage** (semaines 1–4) : épingler un message « Comment on note (0–10) »
  avec lien vers la page transparence du site ; partager le Top dans 3–5 groupes
  locaux (étudiants HSG, WG, Facebook « St. Gallen Marktplatz », Jodel) — une
  fois par semaine, pas tous les jours ; publier le kit dans sa Chaîne WhatsApp.
* **Boucle de partage** : chaque post finit par la source et l'heure (crédible,
  facile à transférer) ; le lien vers la page deal du site ramène vers « Alle
  Deals ». Mesurer : abonnés du canal (stats Telegram) + clics `/deal/` (site).
* **Ne jamais** : acheter des abonnés, poster des deals non vérifiés, cacher une
  condition (étudiants, membres, achat minimum), inventer une échéance.
* **Un canal par ville, plus tard** : ajouter `[cities.zuerich]` dans
  `config/channel.toml` avec `channel_env = "TELEGRAM_CHANNEL_ID_ZUERICH"` et
  `local = false` tant qu'il n'y a pas de source locale (il reçoit alors les
  deals nationaux / en ligne seulement — même règle que le site), puis une
  étape `--city zuerich` dans `channel.yml` avec ce secret. L'état est déjà
  séparé par ville.
* **Langue** : `lang` par ville (`de` pour St-Gall, `fr` pour Genève/Lausanne).
