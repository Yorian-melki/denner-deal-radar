import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CITIES } from "@/config/cities";
import { CATEGORIES, categoryForFamily } from "@/lib/categories";
import { dealSlug, hasPage, inCity, markPages, projectDeal, projectFeed, slugify } from "@/lib/project";
import type { Feed, RawDeal } from "@/lib/types";

const FEED: Feed = { id: "ch-sg", country: "CH", currency: "CHF", url: "x", cities: ["st-gallen"] };
const NOW = new Date("2026-10-27T12:00:00+01:00");
const base: RawDeal = {
  deal_id: "qoqa:1", source_id: "qoqa", title: "Kopfhörer Über-Ohr", family: "flash",
  source_url: "https://www.qoqa.ch/de/offers/1", current_price: 49, reference_price: 99,
  deal_score: 7.2, geographic_scope_resolved: "ONLINE", lifecycle: "ACTIVE",
  personal_relevance: 0.9, distance_km: 1.2, favorite: true, eligible_home: true,
};

describe("projectDeal", () => {
  it("liste blanche : aucun champ personnel ne fuit", () => {
    const p = projectDeal(base, FEED, NOW)!;
    const json = JSON.stringify(p);
    for (const k of ["personal_relevance", "distance_km", "favorite", "eligible_home", "0.9", "1.2"]) expect(json).not.toContain(k);
    expect(p).toMatchObject({ price: 49, referencePrice: 99, score: 7.2, category: "tech-deals", cities: ["*"] });
  });

  it("masque expirés, retirés, épuisés, doublons et dates de fin passées", () => {
    expect(projectDeal({ ...base, lifecycle: "EXPIRED" }, FEED, NOW)).toBeNull();
    expect(projectDeal({ ...base, sold_out: true }, FEED, NOW)).toBeNull();
    expect(projectDeal({ ...base, duplicate_of: "x" }, FEED, NOW)).toBeNull();
    expect(projectDeal({ ...base, ends_at: "2026-10-26T23:59:00+01:00" }, FEED, NOW)).toBeNull();
    expect(projectDeal({ ...base, ends_at: "2026-10-28T23:59:00+01:00" }, FEED, NOW)).not.toBeNull();
  });

  it("réduction invraisemblable : listé mais sans note", () => {
    const p = projectDeal({ ...base, family: "grocery", current_price: 0.05, reference_price: 2.95, discount_percentage: 98.3, deal_score: 10 }, FEED, NOW)!;
    expect(p.score).toBeUndefined();
    expect(projectDeal({ ...base, family: "free", discount_percentage: 100, deal_score: 9 }, FEED, NOW)!.score).toBe(9);
  });

  it("refuse les URL non http(s)", () => {
    expect(projectDeal({ ...base, source_url: "javascript:x" }, FEED, NOW)).toBeNull();
  });

  it("deal local rattaché à la ville du flux seulement", () => {
    const p = projectDeal({ ...base, geographic_scope_resolved: "LOCAL" }, FEED, NOW)!;
    expect(inCity(p, { slug: "st-gallen", country: "CH" })).toBe(true);
    expect(inCity(p, { slug: "zuerich", country: "CH" })).toBe(false);
    const online = projectDeal(base, FEED, NOW)!;
    expect(inCity(online, { slug: "zuerich", country: "CH" })).toBe(true);
    expect(inCity(online, { slug: "paris", country: "FR" })).toBe(false);
  });
});

describe("markPages", () => {
  it("note ≥ 5 seulement, plafonné, dans l'ordre du classement", () => {
    const mk = (score?: number) => projectDeal({ ...base, deal_id: `q:${score}`, title: `T${score}`, deal_score: score }, FEED, NOW)!;
    const ranked = [mk(9), mk(8), mk(6), mk(4.9), mk(undefined)];
    expect(markPages(ranked).map(hasPage)).toEqual([true, true, true, false, false]);
    expect(markPages(ranked, 2).map(hasPage)).toEqual([true, true, false, false, false]);
  });
});

describe("slugs", () => {
  it("stables, ASCII, uniques par id", () => {
    expect(slugify("Über Äpfel & Café — 2×")).toBe("uber-apfel-cafe-2");
    expect(dealSlug("a:1", "X")).toBe(dealSlug("a:1", "X"));
    expect(dealSlug("a:1", "X")).not.toBe(dealSlug("a:2", "X"));
  });
});

describe("catégories et villes", () => {
  it("chaque famille du scanner a une catégorie", () => {
    const families = ["grocery","retail","tech","flash","surplus","free","secondhand","refurbished","restaurant","student",
      "transport","travel","event","subscription","cashback","coupon","contest","digital_free","local_news"];
    const slugs = new Set(CATEGORIES.map((c) => c.slug));
    for (const f of families) expect(slugs.has(categoryForFamily(f))).toBe(true);
  });
  it("slugs de ville uniques", () => {
    expect(new Set(CITIES.map((c) => c.slug)).size).toBe(CITIES.length);
  });
});

describe("flux réel (échantillon)", () => {
  it("projette l'échantillon sans erreur, trié par note", () => {
    const raw = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "fixtures", "universal.sample.json"), "utf8"));
    const deals = projectFeed(raw.deals, FEED, new Date(raw.generated_at));
    expect(deals.length).toBeGreaterThan(50);
    expect(new Set(deals.map((d) => d.slug)).size).toBe(deals.length);
    const scores = deals.map((d) => d.score ?? -1);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
