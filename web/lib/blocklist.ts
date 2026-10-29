/** Contenus exclus des vitrines, de Studis, de Gratis et de l'accueil (round 3, items 8, 15, 31).
 * Comparés au titre, à la marque, au marchand et à l'hôte du lien. */

/** Marques pour adultes (jamais sur Studis, Gratis ni l'accueil ; listées seulement dans leur catégorie). */
export const ADULT_BRANDS = /\b(lovense|we-?vibe|satisfyer|womanizer|amorelie|eis\.de|orion|beate[\s-]?uhse|amorana|fun\s?factory)\b/i;
/** Mots (existants depuis le round 2). */
export const ADULT_WORDS = /\bBegleiter(in)?\b|\bEscort|\bErotik|\bSex(shop|toy)/i;

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
 * Ginger Beer, Ginseng exclus. Tabac (LPTab) : jamais publié. */
export const SPIRITS = /\b(gin|vodka|wodka|whisk(?:e)?y|rum|rhum|tequila|grappa|cognac|brandy|likör|liqueur|schnaps|kirsch(?!stengel)|absinth|pastis|ouzo|aperol|campari|jägermeister|williams(?:birne)?\s*brand|obstbrand|calvados|mezcal|spirituose)\b/i;
export const TOBACCO = /\b(zigarett|cigarett|tabak|tabac|tobacco|e-?zigarette|vape|iqos|heets|snus|zigarre|cigare)/i;
