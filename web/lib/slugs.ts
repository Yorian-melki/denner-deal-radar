/** Registre des slugs publiés (round 4, item 1). Un lien partagé ne meurt jamais :
 *  - slug IMMUABLE : une clé produit (hachage stable, suffixe du slug) garde le premier
 *    slug publié, même si le nettoyage du titre change ensuite ;
 *  - tout slug déjà publié qui n'a plus de page reçoit un 301 statique (_redirects) vers
 *    la page actuelle de la même clé, sinon vers sa catégorie, sinon vers la ville.
 * Le registre est publié à chaque build (/slug-registry.json) et relu par le build suivant
 * (aucun commit depuis la CI) ; config/slug-seed.json l'amorce (sitemaps du 28-29.10).
 * Fonctions pures, testées (tests/round4.test.ts). */

export interface SlugRegistry {
  v: 1;
  /** hachage de la clé produit → premier slug publié (jamais modifié ensuite). */
  canon: Record<string, string>;
  /** slug → [catégorie, dernier jour publié (AAAA-MM-JJ)]. */
  seen: Record<string, [string, string]>;
}

export const REGISTRY_PATH = "/slug-registry.json";
/** Durée de conservation d'un slug qui n'est plus publié (liens WhatsApp, favoris). */
export const REGISTRY_KEEP_DAYS = 90;
/** Cloudflare Pages : 2 000 redirections statiques au plus ; marge pour les règles fixes. */
export const MAX_LEGACY_LINES = 1900;
const LOCALES = ["de", "fr", "en"] as const;

export const hashOfSlug = (slug: string) => slug.slice(slug.lastIndexOf("-") + 1);

export const emptyRegistry = (): SlugRegistry => ({ v: 1, canon: {}, seen: {} });

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Registre relu depuis le réseau ou le disque : tout ce qui n'a pas la forme attendue est ignoré. */
export function validateRegistry(x: unknown): SlugRegistry | null {
  if (!x || typeof x !== "object") return null;
  const o = x as { v?: unknown; canon?: unknown; seen?: unknown };
  if (o.v !== 1 || !o.canon || typeof o.canon !== "object" || !o.seen || typeof o.seen !== "object") return null;
  const out = emptyRegistry();
  for (const [h, s] of Object.entries(o.canon as Record<string, unknown>)) {
    if (typeof s === "string" && SLUG.test(s) && hashOfSlug(s) === h) out.canon[h] = s;
  }
  for (const [s, v] of Object.entries(o.seen as Record<string, unknown>)) {
    if (!SLUG.test(s) || !Array.isArray(v) || v.length !== 2) continue;
    const [cat, last] = v;
    if (typeof cat === "string" && /^[a-z-]{0,40}$/.test(cat) && typeof last === "string" && DAY.test(last)) out.seen[s] = [cat, last];
  }
  return out;
}

/** Fusion : le PREMIER registre qui connaît une clé fixe son slug ; « seen » garde la date la
 * plus récente et une catégorie connue. */
export function mergeRegistries(...regs: (SlugRegistry | null | undefined)[]): SlugRegistry {
  const out = emptyRegistry();
  for (const r of regs) {
    if (!r) continue;
    for (const [h, s] of Object.entries(r.canon)) out.canon[h] ??= s;
    for (const [s, [cat, last]] of Object.entries(r.seen)) {
      const prev = out.seen[s];
      out.seen[s] = prev ? [prev[0] || cat, prev[1] > last ? prev[1] : last] : [cat, last];
    }
  }
  return out;
}

const daysBetween = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

/** Ajoute les slugs publiés par ce build, puis oublie ce qui n'a plus été publié depuis
 * REGISTRY_KEEP_DAYS (et les clés dont aucun slug n'est encore connu). */
export function updateRegistry(reg: SlugRegistry, published: { slug: string; category: string }[], today: string): SlugRegistry {
  const out: SlugRegistry = { v: 1, canon: { ...reg.canon }, seen: { ...reg.seen } };
  for (const d of published) {
    out.canon[hashOfSlug(d.slug)] ??= d.slug;
    out.seen[d.slug] = [d.category || out.seen[d.slug]?.[0] || "", today];
  }
  for (const [s, [, last]] of Object.entries(out.seen)) if (daysBetween(last, today) > REGISTRY_KEEP_DAYS) delete out.seen[s];
  const alive = new Set(Object.keys(out.seen).map(hashOfSlug));
  for (const h of Object.keys(out.canon)) if (!alive.has(h)) delete out.canon[h];
  return out;
}

export interface LegacyTarget { slug: string; target: (l: string) => string; kind: "deal" | "category" | "city"; last: string }

/** Cible de chaque slug déjà publié qui n'a plus de page : la page actuelle de la même clé
 * (vivante ou « abgelaufen »), sinon la catégorie, sinon la ville. Les renommages passent
 * d'abord, puis les plus récents (budget de lignes limité). */
export function legacyTargets(reg: SlugRegistry, hasDeal: (slug: string) => boolean, hasCategory: (cat: string) => boolean, city: string): LegacyTarget[] {
  const out: LegacyTarget[] = [];
  for (const [slug, [cat, last]] of Object.entries(reg.seen)) {
    if (hasDeal(slug)) continue;
    const now = reg.canon[hashOfSlug(slug)];
    if (now && now !== slug && hasDeal(now)) out.push({ slug, kind: "deal", last, target: (l) => `/${l}/deal/${now}` });
    else if (cat && hasCategory(cat)) out.push({ slug, kind: "category", last, target: (l) => `/${l}/${city}/${cat}` });
    else out.push({ slug, kind: "city", last, target: (l) => `/${l}/${city}` });
  }
  const rank = { deal: 0, category: 1, city: 2 } as const;
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.last.localeCompare(a.last) || a.slug.localeCompare(b.slug));
}

/** Lignes _redirects statiques (une par langue, jamais de « :lang » : limite de 100 règles dynamiques). */
export function legacyLines(targets: LegacyTarget[], maxLines = MAX_LEGACY_LINES): string[] {
  const lines: string[] = [];
  for (const t of targets) {
    if (lines.length + LOCALES.length > maxLines) break;
    for (const l of LOCALES) lines.push(`/${l}/deal/${t.slug} ${t.target(l)} 301`);
  }
  return lines;
}
