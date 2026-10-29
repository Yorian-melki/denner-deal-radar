import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cityBySlug, launchedCities } from "@/config/cities";
import { CategoryListing, categoryList, categoryMetadata, pageCount, storesOf } from "@/components/CategoryListing";
import { getDeals } from "@/lib/data";
import { isLocale, type Locale } from "@/lib/i18n";
import { inCity } from "@/lib/project";

/** Pages 2…N d'un magasin : /…/supermarkt-aktionen/<magasin>/<n>. */
export const dynamicParams = false;
export async function generateStaticParams() {
  const { deals } = await getDeals();
  const out: { city: string; category: string; page: string; sub: string }[] = [];
  for (const c of launchedCities()) {
    const here = deals.filter((d) => inCity(d, c));
    for (const s of storesOf(here)) {
      const pages = pageCount(categoryList(here, "supermarkt-aktionen", s.slug).length);
      for (let n = 2; n <= pages; n++) out.push({ city: c.slug, category: "supermarkt-aktionen", page: s.slug, sub: String(n) });
    }
  }
  // Next exige au moins un paramètre avec dynamicParams = false : la page « 1 » n'est jamais liée.
  return out.length ? out : [{ city: launchedCities()[0].slug, category: "supermarkt-aktionen", page: "x", sub: "1" }];
}

type P = { params: Promise<{ locale: string; city: string; category: string; page: string; sub: string }> };

async function resolve(p: Awaited<P["params"]>) {
  const city = cityBySlug(p.city);
  if (!city || p.category !== "supermarkt-aktionen") return null;
  const { deals, now } = await getDeals();
  const here = deals.filter((d) => inCity(d, city));
  const store = storesOf(here).find((s) => s.slug === p.page);
  const page = Number(p.sub);
  if (!store || !Number.isInteger(page) || page < 2) return null;
  const n = categoryList(here, "supermarkt-aktionen", store.slug).length;
  if (page > pageCount(n)) return null;
  return { city, page, here, n, now, store };
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await params;
  const r = await resolve(p);
  if (!r || !isLocale(p.locale)) return {};
  return categoryMetadata(r.city, p.locale, "supermarkt-aktionen", r.page, r.n, r.store);
}

export default async function StorePageN({ params }: P) {
  const p = await params;
  const r = await resolve(p);
  if (!r) notFound();
  return <CategoryListing city={r.city} locale={p.locale as Locale} slug="supermarkt-aktionen" page={r.page} here={r.here} now={r.now} store={r.store} />;
}
