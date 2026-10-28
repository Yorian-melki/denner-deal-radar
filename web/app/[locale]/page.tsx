import type { Metadata } from "next";
import { mainCity } from "@/config/cities";
import { CityDashboard } from "@/components/CityDashboard";
import { JsonLd } from "@/components/JsonLd";
import { getDeals } from "@/lib/data";
import { HTML_LANG, dict, isLocale, type Locale } from "@/lib/i18n";
import { inCity } from "@/lib/project";
import { SITE_NAME, SITE_URL, alternates, paths } from "@/lib/site";

type P = { params: Promise<{ locale: string }> };

/** /de, /fr, /en : tant qu'une seule ville existe, Cloudflare redirige en 302 vers
 * /<langue>/st-gallen (public/_redirects). Cette page n'est qu'un repli identique,
 * dont le canonical pointe vers la page ville (pas de doublon indexable). */
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const city = mainCity();
  return {
    title: { absolute: `${dict(locale).dealsIn(city.name[locale])} – ${SITE_NAME}` },
    alternates: alternates(`/${city.slug}`, locale),
    robots: { index: false, follow: true },
  };
}

export default async function Home({ params }: P) {
  const locale = (await params).locale as Locale;
  const { deals, generatedAt, now } = await getDeals();
  const city = mainCity();
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}${paths.home(locale)}`, inLanguage: HTML_LANG[locale] }} />
      <CityDashboard city={city} locale={locale} deals={deals.filter((d) => inCity(d, city))} generatedAt={generatedAt} now={now} />
    </>
  );
}
