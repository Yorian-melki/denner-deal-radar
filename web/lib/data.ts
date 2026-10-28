import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FEEDS } from "@/config/cities";
import { cleanOutbound } from "@/lib/outbound";
import { markPages, projectFeed, rankDeals } from "@/lib/project";
import type { PublicDeal, RawDeal } from "@/lib/types";

/** Le flux fait plusieurs Mo (au-delà du Data Cache de Next) : mémo en mémoire
 * par processus de build, pour ne le télécharger qu'une fois par worker. */
const TTL_MS = 15 * 60 * 1000;
let memo: { at: number; deals: PublicDeal[]; generatedAt: string } | null = null;

/** Plafond de taille du flux (le flux réel fait ~12 Mo) : au-delà, on refuse. */
const MAX_FEED_BYTES = 25 * 1024 * 1024;
/** Part maximale de deals rejetés pour lien sortant non publiable (affiliation tiers opaque). */
const MAX_REJECTED_LINKS = 0.02;

/** Validation minimale du schéma : un objet avec un tableau `deals` d'objets
 * portant deal_id, source_id, title et family en chaînes. Les entrées non conformes sont ignorées. */
export function validateFeed(data: unknown): { generated_at?: string; deals: RawDeal[] } {
  if (!data || typeof data !== "object" || !Array.isArray((data as { deals?: unknown }).deals)) throw new Error("flux invalide : tableau deals absent");
  const d = data as { generated_at?: unknown; deals: unknown[] };
  const deals = d.deals.filter((x): x is RawDeal => {
    const o = x as Record<string, unknown>;
    return !!o && typeof o === "object" && ["deal_id", "source_id", "title", "family"].every((k) => typeof o[k] === "string");
  });
  return { generated_at: typeof d.generated_at === "string" ? d.generated_at : undefined, deals };
}

/** Part des deals dont le lien sortant est refusé (affiliation tiers impossible à désemballer). */
export function rejectedLinkShare(deals: RawDeal[]): number {
  const withUrl = deals.map((d) => (typeof d.offer_url === "string" && d.offer_url) || (typeof d.source_url === "string" && d.source_url) || "").filter((u) => /^https?:\/\//.test(u));
  if (!withUrl.length) return 0;
  return withUrl.filter((u) => !cleanOutbound(u)).length / withUrl.length;
}

async function loadRaw(url: string): Promise<{ generated_at?: string; deals: RawDeal[] }> {
  if (process.env.DATA_FIXTURE === "1") {
    const p = path.join(process.cwd(), "fixtures", "universal.sample.json");
    return validateFeed(JSON.parse(await readFile(p, "utf8")));
  }
  const res = await fetch(url, { cache: "force-cache", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`feed ${url}: HTTP ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_FEED_BYTES) throw new Error(`feed ${url}: trop volumineux`);
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) throw new Error(`feed ${url}: trop volumineux`);
  const raw = validateFeed(JSON.parse(text));
  const share = rejectedLinkShare(raw.deals);
  console.log(JSON.stringify({ level: "info", msg: "feed_loaded", deals: raw.deals.length, rejectedLinks: Math.round(share * 1000) / 10 }));
  if (share > MAX_REJECTED_LINKS) throw new Error(`feed ${url}: ${Math.round(share * 100)} % de liens sortants non publiables (> 2 %) — vérifier lib/outbound.ts`);
  return raw;
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
