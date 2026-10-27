import type { NextConfig } from "next";

// Export statique → Cloudflare Pages (gratuit, usage commercial autorisé).
// Les en-têtes HTTP sont dans public/_headers (format Cloudflare).
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default config;
