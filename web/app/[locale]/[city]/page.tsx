import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cityBySlug, launchedCities } from "@/config/cities";
import { CityDashboard } from "@/components/CityDashboard";
import { getDeals } from "@/lib/data";
import { OG_LOCALE, dict, isLocale, type Locale } from "@/lib/i18n";
import { inCity } from "@/lib/project";
import { SITE_NAME, alternates, ogImage, paths } from "@/lib/site";

export const dynamicParams = false;
export const generateStaticParams = () => launchedCities().map((c) => ({ city: c.slug }));

type P = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await params;
  const city = cityBySlug(p.city);
  if (!city || !isLocale(p.locale)) return {};
  const t = dict(p.locale);
  const name = city.name[p.locale];
  return {
    title: t.dealsIn(name),
    description: t.cityDescription(name),
    alternates: alternates(`/${city.slug}`, p.locale),
    openGraph: {
      type: "website", siteName: SITE_NAME, title: t.cityTitle(name), description: t.cityDescription(name),
      url: paths.city(p.locale, city.slug), locale: OG_LOCALE[p.locale], images: [ogImage(p.locale, city.slug)],
    },
  };
}

export default async function CityPage({ params }: P) {
  const p = await params;
  const city = cityBySlug(p.city);
  if (!city) notFound();
  const { deals, generatedAt, now } = await getDeals();
  return <CityDashboard city={city} locale={p.locale as Locale} deals={deals.filter((d) => inCity(d, city))} generatedAt={generatedAt} now={now} />;
}
