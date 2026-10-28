import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CITIES, launchedCities, localeForPath } from "@/config/cities";
import { CATEGORIES } from "@/lib/categories";
import { CATEGORY_TEXT, DICTS, dict } from "@/lib/i18n";
import { projectDeal, projectFeed } from "@/lib/project";
import {
  balancedSections, dedupeProducts, hasRealEnd, isLowestSeen, isVerifiedSaving, pickTop, productKey,
  timeLeft, weeklySavings, whatsappUrl,
} from "@/lib/select";
import { telegramUrl } from "@/lib/site";
import type { Feed, PublicDeal, RawDeal } from "@/lib/types";

const FEED: Feed = { id: "ch-sg", country: "CH", currency: "CHF", url: "x", cities: ["st-gallen"] };
const NOW = new Date("2026-10-27T12:00:00+01:00");

let seq = 0;
/** Deal public minimal pour les règles d'affichage. */
function mk(p: Partial<PublicDeal> = {}): PublicDeal {
  seq++;
  return {
    id: `d:${seq}`, slug: `d-${seq}`, title: `Deal ${seq}`, source: "src", merchant: "Shop A",
    family: "tech", category: "tech-deals", geo: "ONLINE", cities: ["*"], country: "CH",
    currency: "CHF", conditions: [], url: "https://example.ch/x", attribution: "Shop A",
    score: 5, confidence: 0.9, ...p,
  };
}

describe("dedupeProducts", () => {
  it("même GTIN chez plusieurs magasins → une carte, la meilleure, avec « aussi chez »", () => {
    const a = mk({ merchant: "Galaxus", entityId: "gtin:07611234567890", score: 6, price: 20 });
    const b = mk({ merchant: "Digitec", entityId: "gtin:07611234567890", score: 8, price: 21 });
    const c = mk({ merchant: "BRACK", entityId: "gtin:07611234567890", score: 6, price: 19 });
    const other = mk({ merchant: "Galaxus", entityId: "sku:galaxus:1" });
    const out = dedupeProducts([a, other, b, c]);
    expect(out.map((d) => d.id)).toEqual([other.id, b.id]);
    expect(out[1].alsoAt?.sort()).toEqual(["BRACK", "Galaxus"]);
  });

  it("à note égale, le prix le plus bas gagne ; les sku:/t: ne sont jamais fusionnés", () => {
    const a = mk({ merchant: "X", entityId: "mpn:apple:mx1", score: 6, price: 20 });
    const b = mk({ merchant: "Y", entityId: "mpn:apple:mx1", score: 6, price: 18 });
    expect(dedupeProducts([a, b]).map((d) => d.id)).toEqual([b.id]);
    const s1 = mk({ entityId: "sku:denner:1" }), s2 = mk({ entityId: "sku:denner:1" });
    expect(dedupeProducts([s1, s2])).toHaveLength(2);
    expect(productKey(mk({ entityId: "t:migros:apfel" }))).toBeUndefined();
    expect(productKey(mk({ entityId: "game:terrascape" }))).toBe("game:terrascape");
  });

  it("même magasin deux fois : pas de « aussi chez » vide", () => {
    const a = mk({ merchant: "X", entityId: "gtin:1", score: 7 });
    const b = mk({ merchant: "x ", entityId: "gtin:1", score: 5 });
    expect(dedupeProducts([a, b])[0].alsoAt).toBeUndefined();
  });
});

describe("pickTop", () => {
  it("jamais de deal non noté", () => {
    const list = [mk({ score: undefined }), mk({ score: 2 }), mk({ score: undefined, merchant: "B" })];
    expect(pickTop(list).every((d) => d.score !== undefined)).toBe(true);
    expect(pickTop(list)).toHaveLength(1);
  });

  it("max. 2 par marchand dans un top 12, même si le marchand domine le classement", () => {
    const list = [
      ...Array.from({ length: 10 }, (_, i) => mk({ merchant: "Denner", score: 9 - i * 0.1, category: "supermarkt-aktionen" })),
      ...Array.from({ length: 10 }, (_, i) => mk({ merchant: `Shop ${i}`, score: 5, category: `cat-${i % 5}` })),
    ];
    const top = pickTop(list);
    expect(top).toHaveLength(12);
    const counts = new Map<string, number>();
    for (const d of top) counts.set(d.merchant!, (counts.get(d.merchant!) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it("l'épicerie ne noie pas les autres catégories (plafond par catégorie)", () => {
    const groceries = Array.from({ length: 20 }, (_, i) => mk({ merchant: `G${i}`, score: 9, category: "supermarkt-aktionen" }));
    const others = Array.from({ length: 12 }, (_, i) => mk({ merchant: `O${i}`, score: 4, category: i % 2 ? "gratis" : "tech-deals" }));
    const top = pickTop([...groceries, ...others]);
    expect(top.filter((d) => d.category === "supermarkt-aktionen").length).toBe(4);
    expect(top).toHaveLength(12);
  });

  it("plafond par catégorie relâché seulement s'il manque des deals (jamais celui par marchand)", () => {
    const only = Array.from({ length: 8 }, (_, i) => mk({ merchant: `G${i % 3}`, category: "supermarkt-aktionen" }));
    const top = pickTop(only);
    expect(top).toHaveLength(6); // 3 marchands × 2
  });

  it("conserve l'ordre du classement et dédoublonne les produits", () => {
    const a = mk({ merchant: "A", score: 9, entityId: "gtin:5" });
    const b = mk({ merchant: "B", score: 8, entityId: "gtin:5" });
    const c = mk({ merchant: "C", score: 7 });
    const top = pickTop([a, b, c]);
    expect(top.map((d) => d.id)).toEqual([a.id, c.id]);
    expect(top[0].alsoAt).toEqual(["B"]);
  });
});

describe("balancedSections", () => {
  it("sections de taille égale, ordonnées par meilleure note, exclusion respectée", () => {
    const deals = [
      ...Array.from({ length: 30 }, (_, i) => mk({ merchant: `G${i}`, score: 3, category: "supermarkt-aktionen" })),
      mk({ merchant: "T1", score: 8, category: "tech-deals" }),
      mk({ merchant: "F1", score: undefined, category: "gratis" }),
    ];
    const s = balancedSections(deals, CATEGORIES.map((c) => c.slug), { perSection: 4 });
    expect(s.map((x) => x.slug)).toEqual(["tech-deals", "supermarkt-aktionen", "gratis"]);
    expect(s.find((x) => x.slug === "supermarkt-aktionen")!.items).toHaveLength(4);
    expect(s.find((x) => x.slug === "supermarkt-aktionen")!.total).toBe(30);
    const scoredOnly = balancedSections(deals, CATEGORIES.map((c) => c.slug), { scoredOnly: true, exclude: new Set([deals[30].id]) });
    expect(scoredOnly.map((x) => x.slug)).toEqual(["supermarkt-aktionen"]);
  });
});

describe("chiffres d'accroche (vrais uniquement)", () => {
  const asOf = new Date("2026-10-14T03:00:00+02:00");
  const recent = "2026-10-13T10:00:00+02:00";

  it("weeklySavings : notés, référence vérifiable, vus cette semaine, produit compté une fois", () => {
    const deals = [
      mk({ discountAbs: 10, referenceType: "merchant_previous", firstSeenAt: recent }),
      mk({ discountAbs: 5.5, referenceType: "catalog", firstSeenAt: recent, entityId: "gtin:9", merchant: "A" }),
      mk({ discountAbs: 5.5, referenceType: "catalog", firstSeenAt: recent, entityId: "gtin:9", merchant: "B" }),
      mk({ discountAbs: 99, referenceType: "merchant_previous", firstSeenAt: recent, score: undefined }), // non noté / invraisemblable
      mk({ discountAbs: 50, referenceType: "stated_percent_only", firstSeenAt: recent }),               // référence faible
      mk({ discountAbs: 40, referenceType: "merchant_previous", firstSeenAt: "2026-09-01T00:00:00+02:00" }), // trop ancien
      mk({ discountAbs: 30, referenceType: "msrp", firstSeenAt: recent, score: 0 }),                     // note 0
      mk({ discountAbs: 7, referenceType: "market" }),                                                    // date inconnue
    ];
    expect(weeklySavings(deals, asOf)).toEqual({ total: 15.5, count: 2 });
    expect(weeklySavings([], asOf)).toEqual({ total: 0, count: 0 });
  });

  it("le garde-fou de réduction invraisemblable exclut le deal du total", () => {
    const raw: RawDeal = {
      deal_id: "coop:1", source_id: "coop", title: "Äpfel", family: "grocery", source_url: "https://coop.ch/x",
      current_price: 0.05, reference_price: 2.95, discount_percentage: 98.3, discount_absolute: 2.9,
      reference_price_type: "merchant_previous", deal_score: 10, first_seen_at: "2026-10-27T00:00:00+01:00",
    };
    const p = projectDeal(raw, FEED, NOW)!;
    expect(isVerifiedSaving(p)).toBe(false);
  });

  it("badge « prix le plus bas » seulement prouvé par l'historique", () => {
    expect(isLowestSeen(mk({ price: 10, historicalLow: 10, historyN: 5 }))).toBe(true);
    expect(isLowestSeen(mk({ price: 10, historicalLow: 9.5, historyN: 5 }))).toBe(false);
    expect(isLowestSeen(mk({ price: 0, historicalLow: 0, historyN: 1 }))).toBe(false);
    expect(isLowestSeen(mk({ price: 10 }))).toBe(false);
  });

  it("compte à rebours seulement pour une date de fin publiée", () => {
    expect(hasRealEnd({ endsAt: "2026-10-30T23:59:00+01:00" })).toBe(true);
    expect(hasRealEnd({ endsAt: "2026-10-30T23:59:00+01:00", endsInferred: true })).toBe(false);
    expect(hasRealEnd({})).toBe(false);
    expect(timeLeft("2026-10-29T15:30:00+01:00", NOW)).toMatchObject({ days: 2, hours: 3, minutes: 30 });
    expect(timeLeft("2026-10-20T00:00:00+01:00", NOW).ms).toBe(0);
  });
});

describe("projection des nouveaux champs", () => {
  it("historique, type de référence, économie absolue, date de fin déduite", () => {
    const p = projectDeal({
      deal_id: "g:1", source_id: "galaxus", title: "X", family: "tech", source_url: "https://galaxus.ch/x",
      current_price: 10, reference_price: 15, discount_absolute: 5, reference_price_type: "merchant_previous",
      historical_low: 10, historical_median: 14, history_n: 6, canonical_entity_id: "gtin:1", ends_at: "2026-10-30T00:00:00+01:00", ends_inferred: true,
    }, FEED, NOW)!;
    expect(p).toMatchObject({ discountAbs: 5, referenceType: "merchant_previous", historicalLow: 10, historicalMedian: 14, historyN: 6, entityId: "gtin:1", endsInferred: true });
  });

  it("échantillon réel : top 12 conforme aux règles", () => {
    const raw = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "fixtures", "universal.sample.json"), "utf8"));
    const deals = projectFeed(raw.deals, FEED, new Date(raw.generated_at));
    const top = pickTop(deals);
    expect(top.length).toBeGreaterThan(0);
    expect(top.every((d) => d.score !== undefined)).toBe(true);
    const m = new Map<string, number>();
    for (const d of top) m.set(d.merchant ?? d.source, (m.get(d.merchant ?? d.source) ?? 0) + 1);
    expect(Math.max(...m.values())).toBeLessThanOrEqual(2);
    expect(weeklySavings(deals, new Date(raw.generated_at)).total).toBeGreaterThan(0);
  });
});

describe("i18n et villes", () => {
  it("toutes les langues ont les mêmes clés, et chaque catégorie est traduite", () => {
    const keys = Object.keys(DICTS.de).sort();
    for (const l of ["fr", "en"] as const) expect(Object.keys(DICTS[l]).sort()).toEqual(keys);
    for (const l of ["de", "fr", "en"] as const) for (const c of CATEGORIES) expect(CATEGORY_TEXT[l][c.slug]).toBeDefined();
    for (const l of ["de", "fr", "en"] as const) expect(Object.keys(DICTS[l].refTypes).sort()).toEqual(Object.keys(DICTS.de.refTypes).sort());
  });

  it("langue par ville ; EN en repli", () => {
    expect(dict("xx")).toBe(DICTS.en);
    expect(localeForPath("/lausanne/gratis")).toBe("fr");
    expect(localeForPath("/st-gallen")).toBe("de");
    expect(localeForPath("/deal/x")).toBe("de");
    const byslug = Object.fromEntries(CITIES.map((c) => [c.slug, c]));
    for (const s of ["zuerich", "bern", "basel"]) expect(byslug[s]).toMatchObject({ locale: "de", launched: false });
    for (const s of ["lausanne", "geneve"]) expect(byslug[s]).toMatchObject({ locale: "fr", launched: false });
    expect(launchedCities().map((c) => c.slug)).toEqual(["st-gallen"]);
  });

  it("aucun texte d'interface ne fabrique de rareté ni de preuve sociale", () => {
    const all = JSON.stringify(DICTS, (_k, v) => (typeof v === "function" ? v(1, 2, 3) : v)).toLowerCase();
    for (const bad of ["nur noch", "beeil", "schnell", "dépêche", "plus que", "hurry", "only a few", "personen sehen", "people are viewing", "vergriffen bald"])
      expect(all).not.toContain(bad);
  });
});

describe("partage et Telegram", () => {
  it("lien WhatsApp encodé", () => {
    expect(whatsappUrl("A & B", "https://x.ch/d?a=1")).toBe(`https://wa.me/?text=${encodeURIComponent("A & B\nhttps://x.ch/d?a=1")}`);
  });
  it("URL Telegram : seulement https://t.me", () => {
    expect(telegramUrl(undefined)).toBeUndefined();
    expect(telegramUrl("")).toBeUndefined();
    expect(telegramUrl("https://t.me/somechannel")).toBe("https://t.me/somechannel");
    expect(telegramUrl("javascript:alert(1)")).toBeUndefined();
    expect(telegramUrl("https://evil.example/t.me")).toBeUndefined();
  });
});

import { pickTop as _pickTop, dedupeProducts as _dedupe } from "@/lib/select";
describe("honnêteté des vitrines", () => {
  const mk = (o: any) => ({ id: o.id, slug: o.id, title: o.title ?? o.id, source: "s", merchant: o.merchant ?? "M", family: "retail", category: o.category ?? "shopping",
    geo: "NATIONAL", cities: ["*"], country: "CH", currency: "CHF", conditions: [], url: "https://x.ch", attribution: "x", score: o.score ?? 8, confidence: o.confidence ?? 0.9, price: o.price, ...o });
  it("une réduction peu fiable n'est jamais en vitrine", () => {
    const top = _pickTop([mk({ id: "vpn", score: 9.3, confidence: 0.55, merchant: "VPN" }), mk({ id: "ok", score: 7, merchant: "B" })] as any);
    expect(top.map((d) => d.id)).toEqual(["ok"]);
  });
  it("variantes quasi identiques du même marchand fusionnées", () => {
    const out = _dedupe([mk({ id: "a", title: "Vanish Oxi Action Fleckentferner Pulver", price: 12.95, merchant: "Denner" }),
      mk({ id: "b", title: "Vanish Oxi Action Fleckentferner Pulver White", price: 12.95, merchant: "Denner" }),
      mk({ id: "c", title: "Vanish Oxi Action Gel", price: 9.95, merchant: "Denner" })] as any);
    expect(out.map((d) => d.id)).toEqual(["a", "c"]);
  });
});
