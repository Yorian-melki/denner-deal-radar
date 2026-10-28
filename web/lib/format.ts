/** Formats numériques et dates : tout passe par Intl (séparateur de milliers
 * suisse « ’ », décimales selon la langue) — jamais de nombre « brut » à l'écran. */
import { intlLocale, type Locale } from "@/lib/i18n";

const TZ = "Europe/Zurich";

export const fmtPrice = (v: number | undefined, cur: string, locale: Locale) =>
  v === undefined ? "" : new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: cur }).format(v);

/** Entier avec séparateur de milliers (« 1’349 », « 1 349 »). */
export const fmtInt = (n: number, locale: Locale) => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(n);

/** Pourcentage entier, sans signe (« 63 % » en FR, « 63% » en DE/EN, selon la norme Intl). */
export const fmtPct = (pct: number, locale: Locale) =>
  new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(Math.round(pct) / 100);

/** Note sur 10 avec une décimale (« 8.2 » DE/EN, « 8,2 » FR). */
export const fmtScore = (s: number, locale: Locale) =>
  s.toLocaleString(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function parts(iso: string, locale: Locale, opts: Intl.DateTimeFormatOptions) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: TZ }).formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

/** « Mi 29.10. » / « mer. 29.10 » / « Wed 29.10 ». L'année n'apparaît que si la
 * date sort de l'année de référence ou en est éloignée de plus de 60 jours. */
export function fmtDay(iso: string | undefined, locale: Locale, ref: Date = new Date()): string {
  if (!iso || !Number.isFinite(new Date(iso).getTime())) return "";
  const p = parts(iso, locale, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const refYear = parts(ref.toISOString(), locale, { year: "numeric" }).year;
  const far = Math.abs(new Date(iso).getTime() - ref.getTime()) > 60 * 86_400_000;
  const withYear = p.year !== refYear || far;
  const wd = (p.weekday ?? "").replace(/\.$/, locale === "de" ? "" : ".");
  const date = locale === "de" ? `${p.day}.${p.month}.${withYear ? p.year : ""}` : `${p.day}.${p.month}${withYear ? `.${p.year}` : ""}`;
  return `${wd} ${date}`;
}

/** « 28.10., 12:34 » — jamais « heute » : la page statique peut être lue le lendemain. */
export function fmtUpdated(iso: string | undefined, locale: Locale): string {
  if (!iso) return "";
  const p = parts(iso, locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.day}.${p.month}${locale === "de" ? "." : ""}, ${p.hour}:${p.minute}`;
}

/** Date longue (pages légales, « Stand ») : « 28. Oktober 2026 ». */
export const fmtLongDate = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(new Date(iso));
