"use client";
import { usePathname } from "next/navigation";

const LANG_PREFIX = /^\/(de|fr|en)(?=\/|$)/;

/** Chemin équivalent dans une autre langue : seul le premier segment change ;
 * requête (?q=…) et ancre (#…) sont conservées. Jamais de lien vers « / ». */
export function switchPath(pathname: string, to: string, search = "", hash = ""): string {
  let rest = pathname.replace(LANG_PREFIX, "");
  if (rest === "/missing") rest = ""; // gabarit 404 : le lien statique mène à l'accueil de la langue
  return `/${to}${rest === "/" ? "" : rest}${search}${hash}`;
}

/** Sélecteur DE · FR · EN. Le href statique (sans JS) pointe déjà vers la page
 * équivalente ; au clic, on reprend l'URL réelle (404 servie pour une autre
 * adresse, paramètres de recherche) pour rester exactement au même endroit. */
export function LangSwitch({ current, label, langs }: { current: string; label: string; langs: { code: string; name: string; hreflang: string }[] }) {
  const pathname = usePathname() ?? `/${current}`;
  return (
    <nav className="lang" aria-label={label}>
      {langs.map((l) => (
        <a
          key={l.code}
          href={switchPath(pathname, l.code)}
          hrefLang={l.hreflang}
          lang={l.hreflang}
          aria-current={l.code === current ? "true" : undefined}
          title={l.name}
          onClick={(e) => {
            if (l.code === current) return;
            e.preventDefault();
            location.assign(switchPath(location.pathname, l.code, location.search, location.hash));
          }}
        >
          <span aria-hidden="true">{l.code.toUpperCase()}</span>
          <span className="sr-only">{l.name}</span>
        </a>
      ))}
    </nav>
  );
}
