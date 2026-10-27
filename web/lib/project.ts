import { categoryForFamily } from "@/lib/categories";
import type { Feed, GeoScope, PublicDeal, RawDeal } from "@/lib/types";

const LOCAL_SCOPES = new Set<GeoScope>(["LOCAL", "NEARBY", "REGIONAL"]);
const HIDDEN_LIFECYCLE = new Set(["EXPIRED", "REMOVED", "SOURCE_FAILURE"]);

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function slugify(s: string, max = 60): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

/** FNV-1a 32 bits : court, stable, identique au build et au runtime. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const dealSlug = (id: string, title: string) => `${slugify(title) || "deal"}-${shortHash(id)}`;

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** Réduction au-delà de laquelle une famille « payante » est suspecte (erreur
 * de parsing, prix au détail vs lot…). Le deal reste listé mais sans note,
 * pour ne jamais propulser une erreur en tête d'une page publique. */
const IMPLAUSIBLE_DISCOUNT: Record<string, number> = { grocery: 80, retail: 85, tech: 85, flash: 90, refurbished: 85 };

export function isPlausible(family: string, discountPct: number | undefined): boolean {
  const max = IMPLAUSIBLE_DISCOUNT[family];
  return max === undefined || discountPct === undefined || discountPct <= max;
}

/** Ce qui est encore valable maintenant (statut recalculé, comme le PWA). */
export function isLive(d: RawDeal, now: Date): boolean {
  if (HIDDEN_LIFECYCLE.has(String(d.lifecycle))) return false;
  if (d.duplicate_of || d.sold_out === true) return false;
  const ends = str(d.ends_at);
  if (ends && new Date(ends).getTime() < now.getTime()) return false;
  return true;
}

/** Projection publique d'un deal brut. Liste blanche explicite : tout champ
 * non listé (personal_relevance, distance_km, favorite, eligible_home…) est
 * abandonné. Retourne null si le deal n'est pas publiable. */
export function projectDeal(d: RawDeal, feed: Feed, now: Date): PublicDeal | null {
  if (!d.deal_id || !d.title || !isLive(d, now)) return null;
  const url = str(d.offer_url) ?? str(d.source_url);
  if (!url || !/^https?:\/\//.test(url)) return null;
  const geo = (str(d.geographic_scope_resolved) ?? str(d.geographic_scope) ?? "NATIONAL") as GeoScope;
  const merchant = str(d.merchant);
  const host = hostOf(str(d.source_url) ?? url);
  const discountPct = num(d.effective_discount) ?? num(d.discount_percentage);
  const plausible = isPlausible(d.family, discountPct);
  const conditions = Array.isArray(d.conditions) ? d.conditions.filter((c): c is string => typeof c === "string") : [];
  return {
    id: d.deal_id,
    slug: dealSlug(d.deal_id, d.title),
    title: d.title.slice(0, 160),
    source: d.source_id,
    merchant,
    family: d.family,
    category: categoryForFamily(d.family),
    geo,
    // Un deal local n'appartient qu'aux villes de son flux ; national/en ligne : à tout le pays.
    cities: LOCAL_SCOPES.has(geo) ? feed.cities : ["*"],
    country: feed.country,
    price: num(d.current_price),
    referencePrice: num(d.reference_price),
    discountPct,
    currency: str(d.currency) ?? feed.currency,
    unitPrice: num(d.unit_price),
    unit: str(d.unit),
    score: plausible ? num(d.deal_score) : undefined,
    confidence: num(d.score_confidence),
    urgency: str(d.urgency),
    lifecycle: str(d.lifecycle),
    startsAt: str(d.starts_at),
    endsAt: str(d.ends_at),
    firstSeenAt: str(d.first_seen_at),
    conditions: conditions.slice(0, 4),
    url,
    attribution: `${merchant ?? d.source_id}${host ? ` (${host})` : ""}`,
    requiresStudent: d.requires_student === true || undefined,
    couponCode: str(d.coupon_code),
  };
}

/** Tri éditorial : note absolue d'abord, puis réduction ; les non-évalués en dernier. */
export function rankDeals(deals: PublicDeal[]): PublicDeal[] {
  return [...deals].sort(
    (a, b) =>
      (b.score ?? -1) - (a.score ?? -1) ||
      (b.discountPct ?? -1) - (a.discountPct ?? -1) ||
      a.title.localeCompare(b.title),
  );
}

export function projectFeed(raw: RawDeal[], feed: Feed, now: Date): PublicDeal[] {
  const seen = new Set<string>();
  const out: PublicDeal[] = [];
  for (const d of raw) {
    const p = projectDeal(d, feed, now);
    if (p && !seen.has(p.slug)) {
      seen.add(p.slug);
      out.push(p);
    }
  }
  return rankDeals(out);
}

export const inCity = (d: PublicDeal, city: { slug: string; country: string }) =>
  d.country === city.country && (d.cities.includes("*") || d.cities.includes(city.slug));
