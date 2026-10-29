import { categoryBySlug, categorize, isSupermarket, isTrial } from "@/lib/categories";
import { dayDiff, zurichHour } from "@/lib/format";
import { mergeConditions, parseCondition, structuredConditions } from "@/lib/conditions";
import { cleanOutbound, hostOf, viaHost } from "@/lib/outbound";
import { resolveMerchant, sourceName, stripMerchantSuffix } from "@/lib/merchant";
import { CONTEST, OTHER_CITY, SERVICE_NOT_ITEM, SPIRITS, SPIRITS_FOOD, TOBACCO, isAdult, isAlcohol, isPastWeek, outOfSeason } from "@/lib/blocklist";
import { titleLang } from "@/lib/titleLang";
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

/** Slugs déjà publiés (lib/slugs.ts) : hachage de la clé → premier slug. Posé par lib/data.ts
 * avant la projection ; vide dans les tests sauf s'ils le posent. */
let CANON_SLUGS: Record<string, string> = {};
export function setCanonicalSlugs(canon: Record<string, string>) { CANON_SLUGS = canon; }

/** Slug : titre NETTOYÉ + hachage de la clé produit stable (jamais de « zum-neuen-tiefstpreis »).
 * IMMUABLE (round 4, item 1) : une clé déjà publiée garde son premier slug, même si le
 * nettoyage du titre change ; le suffixe ne dépend jamais du texte du titre. */
export const dealSlug = (id: string, title: string) => {
  const h = shortHash(stableKey(id));
  return CANON_SLUGS[h] ?? `${slugify(title) || "deal"}-${h}`;
};

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
 * neutrement (« Preisangabe des Anbieters »), sans note (round 3, arbitrage 1). */
const VENDOR = new Set(["msrp", "catalog", "declared_value"]);
/** Seulement un pourcentage annoncé ou un chiffre de communauté : aucune note. */
const VENDOR_PCT = new Set(["stated_percent_only", "community_claimed"]);

export const VERIFY_MIN_CONFIDENCE = 0.7;
/** Badge de note seulement à partir de 5/10 (en dessous : prix et marchand seulement). */
export const PAGE_MIN_SCORE = 5;
export const BADGE_MIN_SCORE = PAGE_MIN_SCORE;
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

/** Mot entièrement en capitales de 4 lettres ou plus (« LIVARNO » → « Livarno ») ; l'apostrophe
 * suit (« GORDON'S » → « Gordon's », jamais « Gordon'S », round 4, item 9). */
const SHOUT = /(?<![\p{L}\p{N}])(\p{Lu}{4,}(?:['’]\p{Lu}{1,2})?)(?![\p{L}\p{N}])/gu;
const titleCase = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();
/** Formules commerciales de la source (round 4, item 9) : jamais dans un titre publié. */
const MARKETING_TAIL: RegExp[] = [
  /\s*[-–]\s*(?:Aktionspreis|Prix promo)\s*$/i,
  /\s*\/?\s*\bSchn(?:ä|a)ppchen\b\s*\/?/gi,
  /\s+zu Toppreisen\b/i,
  /\s+(?:bei\s+\S+\s+)?in Aktion\s*$/i,
  /\s*Spare viel bei\b.*$/i,
  /\s*\(metacritic[^)]*\)/i,
];

/** Préfixes publicitaires (« ERHÖHT 35% », « Exklusiv! », « NEU: ») — en tête ou après « Marque: ». */
const PROMO_WORDS_ANY_CASE = /(^|[:–-]\s*)(?:ERH(?:Ö|OE?)HT|(?:\p{L}+-)?EXKLUSIV(?:DEAL)?)\b[:!–-]?\s*/iu;
const PROMO_WORDS_UPPER = /(^|[:–-]\s*)(?:NEU|HOT|TOP|DEAL)\b[:!]?\s+/u;
const PROMO_WORDS_COLON = /(^|[:–-]\s*)(?:neu|hot|top|deal)\s*[:!]\s*/iu;
/** Urgence fabriquée par la source. */
const URGENCY = /\s*[-–,!(]?\s*\b(?:nur\s+(?:noch\s+)?(?:heute|bis\s+morgen)|nur\s+(?:noch\s+)?\d+\s+(?:Exemplare?|Stück|Stk\.?)\s+(?:übrig|verfügbar)|letzte\s+chance|solange\s+es\s+geht|aujourd[’']hui\s+seulement|dernier\s+jour|today\s+only|last\s+chance|only\s+\d+\s+left)\b[^\p{L}\d«“"]*(?:\)\s*)?/giu;
/** Superlatifs de prix (« zum neuen Bestpreis »), gardés seulement si notre historique le prouve. */
const SUPERLATIVE = /\s*[-–,!]?\s*\b(?:zum\s+)?(?:neue[nr]?\s+)?(?:besten\s+Preis|Bestpreis|Tiefstpreis|Niedrigstpreis|Tiefpreis|Toppreis|Allzeit-?Tiefstpreis|Allzeittief(?:preis)?)\b(?:\s+(?:von|für)?\s*(?:CHF|Fr\.)\s*[\d.’',–-]+)?!?/giu;
const PICKUP = /\s*\((?:nur\s+)?Abholung\)|\s*[-–,]\s*nur\s+Abholung\b/iu;
/** « bis zum 29.10. (17 Uhr) » dans un titre : date de fin (parsée), retirée du titre. */
const UNTIL_IN_TITLE = /\s*[-–,(]?\s*\bbis\s+(?:zum\s+)?(\d{1,2})\.(\d{1,2})\.?(?:\s*\(?\s*(\d{1,2})(?::(\d{2}))?\s*Uhr\s*\)?)?\)?/iu;

/** Titre nettoyé, sans vocabulaire marketing (round 2, item 9 ; round 3, item 6) :
 * (a) préfixe de marque « Marque: » conservé à part ; (b) « ERHÖHT », « NEU: », « Exklusiv! »
 * en tête ou après la marque, AVANT la casse de titre ; (c) urgence (« nur noch heute ») ;
 * (d) superlatifs (« zum neuen Bestpreis ») sauf si notre historique le prouve ; (e) « bei
 * <marchand> » en fin de titre quand il répète le marchand affiché ; (f) « (Abholung) »
 * devient une condition ; (g) « Nexode20000mAh » → « Nexode 20000mAh » ; (h) guillemets
 * de la langue ; (i) « 5 % » → « 5% » (DE/EN), « 5 % » (FR) ; (j) marque doublée. */
export function cleanTitle(t: string, opts: { discountPct?: number; keepLowest?: boolean; merchant?: string; lang?: string; free?: boolean } = {}): string {
  let s = t
    .replace(/^\s*\[[^\]]{1,40}\]\s*/, "")
    .replace(/\s*\((aktionspreis|prix promo)\)\s*$/i, "")
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, "");
  // « QoQa-Exklusiv: … » : le préfixe entier est un slogan.
  s = s.replace(/^\s*\p{L}+-Exklusiv(?:deal)?\s*[:!–-]\s*/iu, "");
  for (const re of MARKETING_TAIL) s = s.replace(re, "");
  // Urgence d'abord : « Nur noch heute! Exklusiv – … » laisse sinon « Exklusiv » en tête.
  s = s.replace(URGENCY, " ").replace(/^[\s!,:;–-]+/, "");
  // (a)
  const pm = s.match(/^([^:]{1,40}):\s*/);
  let brand = pm ? pm[1].trim() : "";
  let rest = pm ? s.slice(pm[0].length) : s;
  // (b) en tête du reste, puis en tête absolue (« ERHÖHT: Marke … »).
  for (let i = 0; i < 2; i++) rest = rest.replace(PROMO_WORDS_ANY_CASE, "$1").replace(PROMO_WORDS_UPPER, "$1").replace(PROMO_WORDS_COLON, "$1");
  if (/^(?:ERH(?:Ö|OE?)HT|EXKLUSIV(?:DEAL)?|NEU|HOT|TOP)$/iu.test(brand)) brand = "";
  // (j) « Fnac: Fnac-Karte: … » → « Fnac-Karte: … »
  if (brand && rest.toLowerCase().startsWith(brand.toLowerCase())) brand = "";
  s = brand ? `${brand}: ${rest}` : rest;
  // (c), (d)
  s = s.replace(URGENCY, " ");
  if (!opts.keepLowest) s = s.replace(SUPERLATIVE, "");
  s = s.replace(PICKUP, "").replace(UNTIL_IN_TITLE, "");
  const pct = opts.discountPct;
  if (pct !== undefined && pct > 0 && pct < 100) s = s.replace(/(^|:\s*)(\d{3,})(\s?%)/, (m, pre: string, n: string, sign: string) => (Number(n) >= 100 ? `${pre}${Math.round(pct)}${sign}` : m));
  s = s.replace(/\b(\p{L}{3,})\s+\1\b/giu, "$1");
  if (s.replace(/[^\p{L}]/gu, "").length > 0) s = s.replace(SHOUT, (w) => titleCase(w));
  // « Fisher’S » (casse de titre de la source) → « Fisher’s ».
  s = s.replace(/(\p{Ll})(['’])S\b/gu, "$1$2s");
  // (e)
  s = stripMerchantSuffix(s.trim(), opts.merchant);
  // Points d'exclamation finaux (hors citation) ; « gratis » final quand le prix affiché dit déjà « Gratis ».
  if (!/[«“"]/.test(s)) s = s.replace(/(\p{L})!+(?=\s*(?:\(|$))/gu, "$1").replace(/\s*!+\s*$/, "");
  if (opts.free) s = s.replace(/\s+(?:gratis|kostenlos|gratuit|free)\s*$/i, "");
  // Typographie : apostrophe, espace avant l'unité, tiret, points de suspension.
  s = s.replace(/(\p{L})'(\p{L})/gu, "$1’$2").replace(/(\d)(ml|cl|dl|kg|g)\b/g, "$1 $2").replace(/ - /g, " – ").replace(/\.{3}/g, "…");
  // (g)
  s = s.replace(/(\p{L})(\d{4,})(?=\s?mAh\b)/gu, "$1 $2");
  // (h)
  const lang = opts.lang;
  if (lang === "de" || lang === "fr") s = s.replace(/["“„]([^"“”„«»]{1,60})["”“]/g, "«$1»");
  else if (lang === "en") s = s.replace(/["„«]([^"“”„«»]{1,60})["”»]/g, "“$1”");
  // (i)
  s = lang === "fr" ? s.replace(/(\d)\s?%/g, "$1\u202f%") : s.replace(/(\d)[\s\u202f\u00a0]%/g, "$1%");
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([,.:;!?])/g, "$1").replace(/^[\s,:;–-]+|[\s,:;–-]+$/g, "").replace(/:\s*$/, "").trim();
  if (lang === "fr") s = s.replace(/(\S)\s*([:;!?])(?=\s|$)/g, "$1\u202f$2");
  return s || t.trim();
}

/** Quantité lisible dans toutes les langues (round 3, item 14) : « 500 g », « 6 × 75 cl » ;
 * un nombre de pièces est rendu par langue (« 28 Stk. »). Rien d'autre (« Pro Stück », « 100 Waschgänge »). */
export function packSize(raw: unknown, title: string): { text?: string; pieces?: number } | undefined {
  const s = typeof raw === "string" ? raw.trim() : "";
  const metric = /^(\d+(?:[.,]\d+)?)\s*(?:[x×]\s*(\d+(?:[.,]\d+)?)\s*)?(g|kg|ml|cl|dl|l)$/i;
  let m = s.match(metric);
  if (m) return { text: m[2] ? `${m[1]} × ${m[2]} ${m[3].toLowerCase()}` : `${m[1]} ${m[3].toLowerCase()}` };
  if ((m = s.match(/^(\d{1,4})\s*(?:Stück|Stk\.?|pièces?|pces?)$/i))) return Number(m[1]) > 1 ? { pieces: Number(m[1]) } : undefined;
  const t = title.match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l)\b/i);
  if (t) return { text: t[1] ? `${t[1]} × ${t[2]} ${t[3].toLowerCase()}` : `${t[2]} ${t[3].toLowerCase()}` };
  return undefined;
}

/** Réduction étudiante « Marque: (bis zu) 15% Studentenrabatt » → titre dans chaque langue
 * (round 3, item 8). Seulement si le titre ne dit rien de plus (sinon : titre d'origine, lang=). */
const STUDENT_TITLE = /^([^:]{1,40}):\s*(bis zu|up to|jusqu[’']à)?\s*(\d{1,2})\s?%\*?\s*(?:Studentenrabatt|Studierendenrabatt|Student(?:en)?\s?Discount|Rabatt(?:\s+für\s+Studierende)?|discount|off|de réduction(?: étudiante)?)?\s*(auf alles|auf das gesamte Sortiment|on everything|sitewide|site-wide|sur tout)?\s*$/i;
export function studentTitles(title: string, lang: string = "?"): PublicDeal["titles"] | undefined {
  const m = title.match(STUDENT_TITLE);
  if (m) {
    const brand = m[1].trim(), upTo = !!m[2], pct = Number(m[3]), all = !!m[4];
    if (!(pct > 0 && pct < 100)) return undefined;
    return {
      de: `${brand}: ${upTo ? "bis zu " : ""}${pct}% Rabatt für Studierende${all ? " auf alles" : ""}`,
      fr: `${brand}\u202f: ${upTo ? "jusqu’à " : ""}${pct}\u202f% de réduction étudiante${all ? " sur tout" : ""}`,
      en: `${brand}: ${upTo ? "up to " : ""}${pct}% student discount${all ? " on everything" : ""}`,
    };
  }
  // « Chani: 12 Monate mit 50% Rabatt … », « Disney+: Mit 12 Monate 15% sparen » (round 4, item 10).
  const mo = title.match(/^([^:]{1,40}):\s*(?:mit\s+)?(\d{1,2})\s+Monate?n?\s+(?:lang\s+)?(?:mit\s+)?(\d{1,2})\s?%/i);
  if (mo) {
    const brand = mo[1].trim(), n = Number(mo[2]), pct = Number(mo[3]);
    return {
      de: `${brand}: ${n} Monate lang ${pct}% Rabatt für Studierende`,
      fr: `${brand}\u202f: ${pct}\u202f% de réduction étudiante pendant ${n} mois`,
      en: `${brand}: ${pct}% student discount for ${n} months`,
    };
  }
  // Repli : titre d'une autre langue que la page → « Marque : N % de réduction étudiante » dans la langue
  // de la page ; le titre d'origine reste sur la page deal (lang=). Le titre dans sa langue n'est pas touché.
  const g = title.match(/^([^:|]{1,40}):\s*(bis zu|up to|jusqu[’']à|mindestens|at least|weitere)?\s*(\d{1,2})\s?%/i);
  if (!g) return undefined;
  const brand = g[1].trim(), pct = Number(g[3]), upTo = /bis zu|up to|jusqu/i.test(g[2] ?? "");
  const out: NonNullable<PublicDeal["titles"]> = {
    de: `${brand}: ${upTo ? "bis zu " : ""}${pct}% Rabatt für Studierende`,
    fr: `${brand}\u202f: ${upTo ? "jusqu’à " : ""}${pct}\u202f% de réduction étudiante`,
    en: `${brand}: ${upTo ? "up to " : ""}${pct}% student discount`,
  };
  if (lang === "de" || lang === "fr" || lang === "en") delete out[lang];
  return out;
}

/** « Zurich, Switzerland to Phuket, Thailand for only €485 roundtrip » → titres DE/FR/EN ; les vols
 * qui ne partent pas de Suisse (« European cities to … ») : undefined (non publiés). */
const SWISS_AIRPORT: Record<string, [string, string, string]> = {
  zurich: ["Zürich", "Zurich", "Zurich"], basel: ["Basel", "Bâle", "Basel"], geneva: ["Genf", "Genève", "Geneva"], bern: ["Bern", "Berne", "Bern"], lugano: ["Lugano", "Lugano", "Lugano"],
};
export function secretFlyingTitles(title: string): PublicDeal["titles"] | undefined {
  const m = title.match(/^(Zurich|Basel|Geneva|Bern|Lugano),\s*Switzerland\s+to\s+(.+?)\s+(?:for|from)\s+(?:only\s+)?(€|CHF\s?|\$|£)\s?(\d[\d,.]*)\s*(roundtrip|one-way)?/i);
  if (!m) return undefined;
  const from = SWISS_AIRPORT[m[1].toLowerCase()];
  const [city, ...country] = m[2].split(/,\s*/);
  const to = country.length ? `${city} (${country.join(", ")})` : city;
  const cur = m[3].trim(), n = m[4], rt = (m[5] ?? "").toLowerCase() !== "one-way";
  return {
    de: `${from[0]} → ${to} · ${rt ? "retour" : "einfach"} ab ${cur} ${n}`,
    fr: `${from[1]} → ${to} · ${rt ? "aller-retour" : "aller simple"} dès ${n}\u00a0${cur}`,
    en: `${from[2]} → ${to} · ${rt ? "return" : "one-way"} from ${cur}${n}`,
  };
}

/** Le titre d'origine disait « (Abholung) » : condition « nur Abholung ». */
export const isPickupOnly = (t: string) => PICKUP.test(t);

/** Date de fin écrite dans le titre (« bis zum 29.10. (17 Uhr) »), année du build. */
export function endsFromTitle(t: string, now: Date): string | undefined {
  const m = t.match(UNTIL_IN_TITLE);
  if (!m) return undefined;
  const day = Number(m[1]), month = Number(m[2]), hour = m[3] !== undefined ? Number(m[3]) : 23, min = m[4] !== undefined ? Number(m[4]) : m[3] !== undefined ? 0 : 59;
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12 && hour <= 23 && min <= 59)) return undefined;
  let year = now.getUTCFullYear();
  if (month < now.getUTCMonth() + 1 - 6) year++; // « bis 5.1. » lu en novembre
  const pad = (n: number) => String(n).padStart(2, "0");
  // Heure suisse : décalage de la date (hiver +01:00, été +02:00).
  const probe = new Date(`${year}-${pad(month)}-${pad(day)}T12:00:00Z`);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Zurich", timeZoneName: "shortOffset" }).formatToParts(probe).find((x) => x.type === "timeZoneName")?.value ?? "GMT+1";
  const h = Number(off.replace(/^GMT\+?/, "") || 1);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}:00+${pad(h)}:00`;
}

/** Clé produit stable entre les semaines : sans « -week-YYYYMMDD » ni « :YYYY-MM-DD »
 * (un lien partagé sur WhatsApp survit à la semaine suivante, round 3, item 10). */
export const stableKey = (id: string) => id.replace(/-(?:week|weekstart|weekend)-\d{8}$/, "").replace(/:\d{4}-\d{2}-\d{2}$/, "");

/** Prix promotionnel « à vie » : seulement si le texte le dit (round 4, item 24). */
const LIFETIME = /lebenslang|dauerhaft|für immer|à vie|for life|forever/i;

function subscription(d: RawDeal, price: number | undefined): Subscription | undefined {
  if (d.family !== "subscription") return undefined;
  const months = num(d.commitment_months), promoMonths = num(d.promo_months);
  const after = num(d.price_after_promo) ?? num(d.regular_monthly_price);
  const fee = num(d.activation_fee);
  // Total 24 mois seulement si la taxe de mise en service est connue (0 compris) et,
  // en cas de promo limitée, le prix ensuite aussi (round 2, item 33) : jamais un total
  // présenté comme un fait avec une inconnue dedans. Round 4, item 24 : une promo dont la
  // durée est inconnue n'est JAMAIS supposée durer 24 mois (sauf « lebenslang » écrit).
  const ref = num(d.reference_price);
  const isPromo = price !== undefined && ((after !== undefined && after > price) || (ref !== undefined && ref > price));
  const promoUnknown = isPromo && promoMonths === undefined && !LIFETIME.test(String(d.title ?? ""));
  let total24: number | undefined;
  const p = Math.min(promoMonths ?? 24, 24);
  if (price !== undefined && fee !== undefined && !promoUnknown && (p >= 24 || after !== undefined)) {
    total24 = Math.round((price * p + (after ?? price) * (24 - p) + fee) * 100) / 100;
  }
  return { months, promoMonths, after: after !== undefined && after !== price ? after : undefined, fee, total24, promoUnknown: promoUnknown || undefined };
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
export function projectDeal(d: RawDeal, feed: Feed, now: Date, opts: { expired?: boolean } = {}): PublicDeal | null {
  if (!d.deal_id || !d.title || (!opts.expired && !isLive(d, now))) return null;
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
  // Concours, articles d'une semaine passée, tabac : jamais publiés (round 3, items 15 et 31).
  if (d.family === "contest" || CONTEST.test(rawTitle) || isPastWeek(rawTitle, now) || TOBACCO.test(rawTitle)) return null;
  // Gratis (round 4, item 14) : pas de service déguisé en objet gratuit, pas de bain en plein air hors saison.
  const freeFamily = d.family === "free" || d.family === "digital_free";
  if (freeFamily && SERVICE_NOT_ITEM.test(rawTitle)) return null;
  if (outOfSeason(rawTitle, now)) return null;
  // Reisen (round 4, item 31) : un article sans prix n'est pas une offre ; Secret Flying seulement
  // au départ de la Suisse, avec un titre traduit (« Zürich → Phuket (Thailand) · retour ab € 485 »).
  const flight = d.source_id === "secretflying" ? secretFlyingTitles(rawTitle) : undefined;
  if (d.source_id === "secretflying" && !flight) return null;
  if ((d.family === "travel" || d.family === "transport") && !flight && num(d.current_price) === undefined && !/\d/.test(rawTitle)) return null;
  const titleEnds = endsFromTitle(rawTitle, now);
  if (!opts.expired && titleEnds && new Date(titleEnds).getTime() < now.getTime()) return null;
  const merchant = resolveMerchant(d.source_id, str(d.merchant), rawTitle);
  const lang = titleLang(d.source_id, rawTitle);
  const title = cleanTitle(rawTitle, { discountPct: num(d.effective_discount) ?? num(d.discount_percentage), keepLowest: provenLowest, merchant, lang, free: num(d.current_price) === 0 })
    // Glossaire (round 4, item 10) : « Trainer » (anglicisme de la source) → « Sneaker ».
    .replace(/\bTrainern?(?= für)/g, "Sneaker").slice(0, 160);
  // Spiritueux : jamais publiés (round 4, item 2 ; LAlc art. 42b). L'ancien lien mène à la catégorie (lib/slugs.ts).
  const spirits = SPIRITS.test(rawTitle) && !SPIRITS_FOOD.test(rawTitle);
  if (spirits) return null;
  const alcohol = isAlcohol(rawTitle, str(d.category), clean.url);
  const geo = (str(d.geographic_scope_resolved) ?? str(d.geographic_scope) ?? "NATIONAL") as GeoScope;
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
  // Spiritueux : ni prix barré, ni pourcentage, ni note (LAlc art. 42b).
  const kind = bonus ? "none" : refKind(referenceType, referencePrice !== undefined && price !== undefined && referencePrice > price, (discountPct ?? 0) >= 1);

  // Note publique : règles d'honnêteté appliquées au score du scanner (round 3, arbitrage 1 :
  // une note n'existe que si sa base est visible). Pas de note du tout quand la fiabilité
  // est < 0.7, quand la référence est un chiffre du vendeur (UVP, catalogue) ou un
  // pourcentage annoncé, ou dans une catégorie sans note.
  let score = num(d.deal_score);
  let scoreCap: ScoreCap | undefined;
  if (
    !isPlausible(d.family, discountPct) || quantityMismatch(title, price, unitPrice, unit) ||
    kind !== "comparable" || (confidence ?? 0) < VERIFY_MIN_CONFIDENCE || categoryBySlug(category)?.unrated
  ) score = undefined;
  // Une note de 0 se lit comme un jugement : pas de note du tout (round 2, item 6).
  if (score !== undefined && score <= 0) score = undefined;
  // Prix « statt » du marchand : affiché dès que la référence est un prix pratiqué
  // (comparable), sans signal d'incohérence et fiable. Ce n'est PAS une vérification de
  // notre part (« laut Denner ») tant que nos relevés ne la confirment pas (refObserved).
  const verifiedRef =
    score !== undefined && kind === "comparable" && !BAD_INTEGRITY.has(integrity ?? "") &&
    (confidence ?? 0) >= VERIFY_MIN_CONFIDENCE && (netSavings === undefined || netSavings > 0);
  const historicalMedian = num(d.historical_median), historyN = num(d.history_n);
  const refObserved = verifiedRef && isRefObserved(referencePrice, historicalMedian, historyN);
  // Comparaison avec un concurrent dont le prix n'est pas affiché : aucune note.
  if (referenceType === "competitor" && !(verifiedRef && referencePrice !== undefined && price !== undefined && referencePrice > price)) score = undefined;
  if (score !== undefined && score > SCORE_CAP) {
    const cap = (why: ScoreCap) => { score = SCORE_CAP; scoreCap = why; };
    if (BAD_INTEGRITY.has(integrity ?? "")) cap("integrity");
    // Un « statt » du marchand que nous n'avons pas observé n'est pas un historique : au plus « gut ».
    else if (!refObserved) cap("unchecked");
  }
  const inStore = isSupermarket(merchant, d.source_id) || undefined;

  const fromSource = THIRD_PARTY_CODE_SOURCES.has(d.source_id);
  const rawConds = Array.isArray(d.conditions) ? d.conditions.filter((c): c is string => typeof c === "string") : [];
  const conds = mergeConditions([
    ...structuredConditions(d as Parameters<typeof structuredConditions>[0]),
    ...rawConds.map((c) => parseCondition(fromSource ? redactCodes(c) : c)),
    ...(isPickupOnly(rawTitle) ? [{ code: "pickup" }] : []),
  ]).slice(0, 6);
  const brand = str(d.brand) ?? title.split(/\s+/)[0]?.replace(/[^\p{L}\p{N}-]/gu, "");

  return {
    id: d.deal_id,
    slug: dealSlug(d.deal_id, title),
    title,
    source: d.source_id,
    merchant,
    brand: brand && brand.length > 1 ? brand : undefined,
    family: d.family,
    category,
    geo,
    // Un deal local n'appartient qu'aux villes de son flux ; national/en ligne : à tout le pays.
    // Une autre ville nommée dans le titre (« Freibad Marzili in Bern ») : pas une offre de cette ville.
    cities: OTHER_CITY.test(rawTitle) && !feed.cities.some((c) => rawTitle.toLowerCase().includes(c.replace(/-/g, " "))) ? [] : LOCAL_SCOPES.has(geo) ? feed.cities : ["*"],
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
    size: packSize(d.package_size, rawTitle),
    sub: subscription(d, price),
    netSavings,
    score,
    confidence,
    urgency: str(d.urgency),
    lifecycle: str(d.lifecycle),
    startsAt: str(d.starts_at),
    endsAt: str(d.ends_at) ?? titleEnds,
    endsInferred: d.ends_inferred === true || undefined,
    firstSeenAt: str(d.first_seen_at),
    lastSeenAt: str(d.last_seen_at),
    conds,
    url: clean.url,
    via: viaHost(clean.url, merchant),
    noAff: clean.wasAffiliate || undefined,
    attribution: sourceName(d.source_id),
    requiresStudent: d.requires_student === true || d.family === "student" || undefined,
    trial: isTrial({ title }) || undefined,
    couponCode: fromSource ? undefined : str(d.coupon_code),
    upcoming: (str(d.starts_at) && new Date(str(d.starts_at)!).getTime() > now.getTime()) || undefined,
    inStore,
    // Jamais en vitrine ni sur l'accueil, Studis ou Gratis : contenu adulte, spiritueux, marchand inconnu.
    noShowcase: NO_SHOWCASE.test(rawTitle) || isAdult(rawTitle, merchant, str(d.brand), hostOf(clean.url)) || alcohol || !merchant || undefined,
    titles: flight ?? (d.family === "student" ? studentTitles(title, lang) : undefined),
    adult: isAdult(rawTitle, merchant, str(d.brand), hostOf(clean.url)) || undefined,
    alcohol: alcohol || undefined,
  };
}

/** Le dernier jour d'une action en magasin, après 18:00 (Zurich) : plus achetable
 * « maintenant » pour qui lit la vitrine → retirée des vitrines (reste listée). */
export const STORE_CLOSING_HOUR = 18;
export function pastStoreHours(d: Pick<PublicDeal, "inStore" | "endsAt" | "endsInferred">, now: Date): boolean {
  if (!d.inStore || !d.endsAt || d.endsInferred) return false;
  return dayDiff(d.endsAt, now) <= 0 && zurichHour(now) >= STORE_CLOSING_HOUR;
}

/** Pourcentage d'économie affichable (prix « statt » du marchand, ≥ 1 %). */
export function savingPct(d: Pick<PublicDeal, "verifiedRef" | "referencePrice" | "price">): number | undefined {
  if (!d.verifiedRef || d.referencePrice === undefined || d.price === undefined || d.referencePrice <= 0) return undefined;
  const pct = ((d.referencePrice - d.price) / d.referencePrice) * 100;
  return pct >= 1 ? pct : undefined;
}

/** Le prix « statt » du marchand est-il RENDU (« .was ») ? Même prédicat pour la carte,
 * le héros, le badge, le tri et les phrases de tri (round 3, item 2). */
export const showsRef = (d: Pick<PublicDeal, "verifiedRef" | "referencePrice" | "price">) =>
  d.verifiedRef && d.referencePrice !== undefined && savingPct(d) !== undefined;

/** Note AFFICHÉE : seulement si sa base (le prix « statt ») est visible et à partir de 5/10. */
export const shownScore = (d: PublicDeal) => (showsRef(d) && d.score !== undefined && d.score >= BADGE_MIN_SCORE ? d.score : undefined);

/** Économie en CHF par unité, seulement avec un prix « statt » affiché. */
export function savingChf(d: PublicDeal): number {
  if (!showsRef(d)) return -1;
  if (d.discountAbs !== undefined && d.discountAbs > 0) return d.discountAbs;
  return d.referencePrice !== undefined && d.price !== undefined && d.referencePrice > d.price ? d.referencePrice - d.price : -1;
}

/** Économie par unité de base (CHF par kg ou par litre) : (référence − prix) / quantité, la
 * quantité étant déduite du prix unitaire publié. −1 si inconnue (round 4, item 4). */
export function baseUnitSaving(d: PublicDeal): number {
  if (!showsRef(d) || d.unitPrice === undefined || !(d.unitPrice > 0) || d.price === undefined || !(d.price > 0) || (d.unit !== "kg" && d.unit !== "l")) return -1;
  const qty = d.price / d.unitPrice;
  return qty > 0 ? (d.referencePrice! - d.price) / qty : -1;
}

/** Note qui classe : seulement celle que la carte AFFICHE, c.-à-d. confirmée par nos relevés
 * (round 4, arbitrage 2 : aucune note invisible ne classe une carte). */
export const observedScore = (d: PublicDeal) => (d.refObserved && d.score !== undefined ? d.score : -1);

/** Pourcentage arrondi au demi-point (les écarts plus fins ne départagent pas). */
const pctKey = (d: PublicDeal) => Math.round((savingPct(d) ?? -1) * 2) / 2;

/** Comparateur UNIQUE du site (round 3, item 2), utilisé par rankDeals, better(), pickTop,
 * orderCategory et « Mehr aus » :
 * (1) disponible maintenant avant « ab morgen » ; (2) prix « statt » affiché d'abord ;
 * (3) parmi eux : note AFFICHÉE (confirmée par nos relevés), puis réduction en % (au demi-point), puis économie par kg/l, puis en CHF
 * (round 4, item 4 : à note égale, −60 % sur CHF 3 passe avant −50 % sur un carton à CHF 70) ;
 * parmi les autres : le plus récent d'abord (aucune note invisible ne classe une carte) ; (4) titre, id. */
export function compareDeals(a: PublicDeal, b: PublicDeal): number {
  const ra = showsRef(a), rb = showsRef(b);
  return (
    Number(!!a.upcoming) - Number(!!b.upcoming) ||
    Number(rb) - Number(ra) ||
    (ra && rb ? observedScore(b) - observedScore(a) || pctKey(b) - pctKey(a) || baseUnitSaving(b) - baseUnitSaving(a) || savingChf(b) - savingChf(a) : 0) ||
    (!ra && !rb ? (b.firstSeenAt ?? "").localeCompare(a.firstSeenAt ?? "") : 0) ||
    a.title.localeCompare(b.title) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Tri éditorial (voir compareDeals) ; les non-évalués en dernier. */
export function rankDeals(deals: PublicDeal[]): PublicDeal[] {
  return [...deals].sort(compareDeals);
}

/** Pierres tombales (round 3, item 10) : deals terminés depuis au plus 30 jours. Leur URL
 * (slug stable) reste valable : page « abgelaufen », noindex, sans bouton ni Offer. */
export const TOMBSTONE_DAYS = 30;
export function endedAt(d: RawDeal, now: Date): string | undefined {
  if (String(d.lifecycle) === "SOURCE_FAILURE" || d.duplicate_of) return undefined;
  const ends = str(d.ends_at), seen = str(d.last_seen_at);
  const t = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);
  let at: string | undefined;
  if (ends && t(ends) < now.getTime()) at = ends;
  else if (HIDDEN_LIFECYCLE.has(String(d.lifecycle)) || d.sold_out === true) at = seen && t(seen) <= now.getTime() ? seen : undefined;
  if (!at || !(now.getTime() - t(at) <= TOMBSTONE_DAYS * 86_400_000)) return undefined;
  return at;
}

export function projectExpired(raw: RawDeal[], feed: Feed, now: Date, liveSlugs: Set<string>): PublicDeal[] {
  const out = new Map<string, PublicDeal>();
  for (const d of raw) {
    const at = endedAt(d, now);
    if (!at) continue;
    const p = projectDeal(d, feed, now, { expired: true });
    if (!p || liveSlugs.has(p.slug)) continue;
    const prev = out.get(p.slug);
    if (!prev || (prev.endedAt ?? "") < at) out.set(p.slug, { ...p, endedAt: at, page: true });
  }
  return [...out.values()].sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));
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
