/** /.well-known/security.txt (RFC 9116), généré à la volée pour que :
 * - Contact = mailto:<OPERATOR_EMAIL> si la variable existe dans Cloudflare Pages
 *   (Settings → Variables and Secrets, runtime ; NEXT_PUBLIC_OPERATOR_EMAIL accepté),
 *   sinon la page /de/impressum du domaine courant ;
 * - pas de champ Policy tant qu'aucune politique de divulgation (/sicherheit) n'existe ;
 * - Expires reste toujours < 1 an (exigence RFC) sans maintenance manuelle ;
 * - Canonical = domaine réellement servi (pages.dev ou domaine définitif). */
interface Env { OPERATOR_EMAIL?: string; NEXT_PUBLIC_OPERATOR_EMAIL?: string }

const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

export function securityTxt(origin: string, email: string | undefined, now: Date): string {
  const expires = new Date(now.getTime() + 180 * 24 * 3600 * 1000);
  expires.setUTCHours(0, 0, 0, 0);
  const contact = email && EMAIL.test(email) ? `mailto:${email}` : `${origin}/de/impressum`;
  return [
    `Contact: ${contact}`,
    `Expires: ${expires.toISOString()}`,
    `Preferred-Languages: de, fr, en`,
    `Canonical: ${origin}/.well-known/security.txt`,
    "",
  ].join("\n");
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
    "X-Robots-Tag": "noindex",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
  }
  const origin = new URL(request.url).origin;
  const body = securityTxt(origin, (env.OPERATOR_EMAIL || env.NEXT_PUBLIC_OPERATOR_EMAIL || "").trim(), new Date());
  return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
};
