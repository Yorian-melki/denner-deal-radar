/** Nettoyage des liens sortants AVANT publication :
 * - un lien d'affiliation d'un tiers (agrégateur qui touche une commission) est
 *   désemballé vers l'URL du marchand ; s'il ne peut pas l'être, le deal est exclu
 *   (jamais de lien rémunéré non signalé, jamais la commission d'un autre) ;
 * - paramètres de suivi et d'affiliation tiers retirés, http → https ;
 * - si le lien mène à un agrégateur et non au marchand, on le dit (« via rappn.ch »). */

/** Hôtes de redirection d'affiliation, de traçage publicitaire ou de raccourcissement :
 * jamais publiés tels quels (round 3, item 9). LISTE UNIQUE du site : lib/affiliate/rewrite.ts
 * et l'assertion du postbuild (aucun href vers ces hôtes) la réutilisent. */
export const TRACKER_HOST_NAMES = [
  "awin1.com", "tradedoubler.com", "s.click.aliexpress.com", "amzn.to", "anrdoezrs.net", "dpbolvw.net", "jdoqocy.com",
  "tkqlhce.com", "kqzyfj.com", "sjv.io", "pxf.io", "ct0.ch", "adtraction.com", "financeads.net", "partnerize.com",
  "webgains.com", "belboon.com", "go2cloud.org", "prf.hn", "doubleclick.net", "googleadservices.com", "dartsearch.net",
  "shareasale.com", "linksynergy.com", "skimresources.com", "viglink.com", "digidip.net", "bit.ly", "tidd.ly",
];
export const isTrackerHost = (host: string) => TRACKER_HOST_NAMES.some((h) => host === h || host.endsWith(`.${h}`));
/** Paramètres qui portent l'URL de destination dans une redirection d'affiliation. */
const DEST_PARAMS = ["url", "ued", "murl", "u", "dest", "destination", "r", "redirect", "deeplink", "p_url", "adurl", "ds_dest_url"];
/** Paramètres d'affiliation ou de suivi d'un tiers, retirés de l'URL marchande. */
const STRIP_PARAMS = /^(utm_[a-z]+|tag|aid|awc|affid|aff_id|affiliate|ref_id|clickref|irclickid|gclid|fbclid|dclid|gclsrc|campid|cid|mc_[a-z]+|partner|partnerid|campaign)$/i;

/** Destination cachée dans une URL de traceur : paramètre connu, requête entière encodée,
 * ou ce qui suit « ;ltd=? » / « ? » dans un chemin DoubleClick (…;ltd=?https://…). */
function hiddenDestination(u: URL): string | undefined {
  const fromParam = DEST_PARAMS.map((p) => u.searchParams.get(p)).find((v) => v && /^https?:\/\//i.test(v));
  if (fromParam) return fromParam;
  const raw = u.href;
  const tail = raw.match(/[;?&](?:ltd=)?\??(https?(?::|%3A)(?:\/\/|%2F%2F).+)$/i)?.[1];
  if (tail) {
    try { const d = decodeURIComponent(tail); if (/^https?:\/\//i.test(d)) return d; } catch { /* invalide */ }
  }
  try {
    const q = decodeURIComponent(u.search.slice(1));
    if (/^https?:\/\//i.test(q)) return q;
  } catch { /* invalide */ }
  return undefined;
}

/** Agrégateurs connus : le lien mène chez eux, pas chez le marchand. */
export const AGGREGATOR_HOSTS = ["rappn.ch", "preispirat.ch", "dschungelkompass.ch", "studentbeans.com", "myunidays.com", "mydealz.de", "deals.ch",
  // Round 4, item 19 : portail de coupons et blog de vols — le bouton dit « über … », jamais « bei <Händler> » seul.
  "gutscheine.20min.ch", "secretflying.com", "gamerpower.com"];

export const hostOf = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

const isAffiliateHost = isTrackerHost;

/** Hôtes punycode (IDN) explicitement admis : aucun pour l'instant (homographes). */
const IDN_ALLOW = new Set<string>();
/** Round 4, item 19 : jamais d'URL avec identifiants (« https://denner.ch@evil.example »), de port
 * non standard, d'adresse IP littérale ni de domaine punycode non listé. */
export function safeHost(u: URL): boolean {
  if (u.username || u.password) return false;
  if (u.port && !(u.protocol === "https:" && u.port === "443") && !(u.protocol === "http:" && u.port === "80")) return false;
  const h = u.hostname.toLowerCase();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) || h.startsWith("[") || h.includes(":")) return false;
  if (h.split(".").some((l) => l.startsWith("xn--")) && !IDN_ALLOW.has(h)) return false;
  return h.includes(".");
}

export interface CleanUrl { url: string; /** le lien d'origine était une affiliation tiers → jamais réécrit par nous */ wasAffiliate: boolean }

/** URL publiable, ou null si le lien est une affiliation tiers impossible à désemballer. */
export function cleanOutbound(raw: string): CleanUrl | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!safeHost(u)) return null;
  let wasAffiliate = false;
  for (let hop = 0; hop < 3 && isAffiliateHost(u.hostname.toLowerCase()); hop++) {
    wasAffiliate = true;
    const dest = hiddenDestination(u);
    if (!dest) return null; // impossible à désemballer : le deal est retiré
    try {
      u = new URL(dest);
    } catch {
      return null;
    }
  }
  if (isAffiliateHost(u.hostname.toLowerCase()) || !safeHost(u)) return null;
  for (const k of [...u.searchParams.keys()]) {
    if (STRIP_PARAMS.test(k)) {
      if (!/^utm_/i.test(k)) wasAffiliate = true;
      u.searchParams.delete(k);
    }
  }
  if (u.protocol === "http:") u.protocol = "https:";
  return { url: u.toString(), wasAffiliate };
}

/** Hôte d'agrégateur si le lien n'est pas chez le marchand (sinon undefined). */
export function viaHost(url: string, merchant: string | undefined): string | undefined {
  const host = hostOf(url);
  if (!host || !AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return undefined;
  const m = (merchant ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (m && host.replace(/[^a-z0-9]/g, "").startsWith(m)) return undefined;
  return host;
}
