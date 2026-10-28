import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CITIES, mainCity } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { adClient } from "@/lib/operator";
import { TelegramCta } from "@/components/CityDashboard";
import { DealGrid, DealTitle, PriceLine, dateText, outbound, savingText, showsRef, subscriptionText, valueText } from "@/components/DealCard";
import { Icon } from "@/components/Icon";
import { JsonLd, breadcrumbLd } from "@/components/JsonLd";
import { conditionLines } from "@/lib/conditions";
import { getDeals } from "@/lib/data";
import { colon, fmtAmount, fmtDay, fmtPrice, fmtScore, fmtUpdated } from "@/lib/format";
import { HTML_LANG, OG_LOCALE, categoryText, dict, isLocale, type Locale } from "@/lib/i18n";
import { hostOf } from "@/lib/outbound";
import { hasPage, inCity } from "@/lib/project";
import { HISTORY_MIN_OBSERVATIONS, brandKey, canonical, confidenceTier, hasRealEnd, isLowestSeen, pickTop, promoKey, scoreTier } from "@/lib/select";
import { SITE_NAME, SITE_URL, alternates, ogImage, paths } from "@/lib/site";
import { titleLang } from "@/lib/titleLang";
import type { PublicDeal } from "@/lib/types";

// Export statique : une page par carte publiée (round 2, arbitrage 4).
export const dynamicParams = false;
export async function generateStaticParams() {
  const { deals } = await getDeals();
  return deals.filter(hasPage).map((d) => ({ slug: d.slug }));
}

type P = { params: Promise<{ locale: string; slug: string }> };

async function find(slug: string) {
  const { deals, now } = await getDeals();
  return { d: deals.find((x) => x.slug === slug), now };
}

/** Ville d'un deal : sa ville de flux, sinon la ville principale. */
const cityOf = (d: PublicDeal) => (d.cities.includes("*") ? mainCity() : CITIES.find((c) => c.slug === d.cities[0]) ?? mainCity());

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await params;
  const { d, now } = await find(p.slug);
  if (!d || !isLocale(p.locale)) return { robots: { index: false } };
  const locale = p.locale;
  const t = dict(locale);
  const seller = d.merchant ?? d.attribution;
  const price = d.price !== undefined ? (d.price === 0 ? t.free : fmtPrice(d.price, d.currency, locale)) : "";
  const was = showsRef(d) ? fmtAmount(d.referencePrice!) : "";
  const ogTitle = price ? t.ogTitle(d.title, price, was, seller) : d.title;
  const ogDesc = t.ogDescription(dateText(d, locale, now) ?? "", d.attribution);
  return {
    title: price ? `${d.title} · ${price}` : d.title,
    description: ogDesc,
    alternates: alternates(`/deal/${d.slug}`, locale),
    openGraph: {
      type: "article", siteName: SITE_NAME, title: ogTitle, description: ogDesc,
      url: paths.deal(locale, d.slug), locale: OG_LOCALE[locale], images: [ogImage(locale, cityOf(d).slug)],
    },
    twitter: { card: "summary_large_image", title: ogTitle, description: ogDesc },
  };
}

/** Panneau « So kommt die Bewertung zustande » : chaque fait UNE fois (l'économie est dans le héros). */
function Facts({ d, locale, generatedAt, now }: { d: PublicDeal; locale: Locale; generatedAt: string; now: Date }) {
  const t = dict(locale);
  const money = (v: number) => fmtPrice(v, d.currency, locale);
  const seller = d.merchant ?? d.source;
  const rows: [string, React.ReactNode][] = [];
  if (d.referenceType && d.referenceType !== "none") rows.push([t.refType, t.refTypes[d.referenceType] ?? d.referenceType]);
  // Cohérence héros ↔ panneau : un prix de référence n'apparaît ici que si le héros l'affiche barré.
  if (showsRef(d)) rows.push([t.refPrice, <>{money(d.referencePrice!)}<span className="dd-note">{d.refObserved ? t.refObserved(d.historyN ?? 0) : t.refByMerchant(seller)}</span></>]);
  if (d.historyN !== undefined && d.historyN >= HISTORY_MIN_OBSERVATIONS) {
    if (d.historicalLow !== undefined) rows.push([t.histLow, money(d.historicalLow)]);
    if (d.historicalMedian !== undefined) rows.push([t.histMedian, `${money(d.historicalMedian)} · ${t.histN(d.historyN)}`]);
  } else {
    rows.push([t.histLabel, t.histTooFew]);
  }
  rows.push([t.dataQuality, t.dq[confidenceTier(d.confidence)]]);
  if (d.firstSeenAt) rows.push([t.seenSince, fmtDay(d.firstSeenAt, locale, now)]);
  const checked = d.lastSeenAt ?? generatedAt;
  if (checked) rows.push([t.lastChecked, fmtUpdated(checked, locale)]);
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

/** Partage : bouton natif (si disponible), copie du lien, sinon WhatsApp (nouvel onglet).
 * Sans JavaScript, seul le lien WhatsApp est visible (site.js révèle les boutons). */
function Share({ d, locale, url, text }: { d: PublicDeal; locale: Locale; url: string; text: string }) {
  const t = dict(locale);
  return (
    <div className="share" data-share-url={url} data-share-title={d.title} data-share-text={text} data-copied={t.copied}>
      <button type="button" className="icon-btn" data-share="native" hidden aria-label={`${t.share}: ${d.title}`}><Icon name="share" /></button>
      <button type="button" className="icon-btn" data-share="copy" hidden aria-label={t.copyLink}><Icon name="link" /></button>
      <a className="icon-btn" data-share="whatsapp" href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`} target="_blank" rel="noopener noreferrer"
        aria-label={`${t.shareWhatsApp} (${t.newTab})`}><Icon name="share" /></a>
      <span className="share-status" role="status" aria-live="polite" />
    </div>
  );
}

export default async function DealPage({ params }: P) {
  const p = await params;
  const { deals, generatedAt, now } = await getDeals();
  const d = deals.find((x) => x.slug === p.slug);
  if (!d) notFound();
  const locale = p.locale as Locale;
  const t = dict(locale);
  const city = cityOf(d);
  const cat = categoryText(locale, d.category);
  const catHref = paths.category(locale, city.slug, d.category);
  const money = (v: number) => fmtPrice(v, d.currency, locale);
  const shareUrl = `${SITE_URL}${paths.deal(locale, d.slug)}`;
  const share = t.shareText(d.title, d.price !== undefined ? money(d.price) : "", d.score !== undefined ? fmtScore(d.score, locale) : "");
  const out = outbound(d);
  const linkHost = hostOf(out.href) ?? "";
  const seller = d.merchant ?? d.attribution;
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
  const ctaLabel = d.via ? t.viewAt(d.via) : t.toOffer(seller);
  // Maillage interne : même catégorie, jamais la même action ni la même marque, pages internes seulement.
  const pk = promoKey(d), bk = brandKey(d);
  const related = pickTop(
    canonical(deals.filter((x) => x.category === d.category && x.id !== d.id && hasPage(x) && inCity(x, city) && promoKey(x) !== pk && brandKey(x) !== bk)),
    { n: 3, perCategory: 3, exclude: new Set([d.id]), now },
  ).map((x) => ({ ...x, variants: undefined, alsoAt: undefined }));
  const tl = titleLang(d.source, d.title);
  const jsonLd = d.price !== undefined ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: d.title,
    ...(tl !== "?" ? { inLanguage: HTML_LANG[tl] } : {}),
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
    { name: d.title, path: paths.deal(locale, d.slug) },
  ]);
  const shown = d.score;
  return (
    <>
      <nav className="crumbs" aria-label={t.breadcrumb}>
        <a href={catHref}><Icon name="back" size={16} /><span className="sr-only">{t.backTo(cat.label)}: </span><span aria-hidden="true">{cat.label}</span></a>
      </nav>
      <article className="deal">
        <header className="deal-head">
          <div className="deal-head-text">
            <p className="deal-seller">{seller}</p>
            <h1><DealTitle deal={d} locale={locale} /></h1>
          </div>
          <Share d={d} locale={locale} url={shareUrl} text={share} />
        </header>

        <section className="panel deal-buy" aria-label={t.facts}>
          <PriceLine deal={d} locale={locale} className="deal-price" now={now} />
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
                <span className="btn-hint"><Icon name="external" size={18} />{t.newTab}</span>
              </a>
              <span id="cta-note" className="sr-only">{t.opensSite(linkHost)}</span>
            </div>
          )}
          {out.affiliate && (
            <p className="ad-note">{t.adLink} · <a href={`${paths.page(locale, "transparenz")}#provision`}>{t.adWhy}</a></p>
          )}
        </section>

        <section className="panel deal-score" aria-labelledby="why-title">
          <h2 id="why-title">{t.whyScore}</h2>
          {shown !== undefined ? (
            <p className="verdict">
              <span aria-hidden="true"><span className="verdict-num">{fmtScore(shown, locale)}</span><span className="verdict-of">/10</span> <strong>{t.scoreTiers[scoreTier(shown)]}</strong></span>
              <span className="sr-only">{t.scoreAria(fmtScore(shown, locale), t.scoreTiers[scoreTier(shown)])}</span>
            </p>
          ) : (
            <p className="verdict"><strong>{t.scoreNa}</strong></p>
          )}
          {shown === undefined && <p className="deal-note">{t.scoreNaWhy}</p>}
          {d.scoreCap && <p className="deal-note">{t.scoreCap[d.scoreCap]}</p>}
          <Facts d={d} locale={locale} generatedAt={generatedAt} now={now} />
          <p className="source">{t.source(d.attribution)}</p>
          <a className="text-link" href={paths.page(locale, "transparenz")}>{t.howScored}<Icon name="arrow" size={16} /></a>
        </section>
      </article>

      {related.length > 0 && (
        <section className="section" aria-labelledby="related">
          <div className="section-head">
            <h2 id="related">{t.moreIn(cat.label)}</h2>
          </div>
          <DealGrid deals={related} locale={locale} now={now} labelledBy="related" />
        </section>
      )}
      <AdSlot label={t.adLabel} client={adClient()} />
      <TelegramCta locale={locale} />
      {jsonLd && <JsonLd data={jsonLd} />}
      <JsonLd data={crumbs} />
    </>
  );
}
