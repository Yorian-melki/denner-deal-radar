# web/ — site public (Next.js 16, Vercel)

Lit le flux publié par le scanner (`DATA_URL_CH_SG`, GitHub Pages) et génère
les pages SEO ville / catégorie / deal (ISR 30 min). Plan et contexte :
[../MONETISATION_MVP.md](../MONETISATION_MVP.md).

```bash
npm install
npm test                         # vitest : réécriture affiliée, projection publique
DATA_FIXTURE=1 npm run build     # build hors ligne sur fixtures/universal.sample.json
npm run build && npm start       # build sur le flux réel
vercel deploy --target preview   # preview protégée (jamais --prod sans GO)
```

Variables : voir `.env.example` (toutes facultatives ; sans identifiant
d'affiliation, les liens d'origine sont conservés).
