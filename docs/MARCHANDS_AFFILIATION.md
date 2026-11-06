# Marchands d'affiliation — état au 06.11.2026 (Gmail relu du 15.10 au 06.11)

Comptes : Awin éditeur **3137340** (approuvé) · Tradedoubler site **3505384** (en validation qualité) · CJ CID **8111388** (propriété 101914979, activation = W-8BEN signé + IBAN).
Variables GitHub posées : `AFF_AWIN_ID=3137340`, `AFF_TRADEDOUBLER_ID=3505384`.

## Méthode
Classement par présence dans notre flux (`data/universal/deals`, 28.10) puis pertinence étudiants CH.
Annuaire Awin filtré Suisse : 443 annonceurs non inscrits (423 lus).

## Awin — candidatures envoyées le 28.10 (message standard, site savradar.pages.dev)
MediaMarkt, Conrad, Orell Füssli, Samsung, Sony, Dyson, Acer, Ackermann, Bergzeit, Hunkemöller, Fressnapf,
DeubaXXL, AliExpress EU, Jelmoli, Douglas, adidas, Snipes, Intersport, SportScheck, Alternate, Mister Spex,
Lyca, Wingo, Migros Mobile, Coop Mobile, Spusu, Talktalk, Flixbus, Sixt, Trivago, Lounge by Zalando, Just Eat,
Myprotein, On, Swissactivities, Viator, HolidayCheck, Delonghi, Kenwood, Tassimo, VidaXL, Fnac, Fielmann,
JBL, Harman Kardon, Helly Hansen, smartphoto, CoffeeB, Redcare, BookBeat, Gymbeam, iHerb, flaconi, Breuninger,
Blue Tomato, Bergfreunde, Gigasport, Odlo, Emma, Hilton, HRS, Hotel.info, Travelcircus, 12-Travel, Lidl Reisen,
Aldi Suisse Tours, Holidu, Mytrip, Gotogate, Electrolux, Solis, Kärcher, Myposter, Startselect, Software-Dealz,
ESET, Kaspersky, Temu, Yves Rocher, Marionnaud, Parfumdreams, Kiehl's, Rohner Socks, Cecil, s.Oliver,
Calzedonia, Intimissimi, Tennispoint, Foot-Store, Freeletics, Yazio, Lentiamo, Linsenklick
(résultat exact par marchand : voir statut « En attente » dans Awin).

Absents d'Awin (chercher sur Tradedoubler/CJ/direct) : Galaxus, Digitec, Brack, Interdiscount, Revendo, QoQa,
Otto's, Nettoshop, Manor, Fust, Coop, Lidl (épicerie), Booking.

## Tradedoubler — à postuler dès validation du site
Galaxus, Digitec, Microspot, Interdiscount, Zalando CH, Booking (si dispo), Nettoshop, Brack (vérifier).

## CJ — compte ACTIF (28.10), candidatures envoyées
Booking.com DACH, AliExpress Global, Expedia + Hotels.com (DACH et, par erreur de filtre, plusieurs autres pays), Vrbo,
GetYourGuide INT, Samsung Global, Kiwi.com, Omio (FR/NL/DE), Agoda EU, Surfshark, Lenovo (UK).
Introuvables sur CJ : Udemy, Hostelworld, Airalo, Trip.com, Trainline, Logitech, Microsoft, Swarovski, Farfetch, Europcar, Lufthansa/SWISS.

## Après acceptation
Remplir `AFF_AWIN_MIDS` (domaine=mid) et `AFF_TRADEDOUBLER_*_P` dans les variables GitHub → les liens se réécrivent au build suivant.

## Réponses au 28.10 (soir)
- ✅ Awin **Lyca Mobile CH** (mid 121580) → `AFF_AWIN_MIDS=lycamobile.ch=121580` posé.
- ✅ CJ **Surfshark** approuvé.
- ❌ Awin Fielmann CH : « URL is irrelevant to advertiser brand ».
- ❌ **Tradedoubler : site refusé** (« Too low quality », 28.10 11:16, AVANT la passe masterclass ; site sur *.pages.dev, en noindex, sans trafic ni domaine propre). Le support DACH ne traite plus la question NIF tant que le site est refusé.
  → Re-soumettre via « Ajouter un site » après : domaine propre + indexation + quelques semaines de contenu/trafic (phase 1). Galaxus/Digitec restent la priorité n°1 à ce moment-là.

## Réponses reçues du 28.10 au 06.11 (relevé Gmail du 06.11)

Recherche : Awin, CJ, Tradedoubler, Impact, Partnerize, Rakuten, Webgains, Adtraction, TradeTracker, Daisycon,
« publisher », « affiliate », « approved », « declined », « Partnerprogramm », depuis le 15.10.
**Aucun mail** d'Impact, Partnerize, Rakuten, Webgains, Adtraction, TradeTracker ni Daisycon (aucune candidature
n'y a été envoyée). Aucune réponse n'a été envoyée et aucun contrat accepté pendant ce relevé.

### Acceptés (6)

| Programme | Réseau | Date | Commission (source) | Action requise |
|-|-|-|-|-|
| Lyca Mobile CH (mid 121580) | Awin | 28.10 | Montant **fixe par abonnement**, quel que soit l'abo (mail Lyca). Taux modifiés le 28.10 15:30 : à lire dans Awin › Commission Manager | Yorian : lire le nouveau taux dans Awin. Mail personnel de Yoana Tsoneva (Head of Digital DACH, Lycatel) : offres étudiantes (prépayé 100 Go à 9.49 CHF, abo à −50 % pendant 3 mois). Répondre ou non = décision de Yorian. Lien déjà réécrit (`AFF_AWIN_MIDS`). |
| Surfshark | CJ | 28.10 | **40 % de revenue share** sur les ventes à de nouveaux clients, renégociable selon le volume (mail Surfshark) | Rien d'urgent. VPN = hors cœur étudiant/local : ne pas pousser en une, seulement en page « abonnements utiles ». |
| AliExpress Global (CID 7711902) | CJ | 29.10 | 2 % électronique, 8 % accessoires mobile/vêtements/jardin, 6 % autres ; cookie **3 jours** (mail AliExpress) | Vérifier dans CJ que le statut est bien « Joined ». Intérêt faible (cookie court, qualité variable). |
| Kaspersky DE (Awin) | Awin | 30.10 | non indiqué dans le mail | Lire le taux dans Awin ; programme DE (vérifier qu'il accepte le trafic CH). |
| Software-Dealz DE (aid 68526) | Awin | 01.11 | non indiqué ; campagne Black Weeks du 1 au 30.11 | Lire le taux dans Awin ; utile seulement si une page « logiciels étudiants » existe. |
| Compte CJ (CID 8111388) | CJ | 30.10 « Welcome to the CJ Network » | — | Activation des paiements : **W-8BEN signé + IBAN** (Yorian, toujours en attente). |

### Refusés depuis le 28.10 (20, tous Awin) + Tradedoubler

| Programme | Date | Motif exact (Awin) |
|-|-|-|
| s.Oliver CH | 28.10 | « zu geringe organische Sichtbarkeit » |
| Alternate CH | 28.10 | « Site not live/under construction » |
| Fielmann CH | 28.10 | « URL is irrelevant to advertiser brand » |
| Orell Füssli CH | 29.10 | « Site does not … » (motif tronqué, même famille que Mister Spex) |
| smartphoto CH | 29.10 | « Site does not … » |
| Snipes EU | 29.10 | « Advertiser doesn't work with this publisher type » |
| Breuninger CH | 29.10 | « Site does not … » |
| Gymbeam CH | 29.10 | « Advertiser doesn't work with this publisher type » |
| Rohner Socks CH | 29.10 | « URL is irrelevant to advertiser brand » |
| DeubaXXL CH | 29.10 | « Advertiser doesn't work with this publisher type » |
| Just Eat CH / Takeaway | 29.10 | « Advertiser … » (tronqué, probablement type d'éditeur) |
| flaconi CH | 30.10 | « Site does not complement advertiser brand » |
| AliExpress EU (Awin 119135) | 30.10 | « Site does not … » (le programme CJ, lui, est accepté) |
| Fnac Spectacles FR | 02.11 | « Advertiser doesn't work with this publisher type » |
| Flixbus CH | 02.11 | « Advertiser doesn't work with this publisher type » |
| Mister Spex CH | 04.11 | « Site does not complement advertiser brand » |
| HolidayCheck DE+AT+CH | 04.11 | « Advertiser doesn't work with this publisher type » |
| Viator DACH | 04.11 | « … visibility in Luxury Fashion sector » (motif générique, sans rapport) |
| Myposter CH | 05.11 | « Site does not complement advertiser brand » |
| Bergfreunde CH | 05.11 | « URL is irrelevant to advertiser brand » |
| **Tradedoubler (réseau)** | 28.10 | « Too low quality » ; support DACH : plus d'examen tant que le site est refusé |

Lecture : 3 familles de refus. (1) « publisher type » (6) = le marchand exclut les sites de deals/coupons ; inutile
de re-postuler. (2) « site not live / organische Sichtbarkeit / URL irrelevant / does not complement » (13) = site
sur *.pages.dev, en noindex, sans trafic ; **re-postuler après radarsave.ch + indexation + 4 à 8 semaines de
trafic**. (3) Viator : motif hors sujet, re-postuler plus tard.

### Toujours sans réponse au 06.11
- Awin : ~70 marchands de la liste du 28.10 (statut « En attente » dans Awin), dont les prioritaires **Wingo,
  Migros Mobile, Coop Mobile, Spusu, Talktalk** (télécom), Lounge by Zalando, Sixt, Trivago, Swissactivities, On.
- CJ : Booking.com DACH, Expedia/Hotels.com, Vrbo, GetYourGuide, Samsung, Kiwi.com, Omio, Agoda, Lenovo.

### Ce qui demande une action de Yorian
1. CJ : signer le W-8BEN et saisir l'IBAN (sinon aucun paiement CJ, Surfshark compris).
2. Awin : lire les taux Lyca (changés le 28.10), Kaspersky et Software-Dealz ; me les donner pour ce fichier.
3. Lyca (Yoana Tsoneva) : décider s'il répond (je n'ai rien envoyé). Une offre étudiante exclusive serait le meilleur usage.
4. Domaine radarsave.ch + levée du noindex (voir `docs/LAUNCH_RADARSAVE.md`) : condition de toutes les re-candidatures.
5. Après 4 à 8 semaines de trafic indexé : re-soumettre le site à Tradedoubler (Galaxus/Digitec FR-DE y sont ;
   pour la Suisse, aucun programme public trouvé : demander en direct) et re-postuler aux 13 refus de la famille (2).
6. Nouveau programme repéré (non postulé) : **alao CH** (Awin 19023, courtier télécom Swisscom/Salt/Wingo/Yallo :
   30 CHF par abonnement mobile, 50 CHF internet, 70 CHF combiné, cookie 30 jours).
