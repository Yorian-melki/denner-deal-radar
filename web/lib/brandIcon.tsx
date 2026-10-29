import { SITE_NAME } from "@/lib/site";

/** Tuile de marque unique (round 3, item 16) : initiale de SITE_NAME, graisse 700,
 * #f5f5f7 sur #1d1d1f, rayon 22 % — la même que .logo-tile. Renommer la marque =
 * changer SITE_NAME : favicon, icône d'écran d'accueil et OG suivent. */
export const brandInitial = () => SITE_NAME.trim().charAt(0).toUpperCase() || "D";

export function brandSvg(): string {
  const ch = brandInitial().replace(/[<>&"']/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1d1d1f"/><text x="32" y="45" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="#f5f5f7">${ch}</text></svg>\n`;
}

/** Tuile pour ImageResponse (PNG). `pad` : zone de sécurité « maskable » (Android). */
export function BrandTile({ size, pad = 0 }: { size: number; pad?: number }) {
  const inner = size - 2 * pad;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: pad ? "#1d1d1f" : "transparent" }}>
      <div style={{ width: inner, height: inner, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: pad ? 0 : Math.round(inner * 0.22), background: "#1d1d1f", color: "#f5f5f7", fontSize: Math.round(inner * 0.62), fontWeight: 700 }}>
        {brandInitial()}
      </div>
    </div>
  );
}
