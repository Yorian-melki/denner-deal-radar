import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cityBySlug, launchedCities } from "@/config/cities";
import { CategoryListing, categoryList, categoryMetadata, pageCount } from "@/components/CategoryListing";
import { CATEGORIES, categoryBySlug } from "@/lib/categories";
import { getDeals } from "@/lib/data";
import { isLocale, type Locale } from "@/lib/i18n";
import { inCity } from "@/lib/project";

/** Pages 2…N d'une catégorie (la page 1 est /…/<kategorie>). */
export const dynamicParams = false;
export async function generateStaticParams() {
  const { deals } = await getDeals();
  const out: { city: string; category: string; page: string }[] = [];
  for (const c of launchedCities()) {
    const here = deals.filter((d) => inCity(d, c));
    for (const cat of CATEGORIES) {
      const pages = pageCount(categoryList(here, cat.slug).length);
      for (let n = 2; n <= pages; n++) out.push({ city: c.slug, category: cat.slug, page: String(n) });
    }
  }
  return out;
}

type P = { params: Promise<{ locale: string; city: string; category: string; page: string }> };

async function resolve(p: Awaited<P["params"]>) {
  const city = cityBySlug(p.city), cat = categoryBySlug(p.category), page = Number(p.page);
  if (!city || !cat || !Number.isInteger(page) || page < 2) return null;
  const { deals, now } = await getDeals();
  const here = deals.filter((d) => inCity(d, city));
  const n = categoryList(here, cat.slug).length;
  if (page > pageCount(n)) return null;
  return { city, cat, page, here, n, now };
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await params;
  const r = await resolve(p);
  if (!r || !isLocale(p.locale)) return {};
  return categoryMetadata(r.city, p.locale, r.cat.slug, r.page, r.n);
}

export default async function CategoryPageN({ params }: P) {
  const p = await params;
  const r = await resolve(p);
  if (!r) notFound();
  return <CategoryListing city={r.city} locale={p.locale as Locale} slug={r.cat.slug} page={r.page} here={r.here} now={r.now} />;
}
