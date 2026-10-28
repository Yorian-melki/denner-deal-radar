import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cityBySlug, launchedCities } from "@/config/cities";
import { CategoryListing, categoryList, categoryMetadata } from "@/components/CategoryListing";
import { CATEGORIES, categoryBySlug } from "@/lib/categories";
import { getDeals } from "@/lib/data";
import { isLocale, type Locale } from "@/lib/i18n";
import { inCity } from "@/lib/project";

export const dynamicParams = false;
export const generateStaticParams = () =>
  launchedCities().flatMap((c) => CATEGORIES.map((cat) => ({ city: c.slug, category: cat.slug })));

type P = { params: Promise<{ locale: string; city: string; category: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await params;
  const city = cityBySlug(p.city), cat = categoryBySlug(p.category);
  if (!city || !cat || !isLocale(p.locale)) return {};
  const { deals } = await getDeals();
  const n = categoryList(deals.filter((d) => inCity(d, city)), cat.slug).length;
  return categoryMetadata(city, p.locale, cat.slug, 1, n);
}

export default async function CategoryPage({ params }: P) {
  const p = await params;
  const city = cityBySlug(p.city), cat = categoryBySlug(p.category);
  if (!city || !cat) notFound();
  const { deals } = await getDeals();
  return <CategoryListing city={city} locale={p.locale as Locale} slug={cat.slug} page={1} here={deals.filter((d) => inCity(d, city))} />;
}
