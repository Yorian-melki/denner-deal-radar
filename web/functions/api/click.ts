/** Cloudflare Pages Function : compteur anonyme de clics sortants.
 * Pas d'IP, pas de cookie, pas d'identifiant. Écrit dans Workers Analytics Engine
 * si la liaison CLICKS existe (gratuit) ; sinon RIEN n'est écrit (pas de log).
 *
 * Durcissement (round 2, item 12 ; docs/SECURITY_LEGAL.md) :
 * - POST seulement (405 + Allow sinon, OPTIONS compris : pas de CORS) ;
 * - même origine (Sec-Fetch-Site / Origin) ET requête de type balise
 *   (Sec-Fetch-Mode: no-cors, Sec-Fetch-Dest: empty quand le navigateur les envoie) ;
 * - corps ≤ 1 Ko lu de façon bornée, JSON { deal, page } uniquement ;
 * - le deal doit exister dans /click-ids.json (écrit au build) : un id inconnu → 204
 *   sans écriture ; « affiliate » et « programme » sont DÉDUITS de ce fichier, jamais lus
 *   du client ; « page » doit être une route du site (/de|fr|en/…) ;
 * - budget de points par isolate et par minute. Plafond par IP : règle WAF gratuite
 *   (Security → WAF → Rate limiting : 20 requêtes / 10 s / IP sur /api/click). */
import { secure } from "../../lib/edgeHeaders";

interface Env {
  CLICKS?: { writeDataPoint(p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void };
  ASSETS?: { fetch(input: Request | string | URL): Promise<Response> };
}
type Ctx = { request: Request; env: Env };

const MAX_BODY = 1024;
const BUDGET_PER_MIN = 600;
const FIELDS = new Set(["deal", "page"]);
const RE = {
  deal: /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,119}$/,
  page: /^\/(de|fr|en)(\/[a-z0-9-]+){0,4}$/,
};

const HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};
const reply = (status: number, url: URL, extra: Record<string, string> = {}) =>
  secure(new Response(null, { status, headers: { ...HEADERS, ...extra } }), url);

let windowStart = 0;
let used = 0;
function withinBudget(now: number): boolean {
  if (now - windowStart >= 60_000) { windowStart = now; used = 0; }
  return ++used <= BUDGET_PER_MIN;
}

/** Même origine ET requête de balise. Un appel sans Sec-Fetch-Site ni Origin (curl, bots) est refusé. */
export function isSameOrigin(request: Request): boolean {
  const h = request.headers;
  const site = h.get("Sec-Fetch-Site");
  const mode = h.get("Sec-Fetch-Mode");
  const dest = h.get("Sec-Fetch-Dest");
  if (mode && mode !== "no-cors") return false;
  if (dest && dest !== "empty") return false;
  if (site) return site === "same-origin";
  const origin = h.get("Origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export type Click = { deal: string; page: string };

/** Validation stricte : null au moindre écart (champ inconnu, type, format). */
export function parseClick(b: unknown): Click | null {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const o = b as Record<string, unknown>;
  if (Object.keys(o).some((k) => !FIELDS.has(k))) return null;
  const { deal, page } = o;
  if (typeof deal !== "string" || !RE.deal.test(deal)) return null;
  if (typeof page !== "string" || !RE.page.test(page)) return null;
  return { deal, page };
}

/** Table id → programme d'affiliation (ou null) écrite au build ; mémo par isolate (5 min). */
let ids: { at: number; map: Record<string, string | null> } | null = null;
export async function knownDeals(env: Env, url: URL, now = Date.now()): Promise<Record<string, string | null>> {
  if (ids && now - ids.at < 300_000) return ids.map;
  try {
    const r = await env.ASSETS?.fetch(new URL("/click-ids.json", url));
    const map = r && r.ok ? ((await r.json()) as Record<string, string | null>) : {};
    ids = { at: now, map: map && typeof map === "object" ? map : {} };
  } catch {
    ids = { at: now, map: {} };
  }
  return ids.map;
}

/** Point à écrire, ou null (id inconnu). Le client ne fournit que deal et page. */
export function toPoint(click: Click, map: Record<string, string | null>) {
  if (!Object.prototype.hasOwnProperty.call(map, click.deal)) return null;
  const programme = map[click.deal] ?? "none";
  const source = click.deal.split(":")[0].slice(0, 32);
  return { indexes: [source], blobs: [click.deal, source, programme, click.page, String(programme !== "none")], doubles: [1] };
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

async function handlePost({ request, env }: Ctx, url: URL): Promise<Response> {
  if (!isSameOrigin(request)) return reply(403, url);
  const ct = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (ct !== "application/json" && ct !== "text/plain") return reply(415, url);
  if (Number(request.headers.get("Content-Length") || "0") > MAX_BODY) return reply(413, url);
  if (!withinBudget(Date.now())) return reply(429, url, { "Retry-After": "60" });

  let click: Click | null = null;
  try {
    const raw = await readBounded(request);
    if (raw === "too_large") return reply(413, url);
    if (raw !== null) click = parseClick(JSON.parse(raw));
  } catch {
    click = null;
  }
  if (!click) return reply(400, url);
  if (!env.CLICKS) return reply(204, url); // aucune liaison : rien n'est écrit, nulle part
  const point = toPoint(click, await knownDeals(env, url));
  if (!point) return reply(204, url); // id inconnu : rien n'est écrit
  try { env.CLICKS.writeDataPoint(point); } catch { /* jamais d'erreur interne exposée */ }
  return reply(204, url);
}

/** Un seul point d'entrée : allowlist de méthodes explicite. */
export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  if (ctx.request.method === "POST") {
    try { return await handlePost(ctx, url); } catch { return reply(400, url); }
  }
  return reply(405, url, { Allow: "POST" });
};
