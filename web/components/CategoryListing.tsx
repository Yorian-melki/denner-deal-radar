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
import { canonical, merchantKey, neutralOrder } from "@/lib/select";
import { SITE_NAME, SITE_URL, alternates, ogImage, paths } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";

/** 24 offres par page : pagination statique (/…/kategorie, /…/kategorie/2, …). */
export const PAGE_SIZE = 24;

/** Supermarkt : sur une page de 24, au plus un tiers du même magasin (sinon la page 1
 * est 22/24 Coop, simplement parce que Coop publie le plus). Ordre relatif conservé. */
export const MAX_SHARE_PER_MERCHANT = 1 / 3;
export function interleave(list: PublicDeal[], pageSize = PAGE_SIZE, share = MAX_SHARE_PER_MERCHANT): PublicDeal[] {
  const cap = Math.max(1, Math.floor(pageSize * share));
  const out: PublicDeal[] = [];
  let rest = list;
  while (rest.length) {
    const counts = new Map<string, number>();
    const page: PublicDeal[] = [], later: PublicDeal[] = [];
    for (const d of rest) {
      const m = merchantKey(d);
      if (page.length < pageSize && (counts.get(m) ?? 0) < cap) { page.push(d); counts.set(m, (counts.get(m) ?? 0) + 1); }
      else later.push(d);
    }
    // Plus assez d'autres magasins pour remplir : on complète dans l'ordre.
    while (page.length < pageSize && later.length) page.push(later.shift()!);
    out.push(...page);
    rest = later;
  }
  return out;
}

/** Ordre d'une catégorie — exactement ce que dit la note sous la liste :
 * - abonnements : coût total sur 24 mois croissant (la seule comparaison honnête) ;
 * - catégories sans note : ordre neutre (plus récent d'abord) ;
 * - sinon : prix « statt » d'abord, puis note (lib/project.ts compareDeals) ;
 *   Supermarkt : au plus un tiers d'un même magasin par page. */
export function orderCategory(list: PublicDeal[], slug: string): PublicDeal[] {
  if (slug === "handy-abos") {
    const cost = (d: PublicDeal) => d.sub?.total24 ?? Infinity;
    return [...list].sort((a, b) => cost(a) - cost(b) || a.title.localeCompare(b.title));
  }
  if (categoryBySlug(slug)?.unrated) return neutralOrder(list);
  const ranked = rankDeals(list);
  return slug === "supermarkt-aktionen" ? interleave(ranked) : ranked;
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

export function CategoryListing({ city, locale, slug, page, here, now }: { city: City; locale: Locale; slug: string; page: number; here: PublicDeal[]; now: Date }) {
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
  const sortNote = slug === "handy-abos" ? t.sortedByTotal : categoryBySlug(slug)?.unrated ? t.sortedByNewest : t.sortedByScore;
  return (
    <>
      <nav className="crumbs" aria-label={t.breadcrumb}>
        <a href={paths.city(locale, city.slug)}><Icon name="back" size={16} /><span className="sr-only">{t.backTo(city.name[locale])}: </span><span aria-hidden="true">{city.name[locale]}</span></a>
      </nav>
      <header className="intro">
        <h1>{t.catIn(txt.title, city.name[locale])}</h1>
        <p className="lead">{txt.intro}</p>
      </header>
      <CategoryChips city={city} locale={locale} deals={here} active={slug} />
      {ordered.length === 0 ? (
        <EmptyState city={city} locale={locale} deals={here} exclude={slug} />
      ) : (
        <section aria-labelledby="results" className="section section-first">
          <h2 id="results" className="sr-only">{t.catIn(txt.title, city.name[locale])}</h2>
          <DealGrid deals={slice} locale={locale} labelledBy="results" now={now} />
          <p className="section-foot">
            {pages > 1 ? t.shownRange(fmtInt(first, locale), fmtInt(last, locale), fmtInt(ordered.length, locale)) : t.resultsCount(ordered.length, fmtInt(ordered.length, locale))}
            {" · "}{sortNote}
          </p>
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
