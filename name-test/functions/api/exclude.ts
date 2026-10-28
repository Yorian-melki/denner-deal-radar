/** Exclut définitivement un appareil (tests du fondateur) : ses réponses passées et futures. */
interface Env { DB: D1Database }
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  let b: any; try { b = await request.json(); } catch { return new Response("bad", { status: 400 }); }
  const rids = (Array.isArray(b.rids) ? b.rids : []).filter((r: any) => typeof r === "string" && /^[a-z0-9-]{8,40}$/.test(r)).slice(0, 5);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS excluded (rid TEXT PRIMARY KEY, ts INTEGER)").run();
  for (const r of rids) await env.DB.prepare("INSERT OR IGNORE INTO excluded (rid, ts) VALUES (?, ?)").bind(r, Date.now()).run();
  return Response.json({ ok: rids.length });
};
