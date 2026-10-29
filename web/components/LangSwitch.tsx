/** Sélecteur DE · FR · EN — composant serveur, zéro JavaScript.
 * Le layout ne connaît pas le chemin de la page : chaque lien porte data-lang et
 * scripts/postbuild.mjs réécrit son href vers la page ÉQUIVALENTE de chaque fichier
 * publié (/fr/st-gallen/tech-deals → /de/st-gallen/tech-deals). Sur une 404,
 * functions/_middleware.ts fait la même réécriture à partir de l'URL demandée.
 * Jamais de lien vers « / » ni vers l'accueil d'une langue par défaut. */
const LANG_PREFIX = /^\/(de|fr|en)(?=\/|$)/;

/** Chemin équivalent dans une autre langue : seul le premier segment change ;
 * requête (?q=…) et ancre (#…) sont conservées. */
export function switchPath(pathname: string, to: string, search = "", hash = ""): string {
  let rest = pathname.replace(/\.html$/, "").replace(/\/index$/, "").replace(LANG_PREFIX, "");
  if (rest === "/missing" || rest === "/404") rest = "";
  return `/${to}${rest === "/" ? "" : rest}${search}${hash}`;
}

export function LangSwitch({ current, label, langs }: { current: string; label: string; langs: { code: string; name: string; hreflang: string }[] }) {
  return (
    <nav className="lang" aria-label={label}>
      {/* Nom accessible = texte visible d'abord (WCAG 2.5.3) : « FR – Français ». La langue
          courante n'est pas un lien (jamais d'aria-current sur un lien qui mène ailleurs, ex. 404). */}
      {langs.map((l) => (l.code === current ? (
        <span key={l.code} className="lang-current" lang={l.hreflang} aria-current="true">
          <span>{l.code.toUpperCase()}</span>
          <span className="sr-only"> – {l.name}</span>
        </span>
      ) : (
        <a key={l.code} href={`/${l.code}`} data-lang={l.code} hrefLang={l.hreflang} lang={l.hreflang}>
          <span>{l.code.toUpperCase()}</span>
          <span className="sr-only"> – {l.name}</span>
        </a>
      )))}
    </nav>
  );
}
