import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cityBySlug, launchedCities } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { DealGrid } from "@/components/DealCard";
import { CATEGORIES, categoryBySlug } from "@/lib/categories";
import { getDeals } from "@/lib/data";
import { inCity } from "@/lib/project";

export const revalidate = 1800;
export const dynamicParams = false;
export const generateStaticParams = () =>
  launchedCities().flatMap((c) => CATEGORIES.map((cat) => ({ city: c.slug, category: cat.slug })));

type P = { params: Promise<{ city: string; category: string }> };
const PAGE_SIZE = 60;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await params;
  const city = cityBySlug(p.city), cat = categoryBySlug(p.category);
  if (!city || !cat) return {};
  const { deals } = await getDeals();
  const empty = !deals.some((d) => d.category === cat.slug && inCity(d, city));
  return {
    // Page vide = contenu mince : pas d'indexation tant qu'il n'y a pas de deal.
    ...(empty ? { robots: { index: false, follow: true } } : {}),
    title: `${cat.label} in ${city.name}`,
    description: `${cat.intro} Aktuelle Angebote für ${city.name}.`,
    alternates: { canonical: `/${city.slug}/${cat.slug}` },
  };
}

export default async function CategoryPage({ params }: P) {
  const p = await params;
  const city = cityBySlug(p.city), cat = categoryBySlug(p.category);
  if (!city || !cat) notFound();
  const { deals } = await getDeals();
  const list = deals.filter((d) => d.category === cat.slug && inCity(d, city));
  return (
    <>
      <p className="crumbs"><Link href={`/${city.slug}`}>{city.name}</Link> › {cat.label}</p>
      <h1>{cat.label} in {city.name}</h1>
      <p>{cat.intro}</p>
      <DealGrid deals={list.slice(0, PAGE_SIZE / 2)} />
      <AdSlot />
      <DealGrid deals={list.slice(PAGE_SIZE / 2, PAGE_SIZE)} />
      {list.length > PAGE_SIZE && <p className="muted">+ {list.length - PAGE_SIZE} weitere mit tieferer Note.</p>}
    </>
  );
}
