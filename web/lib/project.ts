import { categoryBySlug, categorize, isSupermarket, isTrial } from "@/lib/categories";
import { dayDiff, zurichHour } from "@/lib/format";
import { mergeConditions, parseCondition, structuredConditions } from "@/lib/conditions";
import { cleanOutbound, hostOf, viaHost } from "@/lib/outbound";
import type { Feed, GeoScope, PublicDeal, RawDeal, RefKind, ScoreCap, Subscription } from "@/lib/types";

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

/** Jamais publiés : contournement géographique d'un abonnement (« Netflix über
 * Bulgarien », VPN) — viole les CGU du service, ce n'est pas une action. */
export const GEO_CIRCUMVENTION = /(?:^|\s)(über|via|aus|in)\s+(Bulgarien|Türkei|Argentinien|Indien|Pakistan|Ägypten|Nigeria)\b|\bVPN\b.*\b(Netflix|Disney|Spotify|YouTube)|\b(Netflix|Disney|Spotify|YouTube)\b.*\bVPN\b/i;
/** Publiés dans leur catégorie, jamais en vitrine ni sur l'accueil. */
export const NO_SHOWCASE = /\bBegleiter(in)?\b|\bEscort|\bErotik|\bSex(shop|toy)/i;

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
/** Résultats du contrôle de plausibilité du scanner qui invalident la référence. */
const BAD_INTEGRITY = new Set(["inflated_reference", "above_usual_price"]);
/** « Von uns beobachtet » : au moins ce nombre de relevés et une médiane à ±5 % de la référence. */
export const OBSERVED_MIN_N = 3;
export const OBSERVED_MAX_GAP = 0.05;

export function isRefObserved(ref: number | undefined, median: number | undefined, n: number | undefined): boolean {
  return ref !== undefined && ref > 0 && median !== undefined && (n ?? 0) >= OBSERVED_MIN_N && Math.abs(median - ref) / ref <= OBSERVED_MAX_GAP;
}

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

/** Mot entièrement en capitales de 4 lettres ou plus (« LIVARNO » → « Livarno »). */
const SHOUT = /(?<![\p{L}\p{N}])(\p{Lu}{4,})(?![\p{L}\p{N}])/gu;
const titleCase = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();

/** Titre nettoyé, sans vocabulaire marketing (round 2, item 9) :
 * - étiquette « [Neukunden] », « (Aktionspreis) », mot répété ;
 * - « ERHÖHT », « NEU: », « HOT: » en tête ; « zum neuen Tiefstpreis » (sauf si
 *   notre historique le prouve) ; « nur heute… » ; émojis ;
 * - « 100% … Gutschein » sur une réduction de 10 % (pourcentage ≥ 100 impossible) ;
 * - mots en capitales (≥ 4 lettres) en casse de titre. */
export function cleanTitle(t: string, opts: { discountPct?: number; keepLowest?: boolean } = {}): string {
  let s = t
    .replace(/^\s*\[[^\]]{1,40}\]\s*/, "")
    .replace(/\s*\((aktionspreis|prix promo)\)\s*$/i, "")
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, "")
    .replace(/^\s*(ERHÖHT|NEU|EXKLUSIV)\b[:!]?\s+/, "")
    .replace(/^\s*(HOT|TOP)\s*[:!]\s*/, "")
    .replace(/\s*[-–,!]?\s*\bnur heute\b.*$/i, "");
  if (!opts.keepLowest) s = s.replace(/\s*[-–,!]?\s*\bzum\s+(neuen\s+)?(Tiefst|Best|Top)preis\b.*$/i, "");
  const pct = opts.discountPct;
  if (pct !== undefined && pct > 0 && pct < 100) s = s.replace(/^(\d{3,})(\s?%)/, (m, n: string, sign: string) => (Number(n) >= 100 ? `${Math.round(pct)}${sign}` : m));
  s = s.replace(/\b(\p{L}{3,})\s+\1\b/giu, "$1");
  if (s.replace(/[^\p{L}]/gu, "").length > 0) s = s.replace(SHOUT, (w) => titleCase(w));
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([,.:;!?])/g, "$1").trim();
  return s || t.trim();
}

function subscription(d: RawDeal, price: number | undefined): Subscription | undefined {
  if (d.family !== "subscription") return undefined;
  const months = num(d.commitment_months), promoMonths = num(d.promo_months);
  const after = num(d.price_after_promo) ?? num(d.regular_monthly_price);
  const fee = num(d.activation_fee);
  // Total 24 mois seulement si la taxe de mise en service est connue (0 compris) et,
  // en cas de promo limitée, le prix ensuite aussi (round 2, item 33) : jamais un total
  // présenté comme un fait avec une inconnue dedans.
  let total24: number | undefined;
  const p = Math.min(promoMonths ?? 24, 24);
  if (price !== undefined && fee !== undefined && (p >= 24 || after !== undefined)) {
    total24 = Math.round((price * p + (after ?? price) * (24 - p) + fee) * 100) / 100;
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
  const rawTitle = String(d.title);
  if (GEO_CIRCUMVENTION.test(rawTitle)) return null;
  // Décision du propriétaire (round 2) : une « promo » à un prix égal ou supérieur
  // au prix habituel que nous avons observé n'est pas une affaire → non publiée.
  if (str(d.promotion_integrity) === "above_usual_price") return null;
  const pricePre = num(d.current_price), lowPre = num(d.historical_low), nPre = num(d.history_n);
  const provenLowest = pricePre !== undefined && lowPre !== undefined && (nPre ?? 0) >= 3 && pricePre <= lowPre + 0.005;
  const title = cleanTitle(rawTitle, { discountPct: num(d.effective_discount) ?? num(d.discount_percentage), keepLowest: provenLowest }).slice(0, 160);
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
  const category = categorize({ family: d.family, title, merchant, category: str(d.category), source: d.source_id });
  const bonus = price === 0 && BONUS.test(title);
  const kind = bonus ? "none" : refKind(referenceType, referencePrice !== undefined && price !== undefined && referencePrice > price, (discountPct ?? 0) >= 1);

  // Note publique : règles d'honnêteté appliquées au score du scanner.
  let score = num(d.deal_score);
  let scoreCap: ScoreCap | undefined;
  if (!isPlausible(d.family, discountPct) || quantityMismatch(title, price, unitPrice, unit) || kind === "none" || kind === "vendor_pct" || categoryBySlug(category)?.unrated) score = undefined;
  // Une note de 0 se lit comme un jugement : pas de note du tout (round 2, item 6).
  if (score !== undefined && score <= 0) score = undefined;
  // Prix « statt » du marchand : affiché dès que la référence est un prix pratiqué
  // (comparable), sans signal d'incohérence et fiable — que la source ait passé ou non
  // notre contrôle d'historique (Denner : integrity absente → « unchecked »).
  const verifiedRef =
    score !== undefined && kind === "comparable" && !BAD_INTEGRITY.has(integrity ?? "") &&
    (confidence ?? 0) >= VERIFY_MIN_CONFIDENCE && (netSavings === undefined || netSavings > 0);
  const historicalMedian = num(d.historical_median), historyN = num(d.history_n);
  const refObserved = verifiedRef && isRefObserved(referencePrice, historicalMedian, historyN);
  if (score !== undefined && score > SCORE_CAP) {
    const cap = (why: ScoreCap) => { score = SCORE_CAP; scoreCap = why; };
    if (kind === "vendor") cap("vendor");
    else if ((confidence ?? 0) < VERIFY_MIN_CONFIDENCE) cap("confidence");
    else if (BAD_INTEGRITY.has(integrity ?? "")) cap("integrity");
    else if (!verifiedRef) cap("unchecked");
    // Comparaison avec un concurrent annoncée par le marchand : plafonnée tant que nos relevés ne la confirment pas.
    else if (referenceType === "competitor" && !refObserved) cap("unchecked");
  }
  const inStore = isSupermarket(merchant, d.source_id) || undefined;

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
    refObserved: refObserved || undefined,
    scoreCap,
    historicalLow: num(d.historical_low),
    historicalMedian,
    historyN,
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
    lastSeenAt: str(d.last_seen_at),
    conds,
    url: clean.url,
    via: viaHost(clean.url, merchant),
    noAff: clean.wasAffiliate || undefined,
    attribution: `${merchant ?? d.source_id}${host ? ` (${host})` : ""}`,
    requiresStudent: d.requires_student === true || d.family === "student" || undefined,
    trial: isTrial({ title }) || undefined,
    couponCode: fromSource ? undefined : str(d.coupon_code),
    upcoming: (str(d.starts_at) && new Date(str(d.starts_at)!).getTime() > now.getTime()) || undefined,
    inStore,
    noShowcase: NO_SHOWCASE.test(rawTitle) || undefined,
  };
}

/** Le dernier jour d'une action en magasin, après 18:00 (Zurich) : plus achetable
 * « maintenant » pour qui lit la vitrine → retirée des vitrines (reste listée). */
export const STORE_CLOSING_HOUR = 18;
export function pastStoreHours(d: Pick<PublicDeal, "inStore" | "endsAt" | "endsInferred">, now: Date): boolean {
  if (!d.inStore || !d.endsAt || d.endsInferred) return false;
  return dayDiff(d.endsAt, now) <= 0 && zurichHour(now) >= STORE_CLOSING_HOUR;
}

/** Économie en CHF par unité, seulement avec un prix « statt » affichable. */
export function savingChf(d: PublicDeal): number {
  if (!d.verifiedRef) return -1;
  if (d.discountAbs !== undefined && d.discountAbs > 0) return d.discountAbs;
  return d.referencePrice !== undefined && d.price !== undefined && d.referencePrice > d.price ? d.referencePrice - d.price : -1;
}

/** Comparateur unique du site (round 2, item 7) : (1) disponible maintenant avant
 * « ab morgen », (2) prix « statt » du marchand avant tout le reste, (3) note,
 * (4) économie en CHF, (5) titre. Utilisé par rankDeals, better(), pickTop et les listes. */
export function compareDeals(a: PublicDeal, b: PublicDeal): number {
  return (
    Number(!!a.upcoming) - Number(!!b.upcoming) ||
    Number(b.verifiedRef) - Number(a.verifiedRef) ||
    (b.score ?? -1) - (a.score ?? -1) ||
    savingChf(b) - savingChf(a) ||
    a.title.localeCompare(b.title) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Tri éditorial (voir compareDeals) ; les non-évalués en dernier. */
export function rankDeals(deals: PublicDeal[]): PublicDeal[] {
  return [...deals].sort(compareDeals);
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

/** Badge de note seulement à partir de 5/10 (en dessous : prix et marchand seulement). */
export const PAGE_MIN_SCORE = 5;
export const BADGE_MIN_SCORE = PAGE_MIN_SCORE;
/** Pages deal : TOUTE carte publiée a sa page interne (round 2, arbitrage 4) ; la
 * seule sortie vers un tiers est le bouton de la page deal. Plafond = budget de
 * fichiers Cloudflare Pages (20 000 ; 3 fichiers HTML par deal) et cible du
 * propriétaire : ≤ ~10 000 fichiers HTML au total (3 000 × 3 langues + listes).
 * Au-delà, le deal n'est pas publié du tout (jamais de carte qui sort du site). */
export const MAX_DEAL_PAGES = 3000;

export function markPages(ranked: PublicDeal[], max = MAX_DEAL_PAGES): PublicDeal[] {
  return ranked.slice(0, max).map((d) => ({ ...d, page: true }));
}

export const hasPage = (d: PublicDeal) => d.page === true;

export const inCity = (d: PublicDeal, city: { slug: string; country: string; absentChains?: string[] }) =>
  d.country === city.country && (d.cities.includes("*") || d.cities.includes(city.slug)) &&
  !(d.inStore && city.absentChains?.includes((d.merchant ?? d.source).trim().toLowerCase()));
