# web/ — site public (Next.js 16 → export statique → Cloudflare Pages)

Lit le flux publié par le scanner (`DATA_URL_CH_SG`, GitHub Pages) et génère
les pages SEO ville / catégorie / deal en HTML statique (`out/`), reconstruit toutes
les 2 h par `.github/workflows/web.yml`. Plan et contexte :
[../MONETISATION_MVP.md](../MONETISATION_MVP.md).

```bash
npm install
npm test                         # vitest : réécriture affiliée, projection publique
DATA_FIXTURE=1 npm run build     # build hors ligne sur fixtures/universal.sample.json
npm run build && npm start       # build sur le flux réel
npm run deploy:preview           # Cloudflare Pages, branche preview
npm run deploy:prod              # production (après GO)
```

Variables : voir `.env.example` (toutes facultatives ; sans identifiant
d'affiliation, les liens d'origine sont conservés).

## Build local sur une petite machine (8 Go, ~4 Go libres)

```sh
df -h /                      # arrêter si moins de 1 Go libre
NEXT_BUILD_CPUS=2 NEXT_PUBLIC_SITE_URL=https://savradar.pages.dev npm run build
```

`prebuild` supprime `.next` et `out` avant de reconstruire (pas de double occupation) ; hors CI,
le postbuild supprime `.next/server/app` et `.next/cache` (≈ 16 Mo restent) ainsi que les dossiers
vides de `out/`. Ne pas lancer wrangler, Chrome et le build en même temps.
