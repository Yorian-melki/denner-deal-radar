/** Nombre de personnes venues via un code de partage (hors tests et avant lancement). */
interface Env { DB: D1Database }
const LAUNCH = 1793164023938;
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const c = (new URL(request.url).searchParams.get("c") || "").replace(/[^a-z0-9]/gi, "").slice(0, 12);
  if (!c) return Response.json({ count: 0 });
  const row = await env.DB.prepare("SELECT COUNT(DISTINCT rid) AS n FROM events WHERE type = 'session' AND ts >= ? AND rid NOT LIKE 'test-%' AND rid NOT IN (SELECT rid FROM excluded) AND json_extract(data, '$.ref') = ?").bind(LAUNCH, c).first<{ n: number }>();
  return Response.json({ count: row?.n ?? 0 }, { headers: { "cache-control": "no-store" } });
};
