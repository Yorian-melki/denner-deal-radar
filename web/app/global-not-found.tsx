import type { Metadata } from "next";
import { mainCity } from "@/config/cities";
import { DICTS, HTML_LANG, LOCALES } from "@/lib/i18n";
import { TOMBSTONE_DAYS } from "@/lib/project";
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
          {/* Un seul H1 (round 4, item 29), puis une ligne par langue. */}
          <h1>{DICTS.de.notFoundTitle}</h1>
          <p>{DICTS.de.notFoundText(TOMBSTONE_DAYS)}</p>
          <p className="nf-langs">
            {LOCALES.map((l, i) => (
              <span key={l}>{i > 0 && " · "}<a href={paths.city(l, city.slug)} lang={HTML_LANG[l]} hrefLang={HTML_LANG[l]}>{DICTS[l].langName}</a></span>
            ))}
          </p>
        </main>
      </body>
    </html>
  );
}
