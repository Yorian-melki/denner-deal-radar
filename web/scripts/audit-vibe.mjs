// Audit « vibe-coded » (round 3, item 42) : protège les acquis visuels et techniques.
// Échoue (exit 1) si : un dégradé hors du masque des puces ; un émoji dans l'interface (hors
// titres de deals) ; un <script> inline autre que ld+json ; plus de 10 Ko br de JS ; CSP ou
// HSTS absents de _headers. Usage : node scripts/audit-vibe.mjs out
import { brotliCompressSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] ?? "out");
const errors = [];
const walk = (d, acc = []) => { for (const n of readdirSync(d)) { const p = path.join(d, n); statSync(p).isDirectory() ? walk(p, acc) : acc.push(p); } return acc; };
const files = walk(OUT);

for (const f of files.filter((x) => x.endsWith(".css"))) {
  const css = readFileSync(f, "utf8");
  for (const m of css.matchAll(/[^{}]+\{[^}]*gradient[^}]*\}/g)) {
    if (!/\.chips/.test(m[0].split("{")[0])) errors.push(`dégradé hors .chips : ${m[0].split("{")[0].trim().slice(0, 60)}`);
  }
}
let js = 0;
for (const f of files.filter((x) => x.endsWith(".js"))) js += brotliCompressSync(readFileSync(f)).length;
if (js > 10 * 1024) errors.push(`JS : ${js} octets br (budget 10 Ko)`);

const EMOJI = /\p{Extended_Pictographic}/u;
let checked = 0;
for (const f of files.filter((x) => x.endsWith(".html"))) {
  checked++; // round 4, item 43 : TOUS les fichiers HTML, plus un échantillon
  let html = readFileSync(f, "utf8");
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if (!/src=/.test(m[1]) && !/application\/ld\+json/.test(m[1])) errors.push(`script inline : ${path.relative(OUT, f)}`);
  html = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<head>[\s\S]*?<\/head>/, "")
    .replace(/<h[123][^>]*>[\s\S]*?<\/h[123]>/g, "").replace(/<a class="card-link"[\s\S]*?<\/a>/g, "");
  const text = html.replace(/<[^>]+>/g, " ");
  if (EMOJI.test(text.replace(/[©®™↗→←·–—’‘“”«»]/g, ""))) errors.push(`émoji dans l'interface : ${path.relative(OUT, f)}`);
}
const headers = existsSync(path.join(OUT, "_headers")) ? readFileSync(path.join(OUT, "_headers"), "utf8") : "";
if (!/^\s*Content-Security-Policy: (?!__CSP__)\S/m.test(headers)) errors.push("_headers : CSP absente");
if (!/^\s*Strict-Transport-Security: max-age=\d+/m.test(headers)) errors.push("_headers : HSTS absent");

// Grandes ombres et filet gauche d'accent : interdits (round 4, item 43).
for (const f of files.filter((x) => x.endsWith(".css"))) {
  const css = readFileSync(f, "utf8");
  if (/border-left\s*:[^;}]*var\(--accent/.test(css)) errors.push("filet gauche d'accent dans le CSS");
  for (const m of css.matchAll(/box-shadow\s*:([^;}]*)/g)) for (const b of m[1].matchAll(/\b\d+px\s+(\d+)px\s+(\d+)px/g)) if (Number(b[2]) > 32) errors.push(`ombre de plus de 32 px : ${m[1].trim().slice(0, 40)}`);
}
console.log(JSON.stringify({ audit: "vibe", jsBr: js, htmlChecked: checked, errors: errors.length }));
if (errors.length) { for (const e of [...new Set(errors)].slice(0, 20)) console.error(`ERREUR audit : ${e}`); process.exit(1); }
