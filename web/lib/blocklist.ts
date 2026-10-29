/** Contenus exclus des vitrines, de Studis, de Gratis et de l'accueil (round 3, items 8, 15, 31).
 * Comparés au titre, à la marque, au marchand et à l'hôte du lien. */

/** Marques pour adultes (jamais sur Studis, Gratis ni l'accueil ; listées seulement dans leur catégorie). */
export const ADULT_BRANDS = /\b(lovense|we-?vibe|satisfyer|womanizer|amorelie|eis\.de|orion|beate[\s-]?uhse|amorana|fun\s?factory)\b/i;
/** Mots (existants depuis le round 2). */
export const ADULT_WORDS = /\bBegleiter(in)?\b|\bEscort|\bErotik|\bSex(shop|toy)|\bDark Romance\b|\bfür eine Nacht\b/i;

/** Gratis (round 4, item 14) : un service n'est pas un objet gratuit (« Pakete abholen lassen », WLAN). */
export const SERVICE_NOT_ITEM = /abholen lassen|\bLieferung\b|\bWi-?Fi\b|\bWLAN\b|werbung skippen/i;
/** Autre ville nommée dans le titre : l'offre ne concerne pas St-Gall (« Freibad Marzili in Bern », « Auto Zürich »). */
export const OTHER_CITY = /\b(?:in|im|nach|ins)\s+(?:[\p{L}-]+\s+){0,3}?(?:Bern|Basel|Zürich|Zurich|Luzern|Baden|Genf|Genève|Lausanne|Winterthur|Biel|Thun|Aarau|Chur|Lugano|Zug|Olten|Solothurn|Fribourg|Freiburg|Neuchâtel|Sion|La Chaux-de-Fonds|Pratteln)\b|\bAuto Zürich\b|\bAquabasilea\b/iu;
/** Bains en plein air : hors saison du 15.09 au 15.05. */
export function outOfSeason(title: string, now: Date): boolean {
  if (!/\b(?:Freibad|Strandbad|Badi|Seebad|Gartenbad)\b/i.test(title)) return false;
  const md = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  return md >= 915 || md < 515;
}

export function isAdult(...fields: (string | undefined)[]): boolean {
  return fields.some((f) => !!f && (ADULT_BRANDS.test(f) || ADULT_WORDS.test(f)));
}

/** Concours et jeux-concours : pas une offre (famille « contest »), exclus de toutes les listes. */
export const CONTEST = /Gewinnspiel|Glücksrad|Spielen\s*&\s*Gewinnen|Wettbewerb|\bgewinnen\b|\bconcours\b|\bsweepstakes?\b|\bgiveaway contest\b/i;

/** « … KW43 » : article d'une semaine passée (semaine ISO). */
export function isPastWeek(title: string, now: Date): boolean {
  const m = title.match(/\bKW\s?(\d{1,2})\b/i);
  if (!m) return false;
  return Number(m[1]) < isoWeek(now);
}

export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
}

/** Spiritueux (LAlc art. 42b : pas de comparaison de prix ni de cadeau) — Kirschstengeli,
 * Ginger Beer, Ginseng exclus. Round 4, item 2 : marques et degré ≥ 15 % vol. ; un spiritueux
 * n'est plus publié du tout (pas de page ; son ancien lien mène à la catégorie). Tabac (LPTab) : jamais publié. */
export const SPIRITS = /\b(gin|vodka|wodka|whisk(?:e)?y|rum|rhum|tequila|grappa|cognac|brandy|likör|liqueur|schnaps|kirsch(?!stengel)|absinth|pastis|ouzo|aperol|campari|jägermeister|williams(?:birne)?\s*brand|obstbrand|calvados|mezcal|spirituose|bacardi|smirnoff|baileys|malibu|captain\s+morgan|gordon[’']?s|limoncello|amaretto|bourbon|scotch|pfl(?:ü|ue)mli|alpenbitter|breezer|john(?:ny|nie)\s+walker|jack\s+daniel[’']?s|jim\s+beam|absolut\s+vodka|tanqueray|hendrick[’']?s|bombay\s+sapphire|jameson|glenfiddich|hennessy|martell|ramazzotti|fernet|sambuca|kräuterlikör|absinthe|destillat|distillate|single malt|eau-de-vie|damassine)\b|\b(?:1[5-9]|[2-9]\d)(?:[.,]\d)?\s?%\s?vol/i;
export const TOBACCO = /\b(zigarett|cigarett|tabak|tabac|tobacco|e-?zigarette|vape|iqos|heets|snus|zigarre|cigare)/i;

/** Boissons alcoolisées (round 4, item 2) : jamais sur l'accueil, en vitrine, dans « Mehr aus »
 * d'un produit non alcoolisé, ni dans les 6 premières cartes de Supermarkt et Shopping (le
 * public compte des mineurs). Listées dans leur catégorie. Titre OU rayon du marchand. */
export const ALCOHOL = /\b(?:wein|weine|rotwein|weisswein|weißwein|roséwein|schaumweine?|glühwein|vins?|wines?|bier|biere|lagerbier|weizenbier|weissbier|pils|bière|bières|beer|lager|cidre|cider|prosecco|champagner|champagne|crémant|cava|spumante|sekt|lambrusco|moscato|primitivo|merlot|chianti|rioja|bordeaux|montepulciano|nero d[’']avola|pinot|chardonnay|sauvignon|riesling|malbec|shiraz|syrah|tempranillo|zinfandel|amarone|valpolicella|ripasso|barolo|barbera|negroamaro|nebbiolo|zweigelt|dôle|fendant|chasselas|cornalin|malvoisie|johannisberg|franciacorta|docg|doca|heineken|corona\s+(?:extra|bier)|feldschlösschen|calanda|eichhof|quöllfrisch|schützengarten|carlsberg|beck[’']?s|erdinger|paulaner|warsteiner|krombacher|desperados|somersby|hoegaarden|leffe|guinness|budweiser|chopfab|ittinger|kronenbourg|tuborg|birra moretti|peroni|super bock|sagres|valaisanne|sangria|vermouth|wermut|portwein|sherry)\b|\b(?:DOC|AOC|IGT)\b(?!\s*(?:monitor|[a-z]{0,3}\d))/iu;
/** Rayon du marchand (« Wein & Spirituosen », « Bier, NoLo & Co », « Schaumwein »). */
export const ALCOHOL_SHELF = /(^|[^\p{L}])(wein|weine|schaumwein|bier|spirituosen|champagner|sekt|cider|vins?|bières?|spiritueux|alcools?|wine|beer)([^\p{L}]|$)/iu;
/** Sans alcool, ou ingrédient (vinaigre, épices pour vin chaud). */
export const ALCOHOL_FREE = /alkoholfrei|alk\.?\s?frei|sans alcool|alcohol[- ]?free|non[- ]alcoholic|\b0[.,][05]\s?%|\bzero\b|\bcero\b|\bfree\b|kombucha|sparkling tea|ginger beer|essig|vinaigre|gewürz|gläser|\bglas\b|traubensaft|jus de raisin|schokolade|chocolat|petit beurre|salami/i;
/** Aliments parfumés (« Bourbon-Vanille », « Tafelschokolade, Kirsch », pralinés à la liqueur) : pas des spiritueux. */
export const SPIRITS_FOOD = /vanill|schokolade|chocolat|pralin|bonbon|tafel|kirschstengel|ginger|ginseng|torte|kuchen|glace|eis\b/i;
/** Lien vers un rayon vin (QoQa : /wine, /vin). */
const ALCOHOL_URL = /\/(?:wine|vin|wein|vins|weine)(?:[/?#.-]|$)/i;

export function isAlcohol(title: string, shelf?: string, url?: string): boolean {
  if (ALCOHOL_FREE.test(title)) return false;
  return ALCOHOL.test(title) || (!!shelf && ALCOHOL_SHELF.test(shelf)) || (!!url && ALCOHOL_URL.test(url));
}
