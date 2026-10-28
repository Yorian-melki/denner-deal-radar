/** Nettoyage des liens sortants AVANT publication :
 * - un lien d'affiliation d'un tiers (agrégateur qui touche une commission) est
 *   désemballé vers l'URL du marchand ; s'il ne peut pas l'être, le deal est exclu
 *   (jamais de lien rémunéré non signalé, jamais la commission d'un autre) ;
 * - paramètres de suivi et d'affiliation tiers retirés, http → https ;
 * - si le lien mène à un agrégateur et non au marchand, on le dit (« via rappn.ch »). */

/** Hôtes de redirection d'affiliation (réseaux) : jamais publiés tels quels. */
const AFFILIATE_HOSTS = [
  /(^|\.)awin1\.com$/, /(^|\.)tradedoubler\.com$/, /(^|\.)s\.click\.aliexpress\.com$/, /(^|\.)amzn\.to$/,
  /(^|\.)anrdoezrs\.net$/, /(^|\.)dpbolvw\.net$/, /(^|\.)jdoqocy\.com$/, /(^|\.)tkqlhce\.com$/, /(^|\.)kqzyfj\.com$/,
  /(^|\.)sjv\.io$/, /(^|\.)pxf\.io$/, /(^|\.)ct0\.ch$/, /(^|\.)adtraction\.com$/, /(^|\.)financeads\.net$/, /(^|\.)partnerize\.com$/,
  /(^|\.)webgains\.com$/, /(^|\.)belboon\.com$/, /(^|\.)go2cloud\.org$/, /(^|\.)prf\.hn$/,
];
/** Paramètres qui portent l'URL de destination dans une redirection d'affiliation. */
const DEST_PARAMS = ["url", "ued", "murl", "u", "dest", "destination", "r", "redirect", "deeplink", "p_url"];
/** Paramètres d'affiliation ou de suivi d'un tiers, retirés de l'URL marchande. */
const STRIP_PARAMS = /^(utm_[a-z]+|tag|aid|awc|affid|aff_id|affiliate|ref_id|clickref|irclickid|gclid|fbclid|mc_[a-z]+|partner|partnerid|campaign)$/i;

/** Agrégateurs connus : le lien mène chez eux, pas chez le marchand. */
export const AGGREGATOR_HOSTS = ["rappn.ch", "preispirat.ch", "dschungelkompass.ch", "studentbeans.com", "myunidays.com", "mydealz.de", "deals.ch"];

export const hostOf = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

const isAffiliateHost = (host: string) => AFFILIATE_HOSTS.some((re) => re.test(host));

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
  let wasAffiliate = false;
  for (let hop = 0; hop < 3 && isAffiliateHost(u.hostname.toLowerCase()); hop++) {
    wasAffiliate = true;
    const dest = DEST_PARAMS.map((p) => u.searchParams.get(p)).find((v) => v && /^https?:\/\//i.test(v));
    if (!dest) return null;
    try {
      u = new URL(dest);
    } catch {
      return null;
    }
  }
  if (isAffiliateHost(u.hostname.toLowerCase())) return null;
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
