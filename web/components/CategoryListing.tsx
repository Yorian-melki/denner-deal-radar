import type { Metadata } from "next";
import type { City } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { adClient } from "@/lib/operator";
import { CategoryChips, EmptyState, TelegramCta } from "@/components/CityDashboard";
import { DealGrid } from "@/components/DealCard";
import { Icon } from "@/components/Icon";
import { JsonLd, breadcrumbLd } from "@/components/JsonLd";
import { categoryBySlug } from "@/lib/categories";
import { fmtInt } from "@/lib/format";
import { OG_LOCALE, categoryText, dict, type Locale } from "@/lib/i18n";
import { hasPage, rankDeals } from "@/lib/project";
import { canonical, neutralOrder } from "@/lib/select";
import { SITE_NAME, SITE_URL, alternates, ogImage, paths } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";

/** 24 offres par page : pagination statique (/…/kategorie, /…/kategorie/2, …). */
export const PAGE_SIZE = 24;

/** Ordre d'une catégorie — exactement ce que dit l'en-tête de la liste :
 * - abonnements : coût total sur 24 mois croissant (la seule comparaison honnête) ;
 * - catégories sans note : ordre neutre (plus récent d'abord) ;
 * - sinon : le classement (note, puis réduction vérifiée), sans réordonnancement. */
export function orderCategory(list: PublicDeal[], slug: string): PublicDeal[] {
  if (slug === "handy-abos") {
    const cost = (d: PublicDeal) => d.sub?.total24 ?? Infinity;
    return [...list].sort((a, b) => cost(a) - cost(b) || a.title.localeCompare(b.title));
  }
  if (categoryBySlug(slug)?.unrated) return neutralOrder(list);
  return rankDeals(list);
}

export function categoryList(deals: PublicDeal[], slug: string) {
  return orderCategory(canonical(deals).filter((d) => d.category === slug), slug);
}

export const pageCount = (n: number) => Math.max(1, Math.ceil(n / PAGE_SIZE));

export function categoryMetadata(city: City, locale: Locale, slug: string, page: number, count: number): Metadata {
  const empty = count === 0;
  const t = dict(locale);
  const txt = categoryText(locale, slug);
  const name = city.name[locale];
  const title = t.catIn(txt.title, name) + (page > 1 ? ` · ${t.pageOf(page, pageCount(count))}` : "");
  const rest = `/${city.slug}/${slug}${page > 1 ? `/${page}` : ""}`;
  return {
    // Page vide = contenu mince : pas d'indexation tant qu'il n'y a pas de deal.
    ...(empty ? { robots: { index: false, follow: true } } : {}),
    title,
    description: `${txt.intro} ${t.catDescriptionSuffix(name)}`,
    alternates: alternates(rest, locale),
    openGraph: {
      type: "website", siteName: SITE_NAME, title: t.catIn(txt.title, name), description: txt.intro,
      url: `/${locale}${rest}`, locale: OG_LOCALE[locale], images: [ogImage(locale, city.slug)],
    },
  };
}

export function CategoryListing({ city, locale, slug, page, here }: { city: City; locale: Locale; slug: string; page: number; here: PublicDeal[] }) {
  const t = dict(locale);
  const txt = categoryText(locale, slug);
  const ordered = categoryList(here, slug);
  const pages = pageCount(ordered.length);
  const slice = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const base = paths.category(locale, city.slug, slug);
  const pageHref = (n: number) => (n <= 1 ? base : `${base}/${n}`);
  const crumbs = breadcrumbLd(SITE_URL, [
    { name: city.name[locale], path: paths.city(locale, city.slug) },
    { name: txt.title, path: base },
  ]);
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t.catIn(txt.title, city.name[locale]),
    itemListElement: slice.filter(hasPage).slice(0, 20).map((d, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}${paths.deal(locale, d.slug)}`, name: d.title })),
  };
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, ordered.length);
  return (
    <>
      <nav className="crumbs" aria-label={t.home}>
        <a href={paths.city(locale, city.slug)}><Icon name="back" size={16} />{city.name[locale]}</a>
      </nav>
      <header className="intro">
        <h1>{t.catIn(txt.title, city.name[locale])}</h1>
        <p className="lead">{txt.intro}</p>
      </header>
      <CategoryChips city={city} locale={locale} deals={here} active={slug} />
      {ordered.length === 0 ? (
        <EmptyState city={city} locale={locale} deals={here} exclude={slug} />
      ) : (
        <section aria-labelledby="results" className="section">
          <div className="results-head">
            <h2 id="results">
              {pages > 1
                ? t.shownOf(`${fmtInt(first, locale)}–${fmtInt(last, locale)}`, t.resultsCount(ordered.length, fmtInt(ordered.length, locale)))
                : t.resultsCount(ordered.length, fmtInt(ordered.length, locale))}
            </h2>
            <p className="section-note">{slug === "handy-abos" ? t.sortedByTotal : categoryBySlug(slug)?.unrated ? t.sortedByNewest : t.sortedByScore}</p>
          </div>
          <DealGrid deals={slice} locale={locale} />
          {pages > 1 && (
            <nav className="pager" aria-label={t.pagination}>
              {page > 1 ? <a className="btn btn-secondary" href={pageHref(page - 1)} rel="prev">{t.prevPage}</a> : <span />}
              <span className="pager-pos">{t.pageOf(page, pages)}</span>
              {page < pages ? <a className="btn btn-secondary" href={pageHref(page + 1)} rel="next">{t.nextPage}</a> : <span />}
            </nav>
          )}
          {/* Publicité : après les résultats, jamais dans la liste classée. */}
          <AdSlot label={t.adLabel} client={adClient()} />
        </section>
      )}
      <TelegramCta locale={locale} />
      <JsonLd data={crumbs} />
      {slice.length > 0 && <JsonLd data={itemList} />}
    </>
  );
}
