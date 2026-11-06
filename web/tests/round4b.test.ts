import { describe, expect, it } from "vitest";
import { categoryList, unpricedList } from "@/components/CategoryListing";
import { cardNotes, curatorRef, hasPriceInfo, sizeParts, valueText } from "@/components/DealCard";
import { inferSize, packSize, qtyCoverage } from "@/lib/project";
import { baseTitle, canonical, categoryCounts, conditionOf, siblingsOf } from "@/lib/select";
import type { PublicDeal } from "@/lib/types";

let seq = 0;
function mk(p: Partial<PublicDeal> = {}): PublicDeal {
  seq++;
  return {
    id: `b:${seq}`, slug: `b-${seq}`, title: `Deal ${seq}`, source: "src", merchant: `Shop ${seq}`, brand: `B${seq}`,
    family: "retail", category: "refurbished", geo: "NATIONAL", cities: ["*"], country: "CH",
    currency: "CHF", conds: [], url: "https://example.ch/x", attribution: "Shop", refKind: "none", verifiedRef: false, page: true, price: 100, ...p,
  };
}

describe("item 26 : taille du lot", () => {
  it("lit la quantité n'importe où dans package_size", () => {
    expect(packSize("Italien, Sizilien, 2023, 6 x 75 cl", "Vertigine")).toEqual({ text: "6 × 75 cl" });
    expect(packSize("Nordostpazifik, XXL, 28 Stück, 840 g", "Fisch-Sticks")).toEqual({ text: "840 g", pieces: 28 });
    expect(packSize("2 x 52 Waschgänge, 2 x 2,6 Liter", "Perwoll")).toEqual({ text: "2 × 2.6 l", washes: 104 });
    expect(packSize("ca. 350 g, per 100 g", "Bergkäse")).toEqual({ text: "350 g", approx: true, per: "100 g" });
    expect(packSize("ungefähr 0.8 kg/Stück", "Rindsfilet")).toEqual({ text: "0.8 kg", approx: true });
    expect(packSize(null, "Finish", { description: "Gigapack · Pro 7 x 21 Stück · 1 Stk. = 0.17" })).toEqual({ pieces: 147 });
  });
  it("déduit seulement une quantité ronde du prix unitaire publié", () => {
    expect(inferSize(4.5, 6, "kg")).toEqual({ text: "750 g", approx: true });
    expect(inferSize(29.7, 6.6, "l")).toEqual({ text: "4.5 l", approx: true });
    expect(inferSize(8.95, 0.895, "piece")).toEqual({ pieces: 10 });
    expect(inferSize(8.95, 0.85, "piece")).toBeUndefined();
    expect(inferSize(1.23, 7.77, "kg")).toEqual({ text: "160 g", approx: true });
    expect(inferSize(0.01, 7, "kg")).toBeUndefined();
  });
  it("rend la ligne dans chaque langue", () => {
    const d = mk({ size: { text: "350 g", approx: true, per: "100 g", pieces: 4 } });
    expect(sizeParts(d, "de")).toEqual(["4 Stk.", "ca. 350 g", "Preis pro 100 g"]);
    expect(sizeParts(d, "fr")).toEqual(["4 pces", "env. 350 g", "prix pour 100 g"]);
  });
  it("mesure la couverture sur les actions avec prix unitaire", () => {
    const s = (size?: PublicDeal["size"]) => mk({ category: "supermarkt-aktionen", unitPrice: 10, unit: "kg", size });
    expect(qtyCoverage([s({ text: "1 kg" }), s(undefined), s({ pieces: 2 }), s({ text: "2 kg" })]).share).toBe(0.75);
  });
});

describe("item 11 : doublons fusionnés", () => {
  const t = (c: string) => `Apple iPad 9. Gen (2021), 64 GB, Wi-Fi Space Grau / 64 GB / Wi-Fi / ${c} / Neu`;
  const rev = (c: string, price: number) => mk({ merchant: "Revendo", brand: "Apple", title: t(c), price, entityId: `sku:revendo:${price}` });
  it("un produit chez un magasin = une carte, « N Angebote ab », états", () => {
    const list = [rev("Sehr gut", 184), rev("Gebraucht", 171), rev("Wie neu", 196), mk({ title: "Other" })];
    const c = canonical(list);
    expect(c).toHaveLength(2);
    expect(c[0].title).toBe("Apple iPad 9. Gen (2021), 64 GB, Wi-Fi Space Grau");
    expect(c[0].group).toEqual({ n: 3, from: 171, conds: ["Wie neu", "Gebraucht"] });
    expect(cardNotes(c[0], "de")).toEqual(["3 Angebote ab CHF 171.–", "Zustand: wie neu – gebraucht"].map((x) => expect.stringContaining(x.split(" ab ")[0])));
    expect(categoryCounts(list).get("refurbished")).toBe(2);
    expect(siblingsOf(list, list[0]).map((x) => x.price)).toEqual([171, 196]);
  });
  it("états et titre de base", () => {
    expect(conditionOf(t("Sehr gut"))).toBe("Sehr gut");
    expect(baseTitle("Outlet - Sony WH-1000XM5 / schwarz")).toBe("Sony WH-1000XM5");
  });
  it("magasins différents : jamais fusionnés", () => {
    expect(canonical([mk({ title: "X", merchant: "A" }), mk({ title: "X", merchant: "B" })])).toHaveLength(2);
  });
});

describe("item 15 : Tech sans prix de référence", () => {
  it("prix d'un curateur en texte seulement, jamais de %", () => {
    const d = mk({ source: "preispirat", category: "tech-deals", refKind: "comparable", referenceType: "competitor", price: 199, referencePrice: 229 });
    expect(curatorRef(d)).toBe(229);
    expect(valueText(d, "de")).toMatch(/^laut Preispirat sonst CHF\s229\.00$/);
    expect(curatorRef({ ...d, source: "aldi" })).toBeUndefined();
  });
  it("aucune carte sans prix dans la grille ; à part dans « Ohne Preisangabe »", () => {
    const a = mk({ category: "tech-deals", title: "A" }), b = mk({ category: "tech-deals", title: "Artikel ohne Preis", price: undefined });
    expect(hasPriceInfo(b)).toBe(false);
    expect(categoryList([a, b], "tech-deals").map((x) => x.id)).toEqual([a.id]);
    expect(unpricedList([a, b], "tech-deals").map((x) => x.id)).toEqual([b.id]);
    expect(unpricedList([a, b], "gutscheine")).toEqual([]);
  });
});
