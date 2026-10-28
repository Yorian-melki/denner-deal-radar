/** Règles d'affichage publiques — fonctions pures, testées (tests/select.test.ts).
 *
 * Objectif : enlever les biais d'affichage sans jamais inventer d'information.
 *  - diversité : max. 2 deals par marchand dans une liste « top » ;
 *  - un même produit vendu par plusieurs magasins n'apparaît qu'une fois
 *    (le meilleur), avec « aussi chez N magasins » ;
 *  - jamais de deal non noté dans une liste « top » ;
 *  - l'épicerie (≈ 60 % du flux) ne noie pas les autres catégories ;
 *  - chiffres d'accroche (économies de la semaine, prix le plus bas, compte à
 *    rebours) calculés UNIQUEMENT à partir de données présentes et vérifiables.
 */
import type { PublicDeal } from "@/lib/types";

/* ------------------------------------------------------------------ produits */

/** Identifiants valables entre magasins (EAN/GTIN, référence fabricant, jeu).
 * Les `sku:`/`t:` sont propres à un marchand → jamais fusionnés. */
const CROSS_STORE_PREFIXES = ["gtin:", "mpn:", "game:"];

/** Variantes quasi identiques chez le même marchand (même prix, mêmes 3 premiers mots,
 * ex. « Vanish Oxi Action Pulver » / « … Pulver White ») : une seule carte. */
const variantKey = (d: PublicDeal) =>
  d.price === undefined ? undefined
    : `v:${(d.merchant ?? d.source).toLowerCase()}|${d.price}|${d.title.toLowerCase().replace(/[^a-z0-9äöüéèàç ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 3).join(" ")}`;

export function productKey(d: PublicDeal): string | undefined {
  const e = d.entityId;
  return e && CROSS_STORE_PREFIXES.some((p) => e.startsWith(p)) ? e : variantKey(d);
}

export const merchantKey = (d: PublicDeal) => (d.merchant ?? d.source).trim().toLowerCase();

/** Meilleur des deux : note la plus haute, puis prix le plus bas, puis titre. */
function better(a: PublicDeal, b: PublicDeal): PublicDeal {
  const sa = a.score ?? -1, sb = b.score ?? -1;
  if (sa !== sb) return sa > sb ? a : b;
  const pa = a.price ?? Infinity, pb = b.price ?? Infinity;
  if (pa !== pb) return pa < pb ? a : b;
  return a.id <= b.id ? a : b;
}

/** Fusionne le même produit vendu par plusieurs magasins : garde le meilleur
 * (à la position du meilleur dans l'ordre d'entrée) et liste les autres
 * marchands dans `alsoAt`. Les deals sans identifiant inter-magasins passent tels quels. */
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
    winner.set(k, others.length ? { ...best, alsoAt: others } : best);
  }
  const out: PublicDeal[] = [];
  for (const d of deals) {
    const k = productKey(d);
    if (!k) out.push(d);
    else if (winner.get(k)?.id === d.id) out.push(winner.get(k)!);
  }
  return out;
}

/* ------------------------------------------------------------- listes top */

export interface TopOptions {
  n?: number;
  /** Max. de deals d'un même marchand (règle stricte, jamais relâchée). */
  perMerchant?: number;
  /** Max. par catégorie ; relâché seulement s'il manque des deals pour remplir. */
  perCategory?: number;
  /** Ids à exclure (déjà montrés plus haut sur la page). */
  exclude?: Set<string>;
}

export const TOP_N = 12;
/** Fiabilité minimale pour être MIS EN AVANT (même seuil que le canal Telegram) :
 * une réduction seulement déclarée par le vendeur reste visible dans sa catégorie, jamais en vitrine. */
export const MIN_CONFIDENCE_TOP = 0.7;
export const PER_MERCHANT = 2;

/** Liste « top » diversifiée : notés seulement, produits dédoublonnés, au plus
 * `perMerchant` par marchand, et au plus `perCategory` par catégorie tant que
 * d'autres catégories peuvent remplir. L'ordre d'entrée (classement) est conservé. */
export function pickTop(deals: PublicDeal[], opts: TopOptions = {}): PublicDeal[] {
  const n = opts.n ?? TOP_N;
  const perMerchant = opts.perMerchant ?? PER_MERCHANT;
  const perCategory = opts.perCategory ?? Math.max(2, Math.ceil(n / 3));
  const pool = dedupeProducts(deals.filter((d) => d.score !== undefined && (d.confidence ?? 0) >= MIN_CONFIDENCE_TOP && !opts.exclude?.has(d.id)));
  const picked: PublicDeal[] = [];
  const byMerchant = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const take = (capCategory: boolean) => {
    for (const d of pool) {
      if (picked.length >= n) return;
      if (picked.includes(d)) continue;
      const m = merchantKey(d);
      if ((byMerchant.get(m) ?? 0) >= perMerchant) continue;
      if (capCategory && (byCategory.get(d.category) ?? 0) >= perCategory) continue;
      picked.push(d);
      byMerchant.set(m, (byMerchant.get(m) ?? 0) + 1);
      byCategory.set(d.category, (byCategory.get(d.category) ?? 0) + 1);
    }
  };
  take(true);
  take(false);
  // Restituer dans l'ordre du classement d'origine.
  const rank = new Map(pool.map((d, i) => [d.id, i]));
  return picked.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
}

export interface Section { slug: string; total: number; items: PublicDeal[] }

/** Sections par catégorie de taille ÉGALE (l'épicerie ne prend pas plus de place
 * qu'une autre catégorie), ordonnées par meilleure note de la catégorie.
 * `scoredOnly` : sections « vitrines » sans deals non notés. */
export function balancedSections(
  deals: PublicDeal[],
  categoryOrder: string[],
  opts: { perSection?: number; scoredOnly?: boolean; exclude?: Set<string> } = {},
): Section[] {
  const per = opts.perSection ?? 4;
  const sections: (Section & { best: number })[] = [];
  for (const slug of categoryOrder) {
    const all = deals.filter((d) => d.category === slug);
    if (!all.length) continue;
    const scored = pickTop(all, { n: per, perCategory: per, exclude: opts.exclude });
    let items = scored;
    if (!opts.scoredOnly && items.length < per) {
      // Compléter avec des non-notés (après les notés), toujours ≤ 2 par marchand.
      const counts = new Map<string, number>();
      for (const d of items) counts.set(merchantKey(d), (counts.get(merchantKey(d)) ?? 0) + 1);
      for (const d of dedupeProducts(all.filter((x) => x.score === undefined && !opts.exclude?.has(x.id)))) {
        if (items.length >= per) break;
        const m = merchantKey(d);
        if ((counts.get(m) ?? 0) >= PER_MERCHANT) continue;
        counts.set(m, (counts.get(m) ?? 0) + 1);
        items = [...items, d];
      }
    }
    if (!items.length) continue;
    sections.push({ slug, total: dedupeProducts(all).length, items, best: Math.max(...all.map((d) => d.score ?? -1)) });
  }
  return sections
    .sort((a, b) => b.best - a.best || categoryOrder.indexOf(a.slug) - categoryOrder.indexOf(b.slug))
    .map(({ best: _best, ...s }) => s);
}

/** Compte par catégorie (après fusion des produits identiques), pour les puces. */
export function categoryCounts(deals: PublicDeal[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of dedupeProducts(deals)) m.set(d.category, (m.get(d.category) ?? 0) + 1);
  return m;
}

/* -------------------------------------------------- chiffres d'accroche vrais */

/** Types de prix de référence assez solides pour parler d'économie « vérifiée ».
 * Exclus : simple % annoncé, référence communautaire, aucune référence. */
export const VERIFIED_REFERENCES = new Set(["merchant_previous", "competitor", "market", "catalog", "msrp", "declared_value"]);

/** Économie comptable dans le total : deal noté (> 0, donc plausible — les
 * réductions invraisemblables n'ont pas de note), référence vérifiable, montant > 0. */
export function isVerifiedSaving(d: PublicDeal): boolean {
  return (
    d.score !== undefined && d.score > 0 &&
    d.discountAbs !== undefined && d.discountAbs > 0 &&
    d.referenceType !== undefined && VERIFIED_REFERENCES.has(d.referenceType)
  );
}

/** « Cette semaine : CHF X d'économies vérifiées repérées ».
 * Somme des `discount_absolute` (1 unité) des deals vivants, notés, à référence
 * vérifiable, vus pour la première fois dans les `days` jours avant `asOf`.
 * Un même produit (multi-magasins) n'est compté qu'une fois. */
export function weeklySavings(deals: PublicDeal[], asOf: Date, days = 7): { total: number; count: number } {
  const since = asOf.getTime() - days * 86_400_000;
  const eligible = deals.filter((d) => {
    if (!isVerifiedSaving(d) || !d.firstSeenAt) return false;
    const t = new Date(d.firstSeenAt).getTime();
    return Number.isFinite(t) && t >= since && t <= asOf.getTime() + 3_600_000;
  });
  const uniq = dedupeProducts(eligible);
  const total = Math.round(uniq.reduce((s, d) => s + (d.discountAbs ?? 0), 0) * 100) / 100;
  return { total, count: uniq.length };
}

/** Badge « prix le plus bas » : seulement si l'historique le prouve
 * (au moins `minObs` observations et prix actuel ≤ plus bas observé). */
export const LOWEST_MIN_OBSERVATIONS = 3;
export function isLowestSeen(d: PublicDeal, minObs = LOWEST_MIN_OBSERVATIONS): boolean {
  return (
    d.price !== undefined && d.historicalLow !== undefined && d.historyN !== undefined &&
    d.historyN >= minObs && d.price <= d.historicalLow + 0.005
  );
}

/** Compte à rebours : seulement pour une date de fin PUBLIÉE (jamais déduite). */
export function hasRealEnd(d: Pick<PublicDeal, "endsAt" | "endsInferred">): boolean {
  return !!d.endsAt && !d.endsInferred && Number.isFinite(new Date(d.endsAt).getTime());
}

export function timeLeft(endsAt: string, now: Date): { ms: number; days: number; hours: number; minutes: number } {
  const ms = Math.max(0, new Date(endsAt).getTime() - now.getTime());
  return {
    ms,
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
  };
}

/* ------------------------------------------- lecture en un coup d'œil */

/** Libellé verbal d'une note (purement dérivé de la note, mêmes seuils de
 * couleur que le badge : ≥ 7 vert, ≥ 4 ambre). */
export function scoreTier(score: number): "top" | "great" | "good" | "ok" | "weak" {
  if (score >= 8.5) return "top";
  if (score >= 7) return "great";
  if (score >= 5.5) return "good";
  if (score >= 4) return "ok";
  return "weak";
}

/** Fiabilité affichée : « sûre » seulement au-dessus du seuil des vitrines. */
export function confidenceTier(c: number | undefined): "high" | "mid" | "low" {
  if (c === undefined) return "low";
  if (c >= 0.85) return "high";
  if (c >= MIN_CONFIDENCE_TOP) return "mid";
  return "low";
}

/** Économie unitaire affichable sur une carte : montant > 0 du scanner, sinon
 * écart prix de référence − prix. Jamais d'économie sans prix de référence. */
export function unitSaving(d: PublicDeal): number | undefined {
  if (d.discountAbs !== undefined && d.discountAbs > 0) return d.discountAbs;
  if (d.referencePrice !== undefined && d.price !== undefined && d.referencePrice > d.price)
    return Math.round((d.referencePrice - d.price) * 100) / 100;
  return undefined;
}

/* -------------------------------------------------------------- partage */

export function whatsappUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
}
