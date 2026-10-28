import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FEEDS } from "@/config/cities";
import { markPages, projectFeed, rankDeals } from "@/lib/project";
import type { PublicDeal, RawDeal } from "@/lib/types";

/** Le flux fait plusieurs Mo (au-delà du Data Cache de Next) : mémo en mémoire
 * par processus de build, pour ne le télécharger qu'une fois par worker. */
const TTL_MS = 15 * 60 * 1000;
let memo: { at: number; deals: PublicDeal[]; generatedAt: string } | null = null;

async function loadRaw(url: string): Promise<{ generated_at?: string; deals: RawDeal[] }> {
  if (process.env.DATA_FIXTURE === "1") {
    const p = path.join(process.cwd(), "fixtures", "universal.sample.json");
    return JSON.parse(await readFile(p, "utf8"));
  }
  const res = await fetch(url, { cache: "force-cache", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`feed ${url}: HTTP ${res.status}`);
  return res.json();
}

export async function getDeals(): Promise<{ deals: PublicDeal[]; generatedAt: string }> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo;
  const results = await Promise.allSettled(FEEDS.map(async (f) => ({ f, raw: await loadRaw(f.url) })));
  const deals: PublicDeal[] = [];
  let generatedAt = "";
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(JSON.stringify({ level: "error", msg: "feed_failed", error: String(r.reason) }));
      continue;
    }
    // Fixture hors ligne : « maintenant » = date de l'échantillon, pour un build
    // reproductible (sinon tous les deals de l'échantillon finissent expirés).
    const fixtureNow = process.env.DATA_FIXTURE === "1" && r.value.raw.generated_at ? new Date(r.value.raw.generated_at) : null;
    deals.push(...projectFeed(r.value.raw.deals ?? [], r.value.f, fixtureNow ?? new Date()));
    generatedAt = r.value.raw.generated_at ?? generatedAt;
  }
  // Un flux en panne ne vide jamais le site : dernière version connue, sinon
  // erreur → l'ISR conserve la page précédente au lieu de publier une page vide.
  if (!deals.length) {
    if (memo) return memo;
    throw new Error("aucun flux disponible");
  }
  memo = { at: Date.now(), deals: markPages(rankDeals(deals)), generatedAt };
  return memo;
}
