import Link from "next/link";
import type { City } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { DealGrid } from "@/components/DealCard";
import { CATEGORIES, categoryBySlug } from "@/lib/categories";
import { categoryText, dict, type Locale } from "@/lib/i18n";
import { balancedSections, categoryCounts, pickTop, weeklySavings } from "@/lib/select";
import { fmtDateTime, fmtMoneyRound, telegramUrl } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";

export function ScoreLegend({ locale }: { locale: Locale }) {
  const t = dict(locale);
  const cls = ["score-hi", "score-mid", "score-lo", "score-na"];
  return (
    <div className="legend">
      <p className="legend-title">{t.legendTitle}</p>
      <ul>
        {t.legendRows.map(([range, text], i) => (
          <li key={range}>
            <span className={`legend-chip ${cls[i]}`}>{range}</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <Link href="/transparenz" className="legend-link">{t.howScored}</Link>
    </div>
  );
}

export function Hero({ city, deals, generatedAt, headingLevel = 1 }: { city: City; deals: PublicDeal[]; generatedAt: string; headingLevel?: 1 | 2 }) {
  const t = dict(city.locale);
  const asOf = generatedAt ? new Date(generatedAt) : new Date();
  const { total, count } = weeklySavings(deals, asOf);
  const currency = deals.find((d) => d.currency)?.currency ?? "CHF";
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <section className="hero" aria-labelledby={`hero-${city.slug}`}>
      <div className="hero-main">
        <p className="hero-kicker">
          <span className="dot" aria-hidden="true" />
          {t.heroKicker(city.name)}
        </p>
        {total >= 1 ? (
          <H id={`hero-${city.slug}`} className="hero-title">
            <span className="hero-amount">{fmtMoneyRound(total, currency, city.locale)}</span>{" "}
            <span className="hero-label">{t.heroSavings}</span>
          </H>
        ) : (
          <H id={`hero-${city.slug}`} className="hero-title">{t.heroFallback(city.name)}</H>
        )}
        <p className="hero-lead">{t.heroLead}</p>
        <p className="hero-meta">
          {t.activeOffers(deals.length)}
          {generatedAt && <> · {t.updated(fmtDateTime(generatedAt, city.locale))}</>}
        </p>
        {total >= 1 && (
          <details className="hero-note">
            <summary>{t.heroHow}</summary>
            <p>{t.heroSavingsNote(count)}</p>
          </details>
        )}
      </div>
      <ScoreLegend locale={city.locale} />
    </section>
  );
}

/** Puces de catégorie, collantes sous l'en-tête : « Toutes » + catégories non vides.
 * `active` : slug de la catégorie courante, ou "all" sur la page ville. */
export function CategoryChips({ city, deals, active }: { city: City; deals: PublicDeal[]; active?: string }) {
  const t = dict(city.locale);
  const counts = categoryCounts(deals);
  const cats = CATEGORIES.filter((c) => counts.get(c.slug));
  if (!cats.length) return null;
  return (
    <nav className="chips-bar" aria-label={t.categories}>
      <div className="chips">
        <Link href={`/${city.slug}`} className="chip" aria-current={active === "all" ? "page" : undefined}>
          {t.allChip}
        </Link>
        {cats.map((c) => (
          <Link key={c.slug} href={`/${city.slug}/${c.slug}`} className="chip" aria-current={active === c.slug ? "page" : undefined}>
            {categoryText(city.locale, c.slug, c).label}
            <span className="chip-n">{counts.get(c.slug)}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** État vide utile : pourquoi c'est vide + où aller (catégories non vides). */
export function EmptyState({ city, deals, exclude }: { city: City; deals: PublicDeal[]; exclude?: string }) {
  const t = dict(city.locale);
  const counts = categoryCounts(deals);
  const cats = CATEGORIES.filter((c) => c.slug !== exclude && counts.get(c.slug)).slice(0, 6);
  return (
    <div className="empty-state">
      <svg aria-hidden="true" width="40" height="40" viewBox="0 0 32 32" className="empty-icon">
        <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" opacity=".35" />
        <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="2" opacity=".6" />
        <path d="M16 16 L26 10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <h2>{t.emptyTitle}</h2>
      <p>{t.emptyHint}</p>
      {cats.length > 0 && (
        <p className="empty-links">
          {cats.map((c) => (
            <Link key={c.slug} href={`/${city.slug}/${c.slug}`} className="chip">
              {categoryText(city.locale, c.slug, c).label}
              <span className="chip-n">{counts.get(c.slug)}</span>
            </Link>
          ))}
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
      <a className="btn btn-tg" href={url} target="_blank" rel="noopener noreferrer">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2 1.8 11.7c-1-.3-1-1 .2-1.5L20.6 3c.9-.3 1.6.2 1.3 1.3Z" />
        </svg>
        {t.telegramCta}
      </a>
    </aside>
  );
}

/** Tableau de bord d'une ville : accroche chiffrée, top diversifié, puces de
 * catégorie, sections de taille égale (l'épicerie ne noie pas le reste). */
export function CityDashboard({
  city, deals, generatedAt, variant,
}: { city: City; deals: PublicDeal[]; generatedAt: string; variant: "home" | "city" }) {
  const t = dict(city.locale);
  const top = pickTop(deals);
  const shown = new Set(top.map((d) => d.id));
  const sections = balancedSections(deals, CATEGORIES.map((c) => c.slug), {
    perSection: variant === "home" ? 4 : 6,
    scoredOnly: variant === "home",
    exclude: shown,
  });
  return (
    <>
      <Hero city={city} deals={deals} generatedAt={generatedAt} />
      <CategoryChips city={city} deals={deals} active={variant === "city" ? "all" : undefined} />
      <section aria-labelledby={`top-${city.slug}`} className="block">
        <div className="block-head">
          <h2 id={`top-${city.slug}`}>{t.topToday}</h2>
          <p className="block-note">{t.topTodayNote}</p>
        </div>
        <DealGrid deals={top} locale={city.locale} showCategory />
      </section>
      <TelegramCta locale={city.locale} />
      <AdSlot />
      {sections.map((s) => {
        const cat = categoryBySlug(s.slug)!;
        const label = categoryText(city.locale, s.slug, cat).label;
        return (
          <section key={s.slug} className="block" aria-labelledby={`sec-${city.slug}-${s.slug}`}>
            <div className="block-head">
              <h2 id={`sec-${city.slug}-${s.slug}`}>
                <Link href={`/${city.slug}/${s.slug}`}>{label}</Link>
              </h2>
              <Link className="block-more" href={`/${city.slug}/${s.slug}`}>{t.seeAll(s.total)}</Link>
            </div>
            <DealGrid deals={s.items} locale={city.locale} />
          </section>
        );
      })}
      {variant === "home" && (
        <p className="all-link"><Link href={`/${city.slug}`} className="btn btn-ghost">{t.allIn(city.name)}</Link></p>
      )}
    </>
  );
}
