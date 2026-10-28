import { HTML_LANG, LOCALES, type Locale } from "@/lib/i18n";
import { isOperatorComplete } from "@/lib/operator";

/** Nom de marque : une variable (GitHub → Variables → SITE_NAME), aucun code à changer.
 * Aucun nom de marque n'est écrit en dur ailleurs : tout passe par SITE_NAME. */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Deal Radar";

/** URL publique absolue (canonical, og:url, sitemap, JSON-LD, liens de partage).
 * Un build de production (CI, Cloudflare, `next build`) sans URL https valide
 * ÉCHOUE : jamais plus de liens vers localhost publiés. */
export function resolveSiteUrl(raw: string | undefined, strict: boolean): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  const valid = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(v) && !/localhost|127\.0\.0\.1|\[::1\]/i.test(v);
  if (valid) return v;
  if (strict)
    throw new Error(`NEXT_PUBLIC_SITE_URL invalide pour un build de production : « ${raw ?? ""} » (attendu : https://domaine, sans localhost).`);
  return v || "http://localhost:3000";
}

const STRICT = !!(process.env.CI || process.env.CF_PAGES) || process.env.NODE_ENV === "production";
export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, STRICT);

/** Indexation seulement quand le build vise le domaine définitif (SITE_INDEXABLE=1
 * dans la CI) : jamais *.pages.dev ni les previews (contenu dupliqué), jamais sans Impressum complet. */
export const INDEXABLE = process.env.SITE_INDEXABLE === "1" && !!process.env.NEXT_PUBLIC_SITE_URL && isOperatorComplete();

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

/** Chemins : préfixe de langue + mêmes slugs dans toutes les langues. */
export const paths = {
  home: (l: Locale) => `/${l}`,
  city: (l: Locale, city: string) => `/${l}/${city}`,
  category: (l: Locale, city: string, cat: string) => `/${l}/${city}/${cat}`,
  deal: (l: Locale, slug: string) => `/${l}/deal/${slug}`,
  page: (l: Locale, page: string) => `/${l}/${page}`,
};

/** canonical + hreflang (de-CH, fr-CH, en, x-default = DE) pour un chemin sans langue (« /st-gallen », « »). */
export function alternates(rest: string, locale: Locale) {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[HTML_LANG[l]] = `/${l}${rest}`;
  languages["x-default"] = `/de${rest}`;
  return { canonical: `/${locale}${rest}`, languages };
}

/** Image Open Graph d'une ville dans une langue (app/[locale]/[city]/og.png, générée au build). */
export const ogImage = (locale: Locale, citySlug: string) => ({ url: `/${locale}/${citySlug}/og.png`, width: 1200, height: 630, alt: SITE_NAME, type: "image/png" });
