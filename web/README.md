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
