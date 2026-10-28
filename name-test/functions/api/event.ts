/** Enregistre une réponse anonyme. Pas d'IP, pas de cookie : seulement un
 * identifiant aléatoire généré sur l'appareil (localStorage). */
interface Env { DB: D1Database }
const TYPES = new Set(["duel", "recall", "spell", "meaning", "session"]);

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  let b: any;
  try { b = await request.json(); } catch { return new Response("bad json", { status: 400 }); }
  const rid = typeof b.rid === "string" && /^[a-z0-9-]{8,40}$/.test(b.rid) ? b.rid : null;
  const events = Array.isArray(b.events) ? b.events.slice(0, 50) : [];
  if (!rid || !events.length) return new Response("bad", { status: 400 });
  const lang = String(b.lang || "").slice(0, 5), device = String(b.device || "").slice(0, 10);
  const stmts = events
    .filter((e: any) => e && TYPES.has(e.type))
    .map((e: any) => env.DB.prepare("INSERT INTO events (rid, ts, type, data, lang, device) VALUES (?,?,?,?,?,?)")
      .bind(rid, Date.now(), e.type, JSON.stringify(e.data ?? {}).slice(0, 2000), lang, device));
  if (stmts.length) await env.DB.batch(stmts);
  return new Response(null, { status: 204 });
};
