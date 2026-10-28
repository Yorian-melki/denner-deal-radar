import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cityBySlug, launchedCities } from "@/config/cities";
import { CityDashboard } from "@/components/CityDashboard";
import { getDeals } from "@/lib/data";
import { dict } from "@/lib/i18n";
import { inCity } from "@/lib/project";
import { SITE_NAME, ogImage } from "@/lib/site";

export const dynamicParams = false;
export const generateStaticParams = () => launchedCities().map((c) => ({ city: c.slug }));

type P = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const city = cityBySlug((await params).city);
  if (!city) return {};
  const t = dict(city.locale);
  return {
    title: t.cityTitle(city.name),
    description: t.cityDescription(city.name),
    alternates: { canonical: `/${city.slug}` },
    openGraph: {
      type: "website", siteName: SITE_NAME, title: t.cityTitle(city.name), description: t.cityDescription(city.name),
      url: `/${city.slug}`, locale: `${city.locale}_CH`, images: [ogImage(city.slug)],
    },
  };
}

export default async function CityPage({ params }: P) {
  const city = cityBySlug((await params).city);
  if (!city) notFound();
  const { deals, generatedAt } = await getDeals();
  return <CityDashboard city={city} deals={deals.filter((d) => inCity(d, city))} generatedAt={generatedAt} variant="city" />;
}
