import { brandSvg } from "@/lib/brandIcon";

export const dynamic = "force-static";

export function GET() {
  return new Response(brandSvg(), { headers: { "Content-Type": "image/svg+xml" } });
}
