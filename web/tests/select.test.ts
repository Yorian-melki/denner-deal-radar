import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CITIES, launchedCities } from "@/config/cities";
import { CATEGORIES } from "@/lib/categories";
import { CATEGORY_TEXT, DICTS, LOCALES, dict } from "@/lib/i18n";
import { projectFeed } from "@/lib/project";
import {
  balancedSections, categoryCounts, confidenceTier, dedupeProducts, hasRealEnd, isLowestSeen, MIN_CONFIDENCE_TOP,
  pickTop, productKey, savingPct, scoreTier, timeLeft, unitSaving, whatsappUrl,
} from "@/lib/select";
import { telegramUrl } from "@/lib/site";
import type { Feed, PublicDeal } from "@/lib/types";

const FEED: Feed = { id: "ch-sg", country: "CH", currency: "CHF", url: "x", cities: ["st-gallen"] };
const NOW = new Date("2026-10-27T12:00:00+01:00");

let seq = 0;
/** Deal public minimal pour les règles d'affichage. */
function mk(p: Partial<PublicDeal> = {}): PublicDeal {
  seq++;
  return {
    id: `d:${seq}`, slug: `d-${seq}`, title: `Deal ${seq}`, source: "src", merchant: "Shop A", brand: `B${seq}`,
    family: "tech", category: "tech-deals", geo: "ONLINE", cities: ["*"], country: "CH",
    currency: "CHF", conds: [], url: "https://example.ch/x", attribution: "Shop A",
    refKind: "comparable", verifiedRef: true, score: 5, confidence: 0.9, ...p,
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

  it("à note égale, le prix le plus bas gagne ; les sku:/t: ne sont jamais fusionnés entre magasins", () => {
    const a = mk({ merchant: "X", entityId: "mpn:apple:mx1", score: 6, price: 20 });
    const b = mk({ merchant: "Y", entityId: "mpn:apple:mx1", score: 6, price: 18 });
    expect(dedupeProducts([a, b]).map((d) => d.id)).toEqual([b.id]);
    const s1 = mk({ entityId: "sku:denner:1" }), s2 = mk({ entityId: "sku:denner:1" });
    expect(dedupeProducts([s1, s2])).toHaveLength(2);
    expect(productKey(mk({ entityId: "game:terrascape" }))).toBe("game:terrascape");
  });

  it("même action, plusieurs variétés (Mövenpick Crema / Il Divino / Himmlische) → 1 carte « +2 Sorten »", () => {
    const base = { merchant: "Coop", brand: "Mövenpick", price: 13.15, referencePrice: 35.85, endsAt: "2026-10-28T23:59:59+01:00", category: "supermarkt-aktionen" };
    const crema = mk({ ...base, title: "Mövenpick Bohnenkaffee Caffè Crema 3x500g", score: 8.2 });
    const divino = mk({ ...base, title: "Mövenpick Bohnenkaffee Il Divino 3x500g", score: 8.2 });
    const himmel = mk({ ...base, title: "Mövenpick Himmlische gemahlen 500g", score: undefined });
    const out = dedupeProducts([crema, divino, himmel]);
    expect(out).toHaveLength(1);
    expect(out[0].variants).toBe(2);
    expect(out[0].alsoAt).toBeUndefined();
  });

  it("même magasin deux fois : pas de « aussi chez » vide", () => {
    const a = mk({ merchant: "X", entityId: "gtin:1", score: 7 });
    const b = mk({ merchant: "x ", entityId: "gtin:1", score: 5 });
    expect(dedupeProducts([a, b])[0].alsoAt).toBeUndefined();
  });
});

describe("pickTop", () => {
  it("jamais de deal non noté ni noté 0", () => {
    const list = [mk({ score: undefined }), mk({ score: 2, merchant: "C" }), mk({ score: 0, merchant: "Z" }), mk({ score: undefined, merchant: "B" })];
    const top = pickTop(list);
    expect(top.every((d) => d.score !== undefined && d.score > 0)).toBe(true);
    expect(top).toHaveLength(1);
  });

  it("une réduction peu fiable n'est jamais en vitrine", () => {
    const top = pickTop([mk({ id: "vpn", score: 9.3, confidence: 0.55, merchant: "VPN" }), mk({ id: "ok", score: 7, merchant: "B" })]);
    expect(top.map((d) => d.id)).toEqual(["ok"]);
  });

  it("max. 2 par marchand dans un top 12, même si le marchand domine le classement", () => {
    const list = [
      ...Array.from({ length: 10 }, (_, i) => mk({ merchant: "Denner", score: 9 - i * 0.1, category: "supermarkt-aktionen" })),
      ...Array.from({ length: 10 }, (_, i) => mk({ merchant: `Shop ${i}`, score: 5, category: CATEGORIES[i % 5].slug })),
    ];
    const top = pickTop(list);
    expect(top).toHaveLength(12);
    const counts = new Map<string, number>();
    for (const d of top) counts.set(d.merchant!, (counts.get(d.merchant!) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it("1 seule carte par marque et par marchand", () => {
    const list = [mk({ merchant: "Coop", brand: "Mövenpick", score: 8.2, price: 1 }), mk({ merchant: "Coop", brand: "Mövenpick", score: 8.1, price: 2 }), mk({ merchant: "Coop", brand: "Lindt", score: 8 })];
    expect(pickTop(list).map((d) => d.brand)).toEqual(["Mövenpick", "Lindt"]);
  });

  it("l'épicerie ne noie pas les autres catégories (plafond par catégorie)", () => {
    const groceries = Array.from({ length: 20 }, (_, i) => mk({ merchant: `G${i}`, score: 9, category: "supermarkt-aktionen" }));
    const others = Array.from({ length: 12 }, (_, i) => mk({ merchant: `O${i}`, score: 4, category: i % 2 ? "haushalt" : "tech-deals" }));
    const top = pickTop([...groceries, ...others]);
    expect(top.filter((d) => d.category === "supermarkt-aktionen").length).toBe(4);
    expect(top).toHaveLength(12);
  });

  it("les services (Lokal & Services) ne sont jamais en vitrine", () => {
    expect(pickTop([mk({ category: "lokal", score: 9 })])).toHaveLength(0);
  });

  it("plafond par catégorie relâché seulement s'il manque des deals (jamais celui par marchand)", () => {
    const only = Array.from({ length: 8 }, (_, i) => mk({ merchant: `G${i % 3}`, category: "supermarkt-aktionen" }));
    expect(pickTop(only)).toHaveLength(6); // 3 marchands × 2
  });

  it("conserve l'ordre du classement et dédoublonne les produits", () => {
    const a = mk({ merchant: "A", score: 9, entityId: "gtin:5" });
    const b = mk({ merchant: "B", score: 8, entityId: "gtin:5" });
    const c = mk({ merchant: "C", score: 7 });
    const top = pickTop([a, b, c]);
    expect(top.map((d) => d.id)).toEqual([a.id, c.id]);
    expect(top[0].alsoAt).toEqual(["B"]);
  });

  it("note minimale (accueil)", () => {
    expect(pickTop([mk({ score: 5.4 }), mk({ score: 5.5, merchant: "B" })], { minScore: 5.5 })).toHaveLength(1);
  });
});

describe("balancedSections", () => {
  it("ordre fixe des catégories (Studis, Gratis d'abord), sections de taille égale, compteurs canoniques", () => {
    const deals = [
      ...Array.from({ length: 30 }, (_, i) => mk({ merchant: `G${i}`, score: 3, category: "supermarkt-aktionen" })),
      mk({ merchant: "T1", score: 8, category: "tech-deals" }),
      mk({ merchant: "F1", score: undefined, category: "gratis", firstSeenAt: "2026-10-27T00:00:00Z" }),
      mk({ merchant: "S1", score: undefined, category: "studenten-rabatte" }),
    ];
    const s = balancedSections(deals, CATEGORIES.map((c) => c.slug), { perSection: 4 });
    expect(s.map((x) => x.slug)).toEqual(["studenten-rabatte", "gratis", "supermarkt-aktionen", "tech-deals"]);
    expect(s.find((x) => x.slug === "supermarkt-aktionen")!.items).toHaveLength(4);
    expect(s.find((x) => x.slug === "supermarkt-aktionen")!.total).toBe(categoryCounts(deals).get("supermarkt-aktionen"));
  });

  it("accueil : note ≥ 5.5 et au moins 2 cartes par section", () => {
    const deals = [mk({ score: 9, merchant: "A" }), mk({ score: 3, category: "haushalt", merchant: "B" }), mk({ score: 6, category: "haushalt", merchant: "C" })];
    const s = balancedSections(deals, CATEGORIES.map((c) => c.slug), { minScore: 5.5, minItems: 2 });
    expect(s).toHaveLength(0);
  });
});

describe("faits par deal (vrais uniquement)", () => {
  it("badge « prix le plus bas » seulement prouvé par l'historique", () => {
    expect(isLowestSeen(mk({ price: 10, historicalLow: 10, historyN: 5 }))).toBe(true);
    expect(isLowestSeen(mk({ price: 10, historicalLow: 9.5, historyN: 5 }))).toBe(false);
    expect(isLowestSeen(mk({ price: 0, historicalLow: 0, historyN: 1 }))).toBe(false);
    expect(isLowestSeen(mk({ price: 10 }))).toBe(false);
  });

  it("date de fin seulement si publiée", () => {
    expect(hasRealEnd({ endsAt: "2026-10-30T23:59:00+01:00" })).toBe(true);
    expect(hasRealEnd({ endsAt: "2026-10-30T23:59:00+01:00", endsInferred: true })).toBe(false);
    expect(hasRealEnd({})).toBe(false);
    expect(timeLeft("2026-10-29T15:30:00+01:00", NOW)).toMatchObject({ days: 2, hours: 3, minutes: 30 });
    expect(timeLeft("2026-10-20T00:00:00+01:00", NOW).ms).toBe(0);
  });

  it("économie et pourcentage seulement avec une référence vérifiée", () => {
    expect(unitSaving(mk({ price: 10 }))).toBeUndefined();
    expect(unitSaving(mk({ price: 10, referencePrice: 8 }))).toBeUndefined();
    expect(unitSaving(mk({ price: 10, referencePrice: 13.5 }))).toBe(3.5);
    expect(unitSaving(mk({ price: 10, referencePrice: 13.5, discountAbs: 3.4 }))).toBe(3.4);
    expect(unitSaving(mk({ price: 10, referencePrice: 13.5, verifiedRef: false }))).toBeUndefined();
    expect(savingPct(mk({ price: 10, referencePrice: 20 }))).toBe(50);
    expect(savingPct(mk({ price: 10, referencePrice: 10.05 }))).toBeUndefined(); // < 1 % : jamais affiché
    expect(savingPct(mk({ price: 10, referencePrice: 20, verifiedRef: false }))).toBeUndefined();
  });

  it("scoreTier / confidenceTier", () => {
    expect(scoreTier(9)).toBe("top");
    expect(scoreTier(7)).toBe("great");
    expect(scoreTier(6.9)).toBe("good");
    expect(scoreTier(4)).toBe("ok");
    expect(scoreTier(3.9)).toBe("weak");
    expect(confidenceTier(undefined)).toBe("low");
    expect(confidenceTier(MIN_CONFIDENCE_TOP - 0.01)).toBe("low");
    expect(confidenceTier(MIN_CONFIDENCE_TOP)).toBe("mid");
    expect(confidenceTier(0.9)).toBe("high");
  });

  it("échantillon réel : top 12 conforme aux règles", () => {
    const raw = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "fixtures", "universal.sample.json"), "utf8"));
    const deals = projectFeed(raw.deals, FEED, new Date(raw.generated_at));
    const top = pickTop(deals);
    expect(top.length).toBeGreaterThan(0);
    expect(top.every((d) => d.score !== undefined && d.score > 0 && (d.confidence ?? 0) >= MIN_CONFIDENCE_TOP)).toBe(true);
    const m = new Map<string, number>();
    for (const d of top) m.set(d.merchant ?? d.source, (m.get(d.merchant ?? d.source) ?? 0) + 1);
    expect(Math.max(...m.values())).toBeLessThanOrEqual(2);
    // Aucune carte « sehr gut / Top » sans référence vérifiée ; aucun prix barré sur une note 0.
    for (const d of deals) {
      if ((d.score ?? 0) >= 7) expect(d.verifiedRef).toBe(true);
      if (d.score === 0) expect(d.verifiedRef).toBe(false);
    }
  });
});

describe("i18n et villes", () => {
  it("toutes les langues ont les mêmes clés, et chaque catégorie est traduite", () => {
    const keys = Object.keys(DICTS.de).sort();
    for (const l of ["fr", "en"] as const) expect(Object.keys(DICTS[l]).sort()).toEqual(keys);
    for (const l of LOCALES) for (const c of CATEGORIES) expect(CATEGORY_TEXT[l][c.slug]).toBeDefined();
    for (const l of LOCALES) for (const k of ["refTypes", "cond", "scoreTiers", "dq", "units", "regions"] as const)
      expect(Object.keys(DICTS[l][k]).sort()).toEqual(Object.keys(DICTS.de[k]).sort());
  });

  it("nom de ville par langue ; repli DE", () => {
    expect(dict("xx")).toBe(DICTS.de);
    const byslug = Object.fromEntries(CITIES.map((c) => [c.slug, c]));
    expect(byslug.geneve.name).toEqual({ de: "Genf", fr: "Genève", en: "Geneva" });
    expect(byslug["st-gallen"].name.fr).toBe("Saint-Gall");
    expect(launchedCities().map((c) => c.slug)).toEqual(["st-gallen"]);
  });

  /** Toutes les VALEURS (pas les clés) des dictionnaires, fonctions évaluées. */
  const values = (v: unknown): string[] =>
    typeof v === "function" ? [String(v(1, "2", 3))] : typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(values) : [];
  const all = (l?: "de" | "fr" | "en") => values(l ? DICTS[l] : DICTS).join(" | ").toLowerCase();

  it("aucun texte d'interface ne fabrique de rareté, de preuve sociale ni d'auto-éloge", () => {
    for (const bad of ["nur noch", "beeil", "schnell", "dépêche", "plus que", "hurry", "only a few", "personen sehen", "people are viewing", "vergriffen bald",
      "geprüft", "vérifié", "verified", "ehrlich", "honnête", "honest"])
      expect(all()).not.toContain(bad);
  });

  it("FR : tutoiement, « actions », pas de « bons plans » ni d'écriture inclusive à point médian", () => {
    const fr = all("fr");
    expect(fr).not.toMatch(/\bvous\b|\bvotre\b|\bvos\b/);
    expect(fr).not.toContain("bons plans");
    expect(fr).not.toMatch(/\p{L}·\p{L}/u);
  });

  it("aucune flèche décorative dans les chaînes (icônes SVG)", () => {
    expect(all()).not.toMatch(/[→↗›↓]/);
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
