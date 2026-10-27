/** Registre des programmes d'affiliation. Chaque programme ne s'active que si
 * ses identifiants sont présents dans l'environnement (comptes créés par
 * l'éditeur du site, à son nom). Sans identifiant → lien d'origine. */
export type Env = Record<string, string | undefined>;

export interface Programme {
  id: string;
  network: "tradedoubler" | "awin" | "amazon" | "aliexpress" | "booking";
  /** Hôtes couverts (correspondance exacte ou sous-domaine). */
  hosts: string[];
  build(url: URL, env: Env): string | null;
}

const enc = encodeURIComponent;

/** "brack.ch=123,revendo.ch=456" → Map(host → mid) */
export function parseMidMap(raw: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of (raw ?? "").split(",")) {
    const [host, mid] = part.split("=").map((s) => s?.trim());
    if (host && mid && /^\d+$/.test(mid)) m.set(host.replace(/^www\./, "").toLowerCase(), mid);
  }
  return m;
}

function tradedoubler(id: string, hosts: string[], programmeVar: string): Programme {
  return {
    id,
    network: "tradedoubler",
    hosts,
    build(url, env) {
      const a = env.AFF_TRADEDOUBLER_ID, p = env[programmeVar];
      if (!a || !p || !/^\d+$/.test(p)) return null;
      return `https://clk.tradedoubler.com/click?p=${p}&a=${enc(a)}&url=${enc(url.toString())}`;
    },
  };
}

export const PROGRAMMES: Programme[] = [
  // Digitec Galaxus : programmes Tradedoubler (un id de programme par marque,
  // à vérifier à l'inscription : les programmes publics connus sont DE/FR/IT/BE).
  tradedoubler("galaxus", ["galaxus.ch"], "AFF_TRADEDOUBLER_GALAXUS_P"),
  tradedoubler("digitec", ["digitec.ch"], "AFF_TRADEDOUBLER_DIGITEC_P"),
  {
    // Awin : un mid par marchand accepté (BRACK, Revendo… selon acceptation).
    id: "awin",
    network: "awin",
    hosts: [], // dynamique : AFF_AWIN_MIDS
    build(url, env) {
      const aff = env.AFF_AWIN_ID;
      const host = url.hostname.toLowerCase();
      const mid = [...parseMidMap(env.AFF_AWIN_MIDS)].find(([h]) => host === h || host.endsWith(`.${h}`))?.[1];
      if (!aff || !mid) return null;
      return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${enc(aff)}&ued=${enc(url.toString())}`;
    },
  },
  {
    id: "amazon-de",
    network: "amazon",
    hosts: ["amazon.de"],
    build(url, env) {
      const tag = env.AFF_AMAZON_DE_TAG;
      if (!tag) return null;
      const u = new URL(url);
      u.searchParams.set("tag", tag);
      return u.toString();
    },
  },
  {
    id: "aliexpress",
    network: "aliexpress",
    hosts: ["aliexpress.com"],
    build(url, env) {
      const t = env.AFF_ALIEXPRESS_TEMPLATE;
      if (!t || !t.includes("{url}") || !t.startsWith("https://")) return null;
      return t.replace("{url}", enc(url.toString()));
    },
  },
  {
    id: "booking",
    network: "booking",
    hosts: ["booking.com"],
    build(url, env) {
      const aid = env.AFF_BOOKING_AID;
      if (!aid || !/^\d+$/.test(aid)) return null;
      const u = new URL(url);
      u.searchParams.set("aid", aid);
      return u.toString();
    },
  },
];
