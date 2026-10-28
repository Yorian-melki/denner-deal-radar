// Post-traitement et garde-fous de l'export statique (out/). Échoue (exit 1) si :
//  - une URL localhost a fuité dans un fichier publié (canonical, og, sitemap, JSON-LD…) ;
//  - une page existe dans une langue mais pas dans les deux autres ;
//  - un lien du sélecteur de langue mène à une page inexistante ;
//  - le nombre de fichiers dépasse le budget Cloudflare Pages (20 000, marge à 18 000).
// Transforme : 404 par langue (/<l>/missing.html → /<l>/404.html), suppression des
// charges RSC (*.txt) inutiles (toute la navigation se fait par liens <a> classiques),
// page de repli /index.html → /de (au cas où _redirects ne serait pas appliqué).
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] ?? "out");
const LOCALES = ["de", "fr", "en"];
const MAX_FILES = 18000;
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

// 1. 404 localisées (Cloudflare sert la 404.html la plus proche du chemin demandé).
for (const l of LOCALES) {
  const src = path.join(OUT, l, "missing.html");
  if (!existsSync(src)) { errors.push(`gabarit 404 absent : ${l}/missing.html`); continue; }
  renameSync(src, path.join(OUT, l, "404.html"));
  rmSync(path.join(OUT, l, "missing.txt"), { force: true });
  rmSync(path.join(OUT, l, "missing"), { recursive: true, force: true });
}

// 2. Charges RSC : inutiles sans <Link> (navigation classique) — divise le nombre de fichiers par ~4.
let pruned = 0;
for (const f of walk(OUT)) {
  const r = rel(f);
  if (r === "robots.txt" || r.startsWith("_next/") || r.startsWith(".well-known/")) continue;
  const base = path.basename(f);
  const isFlight = /^__next\..*\.txt$/.test(base) || (base.endsWith(".txt") && existsSync(f.slice(0, -4) + ".html"));
  if (isFlight) { rmSync(f); pruned++; }
}
// Dossiers vidés par l'élagage.
(function prune(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { prune(p); if (!readdirSync(p).length) rmSync(p, { recursive: true }); }
  }
})(OUT);

// 3. Repli de « / » (la redirection 302 de public/_redirects reste la règle).
if (!existsSync(path.join(OUT, "index.html"))) {
  writeFileSync(path.join(OUT, "index.html"),
    '<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=/de"><link rel="canonical" href="/de"><title>…</title></head><body><a href="/de">Deutsch</a> · <a href="/fr">Français</a> · <a href="/en">English</a></body></html>\n');
}

const files = walk(OUT);
const htmls = files.filter((f) => f.endsWith(".html"));

// 4. Aucune URL locale publiée.
for (const f of files) {
  if (!/\.(html|xml|txt|json|webmanifest|js|css)$/.test(f) || rel(f).startsWith("_next/static/chunks/")) continue;
  const s = readFileSync(f, "utf8");
  if (/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(s)) errors.push(`URL locale dans ${rel(f)}`);
}

// 5. Parité des langues : /de/X ⇔ /fr/X ⇔ /en/X.
const pages = new Map(LOCALES.map((l) => [l, new Set(htmls.map(rel).filter((r) => r.startsWith(`${l}/`) || r === `${l}.html`).map((r) => r.replace(new RegExp(`^${l}`), "")))]));
for (const l of LOCALES) for (const p of pages.get(l)) for (const o of LOCALES) if (!pages.get(o).has(p)) errors.push(`/${l}${p.replace(/\.html$/, "")} sans équivalent /${o}`);

// 6. Le sélecteur de langue ne mène jamais à une page absente (ni à « / »).
const exists = (href) => {
  const clean = href.split(/[?#]/)[0].replace(/\/$/, "");
  if (!clean || clean === "/") return false;
  return existsSync(path.join(OUT, `${clean}.html`)) || existsSync(path.join(OUT, clean, "index.html"));
};
let checked = 0;
for (const f of htmls) {
  const r = rel(f);
  if (r.endsWith("404.html")) continue;
  const html = readFileSync(f, "utf8");
  const nav = html.match(/<nav class="lang"[^>]*>([\s\S]*?)<\/nav>/);
  if (!nav) { if (LOCALES.some((l) => r.startsWith(`${l}/`) || r === `${l}.html`)) errors.push(`sélecteur de langue absent : ${r}`); continue; }
  for (const m of nav[1].matchAll(/href="([^"]+)"/g)) {
    checked++;
    if (!exists(m[1])) errors.push(`sélecteur de langue cassé dans ${r} → ${m[1]}`);
  }
}

// 7. Budget de fichiers Cloudflare Pages.
if (files.length >= MAX_FILES) errors.push(`${files.length} fichiers (budget ${MAX_FILES})`);

console.log(JSON.stringify({ files: files.length, html: htmls.length, rscPruned: pruned, langLinksChecked: checked, errors: errors.length }));
if (errors.length) {
  for (const e of errors.slice(0, 40)) console.error(`ERREUR postbuild : ${e}`);
  if (errors.length > 40) console.error(`… et ${errors.length - 40} autres`);
  process.exit(1);
}
