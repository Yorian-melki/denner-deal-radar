import { getDeals } from "@/lib/data";

export const dynamic = "force-static";

/** Registre des slugs publiés (lib/slugs.ts) : relu par le build suivant et par le postbuild
 * (redirections 301 des anciens liens). Aucune donnée personnelle : slugs, catégories, dates. */
export async function GET() {
  const { registry } = await getDeals();
  return new Response(JSON.stringify(registry), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
