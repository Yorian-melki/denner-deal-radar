import localFont from "next/font/local";

/** Inter variable (sous-ensemble latin, auto-hébergé, préchargé) : une seule famille
 * sur tous les appareils. Repli métrique ajusté (size-adjust) → pas de saut au chargement. */
export const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  preload: true,
  adjustFontFallback: "Arial",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});
