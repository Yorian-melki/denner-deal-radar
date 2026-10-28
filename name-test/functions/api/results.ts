/** Agrégats publics (aucune donnée individuelle) : Elo + Bradley-Terry des duels,
 * reconnaissance mémoire, orthographe à l'écoute, compréhension. */
interface Env { DB: D1Database }

// Tout ce qui précède cette date = test de Yorian (fondateur) : affiché à part, jamais compté.
const OWNER_BEFORE = 1793163427076;

export const onRequestGet = async ({ env }: { env: Env }) => {
  const { results: all } = await env.DB.prepare("SELECT rid, ts, type, data FROM events WHERE rid NOT LIKE 'test-%' ORDER BY id").all<{ rid: string; ts: number; type: string; data: string }>();
  const owner = (all ?? []).filter((r) => r.ts < OWNER_BEFORE);
  const results = (all ?? []).filter((r) => r.ts >= OWNER_BEFORE);
  const ownerPicks: Record<string, number> = {};
  for (const r of owner) { if (r.type !== "duel") continue; try { const d = JSON.parse(r.data); if (d.win) ownerPicks[d.win] = (ownerPicks[d.win] || 0) + 1; } catch {} }
  const S: Record<string, any> = {};
  const st = (n: string) => (S[n] ??= { name: n, elo: 1500, wins: 0, shown: 0, recallHit: 0, recallShown: 0, falseAlarm: 0, decoy: 0, spellOk: 0, spellN: 0, meaningOk: 0, meaningN: 0 });
  const rids = new Set<string>(); let duels = 0;
  const viral = { referred: new Set<string>(), starts: new Set<string>(), shares: 0 };
  const K = 24;
  for (const r of results ?? []) {
    rids.add(r.rid);
    let d: any; try { d = JSON.parse(r.data); } catch { continue; }
    if (r.type === "duel" && d.a && d.b && (d.win === d.a || d.win === d.b)) {
      duels++;
      const A = st(d.a), B = st(d.b), W = d.win === d.a ? A : B, L = W === A ? B : A;
      const ea = 1 / (1 + 10 ** ((L.elo - W.elo) / 400));
      W.elo += K * (1 - ea); L.elo -= K * (1 - ea);
      A.shown++; B.shown++; W.wins++;
    } else if (r.type === "recall" && Array.isArray(d.seen) && Array.isArray(d.decoys) && Array.isArray(d.picked)) {
      const p = new Set(d.picked);
      for (const n of d.seen) { st(n).recallShown++; if (p.has(n)) st(n).recallHit++; }
      for (const n of d.decoys) { st(n).decoy++; if (p.has(n)) st(n).falseAlarm++; }
    } else if (r.type === "spell" && d.name) {
      const s = st(d.name); s.spellN++;
      if (String(d.typed || "").toLowerCase().replace(/[^a-z]/g, "") === d.name.toLowerCase()) s.spellOk++;
    } else if (r.type === "session") {
      if (d.ref) viral.referred.add(r.rid);
      if (d.shared) viral.shares++;
      if (d.start) viral.starts.add(r.rid);
    } else if (r.type === "meaning" && d.name) {
      const s = st(d.name); s.meaningN++; if (d.answer === "deals") s.meaningOk++;
    }
  }
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
  const rows = Object.values(S).map((s: any) => ({
    name: s.name, elo: Math.round(s.elo), duels: s.shown, winRate: pct(s.wins, s.shown),
    recall: pct(s.recallHit, s.recallShown), recallN: s.recallShown, falseAlarm: pct(s.falseAlarm, s.decoy),
    spelling: pct(s.spellOk, s.spellN), spellN: s.spellN, meaning: pct(s.meaningOk, s.meaningN), meaningN: s.meaningN,
  })).sort((a, b) => b.elo - a.elo);
  return Response.json({ respondents: rids.size, duels, rows, viral: { started: viral.starts.size, referred: viral.referred.size, shares: viral.shares, k: viral.starts.size ? Math.round((100 * viral.referred.size) / Math.max(1, viral.starts.size - viral.referred.size)) / 100 : 0 }, owner: { duels: owner.filter((r) => r.type === "duel").length, picks: ownerPicks } }, { headers: { "cache-control": "no-store" } });
};
