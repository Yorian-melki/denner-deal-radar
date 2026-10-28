import type { Metadata, Viewport } from "next";
import { launchedCities } from "@/config/cities";
import { ConsentProvider } from "@/components/Consent";
import { LangScope, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { dict } from "@/lib/i18n";
import { INDEXABLE, SITE_NAME, SITE_URL, ogImage } from "@/lib/site";
import "./globals.css";

const t = dict("de");
const firstCity = launchedCities()[0];
/** Image de partage : générée au build par app/[city]/og.png/route.tsx (avec SITE_NAME). */
const OG_IMAGE = firstCity ? ogImage(firstCity.slug) : undefined;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: { default: `${SITE_NAME} — ${t.tagline}`, template: `%s · ${SITE_NAME}` },
  description: t.metaDescription,
  robots: INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "de_CH",
    title: `${SITE_NAME} — ${t.tagline}`,
    description: t.metaDescription,
    url: "/",
    ...(OG_IMAGE ? { images: [OG_IMAGE] } : {}),
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: t.metaDescription, ...(OG_IMAGE ? { images: [OG_IMAGE.url] } : {}) },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e11" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <ConsentProvider>
          <LangScope>
            <SiteHeader siteName={SITE_NAME} />
            <main id="main">{children}</main>
            <SiteFooter siteName={SITE_NAME} />
          </LangScope>
        </ConsentProvider>
        {process.env.NEXT_PUBLIC_CF_BEACON_TOKEN && (
          // Cloudflare Web Analytics : sans cookie, aucune donnée personnelle.
          <script defer src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: process.env.NEXT_PUBLIC_CF_BEACON_TOKEN })} />
        )}
      </body>
    </html>
  );
}
