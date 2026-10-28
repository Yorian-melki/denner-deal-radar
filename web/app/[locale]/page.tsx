import type { Metadata } from "next";
import { mainCity } from "@/config/cities";
import { CityDashboard } from "@/components/CityDashboard";
import { JsonLd } from "@/components/JsonLd";
import { getDeals } from "@/lib/data";
import { HTML_LANG, dict, isLocale, type Locale } from "@/lib/i18n";
import { inCity } from "@/lib/project";
import { SITE_NAME, SITE_URL, alternates, paths } from "@/lib/site";

type P = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: { absolute: `${SITE_NAME} – ${dict(locale).tagline}` }, alternates: alternates("", locale) };
}

/** Accueil : la ville de lancement (vitrines plus courtes, note ≥ 5.5). */
export default async function Home({ params }: P) {
  const locale = (await params).locale as Locale;
  const { deals, generatedAt } = await getDeals();
  const city = mainCity();
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}${paths.home(locale)}`, inLanguage: HTML_LANG[locale] }} />
      <CityDashboard city={city} locale={locale} deals={deals.filter((d) => inCity(d, city))} generatedAt={generatedAt} variant="home" />
    </>
  );
}
