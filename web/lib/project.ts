import { categoryBySlug, categorize, isTrial } from "@/lib/categories";
import { mergeConditions, parseCondition, structuredConditions } from "@/lib/conditions";
import { cleanOutbound, hostOf, viaHost } from "@/lib/outbound";
import type { Feed, GeoScope, PublicDeal, RawDeal, RefKind, Subscription } from "@/lib/types";

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

/** Réduction au-delà de laquelle une famille « payante » est suspecte (erreur
 * de parsing, prix au détail vs lot…). Le deal reste listé mais sans note,
 * pour ne jamais propulser une erreur en tête d'une page publique. */
const IMPLAUSIBLE_DISCOUNT: Record<string, number> = { grocery: 80, retail: 85, tech: 85, flash: 90, refurbished: 85 };

export function isPlausible(family: string, discountPct: number | undefined): boolean {
  const max = IMPLAUSIBLE_DISCOUNT[family];
  return max === undefined || discountPct === undefined || discountPct <= max;
}

/* ------------------------------------------------ règles d'honnêteté des prix */

/** Seules ces références sont des prix réellement pratiqués (droit suisse : OIP
 * art. 16, LCD art. 3) : elles seules autorisent un prix barré, un « −x % » et
 * une économie chiffrée. */
const COMPARABLE = new Set(["merchant_previous", "competitor", "market"]);
/** Chiffres du vendeur (prix conseillé, catalogue, valeur déclarée) : affichés
 * neutrement (« Preisangabe des Anbieters »), note plafonnée. */
const VENDOR = new Set(["msrp", "catalog", "declared_value"]);
/** Seulement un pourcentage annoncé ou un chiffre de communauté : aucune note. */
const VENDOR_PCT = new Set(["stated_percent_only", "community_claimed"]);

export const VERIFY_MIN_CONFIDENCE = 0.7;
/** Plafond de note quand la preuve est faible : au plus « gut » (< 7). */
export const SCORE_CAP = 6.9;

export function refKind(type: string | undefined, hasRefPrice: boolean, hasPct: boolean): RefKind {
  if (type && COMPARABLE.has(type)) return hasRefPrice ? "comparable" : hasPct ? "vendor_pct" : "none";
  if (type && VENDOR.has(type)) return hasRefPrice ? "vendor" : hasPct ? "vendor_pct" : "none";
  if (type && VENDOR_PCT.has(type)) return "vendor_pct";
  return "none";
}

/** Quantité totale lue dans le titre (« 3x500g » → 1.5 kg ; « 75cl » → 0.75 l). */
export function titleQuantity(title: string): { qty: number; unit: "kg" | "l" } | undefined {
  const m = title.match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l)\b/i);
  if (!m) return undefined;
  const n = Number(m[1] ?? 1), v = Number(m[2].replace(",", "."));
  const u = m[3].toLowerCase();
  const factor: Record<string, number> = { g: 0.001, kg: 1, ml: 0.001, cl: 0.01, dl: 0.1, l: 1 };
  if (!(v > 0)) return undefined;
  return { qty: n * v * factor[u], unit: u === "g" || u === "kg" ? "kg" : "l" };
}

/** Le prix affiché ne correspond pas à la quantité du titre (écart > 5 % avec le
 * prix unitaire) : la référence vise probablement un autre format → pas de note. */
export function quantityMismatch(title: string, price: number | undefined, unitPrice: number | undefined, unit: string | undefined): boolean {
  if (price === undefined || unitPrice === undefined || !price) return false;
  const q = titleQuantity(title);
  if (!q || (unit !== q.unit)) return false;
  return Math.abs(unitPrice * q.qty - price) / price > 0.05;
}

const UNIT: Record<string, PublicDeal["unit"]> = { "CHF/kg": "kg", "CHF/l": "l", "CHF/pièce": "piece", "CHF/Stück": "piece", "CHF/Monat": "month", "CHF/mois": "month" };

/** Bonus d'inscription (« 100 Franken Startbonus ») : ni prix barré ni note. */
const BONUS = /startbonus|willkommensbonus|bonus für|prämie|gutschrift|prime de bienvenue|sign-?up bonus/i;

/** Sources dont les codes promo sont des codes partenaires d'un tiers : jamais republiés. */
const THIRD_PARTY_CODE_SOURCES = new Set(["dschungelkompass"]);
const redactCodes = (s: string) => s.replace(/\s*\(?\s*(gutscheincode|code promo|promo ?code|code)\s*:?\s*«[^»]+»\s*\)?/gi, "");

/** Titre nettoyé : sans étiquette « [Neukunden] », sans « (Aktionspreis) », sans mot répété. */
export function cleanTitle(t: string): string {
  return t
    .replace(/^\s*\[[^\]]{1,40}\]\s*/, "")
    .replace(/\s*\((aktionspreis|prix promo)\)\s*$/i, "")
    .replace(/\b(\p{L}{3,})\s+\1\b/giu, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function subscription(d: RawDeal, price: number | undefined): Subscription | undefined {
  if (d.family !== "subscription") return undefined;
  const months = num(d.commitment_months), promoMonths = num(d.promo_months);
  const after = num(d.price_after_promo) ?? num(d.regular_monthly_price);
  const fee = num(d.activation_fee);
  let total24: number | undefined;
  if (price !== undefined) {
    const p = Math.min(promoMonths ?? 24, 24);
    total24 = Math.round((price * p + (after ?? price) * (24 - p) + (fee ?? 0)) * 100) / 100;
  }
  return { months, promoMonths, after: after !== undefined && after !== price ? after : undefined, fee, total24 };
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
  const rawUrl = str(d.offer_url) ?? str(d.source_url);
  if (!rawUrl || !/^https?:\/\//.test(rawUrl)) return null;
  const clean = cleanOutbound(rawUrl);
  if (!clean) return null; // affiliation tiers impossible à désemballer : jamais publiée
  const title = cleanTitle(d.title).slice(0, 160);
  const geo = (str(d.geographic_scope_resolved) ?? str(d.geographic_scope) ?? "NATIONAL") as GeoScope;
  const merchant = str(d.merchant);
  const host = hostOf(clean.url) ?? hostOf(str(d.source_url));
  const price = num(d.current_price);
  const referencePrice = num(d.reference_price);
  const discountPct = num(d.effective_discount) ?? num(d.discount_percentage);
  const referenceType = str(d.reference_price_type);
  const confidence = num(d.score_confidence);
  const integrity = str(d.promotion_integrity);
  const unit = UNIT[str(d.unit) ?? ""];
  const unitPrice = num(d.unit_price);
  const netSavings = num(d.net_savings);
  const category = categorize({ family: d.family, title, merchant, category: str(d.category) });
  const bonus = price === 0 && BONUS.test(title);
  const kind = bonus ? "none" : refKind(referenceType, referencePrice !== undefined && price !== undefined && referencePrice > price, (discountPct ?? 0) >= 1);

  // Note publique : règles d'honnêteté appliquées au score du scanner.
  let score = num(d.deal_score);
  let scoreCap: PublicDeal["scoreCap"];
  if (!isPlausible(d.family, discountPct) || quantityMismatch(title, price, unitPrice, unit) || kind === "none" || kind === "vendor_pct" || categoryBySlug(category)?.unrated) score = undefined;
  const verifiedRef =
    score !== undefined && score > 0 && kind === "comparable" && integrity === "ok" &&
    (confidence ?? 0) >= VERIFY_MIN_CONFIDENCE && (netSavings === undefined || netSavings > 0);
  if (score !== undefined && score > SCORE_CAP) {
    if (kind === "vendor") { score = SCORE_CAP; scoreCap = "vendor"; }
    else if (!verifiedRef) { score = SCORE_CAP; scoreCap = "confidence"; }
  }

  const fromSource = THIRD_PARTY_CODE_SOURCES.has(d.source_id);
  const rawConds = Array.isArray(d.conditions) ? d.conditions.filter((c): c is string => typeof c === "string") : [];
  const conds = mergeConditions([
    ...structuredConditions(d as Parameters<typeof structuredConditions>[0]),
    ...rawConds.map((c) => parseCondition(fromSource ? redactCodes(c) : c)),
  ]).slice(0, 6);
  const brand = str(d.brand) ?? title.split(/\s+/)[0]?.replace(/[^\p{L}\p{N}-]/gu, "");

  return {
    id: d.deal_id,
    slug: dealSlug(d.deal_id, d.title),
    title,
    source: d.source_id,
    merchant,
    brand: brand && brand.length > 1 ? brand : undefined,
    family: d.family,
    category,
    geo,
    // Un deal local n'appartient qu'aux villes de son flux ; national/en ligne : à tout le pays.
    cities: LOCAL_SCOPES.has(geo) ? feed.cities : ["*"],
    country: feed.country,
    price,
    referencePrice,
    discountPct,
    discountAbs: num(d.discount_absolute),
    referenceType,
    refKind: kind,
    integrity,
    verifiedRef,
    scoreCap,
    historicalLow: num(d.historical_low),
    historicalMedian: num(d.historical_median),
    historyN: num(d.history_n),
    entityId: str(d.canonical_entity_id),
    currency: str(d.currency) ?? feed.currency,
    unitPrice,
    unit,
    sub: subscription(d, price),
    netSavings,
    score,
    confidence,
    urgency: str(d.urgency),
    lifecycle: str(d.lifecycle),
    startsAt: str(d.starts_at),
    endsAt: str(d.ends_at),
    endsInferred: d.ends_inferred === true || undefined,
    firstSeenAt: str(d.first_seen_at),
    conds,
    url: clean.url,
    via: viaHost(clean.url, merchant),
    noAff: clean.wasAffiliate || undefined,
    attribution: `${merchant ?? d.source_id}${host ? ` (${host})` : ""}`,
    requiresStudent: d.requires_student === true || d.family === "student" || undefined,
    trial: isTrial({ title }) || undefined,
    couponCode: fromSource ? undefined : str(d.coupon_code),
  };
}

/** Tri éditorial : note d'abord, puis réduction (seulement si vérifiée) ; les non-évalués en dernier. */
export function rankDeals(deals: PublicDeal[]): PublicDeal[] {
  return [...deals].sort(
    (a, b) =>
      (b.score ?? -1) - (a.score ?? -1) ||
      (b.verifiedRef ? b.discountPct ?? -1 : -1) - (a.verifiedRef ? a.discountPct ?? -1 : -1) ||
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

/** Pages deal : seulement les deals notés ≥ 5/10, plafonnés (Cloudflare Pages
 * gratuit = 20 000 fichiers ; une page par langue = 3 fichiers HTML par deal).
 * Les autres cartes renvoient directement au marchand. */
export const PAGE_MIN_SCORE = 5;
export const MAX_DEAL_PAGES = 2500;

export function markPages(ranked: PublicDeal[], max = MAX_DEAL_PAGES): PublicDeal[] {
  let n = 0;
  return ranked.map((d) => {
    const page = d.score !== undefined && d.score >= PAGE_MIN_SCORE && n < max;
    if (page) n++;
    return page ? { ...d, page } : d;
  });
}

export const hasPage = (d: PublicDeal) => d.page === true;

export const inCity = (d: PublicDeal, city: { slug: string; country: string }) =>
  d.country === city.country && (d.cities.includes("*") || d.cities.includes(city.slug));
