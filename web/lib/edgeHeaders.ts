/** En-têtes de sécurité des réponses générées par une Function (« / » et /api/*) : le
 * fichier _headers ne s'applique pas à elles. Aucune page vue ne passe par une Function
 * (out/_routes.json, round 3, item 1). `set` remplace : jamais de valeur concaténée. */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Permissions-Policy": "accelerometer=(), autoplay=(), browsing-topics=(), camera=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), serial=(), usb=(), xr-spatial-tracking=()",
  // Les Functions ne renvoient jamais de HTML (302, 204, 405) : rien à charger, rien à encadrer.
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

/** Applique les en-têtes de sécurité ; *.pages.dev n'est jamais indexé ; jamais de CORS ouvert. */
export function secure(res: Response, url: URL): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  if (url.hostname.endsWith(".pages.dev")) h.set("X-Robots-Tag", "noindex, nofollow");
  h.delete("Access-Control-Allow-Origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
