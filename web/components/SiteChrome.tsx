import { CITIES, launchedCities, mainCity } from "@/config/cities";
import { ConsentLink } from "@/components/Consent";
import { Icon } from "@/components/Icon";
import { LangSwitch } from "@/components/LangSwitch";
import { activeProgrammes } from "@/lib/affiliate/rewrite";
import { SPONSORS, adClient } from "@/lib/operator";
import { colon } from "@/lib/format";
import { DICTS, HTML_LANG, LOCALES, dict, type Locale } from "@/lib/i18n";
import { paths } from "@/lib/site";

/** Logotype : tuile monogramme (initiale de SITE_NAME) + mot. Renommer = changer une variable. */
export function BrandMark({ name, tile = true }: { name: string; tile?: boolean }) {
  return (
    <>
      {tile && <span className="logo-tile" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>}
      <span className="wordmark">{name}</span>
    </>
  );
}

/** En-tête unique, identique sur toutes les routes : marque · ville · langue.
 * La ville est un vrai menu (details/summary, sans JS) : la ville active + les prochaines. */
export function SiteHeader({ siteName, locale }: { siteName: string; locale: Locale }) {
  const t = dict(locale);
  const cities = launchedCities();
  const city = mainCity();
  const upcoming = CITIES.filter((c) => !c.launched);
  return (
    <header className="top">
      <a href="#main" className="skip">{t.skip}</a>
      <div className="top-inner">
        <a href={paths.city(locale, city.slug)} className="brand"><BrandMark name={siteName} /></a>
        {/* Menu de ville seulement quand il y a un choix (round 3, item 5 ; « bald » : pied de page). */}
        {cities.length > 1 && <details className="city-menu">
          <summary aria-label={`${t.cityMenu}: ${city.name[locale]}`}>
            <span aria-hidden="true">{city.name[locale]}</span><Icon name="chevron" size={16} />
          </summary>
          <div className="city-pop">
            <nav aria-label={t.nav}>
              <ul role="list">
                {cities.map((c) => <li key={c.slug}><a href={paths.city(locale, c.slug)} aria-current={c.slug === city.slug ? "true" : undefined}>{c.name[locale]}</a></li>)}
              </ul>
            </nav>
            {upcoming.length > 0 && <p className="city-soon">{colon(t.soon, locale)} {upcoming.map((c) => c.name[locale]).join(", ")}</p>}
          </div>
        </details>}
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
          <p className="foot-brand"><BrandMark name={siteName} tile={false} /></p>
          <p>{t.footerDisclosure(activeProgrammes().length)}</p>
          <p>{t.footerFacts(activeProgrammes().length, SPONSORS.length)}</p>
          {upcoming.length > 0 && <p>{colon(t.soon, locale)} {upcoming.map((c) => c.name[locale]).join(" · ")}</p>}
        </div>
        <nav className="foot-nav" aria-label={t.footerNav}>
          {links.map(([p, label]) => <a key={p} href={paths.page(locale, p)}>{label}</a>)}
          {/* Lien de consentement seulement si la publicité existe (round 3, item 25). */}
          {adClient() && <ConsentLink label={t.cookieSettings} privacyHref={`${paths.page(locale, "datenschutz")}#cookies`} />}
        </nav>
      </div>
    </footer>
  );
}
