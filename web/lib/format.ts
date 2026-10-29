/** Formats numériques et dates. Un seul style suisse dans les trois langues
 * (arbitrage round 2) : « CHF 13.15 », note « 8.2 », milliers « 1’349 ».
 * Seul le français prend une espace fine insécable avant « % » et « : ».
 * Aucun séparateur ne dépend de l'ICU du serveur de build. */
import { intlLocale, type Locale } from "@/lib/i18n";

const TZ = "Europe/Zurich";
export const NBSP = " ";
/** Espace fine insécable (typographie française : « 63 % », « Prix : »). */
export const NNBSP = " ";

/** Groupes de milliers avec l'apostrophe typographique suisse. */
function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "’");
}

/** Montant « 1’349.50 » (toujours 2 décimales), signe moins typographique. */
export function fmtAmount(v: number): string {
  const neg = v < 0;
  const [i, d] = Math.abs(v).toFixed(2).split(".");
  return `${neg ? "−" : ""}${group(i)}.${d}`;
}

/** « CHF 13.15 » dans les trois langues (NBSP entre devise et montant). */
export const fmtPrice = (v: number | undefined, cur: string, _locale?: Locale) =>
  v === undefined ? "" : `${cur}${NBSP}${fmtAmount(v)}`;

/** Entier avec séparateur de milliers suisse (« 1’349 »), toutes langues. */
export const fmtInt = (n: number, _locale?: Locale) => `${n < 0 ? "−" : ""}${group(String(Math.abs(Math.round(n))))}`;

/** Pourcentage entier : « 63% » (DE/EN), « 63 % » (FR, espace fine insécable). */
export const fmtPct = (pct: number, locale: Locale) => `${Math.round(pct)}${locale === "fr" ? NNBSP : ""}%`;

/** Note sur 10 avec une décimale, point dans toutes les langues (« 8.2 »). */
/** Note : virgule décimale en français (« 6,6/10 », round 4, item 41) ; montants CHF inchangés. */
export const fmtScore = (s: number, locale?: Locale) => (locale === "fr" ? s.toFixed(1).replace(".", ",") : s.toFixed(1));

/** « Libellé : » en français (espace fine insécable), « Label: » sinon. */
export const colon = (label: string, locale: Locale) => (locale === "fr" ? `${label}${NNBSP}:` : `${label}:`);

function parts(iso: string, locale: Locale, opts: Intl.DateTimeFormatOptions) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: TZ }).formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

/** Jour civil à Zurich (« 2026-10-28 ») : base des « heute / morgen ». */
export function zurichDay(d: Date | string): string {
  const p = parts(typeof d === "string" ? d : d.toISOString(), "de", { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Heure (0–23) à Zurich. */
export function zurichHour(d: Date): number {
  return Number(parts(d.toISOString(), "de", { hour: "2-digit", hourCycle: "h23" }).hour);
}

/** Écart en jours civils (Zurich) entre deux instants : 0 = même jour, 1 = lendemain. */
export function dayDiff(iso: string, ref: Date): number {
  const a = Date.parse(`${zurichDay(iso)}T00:00:00Z`), b = Date.parse(`${zurichDay(ref)}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

/** Validité (round 3, item 21) : « Mi 4.11. » / « mer. 4 nov. » / « Wed 4 Nov ». L'année
 * n'apparaît que si la date sort de l'année de référence ou en est éloignée de plus de 60 jours. */
export function fmtDay(iso: string | undefined, locale: Locale, ref: Date = new Date()): string {
  if (!iso || !Number.isFinite(new Date(iso).getTime())) return "";
  const p = parts(iso, locale, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const refYear = parts(ref.toISOString(), locale, { year: "numeric" }).year;
  const far = Math.abs(new Date(iso).getTime() - ref.getTime()) > 60 * 86_400_000;
  const withYear = p.year !== refYear || far;
  if (locale === "en") {
    const e = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ }).formatToParts(new Date(iso));
    const g: Record<string, string> = {};
    for (const x of e) g[x.type] = x.value;
    return `${g.weekday} ${g.day} ${g.month}${withYear ? ` ${g.year}` : ""}`;
  }
  const wd = (p.weekday ?? "").replace(/\.$/, locale === "de" ? "" : ".");
  if (locale === "fr") {
    const mon = new Intl.DateTimeFormat("fr-CH", { month: "short", timeZone: TZ }).format(new Date(iso));
    return `${wd} ${Number(p.day)} ${mon}${withYear ? ` ${p.year}` : ""}`;
  }
  return `${wd} ${Number(p.day)}.${Number(p.month)}.${withYear ? p.year : ""}`;
}

/** Horodatage (round 3, item 21) : « 28.10., 12:34 » / « 28.10 à 12:34 » / « 28 Oct, 12:34 ».
 * Jamais « heute » : la page statique peut être lue le lendemain. */
export function fmtUpdated(iso: string | undefined, locale: Locale): string {
  if (!iso) return "";
  const p = parts(iso, locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (locale === "en") {
    const mon = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: TZ }).format(new Date(iso));
    return `${Number(p.day)} ${mon}, ${p.hour}:${p.minute}`;
  }
  return locale === "fr" ? `${p.day}.${p.month} à ${p.hour}:${p.minute}` : `${p.day}.${p.month}., ${p.hour}:${p.minute}`;
}

/** Date longue (pages légales, « Stand ») : « 28. Oktober 2026 ». */
export const fmtLongDate = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(new Date(iso));
