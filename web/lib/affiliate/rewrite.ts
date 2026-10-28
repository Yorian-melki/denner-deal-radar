import { PROGRAMMES, parseMidMap, type Env } from "@/lib/affiliate/programmes";
import { monetisationEnv } from "@/lib/operator";

export interface OutLink {
  href: string;
  affiliate: boolean;
  programme?: string;
  /** rel conforme Google : "sponsored" pour tout lien rémunéré. */
  rel: string;
}

/** Marqueurs d'un lien déjà affilié (par la source ou un tiers) : on ne le
 * réécrit JAMAIS — détourner la commission d'un autre éditeur est interdit
 * par les CGU des réseaux et déloyal (art. 2 LCD). */
const FOREIGN_MARKERS = [
  /(^|\.)awin1\.com$/, /(^|\.)tradedoubler\.com$/, /(^|\.)s\.click\.aliexpress\.com$/,
  /(^|\.)amzn\.to$/, /(^|\.)anrdoezrs\.net$/, /(^|\.)dpbolvw\.net$/, /(^|\.)jdoqocy\.com$/,
  /(^|\.)tkqlhce\.com$/, /(^|\.)kqzyfj\.com$/, /(^|\.)sjv\.io$/, /(^|\.)pxf\.io$/,
];
const FOREIGN_PARAMS = ["tag", "aid", "awc", "affid", "aff_id", "affiliate", "ref_id", "clickref", "irclickid"];

const PLAIN: Omit<OutLink, "href"> = { affiliate: false, rel: "noopener noreferrer" };

const hostMatches = (host: string, h: string) => host === h || host.endsWith(`.${h}`);

export function isForeignAffiliate(u: URL): boolean {
  if (FOREIGN_MARKERS.some((re) => re.test(u.hostname))) return true;
  return FOREIGN_PARAMS.some((p) => u.searchParams.has(p));
}

/** Réécrit une URL marchande en lien affilié si (et seulement si) un programme
 * actif couvre l'hôte. Fonction pure : `env` est injecté pour les tests. */
export function rewriteUrl(raw: string, env: Env = monetisationEnv()): OutLink {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { href: "#", ...PLAIN };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { href: "#", ...PLAIN };
  if (isForeignAffiliate(u)) return { href: u.toString(), ...PLAIN };
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const awinHosts = [...parseMidMap(env.AFF_AWIN_MIDS).keys()];
  for (const p of PROGRAMMES) {
    const hosts = p.id === "awin" ? awinHosts : p.hosts;
    if (!hosts.some((h) => hostMatches(host, h))) continue;
    const href = p.build(u, env);
    if (href) return { href, affiliate: true, programme: p.id, rel: "sponsored nofollow noopener noreferrer" };
  }
  return { href: u.toString(), ...PLAIN };
}

/** Programmes actifs (pour la page de transparence). */
export function activeProgrammes(env: Env = monetisationEnv()): string[] {
  const probe: Record<string, string> = {
    galaxus: "https://www.galaxus.ch/x",
    digitec: "https://www.digitec.ch/x",
    "amazon-de": "https://www.amazon.de/dp/X",
    aliexpress: "https://www.aliexpress.com/item/1.html",
    booking: "https://www.booking.com/hotel/ch/x.html",
  };
  const out = Object.entries(probe).filter(([, url]) => rewriteUrl(url, env).affiliate).map(([id]) => id);
  for (const host of parseMidMap(env.AFF_AWIN_MIDS).keys()) {
    if (rewriteUrl(`https://${host}/`, env).affiliate) out.push(`awin:${host}`);
  }
  return out;
}
