import { CITIES, launchedCities, mainCity } from "@/config/cities";
import { ConsentLink } from "@/components/Consent";
import { LangSwitch } from "@/components/LangSwitch";
import { activeProgrammes } from "@/lib/affiliate/rewrite";
import { DICTS, HTML_LANG, LOCALES, dict, type Locale } from "@/lib/i18n";
import { paths } from "@/lib/site";

/** Mot-symbole : le nom seul (SITE_NAME), même rendu partout. Renommer = changer une variable. */
export function BrandMark({ name }: { name: string }) {
  return <span className="wordmark">{name}</span>;
}

/** En-tête unique, identique sur toutes les routes : marque · ville · langue. Une seule barre collante. */
export function SiteHeader({ siteName, locale }: { siteName: string; locale: Locale }) {
  const t = dict(locale);
  const cities = launchedCities();
  const city = mainCity();
  return (
    <header className="top">
      <a href="#main" className="skip">{t.skip}</a>
      <div className="top-inner">
        <a href={paths.home(locale)} className="brand"><BrandMark name={siteName} /></a>
        <nav aria-label={t.nav} className="top-nav">
          {cities.length === 1 ? (
            <a href={paths.city(locale, city.slug)} className="top-city">{city.name[locale]}</a>
          ) : (
            cities.map((c) => <a key={c.slug} href={paths.city(locale, c.slug)} className="top-city">{c.name[locale]}</a>)
          )}
        </nav>
        <LangSwitch current={locale} label={t.language} langs={LOCALES.map((l) => ({ code: l, name: DICTS[l].langName, hreflang: HTML_LANG[l] }))} />
      </div>
    </header>
  );
}

export function SiteFooter({ siteName, locale }: { siteName: string; locale: Locale }) {
  const t = dict(locale);
  const upcoming = CITIES.filter((c) => !c.launched);
  const links: [string, string][] = [
    ["transparenz", t.transparency],
    ["quellen", t.sources],
    ["datenschutz", t.privacy],
    ["agb", t.terms],
    ["impressum", t.imprint],
  ];
  return (
    <footer className="foot">
      <div className="foot-inner">
        <div className="foot-about">
          <p className="foot-brand"><BrandMark name={siteName} /></p>
          <p>{t.footerDisclosure}</p>
          <p>{t.footerFacts(activeProgrammes().length)}</p>
          {upcoming.length > 0 && <p>{t.soon}: {upcoming.map((c) => c.name[locale]).join(" · ")}</p>}
        </div>
        <nav className="foot-nav" aria-label={t.transparency}>
          {links.map(([p, label]) => <a key={p} href={paths.page(locale, p)}>{label}</a>)}
          <ConsentLink label={t.cookieSettings} privacyHref={`${paths.page(locale, "datenschutz")}#cookies`} />
        </nav>
      </div>
    </footer>
  );
}
