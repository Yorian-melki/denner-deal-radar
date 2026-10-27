import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cityBySlug, launchedCities } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { DealGrid } from "@/components/DealCard";
import { CATEGORIES } from "@/lib/categories";
import { getDeals } from "@/lib/data";
import { inCity } from "@/lib/project";
import { fmtDate } from "@/lib/site";

export const dynamicParams = false;
export const generateStaticParams = () => launchedCities().map((c) => ({ city: c.slug }));

type P = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const city = cityBySlug((await params).city);
  if (!city) return {};
  return {
    title: `Aktionen & Deals in ${city.name} diese Woche`,
    description: `Alle aktuellen Aktionen in ${city.name}: Supermärkte, Tech, Gratis, Studentenrabatte — nach echter Ersparnis sortiert.`,
    alternates: { canonical: `/${city.slug}` },
  };
}

export default async function CityPage({ params }: P) {
  const city = cityBySlug((await params).city);
  if (!city) notFound();
  const { deals, generatedAt } = await getDeals();
  const here = deals.filter((d) => inCity(d, city));
  return (
    <>
      <h1>Deals in {city.name}</h1>
      <p className="muted">{here.length} aktive Angebote · aktualisiert {fmtDate(generatedAt)}</p>
      <AdSlot />
      {CATEGORIES.map((cat) => {
        const list = here.filter((d) => d.category === cat.slug);
        if (!list.length) return null;
        return (
          <section key={cat.slug}>
            <h2><Link href={`/${city.slug}/${cat.slug}`}>{cat.label}</Link> <span className="muted">({list.length})</span></h2>
            <DealGrid deals={list.slice(0, 6)} />
            {list.length > 6 && <p><Link href={`/${city.slug}/${cat.slug}`}>Alle {list.length} anzeigen →</Link></p>}
          </section>
        );
      })}
    </>
  );
}
