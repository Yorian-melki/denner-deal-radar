import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { mainCity } from "@/config/cities";
import { ConsentBanner } from "@/components/Consent";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { adClient, warnIfMonetisationBlocked } from "@/lib/operator";
import { HTML_LANG, LOCALES, OG_LOCALE, dict, isLocale } from "@/lib/i18n";
import { ANALYTICS_TOKEN, INDEXABLE, SITE_NAME, SITE_URL, alternates, ogImage, paths } from "@/lib/site";
import "../globals.css";

/** Racine par langue : <html lang="de-CH|fr-CH|en">. Toutes les routes existent
 * dans les trois langues avec les mêmes slugs (generateStaticParams). */
warnIfMonetisationBlocked();

export const dynamicParams = false;
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

type P = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = dict(locale);
  const og = ogImage(locale, mainCity().slug);
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    title: { default: `${SITE_NAME} – ${t.tagline}`, template: `%s – ${SITE_NAME}` },
    description: t.metaDescription,
    robots: INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
    alternates: alternates("", locale),
    openGraph: { type: "website", siteName: SITE_NAME, locale: OG_LOCALE[locale], title: SITE_NAME, description: t.metaDescription, url: paths.home(locale), images: [og] },
    twitter: { card: "summary_large_image", title: SITE_NAME, description: t.metaDescription, images: [og.url] },
    icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
    formatDetection: { telephone: false, address: false, email: false },
    manifest: `/${locale}/manifest.webmanifest`,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
  ],
};

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dict(locale);
  return (
    <html lang={HTML_LANG[locale]} data-clicks={process.env.CLICKS_BINDING === "1" ? "1" : undefined}>
      <head>
        {/* Un seul script, externe (CSP script-src 'self') : cartes expirées, puces, partage,
            compteur de clics, consentement. Le postbuild le versionne (/s/site.<hash>.js). */}
        <script src="/site.js" defer />
      </head>
      <body>
        <ConsentBanner adsEnabled={!!adClient()} labels={{ text: t.consentText, accept: t.consentAccept, decline: t.consentDecline, privacy: t.privacy, privacyHref: `${paths.page(locale, "datenschutz")}#cookies` }} />
        <div className="shell">
          <SiteHeader siteName={SITE_NAME} locale={locale} />
          <main id="main" tabIndex={-1}>{children}</main>
          <SiteFooter siteName={SITE_NAME} locale={locale} />
        </div>
        {ANALYTICS_TOKEN && (
          // Cloudflare Web Analytics : sans cookie, aucune donnée personnelle (mentionné dans
          // /datenschutz seulement si ce jeton existe : lib/site.ts ANALYTICS_TOKEN).
          <script defer src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: ANALYTICS_TOKEN })} />
        )}
      </body>
    </html>
  );
}
