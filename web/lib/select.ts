/** Règles d'affichage publiques — fonctions pures, testées (tests/select.test.ts).
 *
 * Objectif : enlever les biais d'affichage sans jamais inventer d'information.
 *  - diversité : max. 2 deals par marchand et 1 par marque dans une liste « top » ;
 *  - une même action (même marchand, même marque, même prix, même référence,
 *    même fin) n'apparaît qu'une fois, avec « +N variétés » ;
 *  - un même produit vendu par plusieurs magasins n'apparaît qu'une fois
 *    (le meilleur), avec « aussi chez N magasins » ;
 *  - jamais de deal non noté, noté 0 ou peu fiable dans une liste « top » ;
 *  - l'épicerie (≈ 60 % du flux) ne noie pas les autres catégories ;
 *  - aucun chiffre d'accroche agrégé (pas de « CHF 12 937 économisés ») ;
 *    seuls des faits vérifiables par deal (prix, référence, date de fin publiée).
 * Les constantes ci-dessous sont citées telles quelles sur /transparenz.
 */
import { categoryBySlug } from "@/lib/categories";
import type { PublicDeal } from "@/lib/types";

/* ------------------------------------------------------------------ produits */

/** Identifiants valables entre magasins (EAN/GTIN, référence fabricant, jeu).
 * Les `sku:`/`t:` sont propres à un marchand → jamais fusionnés entre magasins. */
const CROSS_STORE_PREFIXES = ["gtin:", "mpn:", "game:"];

export const merchantKey = (d: PublicDeal) => (d.merchant ?? d.source).trim().toLowerCase();
const brandKey = (d: PublicDeal) => (d.brand ?? d.title.split(/\s+/)[0] ?? "").toLowerCase();
const day = (iso?: string) => (iso ? iso.slice(0, 10) : "");

/** Clé d'une action : même marchand, même marque, même prix, même référence, même fin
 * (« Mövenpick Caffè Crema » et « Il Divino » à 13.15 au lieu de 35.85 = une action). */
export function promoKey(d: PublicDeal): string | undefined {
  if (d.price === undefined) return undefined;
  return `p:${merchantKey(d)}|${brandKey(d)}|${d.price}|${d.referencePrice ?? ""}|${day(d.endsAt)}`;
}

export function productKey(d: PublicDeal): string | undefined {
  const e = d.entityId;
  return e && CROSS_STORE_PREFIXES.some((p) => e.startsWith(p)) ? e : promoKey(d);
}

/** Meilleur des deux : note la plus haute, puis prix le plus bas, puis id. */
function better(a: PublicDeal, b: PublicDeal): PublicDeal {
  const sa = a.score ?? -1, sb = b.score ?? -1;
  if (sa !== sb) return sa > sb ? a : b;
  const pa = a.price ?? Infinity, pb = b.price ?? Infinity;
  if (pa !== pb) return pa < pb ? a : b;
  return a.id <= b.id ? a : b;
}

/** Fusionne : (1) le même produit vendu par plusieurs magasins → le meilleur, les
 * autres marchands dans `alsoAt` ; (2) les variétés d'une même action chez le même
 * marchand → une carte, `variants` = nombre d'autres variétés. Ordre d'entrée conservé. */
export function dedupeProducts(deals: PublicDeal[]): PublicDeal[] {
  const groups = new Map<string, PublicDeal[]>();
  for (const d of deals) {
    const k = productKey(d);
    if (k) groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const winner = new Map<string, PublicDeal>();
  for (const [k, g] of groups) {
    const best = g.reduce(better);
    const others = [...new Set(g.filter((x) => x !== best && merchantKey(x) !== merchantKey(best)).map((x) => x.merchant ?? x.source))];
    const variants = g.filter((x) => x !== best && merchantKey(x) === merchantKey(best)).length;
    winner.set(k, others.length || variants ? { ...best, ...(others.length ? { alsoAt: others } : {}), ...(variants ? { variants } : {}) } : best);
  }
  const out: PublicDeal[] = [];
  for (const d of deals) {
    const k = productKey(d);
    if (!k) out.push(d);
    else if (winner.get(k)?.id === d.id) out.push(winner.get(k)!);
  }
  return out;
}

/** Liste canonique d'une ville : la SEULE source de tous les compteurs (puces,
 * sections, pages catégorie) — un chiffre affiché à deux endroits est identique. */
export const canonical = (deals: PublicDeal[]) => dedupeProducts(deals);

/* ------------------------------------------------------------- listes top */

export interface TopOptions {
  n?: number;
  /** Max. de deals d'un même marchand (règle stricte, jamais relâchée). */
  perMerchant?: number;
  /** Max. par catégorie ; relâché seulement s'il manque des deals pour remplir. */
  perCategory?: number;
  /** Ids à exclure (déjà montrés plus haut sur la page). */
  exclude?: Set<string>;
  /** Note minimale (vitrines de l'accueil). */
  minScore?: number;
}

export const TOP_N = 12;
/** Fiabilité minimale pour être MIS EN AVANT (même seuil que le canal Telegram) :
 * une réduction seulement déclarée par le vendeur reste visible dans sa catégorie, jamais en vitrine. */
export const MIN_CONFIDENCE_TOP = 0.7;
export const PER_MERCHANT = 2;
/** Une seule carte par marque et par marchand en vitrine (pas trois cafés Mövenpick). */
export const PER_BRAND = 1;
/** Note minimale d'une carte sur l'accueil. */
export const HOME_MIN_SCORE = 5.5;
/** Une section de l'accueil n'apparaît qu'avec au moins ce nombre de cartes. */
export const HOME_MIN_SECTION = 2;

const topEligible = (d: PublicDeal, opts: TopOptions) =>
  d.score !== undefined && d.score > 0 && d.score >= (opts.minScore ?? 0) &&
  (d.confidence ?? 0) >= MIN_CONFIDENCE_TOP && !categoryBySlug(d.category)?.noTop && !opts.exclude?.has(d.id);

/** Liste « top » diversifiée : notés (> 0) et fiables seulement, produits dédoublonnés,
 * au plus `perMerchant` par marchand et 1 par marque, au plus `perCategory` par
 * catégorie tant que d'autres catégories peuvent remplir. L'ordre du classement est conservé. */
export function pickTop(deals: PublicDeal[], opts: TopOptions = {}): PublicDeal[] {
  const n = opts.n ?? TOP_N;
  const perMerchant = opts.perMerchant ?? PER_MERCHANT;
  const perCategory = opts.perCategory ?? Math.max(2, Math.ceil(n / 3));
  const pool = dedupeProducts(deals.filter((d) => topEligible(d, opts)));
  const picked: PublicDeal[] = [];
  const byMerchant = new Map<string, number>();
  const byBrand = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const take = (capCategory: boolean) => {
    for (const d of pool) {
      if (picked.length >= n) return;
      if (picked.includes(d)) continue;
      const m = merchantKey(d), b = `${m}|${brandKey(d)}`;
      if ((byMerchant.get(m) ?? 0) >= perMerchant) continue;
      if ((byBrand.get(b) ?? 0) >= PER_BRAND) continue;
      if (capCategory && (byCategory.get(d.category) ?? 0) >= perCategory) continue;
      picked.push(d);
      byMerchant.set(m, (byMerchant.get(m) ?? 0) + 1);
      byBrand.set(b, (byBrand.get(b) ?? 0) + 1);
      byCategory.set(d.category, (byCategory.get(d.category) ?? 0) + 1);
    }
  };
  take(true);
  take(false);
  const rank = new Map(pool.map((d, i) => [d.id, i]));
  return picked.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
}

/** Ordre neutre pour les catégories sans note (pourcentages des vendeurs) :
 * plus récent d'abord, puis titre — jamais la taille de la réduction annoncée. */
export function neutralOrder(deals: PublicDeal[]): PublicDeal[] {
  return [...deals].sort((a, b) => (b.firstSeenAt ?? "").localeCompare(a.firstSeenAt ?? "") || a.title.localeCompare(b.title));
}

export interface Section { slug: string; total: number; items: PublicDeal[] }

/** Sections par catégorie de taille ÉGALE, dans l'ordre fixe des catégories
 * (lib/categories.ts). Catégories notées : vitrine diversifiée ; catégories sans
 * note (Studis, Gratis, Gutscheine) : ordre neutre, ≤ 2 par marchand. */
export function balancedSections(
  deals: PublicDeal[],
  categoryOrder: string[],
  opts: { perSection?: number; minScore?: number; minItems?: number; exclude?: Set<string> } = {},
): Section[] {
  const per = opts.perSection ?? 4;
  const all = canonical(deals);
  const out: Section[] = [];
  for (const slug of categoryOrder) {
    const inCat = all.filter((d) => d.category === slug);
    if (!inCat.length) continue;
    let items: PublicDeal[];
    if (categoryBySlug(slug)?.unrated) {
      const counts = new Map<string, number>();
      items = [];
      for (const d of neutralOrder(inCat)) {
        if (items.length >= per) break;
        if (opts.exclude?.has(d.id) || (counts.get(merchantKey(d)) ?? 0) >= PER_MERCHANT) continue;
        counts.set(merchantKey(d), (counts.get(merchantKey(d)) ?? 0) + 1);
        items.push(d);
      }
    } else {
      items = pickTop(inCat, { n: per, perCategory: per, exclude: opts.exclude, minScore: opts.minScore });
    }
    if (items.length < (opts.minItems ?? 1)) continue;
    out.push({ slug, total: inCat.length, items });
  }
  return out;
}

/** Compte par catégorie, depuis la liste canonique (puces, « Alle N »). */
export function categoryCounts(deals: PublicDeal[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of canonical(deals)) m.set(d.category, (m.get(d.category) ?? 0) + 1);
  return m;
}

/** Nombre d'actions avec un prix de comparaison établi (ligne de faits de l'accueil). */
export const verifiedCount = (deals: PublicDeal[]) => canonical(deals).filter((d) => d.verifiedRef).length;

/* ------------------------------------------------------------ faits par deal */

/** Badge « prix le plus bas » : seulement si l'historique le prouve
 * (au moins `minObs` observations et prix actuel ≤ plus bas observé). */
export const LOWEST_MIN_OBSERVATIONS = 3;
export function isLowestSeen(d: PublicDeal, minObs = LOWEST_MIN_OBSERVATIONS): boolean {
  return (
    d.price !== undefined && d.historicalLow !== undefined && d.historyN !== undefined &&
    d.historyN >= minObs && d.price <= d.historicalLow + 0.005
  );
}

/** Historique de prix affiché seulement à partir de ce nombre d'observations. */
export const HISTORY_MIN_OBSERVATIONS = 3;

/** Date de fin PUBLIÉE par la source (jamais déduite). */
export function hasRealEnd(d: Pick<PublicDeal, "endsAt" | "endsInferred">): boolean {
  return !!d.endsAt && !d.endsInferred && Number.isFinite(new Date(d.endsAt).getTime());
}

/** Compte à rebours : seulement sur la page deal, et seulement sous ce seuil. */
export const COUNTDOWN_MAX_MS = 6 * 3_600_000;

export function timeLeft(endsAt: string, now: Date): { ms: number; days: number; hours: number; minutes: number } {
  const ms = Math.max(0, new Date(endsAt).getTime() - now.getTime());
  return {
    ms,
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
  };
}

/** Libellé verbal d'une note (purement dérivé de la note). */
export function scoreTier(score: number): "top" | "great" | "good" | "ok" | "weak" {
  if (score >= 8.5) return "top";
  if (score >= 7) return "great";
  if (score >= 5.5) return "good";
  if (score >= 4) return "ok";
  return "weak";
}

/** Qualité des données affichée (« gut / mittel / dünn »). */
export function confidenceTier(c: number | undefined): "high" | "mid" | "low" {
  if (c === undefined) return "low";
  if (c >= 0.85) return "high";
  if (c >= MIN_CONFIDENCE_TOP) return "mid";
  return "low";
}

/** Économie unitaire affichable : SEULEMENT avec une référence vérifiée
 * (comparable, intègre, fiable). Montant > 0 du scanner, sinon référence − prix. */
export function unitSaving(d: PublicDeal): number | undefined {
  if (!d.verifiedRef) return undefined;
  if (d.discountAbs !== undefined && d.discountAbs > 0) return d.discountAbs;
  if (d.referencePrice !== undefined && d.price !== undefined && d.referencePrice > d.price)
    return Math.round((d.referencePrice - d.price) * 100) / 100;
  return undefined;
}

/** Pourcentage d'économie affichable (vérifié, ≥ 1 %). */
export function savingPct(d: PublicDeal): number | undefined {
  if (!d.verifiedRef || d.referencePrice === undefined || d.price === undefined || d.referencePrice <= 0) return undefined;
  const pct = ((d.referencePrice - d.price) / d.referencePrice) * 100;
  return pct >= 1 ? pct : undefined;
}

/* -------------------------------------------------------------- partage */

export function whatsappUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
}
