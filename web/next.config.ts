import type { NextConfig } from "next";

// Export statique → Cloudflare Pages (gratuit, usage commercial autorisé).
// Les en-têtes HTTP sont dans public/_headers (format Cloudflare), les
// redirections dans public/_redirects. Post-traitement : scripts/postbuild.mjs.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  // Racine par langue (app/[locale]/layout.tsx) : la 404 hors préfixe est app/global-not-found.tsx.
  experimental: { globalNotFound: true },
};

export default config;
