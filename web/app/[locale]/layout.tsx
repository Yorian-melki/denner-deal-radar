import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { mainCity } from "@/config/cities";
import { ConsentProvider } from "@/components/Consent";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { inter } from "@/lib/font";
import { adClient, warnIfMonetisationBlocked } from "@/lib/operator";
import { HTML_LANG, LOCALES, OG_LOCALE, dict, isLocale } from "@/lib/i18n";
import { INDEXABLE, SITE_NAME, SITE_URL, alternates, ogImage, paths } from "@/lib/site";
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
    icons: { icon: [{ url: "/favicon.ico", sizes: "32x32" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
    manifest: "/manifest.webmanifest",
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
    <html lang={HTML_LANG[locale]} className={inter.variable}>
      <body>
        <ConsentProvider adsEnabled={!!adClient()} labels={{ text: t.consentText, accept: t.consentAccept, decline: t.consentDecline, privacy: t.privacy, privacyHref: `${paths.page(locale, "datenschutz")}#cookies` }}>
          <div className="shell">
            <SiteHeader siteName={SITE_NAME} locale={locale} />
            <main id="main" tabIndex={-1}>{children}</main>
            <SiteFooter siteName={SITE_NAME} locale={locale} />
          </div>
        </ConsentProvider>
        {/* Masque les cartes dont la date de fin publiée est passée (page servie avant la prochaine reconstruction). */}
        <script src="/expired.js" defer />
        {process.env.NEXT_PUBLIC_CF_BEACON_TOKEN && (
          // Cloudflare Web Analytics : sans cookie, aucune donnée personnelle.
          <script defer src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: process.env.NEXT_PUBLIC_CF_BEACON_TOKEN })} />
        )}
      </body>
    </html>
  );
}
