# Couverture réelle — ce qui est couvert, partiellement, ou impossible

Mesuré en production (GitHub Actions) le 14.10.2026 : 24 sources actives en
collecte automatique (Denner V2 + 23 connecteurs), ~2 850 offres vivantes. Le détail vivant (santé, fraîcheur, doublons) est dans l'onglet
**🩺 Santé** de l'application ; le registre complet (122 sources) dans **🔌 Sources**.

Ce radar ne prétend PAS couvrir « toutes les offres de Saint-Gall ». Il couvre les
offres publiées en ligne par les sources ci-dessous, et documente le reste.

## ✅ Couvert (collecte complète)

| Famille | Sources | Offres (14.10) |
|---|---|---|
| Supermarchés | Denner (V2), Lidl, Aldi, Migros (Ostschweiz), Volg | 488 + 408 + 446 + 39 + 25 |
| Ventes flash | DayDeal, QoQa, Digitec, Galaxus (deals du jour) | 7 + 33 + 8 + 23 |
| Reconditionné | Revendo (offres réellement réduites) | 539 |
| Gratuit numérique | Epic Games, GamerPower | 4 + 14 |
| Communauté | Preispirat (deals, gratuit, coupons) | 58 |
| Coupons / cashback | 20 Minuten Gutscheine, poinz | 23 + 53 |
| Événements | Grabenhalle, Konzert und Theater (gratuits / bon marché) | 8 + 4 |
| Étudiants | UNiDAYS, Student Beans | 24 + 32 |
| Voyage | Ferienpiraten, Secret Flying (ZRH, BSL) | 5 + 6 |
| Ouvertures / signaux locaux | Actualités Ville de St-Gall | 1 |

## 🟠 Partiel (par conception ou limite de la source)

| Source | Limite |
|---|---|
| Tutti, Anibis (gratuit canton SG), BRACK, Saiten | **bloqués depuis les IP de datacenter** (GitHub Actions) ; connecteurs prêts, fonctionnels en scan manuel depuis une connexion résidentielle (`python -m radar u-scan --source tutti_free anibis_free brack saiten_events`) |
| Coop, Aligro, Otto's (via Rappn) | premières pages seulement (~550 offres sur ~1 500) |
| dschungelkompass (abonnements mobile/internet) | 50 offres mobiles affichées sur 54 |
| Aldi | prix sans prix barré : note uniquement après historique |
| Migros | seules les listes autorisées par robots.txt (39 offres) |
| Rabais sur assortiment (Migros, 20min) | % connu, prix individuels non publiés |

## ⛔ Impossible ou bloqué (voir `docs/coverage_gaps.json`)

Too Good To Go (anti-bot + compte), Coop.ch direct (DataDome), stock par magasin,
réductions en rayon, offres personnalisées (Cumulus, Supercard, Lidl Plus), billets
CFF Supersaver (aucune API, 403), Ricardo et Facebook Marketplace, Toppreise,
Interdiscount / MediaMarkt complet / IKEA Zweite Chance / Zalando / H&M, SHSG,
restaurants et happy hours (aucune source structurée), concours (probabilité jamais
publiée).

Alternatives proposées : saisie manuelle « Offre vue en magasin » (photo, sans
LLM), Rappn pour Coop, Tutti/Anibis pour l'occasion, sites étudiants, historique
propre du radar en remplacement des comparateurs.

## Revue de couverture

Tous les 3 mois (ou quand une source passe en échec durable) : relancer l'audit des
familles (`docs/audit/*.json`), régénérer le registre (`python scripts/build_registry.py`),
ajouter les sources à meilleure priorité (`docs/ADDING_A_SOURCE.md`).
