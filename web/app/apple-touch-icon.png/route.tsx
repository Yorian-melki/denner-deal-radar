import { ImageResponse } from "next/og";
import { BrandTile } from "@/lib/brandIcon";

export const dynamic = "force-static";

/** Icône d'écran d'accueil iOS (180 × 180, iOS arrondit lui-même : tuile pleine). */
export function GET() {
  return new ImageResponse(<BrandTile size={180} pad={1} />, { width: 180, height: 180 });
}
