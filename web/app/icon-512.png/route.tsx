import { ImageResponse } from "next/og";
import { BrandTile } from "@/lib/brandIcon";

export const dynamic = "force-static";

/** Icône 512 « maskable » (Android) : lettre dans la zone de sécurité de 80 %. */
export function GET() {
  return new ImageResponse(<BrandTile size={512} pad={52} />, { width: 512, height: 512 });
}
