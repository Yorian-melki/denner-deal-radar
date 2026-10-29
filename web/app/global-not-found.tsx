import type { Metadata } from "next";
import { mainCity } from "@/config/cities";
import { DICTS, HTML_LANG, LOCALES } from "@/lib/i18n";
import { SITE_NAME, paths } from "@/lib/site";
import { BrandMark } from "@/components/SiteChrome";
import "./globals.css";

export const metadata: Metadata = { title: `404 – ${SITE_NAME}`, robots: { index: false, follow: false } };

/** 404 hors des préfixes de langue (/xyz) : courte, dans les trois langues, avec un
 * lien vers chaque accueil. Les 404 sous /de, /fr, /en sont localisées (missing). */
export default function GlobalNotFound() {
  const city = mainCity();
  return (
    <html lang="de-CH">
      <body>
        <main id="main" className="nf nf-global">
          <p className="brand"><BrandMark name={SITE_NAME} /></p>
          {LOCALES.map((l) => (
            <section key={l} lang={HTML_LANG[l]}>
              <h1>{DICTS[l].notFoundTitle}</h1>
              <p><a href={paths.city(l, city.slug)}>{DICTS[l].notFoundCta(city.name[l])}</a></p>
            </section>
          ))}
        </main>
      </body>
    </html>
  );
}
