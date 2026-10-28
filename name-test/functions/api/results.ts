/** Résultats publics (agrégats seulement, aucune donnée individuelle).
 *
 * Méthode (insensible à l'ordre des votes, biais corrigés) :
 * 1. Filtre qualité : répondants trop rapides (médiane < 450 ms/duel) ou qui
 *    cliquent toujours la même position (≥ 95 % sur ≥ 8 duels) écartés.
 * 2. Préférence : Bradley-Terry (régression logistique sur tous les duels à la
 *    fois) avec un terme d'avantage de position (carte du haut) estimé et retiré.
 *    Erreur-type par l'information de Fisher → intervalle à 95 %.
 * 3. Mémoire : indice d' (détection du signal) avec correction par personne :
 *    chaque reconnaissance est comparée au taux moyen de CETTE personne.
 * 4. Orthographe et compréhension : taux de réussite (lissage de Laplace).
 * 5. Score global = moyenne pondérée des z-scores : préférence 60 %, mémoire 25 %,
 *    orthographe 10 %, compréhension 5 % (0 = moyenne quand une mesure manque).
 */
interface Env { DB: D1Database }

// Tout ce qui précède cette date = tests du fondateur : affiché à part, jamais compté.
const OWNER_BEFORE = 1793164023938;

const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
// Quantile normal inverse (Acklam), pour d'.
function zinv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) return -zinv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export const onRequestGet = async ({ env }: { env: Env }) => {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS excluded (rid TEXT PRIMARY KEY, ts INTEGER)").run();
  const { results: raw } = await env.DB.prepare("SELECT rid, ts, type, data FROM events WHERE rid NOT LIKE 'test-%' AND rid NOT IN (SELECT rid FROM excluded) ORDER BY id").all<{ rid: string; ts: number; type: string; data: string }>();
  const owner = (raw ?? []).filter((r) => r.ts < OWNER_BEFORE);
  const ev = (raw ?? []).filter((r) => r.ts >= OWNER_BEFORE).map((r) => { let d: any = {}; try { d = JSON.parse(r.data); } catch {} return { rid: r.rid, type: r.type, d }; });
  const ownerPicks: Record<string, number> = {};
  for (const r of owner) { if (r.type !== "duel") continue; try { const d = JSON.parse(r.data); if (d.win) ownerPicks[d.win] = (ownerPicks[d.win] || 0) + 1; } catch {} }

  // ---- 1. filtre qualité par répondant ----
  const isDuel = (e: any) => e.type === "duel" && e.d.a && e.d.b && (e.d.win === e.d.a || e.d.win === e.d.b);
  const per: Record<string, { ms: number[]; top: number; n: number }> = {};
  for (const e of ev) if (isDuel(e)) {
    const p = (per[e.rid] ??= { ms: [], top: 0, n: 0 });
    p.n++; if (e.d.win === e.d.a) p.top++; if (typeof e.d.ms === "number") p.ms.push(e.d.ms);
  }
  const bad = new Set(Object.entries(per).filter(([, p]) => (p.ms.length >= 4 && median(p.ms) < 450) || (p.n >= 8 && (p.top / p.n >= 0.95 || p.top / p.n <= 0.05))).map(([r]) => r));
  const good = ev.filter((e) => !bad.has(e.rid));

  // ---- 2. Bradley-Terry avec avantage de position (carte du haut = a) ----
  const names = new Set<string>();
  const cnt = new Map<string, number>();
  let duels = 0, topWins = 0;
  const shown: Record<string, number> = {}, won: Record<string, number> = {};
  for (const e of good) if (isDuel(e)) {
    const { a, b } = e.d, tw = e.d.win === a ? 1 : 0;
    names.add(a); names.add(b); duels++; topWins += tw;
    shown[a] = (shown[a] || 0) + 1; shown[b] = (shown[b] || 0) + 1; won[e.d.win] = (won[e.d.win] || 0) + 1;
    const k = `${a}|${b}|${tw}`; cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  const N = [...names], idx = new Map(N.map((n, i) => [n, i]));
  const pairs = [...cnt].map(([k, n]) => { const [a, b, t] = k.split("|"); return { i: idx.get(a)!, j: idx.get(b)!, t: +t, n }; });
  const s = new Float64Array(N.length); let beta = 0; const lambda = 0.05, lr = 0.5;
  for (let it = 0; it < 300 && pairs.length; it++) {
    const g = new Float64Array(N.length), h = new Float64Array(N.length); let gb = 0, hb = 0;
    for (const p of pairs) {
      const q = 1 / (1 + Math.exp(-(s[p.i] - s[p.j] + beta)));
      const r = p.n * (p.t - q), w = p.n * q * (1 - q);
      g[p.i] += r; g[p.j] -= r; h[p.i] += w; h[p.j] += w; gb += r; hb += w;
    }
    for (let i = 0; i < N.length; i++) s[i] += lr * (g[i] - lambda * s[i]) / (h[i] + lambda + 1e-9);
    beta += lr * gb / (hb + 1e-9);
    const mean = s.reduce((x, y) => x + y, 0) / (N.length || 1); for (let i = 0; i < N.length; i++) s[i] -= mean;
  }
  const info = new Float64Array(N.length);
  for (const p of pairs) { const q = 1 / (1 + Math.exp(-(s[p.i] - s[p.j] + beta))); info[p.i] += p.n * q * (1 - q); info[p.j] += p.n * q * (1 - q); }

  // ---- 3. mémoire : d' avec correction par personne ----
  const mem: Record<string, { hit: number; hn: number; fa: number; fn: number }> = {};
  const pr: Record<string, { h: number; hn: number; f: number; fn: number }> = {};
  const recalls = good.filter((e) => e.type === "recall" && Array.isArray(e.d.seen) && Array.isArray(e.d.decoys) && Array.isArray(e.d.picked));
  for (const e of recalls) { const p = (pr[e.rid] ??= { h: 0, hn: 0, f: 0, fn: 0 }); const pk = new Set(e.d.picked);
    for (const n of e.d.seen) { p.hn++; if (pk.has(n)) p.h++; } for (const n of e.d.decoys) { p.fn++; if (pk.has(n)) p.f++; } }
  const tot = Object.values(pr).reduce((a, p) => ({ h: a.h + p.h, hn: a.hn + p.hn, f: a.f + p.f, fn: a.fn + p.fn }), { h: 0, hn: 0, f: 0, fn: 0 });
  const gH = tot.hn ? tot.h / tot.hn : 0.5, gF = tot.fn ? tot.f / tot.fn : 0.2;
  for (const e of recalls) { const p = pr[e.rid], pk = new Set(e.d.picked);
    const ph = p.hn ? p.h / p.hn : gH, pf = p.fn ? p.f / p.fn : gF;
    for (const n of e.d.seen) { const m = (mem[n] ??= { hit: 0, hn: 0, fa: 0, fn: 0 }); m.hn++; m.hit += (pk.has(n) ? 1 : 0) - ph + gH; }
    for (const n of e.d.decoys) { const m = (mem[n] ??= { hit: 0, hn: 0, fa: 0, fn: 0 }); m.fn++; m.fa += (pk.has(n) ? 1 : 0) - pf + gF; } }

  // ---- 4. orthographe, compréhension ----
  const sp: Record<string, { ok: number; n: number }> = {}, mn: Record<string, { ok: number; n: number }> = {};
  for (const e of good) {
    if (e.type === "spell" && e.d.name) { const x = (sp[e.d.name] ??= { ok: 0, n: 0 }); x.n++; if (String(e.d.typed || "").toLowerCase().replace(/[^a-z]/g, "") === e.d.name.toLowerCase()) x.ok++; }
    if (e.type === "meaning" && e.d.name) { const x = (mn[e.d.name] ??= { ok: 0, n: 0 }); x.n++; if (e.d.answer === "deals") x.ok++; }
  }

  // ---- 5. viralité ----
  const rids = new Set(ev.map((e) => e.rid));
  const viral = { referred: new Set<string>(), starts: new Set<string>(), shares: 0 };
  for (const e of ev) if (e.type === "session") { if (e.d.ref) viral.referred.add(e.rid); if (e.d.shared) viral.shares++; if (e.d.start) viral.starts.add(e.rid); }

  const every = new Set<string>([...N, ...Object.keys(mem), ...Object.keys(sp), ...Object.keys(mn)]);
  const rows: any[] = [...every].map((n) => {
    const i = idx.get(n); const pref = i != null ? s[i] : null; const se = i != null && info[i] > 0 ? 1 / Math.sqrt(info[i]) : null;
    const m = mem[n];
    const H = m && m.hn ? Math.min(0.99, Math.max(0.01, (m.hit + 0.5) / (m.hn + 1))) : null;
    const F = m && m.fn ? Math.min(0.99, Math.max(0.01, (m.fa + 0.5) / (m.fn + 1))) : null;
    const dprime = H != null ? zinv(H) - zinv(F ?? Math.min(0.99, Math.max(0.01, gF))) : null;
    return { name: n, pref, se, duels: shown[n] || 0, winRate: shown[n] ? Math.round((100 * (won[n] || 0)) / shown[n]) : null,
      dprime, recallN: m?.hn || 0, recall: m && m.hn ? Math.round((100 * m.hit) / m.hn) : null, falseAlarm: m && m.fn ? Math.round((100 * m.fa) / m.fn) : null,
      spelling: sp[n] ? Math.round((100 * sp[n].ok) / sp[n].n) : null, spellN: sp[n]?.n || 0, meaning: mn[n] ? Math.round((100 * mn[n].ok) / mn[n].n) : null, meaningN: mn[n]?.n || 0,
      _spell: sp[n] ? (sp[n].ok + 1) / (sp[n].n + 2) : null, _mean: mn[n] ? (mn[n].ok + 1) / (mn[n].n + 2) : null };
  });
  const zs = (k: string) => { const v = rows.map((r) => r[k]).filter((x) => x != null) as number[]; const mu = v.reduce((a, b) => a + b, 0) / (v.length || 1); const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length || 1)) || 1; return (x: number | null) => (x == null ? 0 : (x - mu) / sd); };
  const zp = zs("pref"), zm = zs("dprime"), zsp = zs("_spell"), zme = zs("_mean");
  for (const r of rows) r.score = Math.round(100 * (0.6 * zp(r.pref) + 0.25 * zm(r.dprime) + 0.1 * zsp(r._spell) + 0.05 * zme(r._mean))) / 100;
  rows.sort((a, b) => b.score - a.score);
  const best = [...rows].filter((r) => r.pref != null).sort((a, b) => b.pref - a.pref)[0];
  for (const r of rows) {
    r.tiedWithTop = !!(best && r !== best && r.pref != null && r.se != null && best.se != null && best.pref - r.pref < 1.96 * Math.sqrt(r.se ** 2 + best.se ** 2));
    r.elo = r.pref != null ? Math.round(1500 + 173.7 * r.pref) : null; // échelle Elo pour la lecture
    r.eloLo = r.pref != null && r.se != null ? Math.round(1500 + 173.7 * (r.pref - 1.96 * r.se)) : null;
    r.eloHi = r.pref != null && r.se != null ? Math.round(1500 + 173.7 * (r.pref + 1.96 * r.se)) : null;
    r.dprime = r.dprime != null ? Math.round(100 * r.dprime) / 100 : null;
  }
  for (const r of rows) { delete r._spell; delete r._mean; delete r.pref; delete r.se; }
  return Response.json({
    respondents: rids.size, excludedLowQuality: bad.size, duels, positionBias: duels ? Math.round((100 * topWins) / duels) : null,
    memoryBaseline: { hit: Math.round(100 * gH), falseAlarm: Math.round(100 * gF) }, rows,
    viral: { started: viral.starts.size, referred: viral.referred.size, shares: viral.shares, k: viral.starts.size ? Math.round((100 * viral.referred.size) / Math.max(1, viral.starts.size - viral.referred.size)) / 100 : 0 },
    owner: { duels: owner.filter((r) => r.type === "duel").length, picks: ownerPicks },
  }, { headers: { "cache-control": "no-store" } });
};
