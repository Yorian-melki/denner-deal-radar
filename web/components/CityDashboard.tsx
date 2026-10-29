import type { City } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { adClient } from "@/lib/operator";
import { DealGrid } from "@/components/DealCard";
import { Icon } from "@/components/Icon";
import { CATEGORIES } from "@/lib/categories";
import { fmtInt, fmtScore, fmtUpdated } from "@/lib/format";
import { categoryText, dict, type Locale } from "@/lib/i18n";
import {
  HOME_MIN_SCORE, HOME_MIN_SECTION, MARKDOWN_PER_STORE, PER_BRAND, SECTION_N, TOP_MIN_SCORE, balancedSections, canonical, categoryCounts, homeOrder,
  pickMarkdowns, pickShowcase,
} from "@/lib/select";
import { paths, telegramUrl } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";

/** Sections de la page ville après la vitrine (round 2, item 37) : le reste n'est
 * accessible que par les puces (Haushalt, Gutscheine, Shopping…). */
export const CITY_SECTIONS = ["studenten-rabatte", "gratis", "supermarkt-aktionen"];

/** En-tête factuel : un titre, UNE ligne de faits, puis directement les deals.
 * Aucun montant agrégé, aucun superlatif. Séparateurs « · » en CSS (non lus). */
export function Intro({ city, locale, deals, generatedAt }: { city: City; locale: Locale; deals: PublicDeal[]; generatedAt: string }) {
  const t = dict(locale);
  return (
    <header className="intro">
      <h1>{t.dealsIn(city.name[locale])}</h1>
      <p className="intro-facts">
        <span>{t.factsCount(fmtInt(deals.length, locale))}</span>
        {generatedAt && <span>{t.updated(fmtUpdated(generatedAt, locale))}</span>}
        <a href={paths.page(locale, "transparenz")}>{t.method}</a>
      </p>
    </header>
  );
}

/** Puces visibles d'emblée (round 3, item 18) ; les autres sous « Mehr ». */
export const PRIMARY_CHIPS = ["supermarkt-aktionen", "studenten-rabatte", "gratis", "tech-deals", "handy-abos", "haushalt"];

/** Puces de catégorie (sans compteur) : 6 catégories puis « Mehr » (sans JS : details/summary).
 * La catégorie active est promue dans la rangée au build. Jamais de puce « Alle » (round 4, item 6 :
 * deux rangées commençaient par « Alle » ; le retour à la ville est le lien de fil d'Ariane).
 * La puce active est ramenée au centre au chargement (site.js, data-chips). */
export function CategoryChips({ city, locale, deals, active }: { city: City; locale: Locale; deals: PublicDeal[]; active?: string }) {
  const t = dict(locale);
  const counts = categoryCounts(deals);
  const cats = CATEGORIES.filter((c) => counts.get(c.slug));
  if (!cats.length) return null;
  const primary = PRIMARY_CHIPS.filter((s) => counts.get(s));
  if (active && active !== "all" && counts.get(active) && !primary.includes(active)) primary.push(active);
  const rest = cats.filter((c) => !primary.includes(c.slug));
  const chip = (slug: string) => (
    <a key={slug} href={paths.category(locale, city.slug, slug)} className="chip" aria-current={active === slug ? "page" : undefined}>
      {categoryText(locale, slug).label}
    </a>
  );
  return (
    <nav className="chips" aria-label={t.categories} data-chips="">
      {primary.map(chip)}
      {rest.length > 0 && (
        <details className="chip-more">
          <summary className="chip">{t.moreChip}</summary>
          {rest.map((c) => chip(c.slug))}
        </details>
      )}
    </nav>
  );
}

/** État vide utile : pourquoi c'est vide + où aller (catégories non vides). */
export function EmptyState({ city, locale, deals, exclude }: { city: City; locale: Locale; deals: PublicDeal[]; exclude?: string }) {
  const t = dict(locale);
  const counts = categoryCounts(deals);
  const cats = CATEGORIES.filter((c) => c.slug !== exclude && counts.get(c.slug)).slice(0, 6);
  return (
    <div className="empty-state">
      <h2>{t.emptyTitle}</h2>
      <p>{t.emptyHint}</p>
      {cats.length > 0 && (
        <p className="empty-links">
          {cats.map((c) => <a key={c.slug} href={paths.category(locale, city.slug, c.slug)} className="chip">{categoryText(locale, c.slug).label}</a>)}
        </p>
      )}
    </div>
  );
}

export function TelegramCta({ locale }: { locale: Locale }) {
  const url = telegramUrl();
  if (!url) return null;
  const t = dict(locale);
  return (
    <aside className="tg">
      <div>
        <h2 className="tg-title">{t.telegramTitle}</h2>
        <p>{t.telegramText}</p>
      </div>
      <a className="btn btn-secondary" href={url} target="_blank" rel="noopener noreferrer">{t.telegramCta}</a>
    </aside>
  );
}

/** Titre de section + UN lien « Alle N » (contexte complet pour les lecteurs d'écran). Le titre est
 * toujours visible, sur la même ligne que le lien (round 4, item 6 : plus de « Alle 702 → » orphelin). */
function SectionHead({ id, title, href, more, moreSr }: { id: string; title: string; href?: string; more?: string; moreSr?: string }) {
  return (
    <div className="section-head">
      <h2 id={id}>{title}</h2>
      {href && more && (
        <a className="section-more" href={href}>
          <span aria-hidden="true">{more}</span>
          <span className="sr-only">{moreSr ?? more}</span>
          <Icon name="arrow" size={16} />
        </a>
      )}
    </div>
  );
}

/** Page ville : titre factuel, puces, vitrine stricte (prix « statt » observé, note ≥ 7, ≤ 6) quand
 * elle existe, puis « Grösste Rabatte – laut Händler » (round 4, item 3 : toujours rempli, base
 * dite dans le titre), puis les sections (3 cartes chacune), ordre calculé (lib/select.ts homeOrder). */
export function CityDashboard({ city, locale, deals, generatedAt, now }: { city: City; locale: Locale; deals: PublicDeal[]; generatedAt: string; now: Date }) {
  const t = dict(locale);
  const all = canonical(deals);
  const top = pickShowcase(all, now);
  const shown = new Set(top.map((d) => d.id));
  const markdowns = pickMarkdowns(all, now, shown);
  for (const d of markdowns) shown.add(d.id);
  const sections = homeOrder(balancedSections(all, CITY_SECTIONS, { perSection: SECTION_N, minScore: HOME_MIN_SCORE, minItems: HOME_MIN_SECTION, exclude: shown, now }));
  const counts = categoryCounts(all);
  const method = `${paths.page(locale, "transparenz")}#reihenfolge`;
  return (
    <>
      <Intro city={city} locale={locale} deals={all} generatedAt={generatedAt} />
      <CategoryChips city={city} locale={locale} deals={all} active="all" />
      {top.length > 0 && (
        <section aria-labelledby="top" className="section section-first">
          <SectionHead id="top" title={t.topToday} />
          <DealGrid deals={top} locale={locale} showcase now={now} labelledBy="top" />
          <p className="section-foot">{t.topRule(fmtScore(TOP_MIN_SCORE, locale), PER_BRAND)} · <a href={method}>{t.method}</a></p>
        </section>
      )}
      {markdowns.length > 0 && (
        <section aria-labelledby="markdowns" className={top.length ? "section" : "section section-first"}>
          <SectionHead id="markdowns" title={t.markdownsTitle} />
          <p id="markdowns-desc" className="section-note">{t.markdownsRule(MARKDOWN_PER_STORE)} · <a href={method}>{t.method}</a></p>
          <DealGrid deals={markdowns} locale={locale} showcase now={now} labelledBy="markdowns" describedBy="markdowns-desc" trimMobile />
        </section>
      )}
      {sections.map((s, i) => {
        const href = paths.category(locale, city.slug, s.slug);
        const label = categoryText(locale, s.slug).label;
        const n = fmtInt(counts.get(s.slug) ?? s.total, locale);
        // Première section rendue (sans bloc au-dessus) : titre explicite.
        const first = top.length === 0 && markdowns.length === 0 && i === 0;
        const title = first ? t.homeFirst[s.slug] ?? label : label;
        return (
          <section key={s.slug} className={first ? "section section-first" : "section"} aria-labelledby={`sec-${s.slug}`}>
            <SectionHead id={`sec-${s.slug}`} title={title} href={href} more={t.seeAll(n)} moreSr={t.seeAllIn(n, label)} />
            <DealGrid deals={s.items} locale={locale} now={now} labelledBy={`sec-${s.slug}`} />
          </section>
        );
      })}
      {/* Publicité : jamais dans une liste classée ; après la dernière section, hauteur réservée. */}
      <AdSlot label={t.adLabel} client={adClient()} />
      <TelegramCta locale={locale} />
    </>
  );
}
