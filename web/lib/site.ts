import { intlLocale, type Locale } from "@/lib/i18n";

/** Nom de marque : une variable (GitHub → Variables → SITE_NAME), aucun code à changer.
 * Aucun nom de marque n'est écrit en dur ailleurs : tout passe par SITE_NAME. */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Deal Radar";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
/** Indexation seulement quand le build vise le domaine définitif (SITE_INDEXABLE=1
 * dans la CI) : jamais *.pages.dev ni les previews, pour éviter le contenu dupliqué. */
export const INDEXABLE = process.env.SITE_INDEXABLE === "1" && !!process.env.NEXT_PUBLIC_SITE_URL;

/** Canal Telegram public (https://t.me/…) ; absent ou invalide → aucun bouton. */
export function telegramUrl(raw: string | undefined = process.env.NEXT_PUBLIC_TELEGRAM_URL): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && (u.hostname === "t.me" || u.hostname === "telegram.me") ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Image Open Graph statique d'une ville (app/[city]/og.png/route.tsx, générée au build). */
export const ogImage = (citySlug: string) => ({ url: `/${citySlug}/og.png`, width: 1200, height: 630, alt: SITE_NAME, type: "image/png" });

export const fmtPrice = (v: number | undefined, cur: string, locale: Locale = "de") =>
  v === undefined ? "" : new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: cur }).format(v);

/** Montant arrondi au franc inférieur (accroche « CHF 1 234 » : jamais gonflé). */
export const fmtMoneyRound = (v: number, cur: string, locale: Locale = "de") =>
  new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: cur, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.floor(v));

export const fmtDate = (iso: string | undefined, locale: Locale = "de") =>
  iso ? new Intl.DateTimeFormat(intlLocale(locale), { day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" }).format(new Date(iso)) : "";

export const fmtDateTime = (iso: string | undefined, locale: Locale = "de") =>
  iso
    ? new Intl.DateTimeFormat(intlLocale(locale), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" }).format(new Date(iso))
    : "";
