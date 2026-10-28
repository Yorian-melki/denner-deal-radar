/** Sous-ensemble PUBLIC d'un deal du scanner (radar/core/deal.py).
 * Les champs personnels (pertinence pour Yorian, distance depuis son domicile,
 * favoris…) ne sortent jamais d'ici : voir lib/project.ts. */
export type GeoScope = "LOCAL" | "NEARBY" | "REGIONAL" | "NATIONAL" | "ONLINE" | "TRAVEL_ACCESSIBLE";

export interface RawDeal {
  deal_id: string;
  source_id: string;
  title: string;
  family: string;
  [k: string]: unknown;
}

export interface PublicDeal {
  id: string;            // deal_id du scanner (stable)
  slug: string;          // URL : titre-court + hash
  title: string;
  source: string;        // source_id
  merchant?: string;
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
  historicalLow?: number;
  historicalMedian?: number;
  historyN?: number;     // nombre d'observations de prix derrière low/median
  entityId?: string;     // canonical_entity_id (gtin:, mpn:, sku:, t:, game:…)
  currency: string;
  unitPrice?: number;
  unit?: string;
  score?: number;        // note absolue 0–10 (null = non évaluée)
  confidence?: number;
  urgency?: string;
  lifecycle?: string;
  startsAt?: string;
  endsAt?: string;
  endsInferred?: boolean; // date de fin déduite, pas publiée → jamais de compte à rebours
  firstSeenAt?: string;
  conditions: string[];
  url: string;           // URL d'origine (jamais modifiée ici)
  attribution: string;   // « Quelle : Denner (denner.ch) »
  requiresStudent?: boolean;
  couponCode?: string;
  page?: boolean;        // a sa propre page /deal/<slug>
  alsoAt?: string[];     // autres marchands du même produit (lib/select.ts dedupeProducts)
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
