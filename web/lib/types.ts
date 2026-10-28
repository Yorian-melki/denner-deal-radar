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

export interface Subscription {
  months?: number;       // durée minimale d'engagement
  promoMonths?: number;  // durée du prix promotionnel
  after?: number;        // prix mensuel après la promo
  fee?: number;          // frais de mise en service
  total24?: number;      // coût total sur 24 mois (promo + suite + frais)
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
  /** Prix barré, « −x % » et économie autorisés (référence comparable, intègre, fiable). */
  verifiedRef: boolean;
  /** Pourquoi la note a été plafonnée (affiché sur la page deal). */
  scoreCap?: "vendor" | "confidence";
  historicalLow?: number;
  historicalMedian?: number;
  historyN?: number;     // nombre d'observations de prix derrière low/median
  entityId?: string;     // canonical_entity_id (gtin:, mpn:, sku:, t:, game:…)
  currency: string;
  unitPrice?: number;
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
