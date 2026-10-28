import Link from "next/link";
import { rewriteUrl } from "@/lib/affiliate/rewrite";
import { categoryBySlug } from "@/lib/categories";
import { categoryText, dict, intlLocale, type Locale } from "@/lib/i18n";
import { hasPage } from "@/lib/project";
import { hasRealEnd, isLowestSeen } from "@/lib/select";
import { SITE_URL, fmtDate, fmtPrice } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";
import { EndsIn } from "@/components/EndsIn";
import { OutLink } from "@/components/OutLink";
import { ShareButton } from "@/components/ShareButton";

const tier = (s: number) => (s >= 7 ? "hi" : s >= 4 ? "mid" : "lo");
export const fmtScore = (s: number, locale: Locale) =>
  s.toLocaleString(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function ScoreBadge({ score, locale = "de", size = "md" }: { score?: number; locale?: Locale; size?: "md" | "lg" }) {
  const t = dict(locale);
  if (score === undefined)
    return (
      <span className={`score score-na score-${size}`} title={t.scoreNaWhy}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{t.scoreNa}</span>
      </span>
    );
  const s = fmtScore(score, locale);
  return (
    <span className={`score score-${tier(score)} score-${size}`}>
      <span aria-hidden="true">{s}</span>
      <span className="sr-only">{t.scoreOf(s)}</span>
    </span>
  );
}

/** Explication de la note, uniquement avec des faits présents dans les données. */
export function ScoreFacts({ deal, locale }: { deal: PublicDeal; locale: Locale }) {
  const t = dict(locale);
  if (deal.score === undefined) return <p className="why-text">{t.scoreNaWhy}</p>;
  const cur = deal.currency;
  const rows: [string, string][] = [];
  if (deal.referenceType) rows.push([t.refType, t.refTypes[deal.referenceType] ?? deal.referenceType]);
  if (deal.referencePrice !== undefined) rows.push([t.refPrice, fmtPrice(deal.referencePrice, cur, locale)]);
  if (deal.discountAbs !== undefined && deal.discountAbs > 0)
    rows.push([t.youSave, `${fmtPrice(deal.discountAbs, cur, locale)}${deal.discountPct !== undefined ? ` (−${Math.round(deal.discountPct)} %)` : ""}`]);
  else if (deal.discountPct !== undefined && deal.discountPct > 0) rows.push([t.youSave, `−${Math.round(deal.discountPct)} %`]);
  if (deal.historyN !== undefined && deal.historyN > 0) {
    if (deal.historicalLow !== undefined) rows.push([t.histLow, fmtPrice(deal.historicalLow, cur, locale)]);
    if (deal.historicalMedian !== undefined) rows.push([t.histMedian, fmtPrice(deal.historicalMedian, cur, locale)]);
    rows.push(["", t.histN(deal.historyN)]);
  }
  rows.push([t.confidence, deal.confidence !== undefined ? `${Math.round(deal.confidence * 100)} %` : t.unknown]);
  return (
    <dl className="why-facts">
      {rows.map(([k, v], i) => (
        <div key={i}>
          {k && <dt>{k}</dt>}
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Note + explication en un tap (<details> natif : sans JS, accessible au clavier). */
export function ScoreWhy({ deal, locale, open = false }: { deal: PublicDeal; locale: Locale; open?: boolean }) {
  const t = dict(locale);
  return (
    <details className="why" open={open}>
      <summary>
        <ScoreBadge score={deal.score} locale={locale} />
        <span className="why-hint">{t.whyScore}</span>
      </summary>
      <div className="why-body">
        <ScoreFacts deal={deal} locale={locale} />
        <Link href="/transparenz" className="why-link">{t.howScored}</Link>
      </div>
    </details>
  );
}

export function shareInfo(deal: PublicDeal, locale: Locale) {
  const t = dict(locale);
  // Page du deal si elle existe ; sinon le lien d'origine (jamais le lien affilié).
  const url = hasPage(deal) ? `${SITE_URL}/deal/${deal.slug}` : deal.url;
  const price = deal.price !== undefined ? fmtPrice(deal.price, deal.currency, locale) : "";
  const score = deal.score !== undefined ? fmtScore(deal.score, locale) : "";
  return { url, text: t.shareText(deal.title, price, score) };
}

/** Lien sortant principal (réécriture affiliée au build, astérisque si rémunéré). */
export function OfferButton({ deal, locale, className = "btn btn-primary", short = false }: { deal: PublicDeal; locale: Locale; className?: string; short?: boolean }) {
  const t = dict(locale);
  const out = rewriteUrl(deal.url);
  const seller = deal.merchant ?? deal.attribution;
  return (
    <OutLink className={className} href={out.href} rel={out.rel} affiliate={out.affiliate} programme={out.programme} dealId={deal.id} source={deal.source} affTitle={t.affTitle}>
      {short ? <>{t.toOfferShort}<span className="sr-only">{t.atMerchant(seller)}</span></> : t.toOffer(seller)} <span aria-hidden="true">↗</span>
    </OutLink>
  );
}

export function TimeInfo({ deal, locale }: { deal: PublicDeal; locale: Locale }) {
  const t = dict(locale);
  if (hasRealEnd(deal)) return <EndsIn endsAt={deal.endsAt!} locale={locale} label={t.until(fmtDate(deal.endsAt, locale))} />;
  if (deal.lifecycle === "UPCOMING" && deal.startsAt) return <span className="starts">{t.from(fmtDate(deal.startsAt, locale))}</span>;
  return null;
}

export function DealCard({ deal, locale = "de", showCategory = false }: { deal: PublicDeal; locale?: Locale; showCategory?: boolean }) {
  const t = dict(locale);
  const share = shareInfo(deal, locale);
  const lowest = isLowestSeen(deal);
  const cat = showCategory ? categoryBySlug(deal.category) : undefined;
  const hasRef = deal.referencePrice !== undefined && deal.price !== undefined && deal.referencePrice > deal.price;
  return (
    <article className="card">
      <div className="card-top">
        <ScoreWhy deal={deal} locale={locale} />
        <div className="tags">
          {cat && <span className="tag tag-cat">{categoryText(locale, cat.slug, cat).label}</span>}
          {lowest && <span className="tag tag-low" title={t.lowestSeenTitle(deal.historyN!)}>↓ {t.lowestSeen}</span>}
          {deal.requiresStudent && <span className="tag tag-student">{t.studentsOnly}</span>}
        </div>
      </div>
      <h3 className="card-title">
        {hasPage(deal) ? <Link href={`/deal/${deal.slug}`}>{deal.title}</Link> : deal.title}
      </h3>
      <p className="price-row">
        {deal.price !== undefined && <strong className="price">{fmtPrice(deal.price, deal.currency, locale)}</strong>}
        {hasRef && <s className="was">{fmtPrice(deal.referencePrice, deal.currency, locale)}</s>}
        {deal.discountPct !== undefined && deal.discountPct > 0 && <span className="pct">−{Math.round(deal.discountPct)}%</span>}
      </p>
      <p className="card-meta">
        <span className="seller">{deal.merchant ?? deal.attribution}</span>
        {deal.alsoAt?.length ? <span className="also" title={deal.alsoAt.join(", ")}>{t.alsoAt(deal.alsoAt.length)}</span> : null}
        <TimeInfo deal={deal} locale={locale} />
      </p>
      <div className="card-actions">
        <OfferButton deal={deal} locale={locale} short />
        <ShareButton text={share.text} url={share.url} title={deal.title} locale={locale} />
      </div>
    </article>
  );
}

export function DealGrid({ deals, locale = "de", showCategory = false }: { deals: PublicDeal[]; locale?: Locale; showCategory?: boolean }) {
  if (!deals.length) return <p className="empty">{dict(locale).empty}</p>;
  return (
    <div className="grid">
      {deals.map((d) => <DealCard key={d.slug} deal={d} locale={locale} showCategory={showCategory} />)}
    </div>
  );
}
