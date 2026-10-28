import type { City } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { DealGrid } from "@/components/DealCard";
import { Icon } from "@/components/Icon";
import { CATEGORIES } from "@/lib/categories";
import { fmtInt, fmtUpdated } from "@/lib/format";
import { categoryText, dict, type Locale } from "@/lib/i18n";
import { HOME_MIN_SCORE, HOME_MIN_SECTION, balancedSections, canonical, categoryCounts, pickTop, verifiedCount } from "@/lib/select";
import { paths, telegramUrl } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";

/** En-tête factuel : un titre, une ligne de faits, puis directement les deals.
 * Aucun montant agrégé, aucun superlatif. */
export function Intro({ city, locale, deals, generatedAt }: { city: City; locale: Locale; deals: PublicDeal[]; generatedAt: string }) {
  const t = dict(locale);
  return (
    <header className="intro">
      <h1>{t.dealsIn(city.name[locale])}</h1>
      <p className="intro-facts">
        <span>{t.factsVerified(fmtInt(verifiedCount(deals), locale))}</span>
        {/* Honnêteté « ville par ville » : le flux est surtout national ; on le dit. */}
        <span>{t.inclNational}</span>
        {generatedAt && <span>{t.updated(fmtUpdated(generatedAt, locale))}</span>}
        <a href={paths.page(locale, "transparenz")}>{t.method}</a>
      </p>
    </header>
  );
}

/** Puces de catégorie (sans compteur) : « Alle » + catégories non vides, dans l'ordre fixe. */
export function CategoryChips({ city, locale, deals, active }: { city: City; locale: Locale; deals: PublicDeal[]; active?: string }) {
  const t = dict(locale);
  const counts = categoryCounts(deals);
  const cats = CATEGORIES.filter((c) => counts.get(c.slug));
  if (!cats.length) return null;
  return (
    <nav className="chips" aria-label={t.categories}>
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

function SectionHead({ id, title, href, more }: { id: string; title: string; href?: string; more?: string }) {
  return (
    <div className="section-head">
      <h2 id={id}>{href ? <a href={href}>{title}</a> : title}</h2>
      {href && more && <a className="section-more" href={href}>{more}<Icon name="arrow" size={16} /></a>}
    </div>
  );
}

/** Page ville / accueil : titre factuel, puces, vitrine diversifiée, puis une
 * section par catégorie (même taille pour toutes ; Studis et Gratis d'abord). */
export function CityDashboard({
  city, locale, deals, generatedAt, variant,
}: { city: City; locale: Locale; deals: PublicDeal[]; generatedAt: string; variant: "home" | "city" }) {
  const t = dict(locale);
  const all = canonical(deals);
  const home = variant === "home";
  const top = pickTop(all, { minScore: home ? HOME_MIN_SCORE : undefined });
  const shown = new Set(top.map((d) => d.id));
  const sections = balancedSections(all, CATEGORIES.map((c) => c.slug), {
    perSection: home ? 3 : 4,
    minScore: home ? HOME_MIN_SCORE : undefined,
    minItems: home ? HOME_MIN_SECTION : 1,
    exclude: shown,
  });
  const counts = categoryCounts(all);
  return (
    <>
      <Intro city={city} locale={locale} deals={all} generatedAt={generatedAt} />
      <CategoryChips city={city} locale={locale} deals={all} active={variant === "city" ? "all" : undefined} />
      {top.length > 0 && (
        <section aria-labelledby="top" className="section">
          <SectionHead id="top" title={t.topToday} />
          <p className="section-note">{t.topTodayNote}</p>
          <DealGrid deals={top} locale={locale} />
        </section>
      )}
      {sections.map((s, i) => {
        const href = paths.category(locale, city.slug, s.slug);
        return (
          <div key={s.slug}>
            <section className="section" aria-labelledby={`sec-${s.slug}`}>
              <SectionHead id={`sec-${s.slug}`} title={categoryText(locale, s.slug).label} href={href} more={t.seeAll(fmtInt(counts.get(s.slug) ?? s.total, locale))} />
              <DealGrid deals={s.items} locale={locale} />
            </section>
            {/* Publicité : jamais dans une liste classée ; après la 2e section seulement. */}
            {i === 1 && <AdSlot label={t.adLabel} />}
          </div>
        );
      })}
      <TelegramCta locale={locale} />
      {home && (
        <p className="all-link"><a href={paths.city(locale, city.slug)} className="btn btn-secondary">{t.allIn(city.name[locale])}</a></p>
      )}
    </>
  );
}
