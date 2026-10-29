import { mainCity } from "@/config/cities";
import { HTML_LANG, LOCALES, dict, isLocale } from "@/lib/i18n";
import { SITE_NAME, paths } from "@/lib/site";

/** Manifeste par langue (round 4, item 32) : l'icône d'écran d'accueil ouvre la ville dans la
 * langue où elle a été ajoutée (/fr/st-gallen), avec une description traduite. */
export const dynamic = "force-static";
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const p = await params;
  const locale = isLocale(p.locale) ? p.locale : "de";
  const body = {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: dict(locale).metaDescription,
    lang: HTML_LANG[locale],
    start_url: paths.city(locale, mainCity().slug),
    scope: `/${locale}/`,
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#f5f5f7",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/manifest+json; charset=utf-8" } });
}
