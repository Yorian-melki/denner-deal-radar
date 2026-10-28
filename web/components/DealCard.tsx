/** Carte deal — grammaire fixe (round 2, item 26), un seul lien (la carte entière),
 * qui mène TOUJOURS à la page interne du deal (arbitrage 4 : la seule sortie vers un
 * site tiers est le bouton de la page deal). Composant serveur : zéro JavaScript.
 *  1. titre · note (badge seulement à partir de 5/10)
 *  2. « CHF 13.15  statt 35.85 » (statt = prix du marchand, seulement s'il est affichable)
 *  3. accent « CHF 22.70 günstiger als zuvor » (seulement avec un prix « statt »)
 *  4. méta : marchand · date (« bis heute », « ab morgen », « bis Mi 28.10. »)
 *  5. au plus 2 mentions qui changent le prix réel (Lidl Plus, ab 3 Stück…) */
import { CARD_CONDITIONS, conditionLines } from "@/lib/conditions";
import { dayDiff, fmtAmount, fmtDay, fmtPct, fmtPrice, fmtScore } from "@/lib/format";
import { HTML_LANG, dict, type Locale } from "@/lib/i18n";
import { rewriteUrl } from "@/lib/affiliate/rewrite";
import { BADGE_MIN_SCORE, hasPage } from "@/lib/project";
import { hasRealEnd, isLowestSeen, savingPct, scoreTier, unitSaving } from "@/lib/select";
import { paths } from "@/lib/site";
import { titleLang } from "@/lib/titleLang";
import type { PublicDeal } from "@/lib/types";

/** Note affichable : jamais de badge sous 5/10 (en dessous : prix et marchand seulement). */
export const shownScore = (d: Pick<PublicDeal, "score">) => (d.score !== undefined && d.score >= BADGE_MIN_SCORE ? d.score : undefined);

export function ScoreBadge({ score, locale, size = "md", hidden = false }: { score?: number; locale: Locale; size?: "md" | "lg"; hidden?: boolean }) {
  const t = dict(locale);
  if (score === undefined || score < BADGE_MIN_SCORE) return null;
  const s = fmtScore(score, locale);
  const tier = scoreTier(score);
  const cls = `badge badge-${size}${tier === "top" ? " badge-top" : ""}`;
  if (hidden) return <span className={cls} aria-hidden="true">{s}</span>;
  return <span className={cls} role="img" aria-label={t.scoreAria(s, t.scoreTiers[tier])}>{s}</span>;
}

/** Le prix « statt » du marchand est-il affiché ? (même règle pour la carte, le héros et le panneau). */
export const showsRef = (d: PublicDeal) => d.verifiedRef && d.referencePrice !== undefined && savingPct(d) !== undefined;

/** Titre dans sa langue d'origine (lang seulement sur le texte, pas sur les notes sr). */
export function DealTitle({ deal, locale }: { deal: PublicDeal; locale: Locale }) {
  const tl = titleLang(deal.source, deal.title);
  return tl !== "?" && tl !== locale ? <span lang={HTML_LANG[tl]}>{deal.title}</span> : <>{deal.title}</>;
}

/** Prix, avec unité (/Monat) et « statt » seulement si le prix du marchand est affichable.
 * Préfixe sr : « jetzt » si achetable maintenant, sinon la date de début (« ab Do 29.10. »). */
export function PriceLine({ deal, locale, className = "card-price", now }: { deal: PublicDeal; locale: Locale; className?: string; now?: Date }) {
  const t = dict(locale);
  if (deal.price === undefined) return null;
  const pct = savingPct(deal);
  const unit = deal.unit === "month" ? t.units.month : "";
  const prefix = deal.upcoming ? dateText(deal, locale, now) ?? "" : t.now;
  return (
    <p className={className}>
      <span className="sr-only">{prefix} </span>
      <span className="price">{deal.price === 0 ? t.free : fmtPrice(deal.price, deal.currency, locale)}</span>
      {unit && deal.price !== 0 && <span className="price-unit">{unit}</span>}
      {showsRef(deal) && (
        <span className="was">
          {t.insteadOf(fmtAmount(deal.referencePrice!))}
          <span className="sr-only"> {deal.currency}, {t.cheaperBy(fmtPct(pct!, locale))}</span>
        </span>
      )}
    </p>
  );
}

/** Accent de la carte : l'économie en CHF, une seule fois, seulement avec un prix « statt ». */
export function savingText(deal: PublicDeal, locale: Locale): string | undefined {
  const saving = unitSaving(deal);
  if (saving === undefined || !showsRef(deal)) return undefined;
  return dict(locale).savingLine(fmtPrice(saving, deal.currency, locale), deal.referenceType ?? "merchant_previous");
}

/** Sans prix « statt » : ce que dit la source, en une phrase neutre (jamais d'économie chiffrée). */
export function valueText(deal: PublicDeal, locale: Locale): string | undefined {
  const t = dict(locale);
  if (showsRef(deal)) return undefined;
  if (deal.integrity === "above_usual_price") return t.aboveUsual;
  if (deal.refKind === "vendor" && deal.referencePrice !== undefined) return t.vendorPrice(fmtPrice(deal.referencePrice, deal.currency, locale));
  if (deal.refKind === "vendor_pct" && deal.discountPct !== undefined && deal.discountPct >= 1) return t.vendorPct(fmtPct(deal.discountPct, locale));
  return undefined;
}

/** « bis heute », « bis morgen », « bis Mi 29.10. » (date de fin publiée) ; « ab morgen »,
 * « ab Mo 03.11. » (pas encore commencé). Jamais d'heures ni de minutes. */
export function dateText(deal: Pick<PublicDeal, "startsAt" | "endsAt" | "endsInferred" | "upcoming">, locale: Locale, now = new Date()): string | undefined {
  const t = dict(locale);
  if (deal.startsAt && (deal.upcoming || new Date(deal.startsAt).getTime() > now.getTime())) {
    return dayDiff(deal.startsAt, now) === 1 ? t.fromTomorrow : t.from(fmtDay(deal.startsAt, locale, now));
  }
  if (hasRealEnd(deal)) {
    const dd = dayDiff(deal.endsAt!, now);
    if (dd <= 0) return t.untilToday;
    if (dd === 1) return t.untilTomorrow;
    return t.until(fmtDay(deal.endsAt, locale, now));
  }
  return undefined;
}

/** Ligne obligatoire des abonnements : durée, prix ensuite, frais, total 24 mois
 * (total seulement si frais et prix ensuite sont connus, voir lib/project.ts). */
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
  else if (s.fee === undefined) parts.push(t.subFeeUnknown);
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

export function DealCard({ deal, locale, headingLevel = 3, showcase = false, now }: { deal: PublicDeal; locale: Locale; headingLevel?: 2 | 3; showcase?: boolean; now?: Date }) {
  const href = dealHref(deal, locale);
  const saving = savingText(deal, locale);
  const value = valueText(deal, locale);
  const date = dateText(deal, locale, now);
  const sub = subscriptionText(deal, locale);
  const notes = cardNotes(deal, locale);
  const titleId = `t-${deal.slug}`;
  const H = headingLevel === 2 ? "h2" : "h3";
  const seller = deal.merchant ?? deal.attribution;
  return (
    <li className="card" aria-labelledby={titleId}
      data-ends={hasRealEnd(deal) ? deal.endsAt : undefined}
      data-store-end={showcase && deal.inStore && hasRealEnd(deal) ? deal.endsAt : undefined}>
      <div className="card-head">
        <H className="card-title" id={titleId}>
          {href ? <a className="card-link" href={href}><DealTitle deal={deal} locale={locale} /></a> : <DealTitle deal={deal} locale={locale} />}
        </H>
        <ScoreBadge score={shownScore(deal)} locale={locale} />
      </div>
      <PriceLine deal={deal} locale={locale} now={now} />
      {saving && <p className="card-save">{saving}</p>}
      <p className="card-meta">
        <span className="seller">{seller}</span>
        {value && <span>{value}</span>}
        {date && <span>{date}</span>}
      </p>
      {sub && <p className="card-sub">{sub}</p>}
      {notes.length > 0 && (
        <p className="card-notes">
          {notes.map((n) => <span key={n} className="note">{n}</span>)}
        </p>
      )}
    </li>
  );
}

export function DealGrid({ deals, locale, showcase = false, now, labelledBy }: { deals: PublicDeal[]; locale: Locale; showcase?: boolean; now?: Date; labelledBy?: string }) {
  if (!deals.length) return <p className="empty">{dict(locale).empty}</p>;
  return (
    <ul className="grid" role="list" aria-labelledby={labelledBy} data-showcase={showcase || undefined}>
      {deals.map((d) => <DealCard key={d.slug} deal={d} locale={locale} showcase={showcase} now={now} />)}
    </ul>
  );
}
