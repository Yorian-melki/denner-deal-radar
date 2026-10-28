"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CITIES, launchedCities, localeForPath } from "@/config/cities";
import { ConsentLink } from "@/components/Consent";
import { dict } from "@/lib/i18n";

/** En-tête et pied de page localisés d'après la ville de la route (l'export
 * statique connaît le chemin au build : pas de détection au runtime). */
export function SiteHeader({ siteName }: { siteName: string }) {
  const pathname = usePathname();
  const t = dict(localeForPath(pathname));
  const cities = launchedCities();
  return (
    <header className="top">
      <a href="#main" className="skip">{t.skip}</a>
      <div className="top-inner">
        <Link href="/" className="brand" aria-label={siteName}>
          <svg className="brand-mark" aria-hidden="true" width="26" height="26" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="15" fill="var(--ink)" />
            <circle cx="16" cy="16" r="9.5" fill="none" stroke="var(--lime)" strokeWidth="2" opacity=".55" />
            <circle cx="16" cy="16" r="4.5" fill="none" stroke="var(--lime)" strokeWidth="2" />
            <path d="M16 16 L27 9" stroke="var(--lime)" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="22.5" cy="11.6" r="2.2" fill="var(--lime)" />
          </svg>
          <span>{siteName}</span>
        </Link>
        <nav aria-label={t.nav} className="top-nav">
          {cities.map((c) => (
            <Link key={c.slug} href={`/${c.slug}`} aria-current={pathname?.startsWith(`/${c.slug}`) ? "page" : undefined}>
              {c.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ siteName }: { siteName: string }) {
  const pathname = usePathname();
  const t = dict(localeForPath(pathname));
  const upcoming = CITIES.filter((c) => !c.launched);
  return (
    <footer className="foot">
      <div className="foot-inner">
        <p className="foot-brand">{siteName}</p>
        <p>{t.footerDisclosure}</p>
        {upcoming.length > 0 && (
          <p className="muted">
            {t.soon}: {upcoming.map((c) => c.name).join(" · ")}
          </p>
        )}
        <nav className="foot-nav">
          <Link href="/transparenz">{t.transparency}</Link>
          <Link href="/datenschutz">{t.privacy}</Link>
          <Link href="/impressum">{t.imprint}</Link>
          <Link href="/agb">{t.terms}</Link>
          <Link href="/quellen">{t.sources}</Link>
          <ConsentLink />
        </nav>
      </div>
    </footer>
  );
}

/** Conteneur qui porte la langue de la route (lecteurs d'écran, césure). */
export function LangScope({ children }: { children: React.ReactNode }) {
  const locale = localeForPath(usePathname());
  return <div lang={locale} className="lang-scope">{children}</div>;
}
