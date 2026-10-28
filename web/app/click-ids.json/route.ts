import { outbound } from "@/components/DealCard";
import { getDeals } from "@/lib/data";
import { hasPage } from "@/lib/project";

/** Table publique id → programme d'affiliation (ou null) des deals publiés, lue par
 * functions/api/click.ts : un clic sur un id inconnu n'est jamais compté, et le
 * caractère publicitaire d'un clic est déduit ici, jamais envoyé par le navigateur.
 * Ne contient rien de plus que ce que les pages publient déjà. */
export const dynamic = "force-static";

export async function GET() {
  const { deals } = await getDeals();
  const map: Record<string, string | null> = {};
  for (const d of deals) if (hasPage(d)) map[d.id] = outbound(d).programme ?? null;
  return new Response(JSON.stringify(map), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
