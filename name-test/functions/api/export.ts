/** Export brut ANONYME pour l'analyse hors ligne (analysis/analyze.py).
 * Aucune donnée personnelle : identifiant aléatoire d'appareil, choix, temps, langue, type d'appareil.
 * Exclut les tests (rid test-*), les appareils exclus et tout ce qui précède le lancement. */
interface Env { DB: D1Database }
const LAUNCH = 1793164023938;
export const onRequestGet = async ({ env }: { env: Env }) => {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS excluded (rid TEXT PRIMARY KEY, ts INTEGER)").run();
  const { results } = await env.DB.prepare("SELECT id, rid, ts, type, data, lang, device FROM events WHERE ts >= ? AND rid NOT LIKE 'test-%' AND rid NOT IN (SELECT rid FROM excluded) ORDER BY id").bind(LAUNCH).all();
  return Response.json({ exportedAt: Date.now(), launch: LAUNCH, events: results ?? [] }, { headers: { "cache-control": "no-store" } });
};
