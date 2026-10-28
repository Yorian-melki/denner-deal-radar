/** Carte deal : 4 lignes, un seul lien (la carte entière), aucun bouton.
 *  1. titre · note (badge neutre ; teinte seulement pour « Top »)
 *  2. prix (+ « statt » seulement avec une référence vérifiée)
 *  3. méta : marchand · économie ou mention neutre · date de fin publiée
 *  4. au plus 2 mentions qui changent le prix réel (Lidl Plus, ab 3 Stück…)
 * Composant serveur : zéro JavaScript par carte. */
import { CARD_CONDITIONS, conditionLines, guessLang } from "@/lib/conditions";
import { fmtDay, fmtPct, fmtPrice, fmtScore } from "@/lib/format";
import { HTML_LANG, dict, type Locale } from "@/lib/i18n";
import { rewriteUrl } from "@/lib/affiliate/rewrite";
import { hostOf } from "@/lib/outbound";
import { hasPage } from "@/lib/project";
import { hasRealEnd, isLowestSeen, savingPct, scoreTier, unitSaving } from "@/lib/select";
import { paths } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { OutLink } from "@/components/OutLink";

export function ScoreBadge({ score, locale, size = "md" }: { score?: number; locale: Locale; size?: "md" | "lg" }) {
  const t = dict(locale);
  if (score === undefined) return null;
  const s = fmtScore(score, locale);
  const tier = scoreTier(score);
  return (
    <span className={`badge badge-${size}${tier === "top" ? " badge-top" : ""}`} role="img" aria-label={t.scoreAria(s, t.scoreTiers[tier])}>
      {s}
    </span>
  );
}

/** Prix, avec unité (/Monat, /kg) et « statt » seulement si la référence est vérifiée. */
export function PriceLine({ deal, locale, className = "card-price" }: { deal: PublicDeal; locale: Locale; className?: string }) {
  const t = dict(locale);
  if (deal.price === undefined) return null;
  const pct = savingPct(deal);
  const showRef = deal.verifiedRef && deal.referencePrice !== undefined && pct !== undefined;
  const unit = deal.unit === "month" ? t.units.month : "";
  return (
    <p className={className}>
      <span className="sr-only">{t.now} </span>
      <span className="price">{deal.price === 0 ? t.free : fmtPrice(deal.price, deal.currency, locale)}</span>
      {unit && deal.price !== 0 && <span className="price-unit">{unit}</span>}
      {showRef && (
        <span className="was">
          {t.insteadOf(fmtPrice(deal.referencePrice, deal.currency, locale))}
          <span className="sr-only">, {t.cheaperBy(fmtPct(pct!, locale))}</span>
        </span>
      )}
    </p>
  );
}

/** Ce que vaut la réduction, en une phrase factuelle et neutre. */
export function valueText(deal: PublicDeal, locale: Locale): string | undefined {
  const t = dict(locale);
  const saving = unitSaving(deal);
  if (saving !== undefined && deal.referenceType) {
    return t.savingVs(fmtPrice(saving, deal.currency, locale), t.refShort[deal.referenceType] ?? t.refTypes[deal.referenceType]);
  }
  if (deal.integrity === "above_usual_price") return t.aboveUsual;
  if (deal.refKind === "vendor" && deal.referencePrice !== undefined) return t.vendorPrice(fmtPrice(deal.referencePrice, deal.currency, locale));
  if (deal.refKind === "vendor_pct" && deal.discountPct !== undefined && deal.discountPct >= 1) return t.vendorPct(fmtPct(deal.discountPct, locale));
  return undefined;
}

/** « bis Mi 29.10. » (date de fin publiée) ou « ab Mo 03.11. » (pas encore commencé). */
export function dateText(deal: PublicDeal, locale: Locale, now = new Date()): string | undefined {
  const t = dict(locale);
  if (deal.startsAt && new Date(deal.startsAt).getTime() > now.getTime()) return t.from(fmtDay(deal.startsAt, locale, now));
  if (hasRealEnd(deal)) return t.until(fmtDay(deal.endsAt, locale, now));
  return undefined;
}

/** Ligne obligatoire des abonnements : durée, prix ensuite, frais, total 24 mois. */
export function subscriptionText(deal: PublicDeal, locale: Locale): string | undefined {
  const t = dict(locale);
  const s = deal.sub;
  if (!s) return undefined;
  const money = (v: number) => fmtPrice(v, deal.currency, locale);
  const parts: string[] = [];
  if (s.months !== undefined) parts.push(t.subCommit(s.months));
  if (s.after !== undefined && s.promoMonths !== undefined) parts.push(t.subAfter(money(s.after), s.promoMonths));
  if (s.fee !== undefined && s.fee > 0) parts.push(t.subFee(money(s.fee)));
  if (s.total24 !== undefined) parts.push(t.subTotal(money(s.total24)));
  return parts.join(" · ") || undefined;
}

/** Mentions de la carte : conditions qui changent le prix réel + faits utiles. */
export function cardNotes(deal: PublicDeal, locale: Locale, max = 2): string[] {
  const t = dict(locale);
  const out: string[] = [];
  const money = (v: number) => fmtPrice(v, deal.currency, locale);
  out.push(...conditionLines(deal.conds.filter((c) => CARD_CONDITIONS.has(c.code)), t, locale, money).filter((s) => s !== t.condOther));
  if (deal.requiresStudent && deal.category !== "studenten-rabatte") out.push(t.studentsOnly);
  if (deal.trial) out.push(t.trial);
  if (isLowestSeen(deal)) out.push(t.lowestSeen);
  if (deal.variants) out.push(t.variants(deal.variants));
  else if (deal.alsoAt?.length) out.push(t.alsoAt(deal.alsoAt.length));
  return out.slice(0, max);
}

export const dealHref = (deal: PublicDeal, locale: Locale) => (hasPage(deal) ? paths.deal(locale, deal.slug) : undefined);

/** Lien sortant du deal (réécriture affiliée au build, jamais pour un lien tiers désemballé). */
export function outbound(deal: PublicDeal) {
  return deal.noAff ? { href: deal.url, rel: "noopener noreferrer", affiliate: false as const, programme: undefined } : rewriteUrl(deal.url);
}

export function DealCard({ deal, locale, headingLevel = 3 }: { deal: PublicDeal; locale: Locale; headingLevel?: 2 | 3 }) {
  const t = dict(locale);
  const href = dealHref(deal, locale);
  const value = valueText(deal, locale);
  const date = dateText(deal, locale);
  const sub = subscriptionText(deal, locale);
  const notes = cardNotes(deal, locale);
  const titleId = `t-${deal.slug}`;
  // Titre du marchand dans une autre langue que la page : lu avec la bonne phonétique.
  const tl = guessLang(deal.title);
  const titleLang = tl !== "?" && tl !== locale ? HTML_LANG[tl] : undefined;
  const H = headingLevel === 2 ? "h2" : "h3";
  let link: React.ReactNode;
  let adNote: string | undefined;
  if (href) {
    link = <a className="card-link" href={href}>{deal.title}</a>;
  } else {
    const out = outbound(deal);
    adNote = out.affiliate ? t.adLink : undefined;
    const host = hostOf(out.href) ?? "";
    link = (
      <OutLink className="card-link" href={out.href} rel={out.rel} affiliate={out.affiliate} programme={out.programme} dealId={deal.id} source={deal.source} srNote={t.opensSite(deal.via ?? host)}>
        {deal.title}<Icon name="external" size={16} className="card-ext" />
      </OutLink>
    );
  }
  const seller = deal.merchant ?? deal.attribution;
  return (
    <article className="card" aria-labelledby={titleId} data-ends={hasRealEnd(deal) ? deal.endsAt : undefined}>
      <div className="card-head">
        <H className="card-title" id={titleId} lang={titleLang}>{link}</H>
        <ScoreBadge score={deal.score} locale={locale} />
      </div>
      <PriceLine deal={deal} locale={locale} />
      <p className="card-meta">
        <span className="seller">{seller}</span>
        {!href && deal.via && <span>{t.via(deal.via)}</span>}
        {value && <span>{value}</span>}
        {date && <span>{date}</span>}
      </p>
      {sub && <p className="card-sub">{sub}</p>}
      {(notes.length > 0 || adNote) && (
        <p className="card-notes">
          {notes.map((n) => <span key={n} className="note">{n}</span>)}
          {adNote && <span className="note note-ad">{adNote}</span>}
        </p>
      )}
    </article>
  );
}

export function DealGrid({ deals, locale }: { deals: PublicDeal[]; locale: Locale }) {
  if (!deals.length) return <p className="empty">{dict(locale).empty}</p>;
  return (
    <div className="grid">
      {deals.map((d) => <DealCard key={d.slug} deal={d} locale={locale} />)}
    </div>
  );
}
