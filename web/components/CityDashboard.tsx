import type { City } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { adClient } from "@/lib/operator";
import { DealGrid } from "@/components/DealCard";
import { Icon } from "@/components/Icon";
import { CATEGORIES } from "@/lib/categories";
import { fmtInt, fmtScore, fmtUpdated } from "@/lib/format";
import { categoryText, dict, type Locale } from "@/lib/i18n";
import { HOME_MIN_SCORE, HOME_MIN_SECTION, PER_BRAND, SECTION_N, TOP_MIN_SCORE, balancedSections, canonical, categoryCounts, pickShowcase } from "@/lib/select";
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

/** Puces de catégorie (sans compteur) : « Alle » + catégories non vides, dans l'ordre fixe.
 * La puce active est ramenée au centre au chargement (site.js, data-chips). */
export function CategoryChips({ city, locale, deals, active }: { city: City; locale: Locale; deals: PublicDeal[]; active?: string }) {
  const t = dict(locale);
  const counts = categoryCounts(deals);
  const cats = CATEGORIES.filter((c) => counts.get(c.slug));
  if (!cats.length) return null;
  return (
    <nav className="chips" aria-label={t.categories} data-chips="">
      <a href={paths.city(locale, city.slug)} className="chip" aria-current={active === "all" ? "page" : undefined}>{t.allChip}</a>
      {cats.map((c) => (
        <a key={c.slug} href={paths.category(locale, city.slug, c.slug)} className="chip" aria-current={active === c.slug ? "page" : undefined}>
          {categoryText(locale, c.slug).label}
        </a>
      ))}
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

/** Titre de section + UN lien « Alle N » (contexte complet pour les lecteurs d'écran). */
function SectionHead({ id, title, href, more, moreSr, srOnlyMobile }: { id: string; title: string; href?: string; more?: string; moreSr?: string; srOnlyMobile?: boolean }) {
  return (
    <div className="section-head">
      <h2 id={id} className={srOnlyMobile ? "sr-mobile" : undefined}>{title}</h2>
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

/** Page ville : titre factuel, puces, vitrine stricte (prix « statt », note ≥ 7, ≤ 6),
 * puis Studis, Gratis et Supermarkt (3 cartes chacune). */
export function CityDashboard({ city, locale, deals, generatedAt, now }: { city: City; locale: Locale; deals: PublicDeal[]; generatedAt: string; now: Date }) {
  const t = dict(locale);
  const all = canonical(deals);
  const top = pickShowcase(all, now);
  const shown = new Set(top.map((d) => d.id));
  const sections = balancedSections(all, CITY_SECTIONS, { perSection: SECTION_N, minScore: HOME_MIN_SCORE, minItems: HOME_MIN_SECTION, exclude: shown, now });
  const counts = categoryCounts(all);
  return (
    <>
      <Intro city={city} locale={locale} deals={all} generatedAt={generatedAt} />
      <CategoryChips city={city} locale={locale} deals={all} active="all" />
      {top.length > 0 && (
        <section aria-labelledby="top" className="section section-first">
          <SectionHead id="top" title={t.topToday} srOnlyMobile />
          <DealGrid deals={top} locale={locale} showcase now={now} labelledBy="top" />
          <p className="section-foot">{t.topRule(fmtScore(TOP_MIN_SCORE, locale), PER_BRAND)} · <a href={`${paths.page(locale, "transparenz")}#reihenfolge`}>{t.method}</a></p>
        </section>
      )}
      {sections.map((s) => {
        const href = paths.category(locale, city.slug, s.slug);
        const label = categoryText(locale, s.slug).label;
        const n = fmtInt(counts.get(s.slug) ?? s.total, locale);
        return (
          <section key={s.slug} className="section" aria-labelledby={`sec-${s.slug}`}>
            <SectionHead id={`sec-${s.slug}`} title={label} href={href} more={t.seeAll(n)} moreSr={`${t.seeAll(n)}: ${label}`} />
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
