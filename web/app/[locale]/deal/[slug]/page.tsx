import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CITIES, mainCity } from "@/config/cities";
import { TelegramCta } from "@/components/CityDashboard";
import {
  DealGrid, DealTitle, PriceLine, dateText, displayTitle, noScoreReason, outbound, savingText, sellerName, showsRef, shownScore,
  subscriptionText, valueText,
} from "@/components/DealCard";
import { Icon } from "@/components/Icon";
import { JsonLd, breadcrumbLd } from "@/components/JsonLd";
import { conditionLines } from "@/lib/conditions";
import { getDeals } from "@/lib/data";
import { colon, fmtAmount, fmtDay, fmtInt, fmtPrice, fmtScore } from "@/lib/format";
import { HTML_LANG, OG_LOCALE, categoryText, dict, isLocale, type Locale } from "@/lib/i18n";
import { AGGREGATOR_SOURCES, sourceName } from "@/lib/merchant";
import { hostOf } from "@/lib/outbound";
import { hasPage, inCity } from "@/lib/project";
import { HISTORY_MIN_OBSERVATIONS, canonical, confidenceTier, hasRealEnd, isLowestSeen, relatedDeals, scoreTier } from "@/lib/select";
import { SITE_NAME, SITE_URL, alternates, ogImage, paths } from "@/lib/site";
import { titleLang } from "@/lib/titleLang";
import type { PublicDeal } from "@/lib/types";

// Export statique : une page par carte publiée (round 2, arbitrage 4) + une pierre tombale
// par deal terminé depuis ≤ 30 jours (round 3, item 10 : le lien partagé ne meurt pas).
export const dynamicParams = false;
export async function generateStaticParams() {
  const { deals, expired } = await getDeals();
  return [...deals.filter(hasPage), ...expired].map((d) => ({ slug: d.slug }));
}

type P = { params: Promise<{ locale: string; slug: string }> };

async function find(slug: string) {
  const data = await getDeals();
  const live = data.deals.find((x) => x.slug === slug);
  return { ...data, d: live ?? data.expired.find((x) => x.slug === slug), ended: !live };
}

/** Ville d'un deal : sa ville de flux, sinon la ville principale. */
const cityOf = (d: PublicDeal) => (d.cities.includes("*") ? mainCity() : CITIES.find((c) => c.slug === d.cities[0]) ?? mainCity());

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await params;
  const { d, now, ended } = await find(p.slug);
  if (!d || !isLocale(p.locale)) return { robots: { index: false } };
  const locale = p.locale;
  const t = dict(locale);
  const title = displayTitle(d, locale);
  if (ended) {
    const h1 = t.expiredH1(title, fmtDay(d.endedAt, locale, now));
    return { title: h1, description: t.expiredLead, robots: { index: false, follow: true }, alternates: alternates(`/deal/${d.slug}`, locale) };
  }
  const seller = sellerName(d, locale);
  const price = d.price !== undefined ? (d.price === 0 ? t.free : fmtPrice(d.price, d.currency, locale)) : "";
  const was = showsRef(d) ? fmtAmount(d.referencePrice!) : "";
  const ogTitle = price ? t.ogTitle(title, price, was, seller) : title;
  const ogDesc = t.ogDescription(dateText(d, locale, now) ?? "", d.attribution, showsRef(d));
  return {
    title: price ? `${title} · ${price}` : title,
    description: ogDesc,
    alternates: alternates(`/deal/${d.slug}`, locale),
    openGraph: {
      type: "article", siteName: SITE_NAME, title: ogTitle, description: ogDesc,
      url: paths.deal(locale, d.slug), locale: OG_LOCALE[locale], images: [ogImage(locale, cityOf(d).slug)],
    },
    twitter: { card: "summary_large_image", title: ogTitle, description: ogDesc },
  };
}

/** Faits sous la note : chaque fait UNE fois (le prix « statt » est dans le héros). */
function Facts({ d, locale, generatedAt, now }: { d: PublicDeal; locale: Locale; generatedAt: string; now: Date }) {
  const t = dict(locale);
  const money = (v: number) => fmtPrice(v, d.currency, locale);
  const rows: [string, React.ReactNode][] = [];
  if (d.referenceType && d.referenceType !== "none") rows.push([t.refType, t.refTypes[d.referenceType] ?? d.referenceType]);
  if (showsRef(d) && d.refObserved) rows.push([t.refPrice, t.refObserved(d.historyN ?? 0)]);
  const n = d.historyN ?? 0;
  if (n >= HISTORY_MIN_OBSERVATIONS) {
    if (d.historicalLow !== undefined) rows.push([t.histLow, money(d.historicalLow)]);
    if (d.historicalMedian !== undefined) rows.push([t.histMedian, `${money(d.historicalMedian)} · ${t.histN(n)}`]);
  } else {
    rows.push([t.histLabel, t.histTooFew]);
  }
  // Sans historique propre, la seule base est la déclaration du marchand (jamais « gut »).
  const tier = confidenceTier(d.confidence);
  rows.push([t.dataSureTitle, n < HISTORY_MIN_OBSERVATIONS && tier !== "low" ? t.dq.merchant : t.dq[tier]]);
  if (d.firstSeenAt) rows.push([t.seenSince, fmtDay(d.firstSeenAt, locale, now)]);
  // Précision au jour (round 3, item 24) : deux builds du même jour ne réécrivent pas 7 000 pages.
  const checked = d.lastSeenAt ?? generatedAt;
  if (checked) rows.push([t.lastChecked, fmtDay(checked, locale, now)]);
  return (
    <dl className="facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Partage : UN bouton (feuille native, sinon copie du lien ; site.js le révèle). */
function Share({ d, locale, url, text }: { d: PublicDeal; locale: Locale; url: string; text: string }) {
  const t = dict(locale);
  return (
    <span className="share" data-share-url={url} data-share-title={displayTitle(d, locale)} data-share-text={text} data-copied={t.copied}>
      <button type="button" className="share-btn" data-share="" hidden aria-label={`${t.shareLink}: ${displayTitle(d, locale)}`}>
        <Icon name="share" size={16} /><span aria-hidden="true">{t.share}</span>
      </button>
      <span className="share-status" role="status" aria-live="polite" />
    </span>
  );
}

/** « Mehr aus … » : toujours présent (3 deals de la catégorie + lien vers toute la catégorie). */
function More({ d, deals, locale, now, title }: { d: PublicDeal; deals: PublicDeal[]; locale: Locale; now: Date; title?: string }) {
  const t = dict(locale);
  const city = cityOf(d);
  const cat = categoryText(locale, d.category);
  const pool = canonical(deals.filter((x) => hasPage(x) && inCity(x, city)));
  const related = relatedDeals(pool, d).map((x) => ({ ...x, variants: undefined, alsoAt: undefined }));
  const total = pool.filter((x) => x.category === d.category).length;
  const href = paths.category(locale, city.slug, d.category);
  return (
    <section className="section deal-more" id="more" aria-labelledby="related">
      <div className="section-head">
        <h2 id="related">{title ?? t.moreIn(cat.label)}</h2>
        <a className="section-more" href={href}><span>{t.allInCat(cat.label, fmtInt(total, locale))}</span><Icon name="arrow" size={16} /></a>
      </div>
      {related.length > 0 && <DealGrid deals={related} locale={locale} now={now} labelledBy="related" />}
    </section>
  );
}

/** Pierre tombale : dernier prix en gris (« damals, laut Denner »), aucun bouton, aucune Offer. */
function Tombstone({ d, deals, locale, now }: { d: PublicDeal; deals: PublicDeal[]; locale: Locale; now: Date }) {
  const t = dict(locale);
  const city = cityOf(d);
  const cat = categoryText(locale, d.category);
  const catHref = paths.category(locale, city.slug, d.category);
  const seller = sellerName(d, locale);
  const crumbs = breadcrumbLd(SITE_URL, [
    { name: city.name[locale], path: paths.city(locale, city.slug) },
    { name: cat.title, path: catHref },
  ]);
  return (
    <div className="deal-wrap">
      <nav className="crumbs" aria-label={t.breadcrumb}>
        <a href={catHref}><Icon name="back" size={16} /><span className="sr-only">{t.backTo(cat.label)}</span><span aria-hidden="true">{cat.label}</span></a>
      </nav>
      <article className="deal deal-ended" data-ended={d.endedAt?.slice(0, 10)}>
        <header className="deal-head">
          {d.merchant ? <p className="deal-seller">{d.merchant}</p> : <p className="deal-seller">{t.via(sourceName(d.source))}</p>}
          <h1><DealTitle deal={d} locale={locale} /> – {t.expiredOn} <time dateTime={d.endedAt}>{fmtDay(d.endedAt, locale, now)}</time></h1>
          <p className="lead">{t.expiredLead}</p>
        </header>
        {d.price !== undefined && (
          <section className="panel deal-buy" aria-labelledby="buy-title">
            <h2 id="buy-title" className="sr-only">{t.buyTitle}</h2>
            <p className="deal-price deal-price-ended">
              <span className="price">{d.price === 0 ? t.free : fmtPrice(d.price, d.currency, locale)}</span>
              {showsRef(d) && <span className="was">{t.thenInstead(fmtAmount(d.referencePrice!))}</span>}
            </p>
            <p className="deal-note">{t.thenBy(seller)}</p>
          </section>
        )}
      </article>
      <More d={d} deals={deals} locale={locale} now={now} title={t.similarNow(cat.label)} />
      <JsonLd data={crumbs} />
    </div>
  );
}

export default async function DealPage({ params }: P) {
  const p = await params;
  const { deals, generatedAt, now, d, ended } = await find(p.slug);
  if (!d) notFound();
  const locale = p.locale as Locale;
  if (ended) return <Tombstone d={d} deals={deals} locale={locale} now={now} />;
  const t = dict(locale);
  const city = cityOf(d);
  const cat = categoryText(locale, d.category);
  const catHref = paths.category(locale, city.slug, d.category);
  const money = (v: number) => fmtPrice(v, d.currency, locale);
  const title = displayTitle(d, locale);
  const shareUrl = `${SITE_URL}${paths.deal(locale, d.slug)}`;
  const shown = shownScore(d);
  const share = t.shareText(title, d.price !== undefined ? money(d.price) : "", shown !== undefined ? fmtScore(shown, locale) : "");
  const out = outbound(d);
  const linkHost = hostOf(out.href) ?? "";
  const seller = sellerName(d, locale);
  const saving = savingText(d, locale);
  const value = valueText(d, locale);
  const date = dateText(d, locale, now);
  const sub = subscriptionText(d, locale);
  const conds = conditionLines(d.conds, t, locale, money);
  if (d.unitPrice !== undefined && d.unit && d.unit !== "month") conds.unshift(`${colon(t.unitPrice, locale)} ${money(d.unitPrice)}${t.units[d.unit]}`);
  if (d.requiresStudent) conds.unshift(t.studentsOnly);
  if (d.trial) conds.unshift(t.trial);
  if (isLowestSeen(d)) conds.push(t.lowestSeen);
  // Action en magasin trouvée sur un agrégateur (rappn, preispirat) : le vrai « où »
  // est le magasin ; l'agrégateur n'est que la source (round 2, item 25).
  const storeVia = d.inStore && d.via;
  // Le bouton nomme la même entité que la ligne marchand, et l'agrégateur s'il y passe.
  const ctaLabel = d.via ? t.ctaVia(d.merchant ?? "", d.via) : t.toOffer(seller);
  const via = AGGREGATOR_SOURCES.has(d.source) ? t.via(sourceName(d.source)) : undefined;
  const tl = titleLang(d.source, d.title);
  const jsonLd = d.price !== undefined ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    ...(d.titles?.[locale] ? { inLanguage: HTML_LANG[locale] } : tl !== "?" ? { inLanguage: HTML_LANG[tl] } : {}),
    offers: {
      "@type": "Offer",
      price: d.price.toFixed(2),
      priceCurrency: d.currency,
      ...(d.via ? {} : { url: d.url }),
      ...(hasRealEnd(d) ? { priceValidUntil: d.endsAt!.slice(0, 10) } : {}),
      ...(d.merchant ? { seller: { "@type": "Organization", name: d.merchant } } : {}),
    },
  } : null;
  const crumbs = breadcrumbLd(SITE_URL, [
    { name: city.name[locale], path: paths.city(locale, city.slug) },
    { name: cat.title, path: catHref },
    { name: title, path: paths.deal(locale, d.slug) },
  ]);
  const reason = noScoreReason(d);
  return (
    <div className="deal-wrap">
      <nav className="crumbs" aria-label={t.breadcrumb}>
        <a href={catHref}><Icon name="back" size={16} /><span className="sr-only">{t.backTo(cat.label)}</span><span aria-hidden="true">{cat.label}</span></a>
      </nav>
      <article className="deal" data-ends={hasRealEnd(d) ? d.endsAt : undefined} data-gone-text={t.expiredBadge}>
        <header className="deal-head">
          <p className="deal-seller">
            {/* Marchand inconnu : seulement « via <source> » (round 4, item 12), jamais « Händler unbekannt ». */}
            {d.merchant && <span>{d.merchant}</span>}
            {via && <span className="deal-via">{via}</span>}
            <Share d={d} locale={locale} url={shareUrl} text={share} />
          </p>
          <h1><DealTitle deal={d} locale={locale} /></h1>
        </header>

        <section className="panel deal-buy" aria-labelledby="buy-title">
          <h2 id="buy-title" className="sr-only">{t.buyTitle}</h2>
          <PriceLine deal={d} locale={locale} className="deal-price" now={now} attrib />
          {saving && <p className="deal-saving">{saving}</p>}
          {value && <p className="deal-note">{value}</p>}
          {sub && <p className="deal-note">{sub}</p>}
          {date && <p className="deal-date">{hasRealEnd(d) ? <time dateTime={d.endsAt}>{date}</time> : date}</p>}
          {conds.length === 1 && <p className="deal-note">{conds[0]}</p>}
          {conds.length > 1 && (
            <ul className="conds" aria-label={t.conditions}>
              {conds.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
          {d.couponCode && <p className="deal-note">{colon(t.code, locale)} <code>{d.couponCode}</code></p>}
          {storeVia ? (
            <div className="deal-actions">
              <p className="store-cta">{t.inStoreAt(seller)}{date ? ` · ${date}` : ""}</p>
              <a className="text-link" href={out.href} target="_blank" rel={out.rel} data-deal={d.id} aria-describedby="cta-note">
                {t.sourceLink(linkHost)}<Icon name="external" size={16} />
              </a>
              <span id="cta-note" className="sr-only">{t.opensSite(linkHost)}</span>
            </div>
          ) : (
            <div className="deal-actions">
              <a className="btn btn-primary btn-lg" href={out.href} target="_blank" rel={out.rel} data-deal={d.id} aria-describedby="cta-note">
                <span>{ctaLabel}{out.affiliate ? ` · ${t.adLinkName}` : ""}</span>
                <Icon name="external" size={18} />
              </a>
              <span id="cta-note" className="sr-only">{t.opensSite(linkHost)}</span>
            </div>
          )}
          {out.affiliate && (
            <p className="ad-note">{t.adLink} · <a href={`${paths.page(locale, "transparenz")}#provision`}>{t.adWhy}</a></p>
          )}
        </section>

        <section className="panel deal-score" aria-labelledby="why-title">
          {shown !== undefined ? (
            <>
              <h2 id="why-title">{t.whyScore}</h2>
              <p className="verdict">
                <span aria-hidden="true"><span className="verdict-num">{fmtScore(shown, locale)}</span><span className="verdict-of">/10</span> <strong>{t.scoreTiers[scoreTier(shown)]}</strong></span>
                <span className="sr-only">{t.scoreAria(fmtScore(shown, locale), t.scoreTiers[scoreTier(shown)])}</span>
              </p>
              {d.scoreCap && <p className="deal-note">{t.scoreCap[d.scoreCap]}</p>}
              <Facts d={d} locale={locale} generatedAt={generatedAt} now={now} />
              <p className="source">{t.source(d.attribution)}</p>
              <a className="text-link" href={paths.page(locale, "transparenz")}>{t.howScored}<Icon name="arrow" size={16} /></a>
            </>
          ) : (
            <>
              <h2 id="why-title" className="sr-only">{t.whyNoScore}</h2>
              <p className="verdict-line">
                <span>{t.scoreNaLine(t.noScore[reason])}</span>
                {" · "}<a href={paths.page(locale, "transparenz")}>{t.howScored}</a>
              </p>
              <details className="facts-more">
                <summary>{t.whyNoScore}</summary>
                <p className="deal-note">{t.scoreNaWhy}</p>
                <Facts d={d} locale={locale} generatedAt={generatedAt} now={now} />
                <p className="source">{t.source(d.attribution)}</p>
              </details>
            </>
          )}
        </section>
      </article>

      <More d={d} deals={deals} locale={locale} now={now} />
      <TelegramCta locale={locale} />
      {jsonLd && <JsonLd data={jsonLd} />}
      <JsonLd data={crumbs} />
    </div>
  );
}
