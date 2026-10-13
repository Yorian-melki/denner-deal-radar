// Service worker prudent : RÉSEAU D'ABORD pour tout, cache uniquement hors ligne.
// - On affiche toujours la dernière version publiée quand le réseau répond.
// - Hors ligne, les données en cache sont marquées (X-From-Cache) et
//   l'application recalcule le statut de chaque offre à l'heure courante :
//   une offre expirée depuis n'est jamais affichée comme actuelle.
const SHELL = "shell-v3.1";
const DATA = "data-v3";
const SHELL_FILES = ["./", "index.html", "style.css", "app.js", "universal.js", "manifest.webmanifest",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const isData = url.pathname.includes("/data/");
  const bucket = isData ? DATA : SHELL;
  const key = isData ? url.pathname : e.request;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(bucket).then((c) => c.put(key, copy)); }
    return r;
  }).catch(() => caches.match(key).then((hit) => {
    if (!hit) return isData ? Promise.reject(new Error("hors ligne")) : caches.match("index.html");
    if (!isData) return hit;
    const h = new Headers(hit.headers);
    h.set("X-From-Cache", "1");
    return hit.blob().then((b) => new Response(b, { headers: h }));
  })));
});
