import type { NextConfig } from "next";

// Export statique → Cloudflare Pages (gratuit, usage commercial autorisé).
// Les en-têtes HTTP sont dans public/_headers (format Cloudflare), les
// redirections dans public/_redirects. Post-traitement : scripts/postbuild.mjs.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  // Racine par langue (app/[locale]/layout.tsx) : la 404 hors préfixe est app/global-not-found.tsx.
  // NEXT_BUILD_CPUS (optionnel) : moins de workers de rendu sur une machine à 8 Go
  // (chaque worker parse le flux de ~16 Mo ; 7 workers → swap disque).
  experimental: { globalNotFound: true, ...(Number(process.env.NEXT_BUILD_CPUS) > 0 ? { cpus: Number(process.env.NEXT_BUILD_CPUS) } : {}) },
};

export default config;
