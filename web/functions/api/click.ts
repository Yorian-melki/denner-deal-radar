/** Cloudflare Pages Function : compteur anonyme de clics sortants.
 * Pas d'IP, pas de cookie, pas d'identifiant. Écrit dans Workers Analytics
 * Engine si la liaison CLICKS existe (gratuit), sinon un log structuré
 * (Cloudflare → Logs en temps réel).
 *
 * Durcissement (docs/SECURITY_LEGAL.md) :
 * - POST seulement (405 + Allow sinon, OPTIONS compris : pas de CORS) ;
 * - même origine seulement (Sec-Fetch-Site / Origin), sinon 403 ;
 * - corps ≤ 1 Ko lu de façon bornée, JSON objet, champs connus uniquement,
 *   formats stricts (regex) ; rien de la requête n'est renvoyé, erreurs génériques ;
 * - garde-fou d'abus sans option payante : budget de points par isolate et par
 *   minute (borne le coût et la pollution des stats). Le plafond par IP se règle
 *   dans Cloudflare → Security → WAF → Rate limiting rules (1 règle gratuite). */
interface Env { CLICKS?: { writeDataPoint(p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void } }
type Ctx = { request: Request; env: Env };

const MAX_BODY = 1024;
const BUDGET_PER_MIN = 600;
const FIELDS = new Set(["deal", "source", "affiliate", "programme", "page"]);
const RE = {
  deal: /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,119}$/,
  source: /^[a-z0-9][a-z0-9_-]{0,31}$/,
  programme: /^[a-z0-9][a-z0-9_-]{0,31}$/,
  page: /^\/[A-Za-z0-9._~%/-]{0,199}$/,
};

const HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};
const reply = (status: number, extra: Record<string, string> = {}) =>
  new Response(null, { status, headers: { ...HEADERS, ...extra } });

let windowStart = 0;
let used = 0;
function withinBudget(now: number): boolean {
  if (now - windowStart >= 60_000) { windowStart = now; used = 0; }
  return ++used <= BUDGET_PER_MIN;
}

/** sendBeacon envoie Sec-Fetch-Site (navigateurs récents) ou Origin. Un appel
 * sans aucun des deux (curl, bots) est refusé : seul le site écrit des points. */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export type Click = { deal: string; source: string; affiliate: boolean; programme: string; page: string };

/** Validation stricte : null au moindre écart (champ inconnu, type, format). */
export function parseClick(b: unknown): Click | null {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const o = b as Record<string, unknown>;
  if (Object.keys(o).some((k) => !FIELDS.has(k))) return null;
  const { deal, source, affiliate, programme = "none", page } = o;
  if (typeof deal !== "string" || !RE.deal.test(deal)) return null;
  if (typeof source !== "string" || !RE.source.test(source)) return null;
  if (typeof programme !== "string" || !RE.programme.test(programme)) return null;
  if (typeof page !== "string" || !RE.page.test(page)) return null;
  if (typeof affiliate !== "boolean") return null;
  return { deal, source, affiliate, programme, page };
}

/** Lecture bornée : on ne fait pas confiance à Content-Length (chunked). */
async function readBounded(request: Request): Promise<string | "too_large" | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel().catch(() => {}); return "too_large"; }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(buf);
}

async function handlePost({ request, env }: Ctx): Promise<Response> {
  if (!isSameOrigin(request)) return reply(403);
  const ct = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (ct !== "application/json" && ct !== "text/plain") return reply(415);
  if (Number(request.headers.get("Content-Length") || "0") > MAX_BODY) return reply(413);
  if (!withinBudget(Date.now())) return reply(429, { "Retry-After": "60" });

  let click: Click | null = null;
  try {
    const raw = await readBounded(request);
    if (raw === "too_large") return reply(413);
    if (raw !== null) click = parseClick(JSON.parse(raw));
  } catch {
    click = null;
  }
  if (!click) return reply(400);

  const point = {
    indexes: [click.source],
    blobs: [click.deal, click.source, click.programme, click.page, String(click.affiliate)],
    doubles: [1],
  };
  try {
    if (env.CLICKS) env.CLICKS.writeDataPoint(point);
    else console.log(JSON.stringify({ level: "info", msg: "outbound_click", blobs: point.blobs }));
  } catch {
    // Jamais d'erreur interne exposée ; le clic du visiteur n'en dépend pas.
  }
  return reply(204);
}

/** Un seul point d'entrée : allowlist de méthodes explicite. */
export const onRequest = async (ctx: Ctx): Promise<Response> => {
  if (ctx.request.method === "POST") {
    try { return await handlePost(ctx); } catch { return reply(400); }
  }
  return reply(405, { Allow: "POST" });
};
