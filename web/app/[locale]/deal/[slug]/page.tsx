import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CITIES, mainCity } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { TelegramCta } from "@/components/CityDashboard";
import { DealGrid, PriceLine, ScoreBadge, dateText, outbound, subscriptionText } from "@/components/DealCard";
import { EndsIn } from "@/components/EndsIn";
import { Icon } from "@/components/Icon";
import { JsonLd, breadcrumbLd } from "@/components/JsonLd";
import { OutLink } from "@/components/OutLink";
import { ShareButton } from "@/components/ShareButton";
import { conditionLines } from "@/lib/conditions";
import { getDeals } from "@/lib/data";
import { fmtPct, fmtPrice, fmtScore } from "@/lib/format";
import { OG_LOCALE, categoryText, dict, isLocale, type Locale } from "@/lib/i18n";
import { hostOf } from "@/lib/outbound";
import { hasPage, inCity } from "@/lib/project";
import { HISTORY_MIN_OBSERVATIONS, canonical, confidenceTier, hasRealEnd, isLowestSeen, pickTop, savingPct, scoreTier, unitSaving } from "@/lib/select";
import { SITE_NAME, SITE_URL, alternates, ogImage, paths } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";

// Export statique : une page par deal NOTÉ ≥ 5 (les autres cartes renvoient
// directement au marchand — pas de contenu mince, moins de fichiers).
export const dynamicParams = false;
export async function generateStaticParams() {
  const { deals } = await getDeals();
  return deals.filter(hasPage).map((d) => ({ slug: d.slug }));
}

type P = { params: Promise<{ locale: string; slug: string }> };

async function find(slug: string) {
  const { deals } = await getDeals();
  return deals.find((d) => d.slug === slug);
}

/** Ville d'un deal : sa ville de flux, sinon la ville principale. */
const cityOf = (d: PublicDeal) => (d.cities.includes("*") ? mainCity() : CITIES.find((c) => c.slug === d.cities[0]) ?? mainCity());

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await params;
  const d = await find(p.slug);
  if (!d || !isLocale(p.locale)) return { robots: { index: false } };
  const locale = p.locale;
  const t = dict(locale);
  const price = d.price !== undefined ? fmtPrice(d.price, d.currency, locale) : "";
  const score = d.score !== undefined ? fmtScore(d.score, locale) : "";
  const summary = t.shareText(d.title, price, score);
  return {
    title: price ? `${d.title} · ${price}` : d.title,
    description: `${summary} · ${d.merchant ?? d.attribution}`,
    alternates: alternates(`/deal/${d.slug}`, locale),
    openGraph: {
      type: "article", siteName: SITE_NAME, title: summary, description: `${d.merchant ?? d.attribution}`,
      url: paths.deal(locale, d.slug), locale: OG_LOCALE[locale], images: [ogImage(locale, cityOf(d).slug)],
    },
  };
}

function Facts({ d, locale }: { d: PublicDeal; locale: Locale }) {
  const t = dict(locale);
  const money = (v: number) => fmtPrice(v, d.currency, locale);
  const rows: [string, React.ReactNode][] = [];
  if (d.referenceType && d.referenceType !== "none") rows.push([t.refType, t.refTypes[d.referenceType] ?? d.referenceType]);
  if (d.referencePrice !== undefined && (d.refKind === "comparable" || d.refKind === "vendor")) rows.push([t.refPrice, money(d.referencePrice)]);
  const saving = unitSaving(d), pct = savingPct(d);
  if (saving !== undefined) rows.push([t.youSave, `${money(saving)}${pct !== undefined ? ` (−${fmtPct(pct, locale)})` : ""}`]);
  if (d.historyN !== undefined && d.historyN >= HISTORY_MIN_OBSERVATIONS) {
    if (d.historicalLow !== undefined) rows.push([t.histLow, money(d.historicalLow)]);
    if (d.historicalMedian !== undefined) rows.push([t.histMedian, `${money(d.historicalMedian)} · ${t.histN(d.historyN)}`]);
  } else {
    rows.push(["", t.histTooFew]);
  }
  rows.push([t.dataQuality, t.dq[confidenceTier(d.confidence)]]);
  return (
    <dl className="facts">
      {rows.map(([k, v], i) => (
        <div key={i} className={k ? undefined : "facts-wide"}>
          {k && <dt>{k}</dt>}
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function DealPage({ params }: P) {
  const p = await params;
  const { deals } = await getDeals();
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
  const ctaLabel = d.via ? t.viewAt(d.via) : t.toOffer(seller);
  const saving = unitSaving(d), pct = savingPct(d);
  const date = dateText(d, locale);
  const sub = subscriptionText(d, locale);
  const conds = conditionLines(d.conds, t, locale, money);
  if (d.unitPrice !== undefined && d.unit && d.unit !== "month") conds.unshift(`${t.unitPrice}: ${money(d.unitPrice)}${t.units[d.unit]}`);
  if (d.requiresStudent) conds.unshift(t.studentsOnly);
  if (d.trial) conds.unshift(t.trial);
  // Maillage interne : meilleurs deals de la même catégorie (mêmes règles que les vitrines).
  const related = pickTop(canonical(deals.filter((x) => x.category === d.category && x.id !== d.id && inCity(x, city))), { n: 3, perCategory: 3, exclude: new Set([d.id]) });
  // Données structurées : pas de marque inventée, pas de disponibilité supposée ;
  // l'URL de l'offre seulement si elle mène chez le marchand (pas chez un agrégateur).
  const jsonLd = d.price !== undefined ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: d.title,
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
  return (
    <>
      <nav className="crumbs" aria-label={t.home}>
        <a href={catHref}><Icon name="back" size={16} />{cat.label}</a>
      </nav>
      <article className="deal">
        <header className="deal-head">
          <p className="deal-seller">{d.via ? `${seller} · ${t.via(d.via)}` : seller}</p>
          <h1>{d.title}</h1>
        </header>

        <div className="deal-layout">
          <section className="panel deal-buy" aria-label={t.facts}>
            <PriceLine deal={d} locale={locale} className="deal-price" />
            {saving !== undefined && d.referenceType && (
              <p className="deal-saving">{t.youSave} {money(saving)}{pct !== undefined ? ` (−${fmtPct(pct, locale)})` : ""} · {t.refTypes[d.referenceType]}</p>
            )}
            {saving === undefined && d.refKind === "vendor" && d.referencePrice !== undefined && <p className="deal-note">{t.vendorPrice(money(d.referencePrice))}</p>}
            {saving === undefined && d.refKind === "vendor_pct" && d.discountPct !== undefined && d.discountPct >= 1 && <p className="deal-note">{t.vendorPct(fmtPct(d.discountPct, locale))}</p>}
            {d.integrity === "above_usual_price" && <p className="deal-note">{t.aboveUsual}</p>}
            {sub && <p className="deal-note">{sub}</p>}
            {date && (
              <p className="deal-date">
                {hasRealEnd(d) && !(d.startsAt && new Date(d.startsAt).getTime() > Date.now())
                  ? <EndsIn endsAt={d.endsAt!} label={date} hm={t.endsInHM} m={t.endsInM} ended={t.ended} />
                  : date}
              </p>
            )}
            {isLowestSeen(d) && <p className="deal-note">{t.lowestSeen}</p>}
            {conds.length > 0 && (
              <ul className="conds" aria-label={t.conditions}>
                {conds.map((c) => <li key={c}>{c}</li>)}
              </ul>
            )}
            {d.couponCode && <p className="deal-note">{t.code}: <code>{d.couponCode}</code></p>}
            <div className="deal-actions">
              <OutLink className="btn btn-primary btn-lg" href={out.href} rel={out.rel} affiliate={out.affiliate} programme={out.programme} dealId={d.id} source={d.source}
                srNote={out.affiliate ? `${t.adLink}, ${t.opensSite(linkHost)}` : t.opensSite(linkHost)}>
                {ctaLabel}<Icon name="external" size={18} />
              </OutLink>
              <ShareButton text={share} url={shareUrl} title={d.title} label={t.share} />
            </div>
            {out.affiliate && (
              <p className="ad-note">{t.adLink} · <a href={`${paths.page(locale, "transparenz")}#provision`}>{t.adWhy}</a></p>
            )}
          </section>

          <section className="panel deal-score" aria-labelledby="why-title">
            <h2 id="why-title">{t.whyScore}</h2>
            <div className="deal-verdict">
              <ScoreBadge score={d.score} locale={locale} size="lg" />
              <p>
                {d.score !== undefined
                  ? <><strong>{t.scoreTiers[scoreTier(d.score)]}</strong> · {fmtScore(d.score, locale)} {t.outOf10}</>
                  : <strong>{t.scoreNa}</strong>}
              </p>
            </div>
            {d.score === undefined && <p className="deal-note">{t.scoreNaWhy}</p>}
            {d.scoreCap && <p className="deal-note">{t.scoreCap[d.scoreCap]}</p>}
            <Facts d={d} locale={locale} />
            <p className="source">{t.source(d.attribution)}</p>
            <a className="text-link" href={paths.page(locale, "transparenz")}>{t.howScored}<Icon name="arrow" size={16} /></a>
          </section>
        </div>
      </article>

      {related.length > 0 && (
        <section className="section" aria-labelledby="related">
          <div className="section-head">
            <h2 id="related">{t.moreIn(cat.label)}</h2>
          </div>
          <DealGrid deals={related} locale={locale} />
        </section>
      )}
      <AdSlot label={t.adLabel} />
      <TelegramCta locale={locale} />
      {jsonLd && <JsonLd data={jsonLd} />}
      <JsonLd data={crumbs} />
    </>
  );
}
