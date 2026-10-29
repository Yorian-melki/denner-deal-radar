import type { Metadata } from "next";
import type { City } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { adClient } from "@/lib/operator";
import { CategoryChips, EmptyState, TelegramCta } from "@/components/CityDashboard";
import { DealGrid } from "@/components/DealCard";
import { Icon } from "@/components/Icon";
import { JsonLd, breadcrumbLd } from "@/components/JsonLd";
import { categoryBySlug, isSupermarket } from "@/lib/categories";
import { fmtInt } from "@/lib/format";
import { OG_LOCALE, categoryText, dict, type Locale } from "@/lib/i18n";
import { hasPage, rankDeals, slugify } from "@/lib/project";
import { canonical, merchantKey, neutralOrder, showsRef, studentOrder } from "@/lib/select";
import { SITE_NAME, SITE_URL, alternates, ogImage, paths } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";

/** 24 offres par page : pagination statique (/…/kategorie, /…/kategorie/2, …). */
export const PAGE_SIZE = 24;

/** Toute catégorie notée : sur une page de 24, au plus un tiers du même marchand, et jamais
 * 3 cartes consécutives du même marchand (round 3, item 14). Ordre relatif conservé. */
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
    out.push(...noTriples(page));
    rest = later;
  }
  return out;
}

/** Jamais 3 cartes consécutives du même marchand quand un autre peut s'intercaler. */
function noTriples(page: PublicDeal[]): PublicDeal[] {
  const out = [...page];
  for (let i = 2; i < out.length; i++) {
    const m = merchantKey(out[i]);
    if (merchantKey(out[i - 1]) !== m || merchantKey(out[i - 2]) !== m) continue;
    const j = out.findIndex((d, k) => k > i && merchantKey(d) !== m);
    if (j < 0) break;
    const [x] = out.splice(j, 1);
    out.splice(i, 0, x);
  }
  return out;
}

/** Événements : par date de début (le plus proche d'abord), round 3, item 23. */
const byStart = (list: PublicDeal[]) =>
  [...list].sort((a, b) => (a.startsAt ?? a.endsAt ?? "9999").localeCompare(b.startsAt ?? b.endsAt ?? "9999") || a.title.localeCompare(b.title));

/** Ordre d'une catégorie — exactement ce que dit la note au-dessus de la liste :
 * - abonnements : coût total sur 24 mois croissant ; événements : par date ;
 * - Studis : réduction annoncée décroissante, puis fin la plus proche ;
 * - autres catégories sans note : plus récent d'abord ;
 * - sinon : comparateur unique (prix « statt » affiché d'abord, puis note ; puis plus récent),
 *   au plus un tiers d'un même marchand par page. */
export function orderCategory(list: PublicDeal[], slug: string): PublicDeal[] {
  if (slug === "handy-abos") {
    const cost = (d: PublicDeal) => d.sub?.total24 ?? Infinity;
    return [...list].sort((a, b) => cost(a) - cost(b) || a.title.localeCompare(b.title));
  }
  if (slug === "events") return byStart(list);
  if (slug === "studenten-rabatte") return studentOrder(list);
  if (categoryBySlug(slug)?.unrated) return neutralOrder(list);
  return interleave(rankDeals(list));
}

/** Supermarkt : seulement les enseignes alimentaires (Office World, SECEND en sortent). */
const isGrocer = (d: PublicDeal) => isSupermarket(d.merchant, d.source) || d.family === "grocery" || d.family === "surplus";

export const storeSlug = (d: PublicDeal) => (d.merchant ? slugify(d.merchant) : "");

export function categoryList(deals: PublicDeal[], slug: string, store?: string) {
  let list = canonical(deals).filter((d) => d.category === slug);
  if (slug === "supermarkt-aktionen") list = list.filter(isGrocer);
  if (store) list = list.filter((d) => storeSlug(d) === store);
  return orderCategory(list, slug);
}

export const pageCount = (n: number) => Math.max(1, Math.ceil(n / PAGE_SIZE));

/** Pages par magasin (round 3, item 14) : Supermarkt, enseignes avec au moins 12 actions. */
export const STORE_MIN = 12;
export function storesOf(deals: PublicDeal[]): { slug: string; name: string; n: number }[] {
  const m = new Map<string, { slug: string; name: string; n: number }>();
  for (const d of categoryList(deals, "supermarkt-aktionen")) {
    const s = storeSlug(d);
    if (!s || /^\d+$/.test(s)) continue;
    const e = m.get(s) ?? { slug: s, name: d.merchant!, n: 0 };
    e.n++;
    m.set(s, e);
  }
  return [...m.values()].filter((x) => x.n >= STORE_MIN).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

export function categoryMetadata(city: City, locale: Locale, slug: string, page: number, count: number, store?: { slug: string; name: string }): Metadata {
  const empty = count === 0;
  const t = dict(locale);
  const txt = categoryText(locale, slug);
  const name = city.name[locale];
  const head = store ? `${txt.title}: ${store.name}` : txt.title;
  const title = t.catIn(head, name) + (page > 1 ? ` · ${t.pageOf(page, pageCount(count))}` : "");
  const rest = `/${city.slug}/${slug}${store ? `/${store.slug}` : ""}${page > 1 ? `/${page}` : ""}`;
  return {
    // Page vide = contenu mince : pas d'indexation tant qu'il n'y a pas de deal.
    ...(empty ? { robots: { index: false, follow: true } } : {}),
    title,
    description: `${txt.intro} ${t.catDescriptionSuffix(name)}`,
    alternates: alternates(rest, locale),
    openGraph: {
      type: "website", siteName: SITE_NAME, title: t.catIn(head, name), description: txt.intro,
      url: `/${locale}${rest}`, locale: OG_LOCALE[locale], images: [ogImage(locale, city.slug)],
    },
  };
}

/** Phrase de tri générée à partir de la liste affichée (round 3, item 2). */
export function sortNote(list: PublicDeal[], slug: string, locale: Locale): string {
  const t = dict(locale);
  if (slug === "handy-abos") return t.sortedByTotal;
  if (slug === "events") return t.sortedByDate;
  if (slug === "studenten-rabatte") return t.sortedByDiscount;
  if (categoryBySlug(slug)?.unrated) return t.sortedByNewest;
  return list.some(showsRef) ? t.sortedByScore : t.sortedByNewestPlain;
}

/** Ligne générée (catégories notées, round 3, item 22) : jamais de promesse de « Statt-Preis »
 * quand aucune carte n'en a. « 76 Angebote, davon 12 mit Statt-Preis · häufigste Händler: … ». */
export function categoryFacts(list: PublicDeal[], locale: Locale): string {
  const t = dict(locale);
  const m = list.filter(showsRef).length;
  const counts = new Map<string, number>();
  for (const d of list) if (d.merchant) counts.set(d.merchant, (counts.get(d.merchant) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([k]) => k);
  return t.catFacts(fmtInt(list.length, locale), m ? fmtInt(m, locale) : "", top.join(", "));
}

/** Couverture générée (round 3, item 14) : « Diese Woche erfasst: Aldi 243 · … · Coop 0 (Quelle derzeit ohne Daten) ». */
const MAIN_GROCERS = ["Aldi", "Coop", "Denner", "Lidl", "Migros", "Volg"];
export function coverageLine(here: PublicDeal[], locale: Locale): string {
  const t = dict(locale);
  const counts = new Map<string, number>(MAIN_GROCERS.map((g) => [g, 0]));
  for (const d of categoryList(here, "supermarkt-aktionen")) if (d.merchant && counts.has(d.merchant)) counts.set(d.merchant, counts.get(d.merchant)! + 1);
  const parts = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([g, n]) => (n ? `${g} ${fmtInt(n, locale)}` : `${g} 0 (${t.coverageNone})`));
  return t.coverage(parts.join(" · "));
}

export function CategoryListing({ city, locale, slug, page, here, now, store }: { city: City; locale: Locale; slug: string; page: number; here: PublicDeal[]; now: Date; store?: { slug: string; name: string } }) {
  const t = dict(locale);
  const txt = categoryText(locale, slug);
  const ordered = categoryList(here, slug, store?.slug);
  const pages = pageCount(ordered.length);
  const slice = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const catBase = paths.category(locale, city.slug, slug);
  const base = store ? `${catBase}/${store.slug}` : catBase;
  const pageHref = (n: number) => (n <= 1 ? base : `${base}/${n}`);
  const crumbs = breadcrumbLd(SITE_URL, [
    { name: city.name[locale], path: paths.city(locale, city.slug) },
    { name: txt.title, path: catBase },
    ...(store ? [{ name: store.name, path: base }] : []),
  ]);
  const head = store ? `${txt.title}: ${store.name}` : txt.title;
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t.catIn(head, city.name[locale]),
    itemListElement: slice.filter(hasPage).slice(0, 20).map((d, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}${paths.deal(locale, d.slug)}`, name: d.title })),
  };
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, ordered.length);
  const rated = !categoryBySlug(slug)?.unrated && slug !== "events";
  const stores = slug === "supermarkt-aktionen" ? storesOf(here) : [];
  const coverage = slug === "supermarkt-aktionen" && !store ? coverageLine(here, locale) : "";
  const back = store ? { href: catBase, label: txt.label } : { href: paths.city(locale, city.slug), label: city.name[locale] };
  return (
    <>
      <nav className="crumbs" aria-label={t.breadcrumb}>
        <a href={back.href}><Icon name="back" size={16} /><span className="sr-only">{t.backTo(back.label)}: </span><span aria-hidden="true">{back.label}</span></a>
      </nav>
      <header className="intro">
        <h1>{t.catIn(head, city.name[locale])}</h1>
        <p className="lead">{rated && ordered.length ? categoryFacts(ordered, locale) : txt.intro}</p>
      </header>
      <CategoryChips city={city} locale={locale} deals={here} active={slug} />
      {stores.length > 1 && (
        <nav className="chips chips-sub" aria-label={t.stores} data-chips="">
          <a href={catBase} className="chip" aria-current={!store ? "page" : undefined}>{t.allChip}</a>
          {stores.map((s) => (
            <a key={s.slug} href={`${catBase}/${s.slug}`} className="chip" aria-current={store?.slug === s.slug ? "page" : undefined}>{s.name}</a>
          ))}
        </nav>
      )}
      {ordered.length === 0 ? (
        <EmptyState city={city} locale={locale} deals={here} exclude={slug} />
      ) : (
        <section aria-labelledby="results" className="section section-first">
          <h2 id="results" className="sr-only">{pages > 1 ? t.shownRangeH(fmtInt(first, locale), fmtInt(last, locale), fmtInt(ordered.length, locale), page, pages) : head}</h2>
          <p id="results-desc" className="section-note">{sortNote(ordered, slug, locale)}</p>
          <DealGrid deals={slice} locale={locale} labelledBy="results" describedBy="results-desc" now={now} />
          <p className="section-foot">
            {pages > 1 ? t.shownRange(fmtInt(first, locale), fmtInt(last, locale), fmtInt(ordered.length, locale)) : t.resultsCount(ordered.length, fmtInt(ordered.length, locale))}
            {coverage && <>{" · "}{coverage}</>}
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
