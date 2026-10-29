/** Sous-ensemble PUBLIC d'un deal du scanner (radar/core/deal.py).
 * Les champs personnels (pertinence pour Yorian, distance depuis son domicile,
 * favoris…) ne sortent jamais d'ici : voir lib/project.ts. */
import type { Cond } from "@/lib/conditions";

export type GeoScope = "LOCAL" | "NEARBY" | "REGIONAL" | "NATIONAL" | "ONLINE" | "TRAVEL_ACCESSIBLE";

export interface RawDeal {
  deal_id: string;
  source_id: string;
  title: string;
  family: string;
  [k: string]: unknown;
}

/** Nature du prix de comparaison, du plus solide au plus faible :
 * - comparable : ancien prix du même magasin, prix d'un concurrent, prix de marché observé ;
 * - vendor : prix conseillé, catalogue, valeur déclarée (chiffre du vendeur, pas un prix pratiqué) ;
 * - vendor_pct : seulement un pourcentage annoncé (ou chiffre « communautaire ») ;
 * - none : aucun. */
export type RefKind = "comparable" | "vendor" | "vendor_pct" | "none";

/** Motif de plafonnement de la note (à 6.9, « gut » au plus) :
 * - unchecked : prix « statt » du marchand que nos relevés n'ont pas (encore) confirmé ;
 * - integrity : référence plus haute que ce que nous avons déjà observé.
 * (Chiffre du vendeur ou fiabilité < 0.7 : aucune note du tout, round 3.) */
export type ScoreCap = "unchecked" | "integrity";

export interface Subscription {
  months?: number;       // durée minimale d'engagement
  promoMonths?: number;  // durée du prix promotionnel
  after?: number;        // prix mensuel après la promo
  fee?: number;          // frais de mise en service
  total24?: number;      // coût total sur 24 mois (promo + suite + frais)
  promoUnknown?: boolean; // prix promotionnel de durée inconnue : aucun total (round 4, item 24)
}

export interface PublicDeal {
  id: string;            // deal_id du scanner (stable)
  slug: string;          // URL : titre-court + hash
  title: string;
  source: string;        // source_id
  merchant?: string;
  brand?: string;
  family: string;
  category: string;      // slug public (lib/categories.ts)
  geo: GeoScope;
  cities: string[];      // villes où le deal est pertinent
  country: string;
  price?: number;
  referencePrice?: number;
  discountPct?: number;
  discountAbs?: number;  // économie absolue par unité (référence − prix), du scanner
  referenceType?: string; // nature du prix de référence (radar/core/deal.py REFERENCE_TYPES)
  refKind: RefKind;
  integrity?: string;    // promotion_integrity du scanner (ok, above_usual_price, inflated_reference…)
  /** Prix « statt » du marchand affichable : référence comparable (prix pratiqué
   * déclaré par le marchand), sans signal d'incohérence, fiabilité ≥ 0.7. Ce n'est
   * PAS une vérification de notre part : libellé « laut <Händler> ». */
  verifiedRef: boolean;
  /** La référence correspond à ce que nous avons observé nous-mêmes (≥ 3 relevés,
   * médiane à ±5 %) : seul cas où le site dit « von uns beobachtet ». */
  refObserved?: boolean;
  /** Pourquoi la note a été plafonnée (affiché sur la page deal). */
  scoreCap?: ScoreCap;
  historicalLow?: number;
  historicalMedian?: number;
  historyN?: number;     // nombre d'observations de prix derrière low/median
  entityId?: string;     // canonical_entity_id (gtin:, mpn:, sku:, t:, game:…)
  currency: string;
  unitPrice?: number;
  /** Quantité de l'emballage (« 6 × 75 cl ») ou nombre de pièces. */
  size?: { text?: string; pieces?: number };
  unit?: "kg" | "l" | "piece" | "month";
  sub?: Subscription;
  netSavings?: number;
  score?: number;        // note 0–10 après règles d'honnêteté (undefined = non évaluée)
  confidence?: number;
  urgency?: string;
  lifecycle?: string;
  startsAt?: string;
  endsAt?: string;
  endsInferred?: boolean; // date de fin déduite, pas publiée → jamais de compte à rebours
  firstSeenAt?: string;
  lastSeenAt?: string;   // dernier relevé du scanner (preuve de fraîcheur)
  conds: Cond[];
  url: string;           // URL marchande (désemballée d'un lien d'affiliation tiers)
  /** Hôte du lien quand ce n'est pas le site du marchand (agrégateur) : « via rappn.ch ». */
  via?: string;
  /** Lien d'origine = affiliation d'un tiers : publié désemballé, jamais réécrit en lien rémunéré. */
  noAff?: boolean;
  attribution: string;   // « Denner (denner.ch) »
  requiresStudent?: boolean;
  trial?: boolean;       // essai gratuit à renouvellement automatique
  couponCode?: string;
  page?: boolean;        // a sa propre page /<locale>/deal/<slug>
  alsoAt?: string[];     // autres marchands du même produit (lib/select.ts dedupeProducts)
  variants?: number;     // autres variétés de la même action chez le même marchand
  /** Commence plus tard (startsAt > maintenant) : jamais en vitrine, jamais « jetzt ». */
  upcoming?: boolean;
  /** Vente en magasin (supermarché) : le dernier jour, retirée des vitrines à 18:00. */
  inStore?: boolean;
  /** Jamais dans les sections de l'accueil ni les vitrines (contenu sensible, marchand inconnu…). */
  noShowcase?: boolean;
  /** Marque ou contenu pour adultes : jamais sur Studis, Gratis ni l'accueil. */
  adult?: boolean;
  /** Boisson alcoolisée (vin, bière, mousseux) : jamais sur l'accueil, en vitrine, dans « Mehr aus »
   * d'un produit sans alcool, ni dans les 6 premières cartes d'une liste (round 4, item 2).
   * Les spiritueux ne sont pas publiés du tout (LAlc art. 42b). */
  alcohol?: boolean;
  /** Pierre tombale : date de fin (le deal n'est plus en vente, page « abgelaufen »). */
  endedAt?: string;
  /** Titres par langue (réductions étudiantes reconstruites : « Acer: 15% Rabatt für Studierende »). */
  titles?: Partial<Record<"de" | "fr" | "en", string>>;
}

export interface Feed {
  id: string;
  country: string;
  currency: string;
  url: string;
  /** Villes servies par ce flux. Les deals LOCAL/NEARBY/REGIONAL sont rattachés
   * à ces villes ; NATIONAL/ONLINE à toutes les villes du pays. */
  cities: string[];
}
