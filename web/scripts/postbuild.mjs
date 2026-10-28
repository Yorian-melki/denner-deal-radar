// Post-traitement et garde-fous de l'export statique (out/). Échoue (exit 1) si :
//  - une URL localhost a fuité dans un fichier publié (canonical, og, sitemap, JSON-LD…) ;
//  - une page existe dans une langue mais pas dans les deux autres ;
//  - un lien du sélecteur de langue mène à une page inexistante ;
//  - un <script> inline exécutable subsiste (seul application/ld+json est permis : CSP 'self') ;
//  - le runtime React/Next est encore référencé (__next_f, /_next/static/chunks/*.js) ;
//  - la politique de confidentialité parle de « Web Analytics » sans que le script soit chargé (ou l'inverse) ;
//  - le nombre de fichiers dépasse le budget Cloudflare Pages (20 000, marge à 18 000).
// Transforme :
//  1. 404 par langue (/<l>/missing.html → /<l>/404.html), sans canonical ni hreflang ;
//  2. suppression des charges RSC (*.txt) et du runtime React : le site est du HTML
//     statique + UN script vanilla (public/site.js), versionné en /s/site.<hash>.js ;
//  3. liens du sélecteur de langue → page ÉQUIVALENTE de chaque fichier ;
//  4. CSP générée (script-src 'self' [+ Cloudflare Web Analytics seulement si activé]) ;
//  5. _routes.json : les Functions ne tournent que sur les pages et /api, jamais sur les fichiers versionnés.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] ?? "out");
const LOCALES = ["de", "fr", "en"];
const MAIN_CITY = "st-gallen";
const MAX_FILES = 18000;
const BUDGET = { cityHtmlBytes: 60 * 1024, jsBytes: 8 * 1024 };
const ANALYTICS = /^[a-f0-9]{32}$/i.test(process.env.NEXT_PUBLIC_CF_BEACON_TOKEN ?? "");
const errors = [];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
const rel = (p) => path.relative(OUT, p).split(path.sep).join("/");
/** Route publique d'un fichier HTML : « de/st-gallen/gratis.html » → « /de/st-gallen/gratis ». */
const routeOf = (r) => "/" + r.replace(/\.html$/, "").replace(/\/index$/, "");

// 1. 404 localisées (Cloudflare sert la 404.html la plus proche du chemin demandé).
for (const l of LOCALES) {
  const src = path.join(OUT, l, "missing.html");
  if (!existsSync(src)) { errors.push(`gabarit 404 absent : ${l}/missing.html`); continue; }
  renameSync(src, path.join(OUT, l, "404.html"));
  rmSync(path.join(OUT, l, "missing.txt"), { force: true });
  rmSync(path.join(OUT, l, "missing"), { recursive: true, force: true });
}

// 2a. Charges RSC : inutiles sans <Link> (navigation classique).
let pruned = 0;
for (const f of walk(OUT)) {
  const r = rel(f);
  if (r === "robots.txt" || r.startsWith(".well-known/")) continue;
  const base = path.basename(f);
  const isFlight = /^__next\..*\.txt$/.test(base) || (base.endsWith(".txt") && existsSync(f.slice(0, -4) + ".html"));
  const isRuntime = r.startsWith("_next/static/") && r.endsWith(".js");
  if (isFlight || isRuntime) { rmSync(f); pruned++; }
}

// 2b. site.js versionné (cache immuable 1 an).
const siteSrc = path.join(OUT, "site.js");
let sitePath = "/site.js";
if (existsSync(siteSrc)) {
  const js = readFileSync(siteSrc);
  const hash = createHash("sha256").update(js).digest("hex").slice(0, 10);
  mkdirSync(path.join(OUT, "s"), { recursive: true });
  sitePath = `/s/site.${hash}.js`;
  writeFileSync(path.join(OUT, sitePath.slice(1)), js);
  rmSync(siteSrc);
  if (js.length > BUDGET.jsBytes) errors.push(`site.js : ${js.length} octets (budget ${BUDGET.jsBytes})`);
} else errors.push("public/site.js absent");

// 2c–3. Réécriture de chaque page HTML.
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const switchPath = (route, to) => {
  let rest = route.replace(/^\/(de|fr|en)(?=\/|$)/, "");
  if (rest === "/404" || rest === "/missing") rest = `/${MAIN_CITY}`;
  return `/${to}${rest === "/" ? "" : rest}`;
};
let rewritten = 0;
for (const f of walk(OUT).filter((x) => x.endsWith(".html"))) {
  const r = rel(f);
  let html = readFileSync(f, "utf8");
  const before = html.length;
  html = html.replace(SCRIPT, (m, attrs, body) => {
    if (/type="application\/ld\+json"/.test(attrs)) return m;
    if (/src="\/site\.js"/.test(attrs)) return `<script src="${sitePath}" defer=""></script>`;
    if (/src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"/.test(attrs)) return m;
    return ""; // runtime Next/React (chunks, bootstrap, __next_f)
  });
  html = html.replace(/<link rel="preload" as="script"[^>]*>/g, "").replace(/<link rel="modulepreload"[^>]*>/g, "");
  const is404 = /(^|\/)404\.html$/.test(r) || r === "_not-found.html";
  if (is404) html = html.replace(/<link rel="(canonical|alternate)"[^>]*>/g, "");
  const route = routeOf(r);
  html = html.replace(/<a href="\/(de|fr|en)" data-lang="(de|fr|en)"/g, (_m, _h, l) => `<a href="${switchPath(route, l)}" data-lang="${l}"`);
  if (html.length !== before || html.includes("data-lang")) { writeFileSync(f, html); rewritten++; }
}

// 4. En-têtes : CSP générée selon ce qui est réellement chargé.
const headersFile = path.join(OUT, "_headers");
if (existsSync(headersFile)) {
  const cf = ANALYTICS ? " https://static.cloudflareinsights.com" : "";
  const cfc = ANALYTICS ? " https://cloudflareinsights.com" : "";
  const csp = `default-src 'self'; script-src 'self'${cf}; connect-src 'self'${cfc}; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'; manifest-src 'self'; worker-src 'self'; upgrade-insecure-requests`;
  const h = readFileSync(headersFile, "utf8");
  if (!h.includes("__CSP__")) errors.push("_headers : marqueur __CSP__ absent");
  writeFileSync(headersFile, h.replace("__CSP__", csp));
}

// 5. Les Functions ne tournent que là où elles servent.
writeFileSync(path.join(OUT, "_routes.json"), JSON.stringify({
  version: 1,
  include: ["/", "/api/*", "/.well-known/*", "/de/*", "/fr/*", "/en/*"],
  exclude: ["/_next/*", "/s/*"],
}, null, 2) + "\n");

// 6. Repli de « / » (la Function functions/index.ts négocie la langue).
if (!existsSync(path.join(OUT, "index.html"))) {
  writeFileSync(path.join(OUT, "index.html"),
    `<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=/de/${MAIN_CITY}"><title>…</title></head><body><a href="/de/${MAIN_CITY}">Deutsch</a> · <a href="/fr/${MAIN_CITY}">Français</a> · <a href="/en/${MAIN_CITY}">English</a></body></html>\n`);
}

const files = walk(OUT);
const htmls = files.filter((f) => f.endsWith(".html"));

// 7. Aucune URL locale publiée.
for (const f of files) {
  if (!/\.(html|xml|txt|json|webmanifest|js|css)$/.test(f)) continue;
  const s = readFileSync(f, "utf8");
  if (/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(s)) errors.push(`URL locale dans ${rel(f)}`);
}

// 8. Parité des langues : /de/X ⇔ /fr/X ⇔ /en/X.
const pages = new Map(LOCALES.map((l) => [l, new Set(htmls.map(rel).filter((r) => r.startsWith(`${l}/`) || r === `${l}.html`).map((r) => r.replace(new RegExp(`^${l}`), "")))]));
for (const l of LOCALES) for (const p of pages.get(l)) for (const o of LOCALES) if (!pages.get(o).has(p)) errors.push(`/${l}${p.replace(/\.html$/, "")} sans équivalent /${o}`);

// 9. Sélecteur de langue : chaque lien mène à une page existante équivalente (jamais « / »).
const exists = (href) => {
  const clean = href.split(/[?#]/)[0].replace(/\/$/, "");
  if (!clean || clean === "/") return false;
  return existsSync(path.join(OUT, `${clean}.html`)) || existsSync(path.join(OUT, clean, "index.html"));
};
let checked = 0;
for (const f of htmls) {
  const r = rel(f);
  const html = readFileSync(f, "utf8");
  // 10. Aucun script inline exécutable ; aucun runtime Next.
  for (const m of html.matchAll(SCRIPT)) {
    if (!m[1].includes("src=") && !/application\/ld\+json/.test(m[1])) { errors.push(`script inline dans ${r}`); break; }
  }
  if (html.includes("__next_f") || /\/_next\/static\/chunks\/[^"]+\.js/.test(html)) errors.push(`runtime Next dans ${r}`);
  const nav = html.match(/<nav class="lang"[^>]*>([\s\S]*?)<\/nav>/);
  if (!nav) { if (LOCALES.some((l) => r.startsWith(`${l}/`) || r === `${l}.html`)) errors.push(`sélecteur de langue absent : ${r}`); continue; }
  const route = routeOf(r);
  for (const m of nav[1].matchAll(/href="([^"]+)"[^>]*data-lang="(de|fr|en)"/g)) {
    checked++;
    if (!exists(m[1])) errors.push(`sélecteur de langue cassé dans ${r} → ${m[1]}`);
    else if (!r.endsWith("404.html") && m[1] !== switchPath(route, m[2])) errors.push(`sélecteur de langue non équivalent dans ${r} → ${m[1]}`);
  }
}

// 11. La politique de confidentialité dit exactement ce qui est chargé.
for (const l of LOCALES) {
  const f = path.join(OUT, l, "datenschutz.html");
  if (!existsSync(f)) continue;
  const html = readFileSync(f, "utf8");
  const says = /Web Analytics/.test(html), loads = /beacon\.min\.js/.test(html);
  if (says !== loads) errors.push(`${l}/datenschutz : mention « Web Analytics » (${says}) ≠ script chargé (${loads})`);
}

// 12. Budget de la page ville (HTML brut).
for (const l of LOCALES) {
  const f = path.join(OUT, l, `${MAIN_CITY}.html`);
  if (existsSync(f) && statSync(f).size > BUDGET.cityHtmlBytes) errors.push(`${l}/${MAIN_CITY}.html : ${statSync(f).size} octets (budget ${BUDGET.cityHtmlBytes})`);
}

// 13. Budget de fichiers Cloudflare Pages.
if (files.length >= MAX_FILES) errors.push(`${files.length} fichiers (budget ${MAX_FILES})`);

console.log(JSON.stringify({ files: files.length, html: htmls.length, pruned, rewritten, langLinksChecked: checked, site: sitePath, errors: errors.length }));
if (errors.length) {
  for (const e of errors.slice(0, 40)) console.error(`ERREUR postbuild : ${e}`);
  if (errors.length > 40) console.error(`… et ${errors.length - 40} autres`);
  process.exit(1);
}
