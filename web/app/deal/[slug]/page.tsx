import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CITIES } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { TelegramCta } from "@/components/CityDashboard";
import { OfferButton, ScoreBadge, ScoreFacts, TimeInfo, fmtScore, shareInfo } from "@/components/DealCard";
import { ShareButton } from "@/components/ShareButton";
import { categoryBySlug } from "@/lib/categories";
import { getDeals } from "@/lib/data";
import { categoryTitle, dict } from "@/lib/i18n";
import { hasPage } from "@/lib/project";
import { isLowestSeen } from "@/lib/select";
import { SITE_NAME, fmtDate, fmtPrice, ogImage } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";

// Export statique : une page par deal NOTÉ (les non-notés renvoient directement
// au marchand depuis les cartes — pas de contenu mince, moins de fichiers).
export const dynamicParams = false;
export async function generateStaticParams() {
  const { deals } = await getDeals();
  return deals.filter(hasPage).map((d) => ({ slug: d.slug }));
}

type P = { params: Promise<{ slug: string }> };

async function find(slug: string) {
  const { deals } = await getDeals();
  return deals.find((d) => d.slug === slug);
}

/** Ville (et donc langue) d'un deal : sa ville de flux, sinon la première ville. */
const cityOf = (d: PublicDeal) => (d.cities.includes("*") ? CITIES[0] : CITIES.find((c) => c.slug === d.cities[0]) ?? CITIES[0]);

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const d = await find((await params).slug);
  if (!d) return { robots: { index: false } };
  const locale = cityOf(d).locale;
  const t = dict(locale);
  const price = d.price !== undefined ? fmtPrice(d.price, d.currency, locale) : "";
  const score = d.score !== undefined ? fmtScore(d.score, locale) : "";
  const summary = t.shareText(d.title, price, score);
  return {
    title: price ? `${d.title} · ${price}` : d.title,
    description: `${summary}${d.discountPct ? ` (−${Math.round(d.discountPct)}%)` : ""} · ${d.merchant ?? d.attribution}`,
    alternates: { canonical: `/deal/${d.slug}` },
    openGraph: {
      type: "article", siteName: SITE_NAME, title: summary, description: `${d.merchant ?? d.attribution}`,
      url: `/deal/${d.slug}`, locale: `${locale}_CH`, images: [ogImage(cityOf(d).slug)],
    },
  };
}

export default async function DealPage({ params }: P) {
  const d = await find((await params).slug);
  if (!d) notFound();
  const city = cityOf(d);
  const locale = city.locale;
  const t = dict(locale);
  const cat = categoryBySlug(d.category);
  const share = shareInfo(d, locale);
  const lowest = isLowestSeen(d);
  const hasRef = d.referencePrice !== undefined && d.price !== undefined && d.referencePrice > d.price;
  const jsonLd = d.price !== undefined ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: d.title,
    ...(d.merchant ? { brand: { "@type": "Brand", name: d.merchant } } : {}),
    offers: {
      "@type": "Offer",
      price: d.price.toFixed(2),
      priceCurrency: d.currency,
      url: d.url,
      ...(d.endsAt ? { priceValidUntil: d.endsAt.slice(0, 10) } : {}),
      ...(d.merchant ? { seller: { "@type": "Organization", name: d.merchant } } : {}),
    },
  } : null;
  return (
    <article className="deal" lang={locale}>
      {cat && (
        <p className="crumbs">
          <Link href={`/${city.slug}`}>{city.name}</Link> <span aria-hidden="true">›</span>{" "}
          <Link href={`/${city.slug}/${cat.slug}`}>{categoryTitle(locale, cat)}</Link>
        </p>
      )}
      <div className="deal-grid">
        <div className="deal-main">
          <div className="tags">
            {lowest && <span className="tag tag-low" title={t.lowestSeenTitle(d.historyN!)}>↓ {t.lowestSeen}</span>}
            {d.requiresStudent && <span className="tag tag-student">{t.studentsOnly}</span>}
          </div>
          <h1>{d.title}</h1>
          <p className="deal-price">
            {d.price !== undefined && <strong className="price">{fmtPrice(d.price, d.currency, locale)}</strong>}
            {hasRef && <s className="was">{fmtPrice(d.referencePrice, d.currency, locale)}</s>}
            {d.discountPct !== undefined && d.discountPct > 0 && <span className="pct">−{Math.round(d.discountPct)}%</span>}
          </p>
          <p className="card-meta">
            <span className="seller">{d.merchant ?? d.attribution}</span>
            <TimeInfo deal={d} locale={locale} />
          </p>
          <div className="card-actions deal-actions">
            <OfferButton deal={d} locale={locale} className="btn btn-primary btn-lg" />
            <ShareButton text={share.text} url={share.url} title={d.title} locale={locale} />
          </div>
          <ul className="facts">
            {d.unitPrice !== undefined && d.unit && <li>{t.unitPrice}: {d.unitPrice.toFixed(2)} {d.unit}</li>}
            {d.startsAt && <li>{t.from(fmtDate(d.startsAt, locale))}</li>}
            {d.couponCode && <li>{t.code}: <code>{d.couponCode}</code></li>}
            {d.conditions.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
        <aside className="deal-score" aria-labelledby="why-title">
          <div className="deal-score-head">
            <ScoreBadge score={d.score} locale={locale} size="lg" />
            <h2 id="why-title">{t.whyScore}</h2>
          </div>
          <ScoreFacts deal={d} locale={locale} />
          <Link href="/transparenz" className="why-link">{t.howScored}</Link>
        </aside>
      </div>
      <p className="muted">{t.source(d.attribution)}</p>
      <TelegramCta locale={locale} />
      <AdSlot />
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
    </article>
  );
}
