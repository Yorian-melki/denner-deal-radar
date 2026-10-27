import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { ConsentProvider } from "@/components/Consent";
import { INDEXABLE, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — die besten Deals deiner Stadt`, template: `%s · ${SITE_NAME}` },
  description: "Aktionen, Gratis-Angebote und Studentenrabatte — automatisch gesammelt und ehrlich bewertet.",
  robots: INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <ConsentProvider>
          <header className="top">
            <Link href="/" className="brand">📡 {SITE_NAME}</Link>
            <nav><Link href="/st-gallen">St. Gallen</Link></nav>
          </header>
          <main>{children}</main>
          <footer className="foot">
            <p>
              Preise und Angebote stammen von den verlinkten Quellen; massgebend ist immer die Seite des Anbieters.
              Mit * markierte Links sind Werbelinks: Wir erhalten ggf. eine Provision, der Preis ändert sich für dich nicht.
            </p>
            <nav>
              <Link href="/transparenz">Transparenz</Link> · <Link href="/datenschutz">Datenschutz</Link> · <Link href="/impressum">Impressum</Link>
            </nav>
          </footer>
        </ConsentProvider>
        <Analytics />
      </body>
    </html>
  );
}
