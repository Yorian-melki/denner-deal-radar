/** Qui vend ? (round 3, item 7). Un agrégateur (Preispirat, Rappn, GamerPower…) n'est
 * jamais affiché comme marchand : il est la SOURCE (« via Preispirat »). Si le vrai
 * marchand est inconnu, on l'écrit (« Händler unbekannt ») et le deal sort des vitrines
 * et des sections de l'accueil. Fonctions pures, testées (tests/round3.test.ts). */

/** Sources qui republient les offres d'autres commerçants. */
export const AGGREGATOR_SOURCES = new Set(["preispirat", "rappn", "gamerpower", "dealdoktor", "studentbeans", "unidays", "dschungelkompass", "gutscheine_20min", "ferienpiraten"]);

/** Nom public d'une source (« via Preispirat »). */
const SOURCE_NAMES: Record<string, string> = {
  preispirat: "Preispirat", rappn: "Rappn", gamerpower: "GamerPower", dealdoktor: "DealDoktor",
  studentbeans: "Student Beans", unidays: "UNiDAYS", dschungelkompass: "Dschungelkompass",
  gutscheine_20min: "20 Minuten Gutscheine", ferienpiraten: "Ferienpiraten", denner: "Denner",
  lidl: "Lidl", aldi: "Aldi", migros: "Migros", volg: "Volg", coop: "Coop", daydeal: "DayDeal",
  digitec_daily: "Digitec", galaxus_daily: "Galaxus", dg_daily: "Digitec Galaxus", brack: "Brack",
  revendo: "Revendo", qoqa: "QoQa", poinz: "Poinz", tutti_free: "tutti.ch", anibis_free: "anibis.ch",
  epic_free: "Epic Games", secretflying: "Secret Flying", stadtsg_news: "Stadt St. Gallen",
  grabenhalle_events: "Grabenhalle", kut_events: "KUT", saiten_events: "Saiten",
};
export const sourceName = (id: string) => SOURCE_NAMES[id] ?? id.replace(/_/g, " ").replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());

/** Noms d'agrégateurs (jamais un « marchand »). */
const AGGREGATOR_NAMES = /^(preispirat|rappn|gamerpower|dealdoktor|student ?beans|unidays|myunidays|dschungelkompass|mydealz|deals\.ch)$/i;
/** Marques ou plateformes souvent mal attribuées comme vendeur par un agrégateur
 * (« Sky Show » → « Apple ») : seulement acceptées si le titre les nomme comme lieu d'achat. */
const BRAND_NOT_MERCHANT = /^(apple|sky|samsung|mobile|pc|android|ios|windows|playstation|xbox)$/i;

/** Graphies officielles (« ALDI SUISSE » → « Aldi »). */
const CANONICAL: Record<string, string> = {
  "aldi suisse": "Aldi", aldi: "Aldi", lidl: "Lidl", "lidl schweiz": "Lidl", denner: "Denner", migros: "Migros", coop: "Coop",
  "coop city": "Coop City", volg: "Volg", qoqa: "QoQa", mediamarkt: "MediaMarkt", "media markt": "MediaMarkt", galaxus: "Galaxus",
  digitec: "Digitec", daydeal: "DayDeal", interdiscount: "Interdiscount", fust: "Fust", brack: "Brack", ikea: "IKEA",
  "office world": "Office World", manor: "Manor", jumbo: "Jumbo", conforama: "Conforama", nettoshop: "Nettoshop",
  "ochsner sport": "Ochsner Sport", "ex libris": "Ex Libris", "orell füssli": "Orell Füssli", "epic games": "Epic Games",
  gog: "GOG", steam: "Steam", amazon: "Amazon", "google play": "Google Play", zalando: "Zalando", "hp store": "HP Store",
};

export function canonicalMerchant(raw: string | undefined): string | undefined {
  const m = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!m) return undefined;
  const k = m.toLowerCase();
  if (CANONICAL[k]) return CANONICAL[k];
  // Tout en capitales (≥ 4 lettres) : casse de titre (« SECEND » → « Secend »).
  if (/^[\p{Lu}\d &.-]{4,}$/u.test(m) && /\p{Lu}{4,}/u.test(m)) return m.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_x, a: string, b: string) => a + b.toUpperCase());
  return m;
}

/** « … bei MediaMarkt », « … im Coop City », « … chez Fnac », « … at Galaxus » en fin de titre. */
const SUFFIX = /\s+(?:bei|im|chez|at)\s+((?:\p{Lu}|\d)[\p{L}\d&.’' -]{0,30}?(?:\s+Store)?)(?:\s+(?:Shop|Online-?Shop))?\s*$/u;

export function merchantFromTitle(title: string): string | undefined {
  const m = title.match(SUFFIX);
  if (!m) return undefined;
  const name = m[1].trim();
  if (name.split(/\s+/).length > 3 || AGGREGATOR_NAMES.test(name)) return undefined;
  return canonicalMerchant(name);
}

/** Retire « bei <marchand> » en fin de titre quand il répète le marchand affiché. */
export function stripMerchantSuffix(title: string, merchant: string | undefined): string {
  if (!merchant) return title;
  const m = title.match(SUFFIX);
  if (!m) return title;
  const a = m[1].toLowerCase().replace(/[^\p{L}\d]/gu, ""), b = merchant.toLowerCase().replace(/[^\p{L}\d]/gu, "");
  return a && (a === b || a.startsWith(b) || b.startsWith(a)) ? title.slice(0, m.index).trim() : title;
}

/** Marchand affichable d'un deal brut : jamais un agrégateur ; « undefined » = inconnu. */
export function resolveMerchant(source: string, rawMerchant: string | undefined, title: string): string | undefined {
  const fromTitle = merchantFromTitle(title);
  const m = canonicalMerchant(rawMerchant);
  const aggregated = AGGREGATOR_SOURCES.has(source);
  if (m && !AGGREGATOR_NAMES.test(m) && !(aggregated && BRAND_NOT_MERCHANT.test(m))) return m;
  if (fromTitle && !BRAND_NOT_MERCHANT.test(fromTitle)) return fromTitle;
  if (!aggregated) return m ?? canonicalMerchant(sourceName(source));
  return undefined;
}
