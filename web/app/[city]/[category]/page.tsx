import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cityBySlug, launchedCities } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { CategoryChips, TelegramCta } from "@/components/CityDashboard";
import { DealGrid } from "@/components/DealCard";
import { CATEGORIES, categoryBySlug } from "@/lib/categories";
import { getDeals } from "@/lib/data";
import { categoryText, categoryTitle, dict } from "@/lib/i18n";
import { inCity } from "@/lib/project";
import { dedupeProducts, pickTop } from "@/lib/select";
import { SITE_NAME, ogImage } from "@/lib/site";

export const dynamicParams = false;
export const generateStaticParams = () =>
  launchedCities().flatMap((c) => CATEGORIES.map((cat) => ({ city: c.slug, category: cat.slug })));

type P = { params: Promise<{ city: string; category: string }> };
const PAGE_SIZE = 60;
const TOP = 12;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await params;
  const city = cityBySlug(p.city), cat = categoryBySlug(p.category);
  if (!city || !cat) return {};
  const t = dict(city.locale);
  const txt = categoryText(city.locale, cat.slug, cat);
  const { deals } = await getDeals();
  const empty = !deals.some((d) => d.category === cat.slug && inCity(d, city));
  return {
    // Page vide = contenu mince : pas d'indexation tant qu'il n'y a pas de deal.
    ...(empty ? { robots: { index: false, follow: true } } : {}),
    title: t.catIn(categoryTitle(city.locale, cat), city.name),
    description: `${txt.intro} ${t.catDescriptionSuffix(city.name)}`,
    alternates: { canonical: `/${city.slug}/${cat.slug}` },
    openGraph: {
      type: "website", siteName: SITE_NAME, title: t.catIn(categoryTitle(city.locale, cat), city.name), description: txt.intro,
      url: `/${city.slug}/${cat.slug}`, locale: `${city.locale}_CH`, images: [ogImage(city.slug)],
    },
  };
}

export default async function CategoryPage({ params }: P) {
  const p = await params;
  const city = cityBySlug(p.city), cat = categoryBySlug(p.category);
  if (!city || !cat) notFound();
  const t = dict(city.locale);
  const txt = categoryText(city.locale, cat.slug, cat);
  const { deals } = await getDeals();
  const here = deals.filter((d) => inCity(d, city));
  // Même produit dans plusieurs magasins → une seule carte (« aussi chez N »).
  const list = dedupeProducts(here.filter((d) => d.category === cat.slug));
  // En tête : top diversifié (notés, ≤ 2 par marchand), puis le reste dans l'ordre du classement.
  const top = pickTop(list, { n: TOP, perCategory: TOP });
  const topIds = new Set(top.map((d) => d.id));
  const rest = list.filter((d) => !topIds.has(d.id));
  const ordered = [...top, ...rest];
  return (
    <>
      <p className="crumbs"><Link href={`/${city.slug}`}>{city.name}</Link> <span aria-hidden="true">›</span> {txt.label}</p>
      <header className="page-head">
        <h1>{t.catIn(categoryTitle(city.locale, cat), city.name)}</h1>
        <p className="lead">{txt.intro}</p>
      </header>
      <CategoryChips city={city} deals={here} />
      <DealGrid deals={ordered.slice(0, PAGE_SIZE / 2)} locale={city.locale} />
      <AdSlot />
      {ordered.length > PAGE_SIZE / 2 && <DealGrid deals={ordered.slice(PAGE_SIZE / 2, PAGE_SIZE)} locale={city.locale} />}
      {ordered.length > PAGE_SIZE && <p className="muted">{t.moreLower(ordered.length - PAGE_SIZE)}</p>}
      <TelegramCta locale={city.locale} />
    </>
  );
}
