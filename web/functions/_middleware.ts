/** Middleware Cloudflare Pages (routes limitées par out/_routes.json : pages /de /fr /en,
 * /api, /.well-known — jamais les fichiers statiques versionnés).
 *
 * 1. 404 sous /de|/fr|/en : le sélecteur de langue (a[data-lang]) est réécrit vers la
 *    page équivalente qui EXISTE dans l'autre langue, sinon la page parente (catégorie,
 *    ville) — même sans JavaScript, on ne retombe jamais sur l'accueil (round 2, item 11).
 * 2. En-têtes de sécurité sur toutes les réponses qui passent ici (HSTS, XFO, noindex
 *    sur *.pages.dev, pas d'Access-Control-Allow-Origin). */
import { secure } from "../lib/edgeHeaders";

/** API Workers (types minimaux : pas de dépendance @cloudflare/workers-types). */
interface RewriterElement { getAttribute(name: string): string | null; setAttribute(name: string, value: string): void }
declare const HTMLRewriter: {
  new (): { on(selector: string, handlers: { element(el: RewriterElement): void }): { transform(r: Response): Response } };
} | undefined;

interface Env { ASSETS: { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> } }
type Ctx = { request: Request; env: Env; next: () => Promise<Response> };

const LOCALES = ["de", "fr", "en"] as const;
const MAIN_CITY = "st-gallen";
const PREFIX = /^\/(de|fr|en)(?=\/|$)/;

/** Chemins candidats, du plus précis au plus général (jamais l'accueil nu). */
export function candidates(lang: string, rest: string): string[] {
  const segs = rest.split("/").filter(Boolean);
  const out: string[] = [];
  for (let n = segs.length; n >= 1; n--) {
    const p = segs.slice(0, n);
    if (p.length === 1 && p[0] === "deal") continue; // /de/deal n'existe pas
    out.push(`/${lang}/${p.join("/")}`);
  }
  out.push(`/${lang}/${MAIN_CITY}`);
  return [...new Set(out)];
}

async function exists(env: Env, url: URL, path: string): Promise<boolean> {
  try {
    const r = await env.ASSETS.fetch(new URL(path, url), { method: "HEAD", redirect: "manual" });
    return r.status === 200 || (r.status >= 300 && r.status < 400);
  } catch {
    return false;
  }
}

export const onRequest = async ({ request, env, next }: Ctx): Promise<Response> => {
  const url = new URL(request.url);
  let res = await next();
  const isHtml = (res.headers.get("content-type") ?? "").includes("text/html");
  if (res.status === 404 && isHtml && PREFIX.test(url.pathname) && typeof HTMLRewriter !== "undefined") {
    const rest = url.pathname.replace(PREFIX, "").replace(/\/+$/, "");
    const target: Record<string, string> = {};
    for (const l of LOCALES) {
      for (const c of candidates(l, rest)) {
        if (await exists(env, url, c)) { target[l] = c; break; }
      }
    }
    res = new HTMLRewriter!()
      .on("a[data-lang]", { element(el: RewriterElement) { const l = el.getAttribute("data-lang") ?? ""; if (target[l]) el.setAttribute("href", target[l]); } })
      .transform(res);
  }
  return secure(res, url);
};
