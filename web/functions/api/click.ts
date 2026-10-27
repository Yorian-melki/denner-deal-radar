/** Cloudflare Pages Function : compteur anonyme de clics sortants.
 * Pas d'IP, pas de cookie. Écrit dans Workers Analytics Engine si la liaison
 * CLICKS existe (gratuit), sinon un log structuré (Cloudflare → Logs en temps réel). */
interface Env { CLICKS?: { writeDataPoint(p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void } }

const clip = (v: unknown, n = 120) => (typeof v === "string" ? v.slice(0, n) : "");

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  let b: Record<string, unknown> = {};
  try {
    b = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const point = {
    indexes: [clip(b.source, 32)],
    blobs: [clip(b.deal), clip(b.source, 32), clip(b.programme, 32), clip(b.page), String(b.affiliate === true)],
    doubles: [1],
  };
  if (env.CLICKS) env.CLICKS.writeDataPoint(point);
  else console.log(JSON.stringify({ level: "info", msg: "outbound_click", blobs: point.blobs }));
  return new Response(null, { status: 204 });
};
