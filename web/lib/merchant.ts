/** Qui vend ? (round 3, item 7). Un agrégateur (Preispirat, Rappn, GamerPower…) n'est
 * jamais affiché comme marchand : il est la SOURCE (« via Preispirat »). Si le vrai
 * marchand est inconnu, la carte n'affiche que la source (« via Preispirat », round 4, item 12 :
 * plus jamais « Händler unbekannt ») et le deal sort des vitrines et des sections de l'accueil. Fonctions pures, testées (tests/round3.test.ts). */

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
  "epic games store": "Epic Games", "epic": "Epic Games", indiegala: "IndieGala", fanatical: "Fanatical", ubisoft: "Ubisoft",
  "prime gaming": "Prime Gaming", fnac: "Fnac", "post.ch": "Die Post", "samsung store": "Samsung Store", "3djake": "3DJake", iherb: "iHerb", peachstore: "Peach", "peach store": "Peach", postfinance: "PostFinance",
};

/** Boutique entre parenthèses (« Ancient Evil (IndieGala) », « SmartStudents! (PostFinance) »). */
const PAREN_STORE = /\((IndieGala|GOG|Steam|Epic Games(?: Store)?|Prime Gaming|Ubisoft|Fanatical|PostFinance)\)/i;
/** « … bei fnac (…) », « … bei iHerb », « … bei pumbi.ch », « im PeachStore » au milieu du titre. */
const MID_STORE = /\b(?:bei|im|chez)\s+(samsung store|fnac|iherb|peachstore|pumbi\.ch|galaxus|digitec|brack|interdiscount|mediamarkt|fust|manor|ikea|zalando|amazon)\b/i;
/** Prestataire nommé en tête du titre (abonnements, services, transports). */
const LEADING_PROVIDER: [RegExp, string][] = [
  [/^HP\b/, "HP Store"], [/^Wingo\b/i, "Wingo"], [/^Quickline\b/i, "Quickline"], [/^yallo\b/i, "yallo"], [/^SBB\b/, "SBB"],
  [/^Sky\b/, "Sky"], [/\bAudible\b/, "Audible"], [/^PubliBike\b/i, "PubliBike"], [/^Update Fitness\b/i, "Update Fitness"],
  [/^Electra\b/, "Electra"], [/\bNeon[- ]Konto\b|\baufs Neon Konto\b/i, "Neon"], [/^Apple ?TV\b|^AppleTV\b/i, "Apple"],
  [/^Google\b/, "Google"], [/\bvon Yesim\b|^Yesim\b/i, "Yesim"], [/^Die Post\b|^Post\b/, "Die Post"], [/^Salt\b/, "Salt"],
  [/^Sunrise\b/, "Sunrise"], [/^Swisscom\b/, "Swisscom"], [/^Galaxus\b/, "Galaxus"], [/^Digitec\b/, "Digitec"],
  // Abonnements et services nommés en tête (relevé du 06.11 : 2,3 % sans marchand, build bloqué).
  [/^CHmobile\b/i, "CHmobile"], [/^Lebara\b/i, "Lebara"], [/^Lyca\b|\bLyca Mobile\b/i, "Lycamobile"], [/^Disney\+/, "Disney+"],
  [/^ifolor\b/i, "ifolor"], [/^C&A\b/, "C&A"], [/^Alpian\b/, "Alpian"], [/^Freedom24\b/, "Freedom24"], [/^alao\b/i, "alao"],
  [/\bSunrise (?:We Connect|\d)/, "Sunrise"], [/^Jetpac\b/, "Jetpac"], [/^Volkswagen\b/, "Volkswagen"],
];

/** Marchand nommé par l'agrégateur dans la 1re phrase de sa description : « Bei 3DJake findet ihr… »,
 * « Aktuell bekommt ihr bei yallo das… », « Derzeit bietet Digital Republic das… ». Prudent : 1 à 3 mots,
 * jamais un agrégateur ni une marque produit, et seulement dans les 160 premiers caractères. */
const DESC_STORE = [
  /\b(?:[Bb]ei|[Bb]eim)\s+(?:der\s+|dem\s+)?((?:\p{Lu}|\d|[a-z][\w-]*\.ch\b|alao\b|yallo\b|reichelt\b)[\p{L}\d&.+-]*(?:\s+\p{Lu}[\p{L}\d&.+-]*){0,2}?)\s+(?:und\s+\S+\s+)?(?:findet|gibt|gibt’s|gibt's|gibts|bekommt|erhaltet|erhältst|könnt|kannst|das|den|die)\b/u,
  /\b(?:bietet|verkauft)\s+((?:\p{Lu})[\p{L}\d&.+-]*(?:\s+\p{Lu}[\p{L}\d&.+-]*){0,2}?)\s+(?:das|den|die|aktuell|derzeit)\b/u,
];
const DESC_NOT_STORE = /^(?:preispirat|twint|der|die|das|uns|euch|ihnen|neukunden|aktuell)$/i;

export function merchantInDescription(desc: string | undefined): string | undefined {
  const head = (desc ?? "").slice(0, 160);
  for (const re of DESC_STORE) {
    const m = head.match(re);
    if (!m) continue;
    const name = m[1].trim();
    if (DESC_NOT_STORE.test(name) || AGGREGATOR_NAMES.test(name) || BRAND_NOT_MERCHANT.test(name)) continue;
    return canonicalMerchant(name);
  }
  return undefined;
}

/** Marchand lu dans le titre ailleurs qu'en fin (round 4, item 12). */
export function merchantInTitle(title: string): string | undefined {
  const p = title.match(PAREN_STORE);
  if (p) return canonicalMerchant(p[1]);
  const m = title.match(MID_STORE);
  if (m) return canonicalMerchant(m[1]);
  for (const [re, name] of LEADING_PROVIDER) if (re.test(title)) return name;
  return undefined;
}

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
export function resolveMerchant(source: string, rawMerchant: string | undefined, title: string, description?: string): string | undefined {
  const fromTitle = merchantFromTitle(title);
  const m = canonicalMerchant(rawMerchant);
  const aggregated = AGGREGATOR_SOURCES.has(source);
  if (m && !AGGREGATOR_NAMES.test(m) && !(aggregated && BRAND_NOT_MERCHANT.test(m))) return m;
  if (fromTitle && !BRAND_NOT_MERCHANT.test(fromTitle)) return fromTitle;
  if (!aggregated) return m ?? canonicalMerchant(sourceName(source));
  return merchantInTitle(title) ?? merchantInDescription(description);
}
