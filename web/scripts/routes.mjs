// Règles de routage partagées par le postbuild et les tests (pas de Function :
// tout est calculé au build, round 3, item 1).
export const MAIN_CITY = "st-gallen";

/** Chemins candidats d'une URL inconnue, du plus précis au plus général (jamais l'accueil nu).
 * Sert au lien de langue des 404 imbriquées : /de/st-gallen/tech-deals/99 → FR :
 * /fr/st-gallen/tech-deals/99, puis /fr/st-gallen/tech-deals, puis /fr/st-gallen. */
export function candidates(lang, rest) {
  const segs = rest.split("/").filter(Boolean);
  const out = [];
  for (let n = segs.length; n >= 1; n--) {
    const p = segs.slice(0, n);
    if (p.length === 1 && p[0] === "deal") continue; // /de/deal n'existe pas
    out.push(`/${lang}/${p.join("/")}`);
  }
  out.push(`/${lang}/${MAIN_CITY}`);
  return [...new Set(out)];
}

/** Seules entrées autorisées dans _routes.json : « / » (langue du navigateur) et,
 * si le compteur de clics est lié, /api/*. Aucune page vue ne passe par une Function. */
export const ALLOWED_ROUTES = new Set(["/", "/api/*"]);
export function routesJson(clicks) {
  return { version: 1, include: clicks ? ["/", "/api/*"] : ["/"], exclude: [] };
}

/** security.txt statique (RFC 9116) : Expires < 1 an, recalculé à chaque build (toutes les 2 h). */
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
export const ADVISORY_URL = "https://github.com/yorian-melki/denner-deal-radar/security/advisories/new";
export function securityTxt(origin, email, now) {
  const expires = new Date(now.getTime() + 180 * 24 * 3600 * 1000);
  expires.setUTCHours(0, 0, 0, 0);
  const contact = email && EMAIL.test(email) ? `mailto:${email}` : ADVISORY_URL;
  return [
    `Contact: ${contact}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: de, fr, en",
    `Canonical: ${origin}/.well-known/security.txt`,
    "",
  ].join("\n");
}
