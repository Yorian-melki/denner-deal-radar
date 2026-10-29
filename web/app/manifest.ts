import type { MetadataRoute } from "next";
import { mainCity } from "@/config/cities";
import { DICTS } from "@/lib/i18n";
import { SITE_NAME, paths } from "@/lib/site";

export const dynamic = "force-static";

/** Manifeste minimal (icône d'écran d'accueil) ; nom = SITE_NAME. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: DICTS.de.metaDescription,
    start_url: paths.city("de", mainCity().slug),
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#f5f5f7",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
