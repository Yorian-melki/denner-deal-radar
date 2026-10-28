/** En-têtes de sécurité communs aux réponses des Functions (le fichier _headers ne
 * s'applique pas aux réponses générées par une Function). `set` remplace : jamais de
 * valeur concaténée. */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/** Applique les en-têtes de sécurité ; *.pages.dev n'est jamais indexé ; jamais de CORS ouvert. */
export function secure(res: Response, url: URL): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  if (url.hostname.endsWith(".pages.dev")) h.set("X-Robots-Tag", "noindex, nofollow");
  h.delete("Access-Control-Allow-Origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
