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
import { categoryBySlug } from "@/lib/categories";
import { BADGE_MIN_SCORE, VERIFY_MIN_CONFIDENCE, hasPage } from "@/lib/project";
import { hasRealEnd, isLowestSeen, savingPct, scoreTier, showsRef, shownScore, unitSaving } from "@/lib/select";
import { paths } from "@/lib/site";
import { titleLang } from "@/lib/titleLang";
import { AGGREGATOR_SOURCES, sourceName } from "@/lib/merchant";
import type { PublicDeal } from "@/lib/types";

/** Note affichable : seulement si le prix « statt » est rendu sur la même carte, et
 * jamais sous 5/10 (lib/project.ts shownScore, round 3, arbitrage 1). */
export { shownScore, showsRef };

export function ScoreBadge({ score, locale, size = "md", hidden = false }: { score?: number; locale: Locale; size?: "md" | "lg"; hidden?: boolean }) {
  const t = dict(locale);
  if (score === undefined || score < BADGE_MIN_SCORE) return null;
  const s = fmtScore(score, locale);
  const tier = scoreTier(score);
  const cls = `badge badge-${size}${tier === "top" ? " badge-top" : ""}`;
  // « /10 » visible (round 4, arbitrage 2) : jamais lu comme « CHF 6.90 » ni comme un degré d'alcool.
  const body = <>{s}<span className="badge-of">/10</span></>;
  if (hidden) return <span className={cls} aria-hidden="true">{body}</span>;
  return <span className={cls} role="img" aria-label={t.scoreAria(s, t.scoreTiers[tier])}>{body}</span>;
}

/** Note d'une CARTE : masquée tant que nos relevés ne confirment pas le prix « statt » (round 4, arbitrage 2) —
 * 13 pastilles « 6.9 » identiques ne disent rien ; la pastille « −N % » neutre prend la place. */
export const cardScore = (deal: PublicDeal) => (deal.refObserved && deal.scoreCap !== "unchecked" ? shownScore(deal) : undefined);

/** Titre affiché dans une langue : titre reconstruit (réductions étudiantes), sinon celui de la source. */
export const displayTitle = (deal: PublicDeal, locale: Locale) => deal.titles?.[locale] ?? deal.title;

/** Titre dans sa langue d'origine (lang seulement sur le texte, pas sur les notes sr). */
export function DealTitle({ deal, locale }: { deal: PublicDeal; locale: Locale }) {
  const own = deal.titles?.[locale];
  if (own) return <>{own}</>;
  const tl = titleLang(deal.source, deal.title);
  return tl !== "?" && tl !== locale ? <span lang={HTML_LANG[tl]}>{deal.title}</span> : <>{deal.title}</>;
}

/** Réduction annoncée en « bis zu » / « up to » dans le titre d'origine. */
const UP_TO = /\b(bis zu|up to|jusqu[’']à)\b/i;

/** Valeur d'une carte sans prix : le pourcentage annoncé (« −35% », « bis −60% ») dans
 * l'emplacement du prix, suivi de « laut Anbieter » (round 3, item 4). */
export function pctValue(deal: PublicDeal, locale: Locale): string | undefined {
  if (deal.price !== undefined || deal.refKind !== "vendor_pct" || deal.discountPct === undefined || deal.discountPct < 1 || deal.discountPct >= 100) return undefined;
  const v = `−${fmtPct(deal.discountPct, locale)}`;
  return UP_TO.test(deal.title) ? `${dict(locale).upTo} ${v}` : v;
}

/** Pourquoi une page deal n'affiche pas de note (une ligne, round 3, item 12). */
export function noScoreReason(deal: PublicDeal): string {
  if (categoryBySlug(deal.category)?.unrated) return "category";
  if (deal.refKind === "vendor_pct") return "pct";
  if (deal.refKind === "vendor") return "vendor";
  if (deal.refKind === "none") return "none";
  if ((deal.confidence ?? 0) < VERIFY_MIN_CONFIDENCE) return "data";
  return "hidden";
}

/** Nom du marchand tel qu'affiché partout (jamais un agrégateur, voir lib/merchant.ts) ; inconnu :
 * le nom de la source qui le publie (« laut Preispirat »), jamais « Händler unbekannt » (round 4, item 12). */
export const sellerName = (deal: PublicDeal, _locale?: Locale) => deal.merchant ?? sourceName(deal.source);

/** Prix, avec unité (/Monat) et « statt » seulement si le prix du marchand est affichable.
 * Préfixe sr : « jetzt » si achetable maintenant, sinon la date de début (« ab Do 29.10. »).
 * `attrib` (héros de la page deal) : « statt 27.35 laut Denner » tant que nos relevés ne
 * confirment pas la référence. Une seule économie par carte : le % lu par les lecteurs
 * d'écran n'est ajouté que si la ligne d'économie en CHF est absente. */
export function PriceLine({ deal, locale, className = "card-price", now, attrib = true }: { deal: PublicDeal; locale: Locale; className?: string; now?: Date; attrib?: boolean }) {
  const t = dict(locale);
  if (deal.price === undefined) {
    const v = pctValue(deal, locale);
    return v ? <p className={className}><span className="price">{v}</span><span className="was">{t.byVendor}</span></p> : null;
  }
  const pct = savingPct(deal);
  const unit = deal.unit === "month" ? t.units.month : "";
  const prefix = deal.upcoming ? dateText(deal, locale, now) ?? "" : t.now;
  const was = showsRef(deal) ? fmtAmount(deal.referencePrice!) : undefined;
  // Valeur en tête (round 4, item 5) : montant, pastille neutre « −56 % », puis « statt 27.35 · laut Denner ».
  return (
    <p className={className}>
      <span className="sr-only">{prefix} </span>
      <span className="price">{deal.price === 0 ? t.free : <><span className="cur">{deal.currency}</span>{"\u202f"}<span className="amt">{fmtAmount(deal.price)}</span></>}</span>
      {unit && deal.price !== 0 && <span className="price-unit">{unit}</span>}
      {was && pct !== undefined && (
        <span className="pct"><span aria-hidden="true">−{fmtPct(pct, locale)}</span><span className="sr-only">{t.cheaperBy(fmtPct(pct, locale))}</span></span>
      )}
      {was && <span className="was">{attrib && !deal.refObserved ? t.insteadOfBy(was, sellerName(deal, locale)) : t.insteadOf(was)}</span>}
    </p>
  );
}

/** Accent de la carte : l'économie en CHF, une seule fois, seulement avec un prix « statt ».
 * « als zuvor » seulement si nos relevés confirment la référence (refObserved). */
export function savingText(deal: PublicDeal, locale: Locale): string | undefined {
  const saving = unitSaving(deal);
  if (saving === undefined || !showsRef(deal)) return undefined;
  return dict(locale).savingLine(fmtPrice(saving, deal.currency, locale), deal.referenceType ?? "merchant_previous", !!deal.refObserved, sellerName(deal, locale));
}

/** Sans prix « statt » : ce que dit la source, en une phrase neutre (jamais d'économie chiffrée). */
export function valueText(deal: PublicDeal, locale: Locale): string | undefined {
  const t = dict(locale);
  if (showsRef(deal)) return undefined;
  if (deal.integrity === "above_usual_price") return t.aboveUsual;
  if (deal.refKind === "vendor" && deal.referencePrice !== undefined) return t.vendorPrice(fmtPrice(deal.referencePrice, deal.currency, locale));
  if (deal.refKind === "vendor_pct" && deal.discountPct !== undefined && deal.discountPct >= 1 && !pctValue(deal, locale)) return t.vendorPct(fmtPct(deal.discountPct, locale));
  return undefined;
}

/** « bis heute », « bis morgen », « bis Mi 29.10. » (date de fin publiée) ; « ab morgen »,
 * « ab Mo 03.11. » (pas encore commencé). Jamais d'heures ni de minutes. */
export function dateText(deal: Pick<PublicDeal, "startsAt" | "endsAt" | "endsInferred" | "upcoming"> & { category?: string }, locale: Locale, now = new Date()): string | undefined {
  const t = dict(locale);
  // Événement d'un soir (≤ 18 h ou sans fin) : « Mi 9.12., 20:00 » ; « ab » seulement sur plusieurs jours (round 3, item 23).
  if (deal.category === "events" && deal.startsAt) {
    const start = new Date(deal.startsAt).getTime(), end = deal.endsAt ? new Date(deal.endsAt).getTime() : NaN;
    if (!Number.isFinite(end) || end - start <= 18 * 3600 * 1000) return eventTime(deal.startsAt, locale, now);
  }
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

/** « Mi 9.12., 20:00 » / « mer. 9 déc., 20 h » / « Wed 9 Dec, 8 pm » (heure omise si minuit). */
export function eventTime(iso: string, locale: Locale, now = new Date()): string {
  const day = fmtDay(iso, locale, now);
  const p = new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Zurich" }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0), m = p.find((x) => x.type === "minute")?.value ?? "00";
  if (h === 0 && m === "00") return day;
  if (locale === "fr") return `${day}, ${h} h${m === "00" ? "" : ` ${m}`}`;
  if (locale === "en") return `${day}, ${h % 12 || 12}${m === "00" ? "" : `:${m}`} ${h < 12 ? "am" : "pm"}`;
  return `${day}, ${String(h).padStart(2, "0")}:${m}`;
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
  else if (s.promoUnknown) parts.push(t.subPromoUnknown);
  else if (s.fee === undefined) parts.push(t.subFeeUnknown);
  return parts.join(" · ") || undefined;
}

/** Ligne quantité des cartes épicerie (round 3, item 14) : « 6 × 75 cl · CHF 16.27/l ».
 * Sans donnée : « Menge: siehe Anbieter » (jamais un prix sans quantité sans le dire). */
export function unitLine(deal: PublicDeal, locale: Locale): string | undefined {
  if (deal.category !== "supermarkt-aktionen" || deal.price === undefined) return undefined;
  const t = dict(locale);
  const parts: string[] = [];
  if (deal.size?.text) parts.push(deal.size.text);
  else if (deal.size?.pieces) parts.push(t.pieces(deal.size.pieces));
  if (deal.unitPrice !== undefined && deal.unit && deal.unit !== "month") parts.push(`${fmtPrice(deal.unitPrice, deal.currency, locale)}${t.units[deal.unit]}`);
  // Sans quantité ni prix unitaire : rien (round 4, item 25), plus de « Menge: siehe Händler » répété.
  return parts.length ? parts.join(" · ") : undefined;
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
  const t = dict(locale);
  const href = dealHref(deal, locale);
  const value = valueText(deal, locale);
  const date = dateText(deal, locale, now);
  const sub = subscriptionText(deal, locale);
  const notes = cardNotes(deal, locale);
  const H = headingLevel === 2 ? "h2" : "h3";
  const seller = deal.merchant;
  // Source agrégée : « via Preispirat » (promesse de /transparenz) ; Studis : « Konto nötig ».
  const via = AGGREGATOR_SOURCES.has(deal.source) ? t.viaSource(sourceName(deal.source)) : undefined;
  const account = deal.category === "studenten-rabatte" ? t.accountNeeded : undefined;
  const unit = unitLine(deal, locale);
  return (
    <li className="card" data-observed={deal.refObserved ? "" : undefined}
      data-ends={hasRealEnd(deal) ? deal.endsAt : undefined}
      data-store-end={showcase && deal.inStore && hasRealEnd(deal) ? deal.endsAt : undefined}>
      <div className="card-head">
        <H className="card-title">
          {href ? <a className="card-link" href={href}><DealTitle deal={deal} locale={locale} /></a> : <DealTitle deal={deal} locale={locale} />}
        </H>
        <ScoreBadge score={cardScore(deal)} locale={locale} />
      </div>
      <PriceLine deal={deal} locale={locale} now={now} />
      {unit && <p className="card-unit">{unit}</p>}
      <p className="card-meta">
        {seller && <span className="seller">{seller}</span>}
        {via && <span>{via}</span>}
        {account && <span>{account}</span>}
        {value && <span>{value}</span>}
        {date && <span data-date="">{hasRealEnd(deal) && !deal.upcoming ? <time dateTime={deal.endsAt}>{date}</time> : date}</span>}
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

export function DealGrid({ deals, locale, showcase = false, now, labelledBy, describedBy, trimMobile = false }: { deals: PublicDeal[]; locale: Locale; showcase?: boolean; now?: Date; labelledBy?: string; describedBy?: string; trimMobile?: boolean }) {
  if (!deals.length) return <p className="empty">{dict(locale).empty}</p>;
  return (
    <ul className={trimMobile ? "grid grid-trim" : "grid"} role="list" aria-labelledby={labelledBy} aria-describedby={describedBy} data-showcase={showcase || undefined}>
      {deals.map((d) => <DealCard key={d.slug} deal={d} locale={locale} showcase={showcase} now={now} />)}
    </ul>
  );
}
