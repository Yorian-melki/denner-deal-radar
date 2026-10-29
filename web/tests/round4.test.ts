import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ALCOHOL_FREE_TOP, MAX_RUN, interleave, longestRun, orderCategory } from "@/components/CategoryListing";
import { PriceLine, cardScore } from "@/components/DealCard";
import { isAlcohol, SPIRITS, SPIRITS_FOOD } from "@/lib/blocklist";
import { resolveMerchant } from "@/lib/merchant";
import { cleanOutbound, viaHost } from "@/lib/outbound";
import { cleanTitle, compareDeals, dealSlug, projectDeal, rankDeals, savingPct, setCanonicalSlugs, shortHash, stableKey } from "@/lib/project";
import { balancedSections, markdownEligible, pickMarkdowns, pickShowcase, relatedDeals } from "@/lib/select";
import { hashOfSlug, legacyLines, legacyTargets, mergeRegistries, updateRegistry, validateRegistry } from "@/lib/slugs";
import type { Feed, PublicDeal } from "@/lib/types";

const FEED: Feed = { id: "ch-sg", country: "CH", currency: "CHF", url: "x", cities: ["st-gallen"] };
const NOW = new Date("2026-10-29T10:00:00+01:00");

let seq = 0;
function mk(p: Partial<PublicDeal> = {}): PublicDeal {
  seq++;
  return {
    id: `r4:${seq}`, slug: `r4-${seq}`, title: `Deal ${seq}`, source: "src", merchant: `Shop ${seq}`, brand: `B${seq}`,
    family: "grocery", category: "supermarkt-aktionen", geo: "NATIONAL", cities: ["*"], country: "CH",
    currency: "CHF", conds: [], url: "https://example.ch/x", attribution: "Shop", referenceType: "merchant_previous",
    refKind: "comparable", verifiedRef: true, score: 6.9, scoreCap: "unchecked", confidence: 0.9, page: true, price: 10, referencePrice: 20,
    size: { text: "500 g" }, unitPrice: 20, unit: "kg", ...p,
  };
}

describe("item 1 : slugs immuables et anciens liens", () => {
  afterEach(() => setCanonicalSlugs({}));
  it("renommer un titre garde le suffixe ; une clé connue garde son premier slug", () => {
    const a = dealSlug("denner:42-week-20261026", "Swisscom blue Mobile S - Aktionspreis");
    const b = dealSlug("denner:42-week-20261102", "Swisscom blue Mobile S");
    expect(hashOfSlug(a)).toBe(hashOfSlug(b));
    setCanonicalSlugs({ [hashOfSlug(a)]: a });
    expect(dealSlug("denner:42", "Swisscom blue Mobile S")).toBe(a);
    expect(hashOfSlug(a)).toBe(shortHash(stableKey("denner:42")));
  });
  it("registre : validation, fusion (premier slug gagne), mise à jour et oubli après 90 jours", () => {
    expect(validateRegistry({ v: 1, canon: { abc: "x-abc", zz: "nope-zz1" }, seen: { "x-abc": ["tech-deals", "2026-10-01"], "<b>": ["", "2026-10-01"] } }))
      .toEqual({ v: 1, canon: { abc: "x-abc" }, seen: { "x-abc": ["tech-deals", "2026-10-01"] } });
    expect(validateRegistry({ v: 2 })).toBeNull();
    const old = { v: 1 as const, canon: { abc: "old-abc" }, seen: { "old-abc": ["handy-abos", "2026-10-20"] as [string, string], "gone-zz": ["", "2026-06-01"] as [string, string] } };
    const merged = mergeRegistries(old, { v: 1, canon: { abc: "new-abc" }, seen: {} });
    expect(merged.canon.abc).toBe("old-abc");
    const up = updateRegistry(merged, [{ slug: "new-abc", category: "handy-abos" }, { slug: "fresh-q1", category: "gratis" }], "2026-10-29");
    expect(up.canon.abc).toBe("old-abc");
    expect(up.canon.q1).toBe("fresh-q1");
    expect(up.seen["gone-zz"]).toBeUndefined();
    expect(up.seen["fresh-q1"]).toEqual(["gratis", "2026-10-29"]);
  });
  it("redirections : renommage → page actuelle, sinon catégorie, sinon ville ; jamais « :lang » ; budget de lignes", () => {
    const reg = { v: 1 as const, canon: { u9: "swisscom-u9" }, seen: {
      "swisscom-aktionspreis-u9": ["handy-abos", "2026-10-27"] as [string, string],
      "swisscom-u9": ["handy-abos", "2026-10-29"] as [string, string],
      "coca-cola-k1": ["supermarkt-aktionen", "2026-10-27"] as [string, string],
      "mystery-z9": ["", "2026-10-27"] as [string, string],
    } };
    const live = new Set(["swisscom-u9"]);
    const t = legacyTargets(reg, (s) => live.has(s), (c) => c === "supermarkt-aktionen", "st-gallen");
    expect(t.map((x) => [x.slug, x.kind])).toEqual([["swisscom-aktionspreis-u9", "deal"], ["coca-cola-k1", "category"], ["mystery-z9", "city"]]);
    const lines = legacyLines(t);
    expect(lines).toContain("/fr/deal/swisscom-aktionspreis-u9 /fr/deal/swisscom-u9 301");
    expect(lines).toContain("/en/deal/coca-cola-k1 /en/st-gallen/supermarkt-aktionen 301");
    expect(lines.join("\n")).not.toMatch(/:lang|\*/);
    expect(legacyLines(t, 4)).toHaveLength(3);
  });
  it("amorce versionnée : valide, et contient l'ancien slug Swisscom", () => {
    const seed = validateRegistry(JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "config", "slug-seed.json"), "utf8")))!;
    expect(seed.seen["swisscom-blue-mobile-s-aktionspreis-ui09jp"]).toBeDefined();
    expect(seed.canon.ui09jp).toBe("swisscom-blue-mobile-s-ui09jp");
  });
});

describe("item 2 : alcool", () => {
  it("détection : vin, bière, mousseux, rayon ; pas l'eau, le vinaigre, le chocolat au Crémant, ni l'alcool 0.0", () => {
    for (const t of ["Due Lune Nero d’Avola Sicilia DOC", "Leopardo Spumante Extra Dry", "Corona Extra Bier", "Heineken Bier Original", "Dôle du Valais AOC"]) expect(isAlcohol(t), t).toBe(true);
    for (const t of ["Evian Mineralwasser", "Weinessig", "Cailler Tafelschokolade Crémant", "Feldschlösschen Alkoholfrei", "Birra Moretti Zero", "AOC CU34G2XPD Monitor", "Schweinefleisch"]) expect(isAlcohol(t), t).toBe(false);
    expect(isAlcohol("Niepoort Fabelhaft", "Wein & Spirituosen")).toBe(true);
    expect(isAlcohol("Valpo", undefined, "https://www.qoqa.ch/de/wine/123")).toBe(true);
  });
  it("spiritueux : jamais publiés (marques, degré ≥ 15 %) ; vanille Bourbon et chocolat au kirsch restent", () => {
    for (const t of ["Captain Morgan Spiced Gold", "Gordon's London Dry Gin", "Johnny Walker Red Label", "Kräuter 35 % vol"]) expect(SPIRITS.test(t) && !SPIRITS_FOOD.test(t), t).toBe(true);
    for (const t of ["Dr. Oetker Bourbon Vanille-Zucker", "Camille Bloch Tafelschokolade, Kirsch", "Perlenbacher Pils 4,9% Vol."]) expect(SPIRITS.test(t) && !SPIRITS_FOOD.test(t), t).toBe(false);
    expect(projectDeal({ deal_id: "lidl:9", source_id: "lidl", title: "CAPTAIN MORGAN Spiced Gold", family: "grocery", source_url: "https://www.lidl.ch/x", lifecycle: "ACTIVE" }, FEED, NOW)).toBeNull();
  });
  it("0 alcool sur l'accueil, la vitrine, « Grösste Rabatte » et « Mehr aus » d'un produit sans alcool ; jamais dans les 6 premières de Supermarkt", () => {
    const wine = Array.from({ length: 8 }, (_, i) => mk({ title: `Wein ${i}`, alcohol: true, price: 5, referencePrice: 20, score: 9, scoreCap: undefined, refObserved: true }));
    const food = Array.from({ length: 8 }, (_, i) => mk({ title: `Brot ${i}`, price: 10, referencePrice: 20 }));
    const all = [...wine, ...food];
    expect(pickShowcase(all, NOW).some((d) => d.alcohol)).toBe(false);
    expect(pickMarkdowns(all, NOW).some((d) => d.alcohol)).toBe(false);
    expect(balancedSections(all, ["supermarkt-aktionen"], { now: NOW }).flatMap((s) => s.items).some((d) => d.alcohol)).toBe(false);
    expect(relatedDeals(all, food[0]).some((d) => d.alcohol)).toBe(false);
    expect(relatedDeals(all, wine[0]).length).toBeGreaterThan(0);
    const page = orderCategory(all, "supermarkt-aktionen");
    expect(page.slice(0, ALCOHOL_FREE_TOP).some((d) => d.alcohol)).toBe(false);
  });
});

describe("item 3 : « Grösste Rabatte – laut Händler »", () => {
  it("toujours rempli si la base existe ; % non croissant ; 1 par magasin ; seulement l'ancien prix du marchand", () => {
    const deals = [
      mk({ merchant: "Denner", price: 5, referencePrice: 20 }), mk({ merchant: "Denner", price: 9, referencePrice: 20 }),
      mk({ merchant: "Lidl", price: 12, referencePrice: 20 }), mk({ merchant: "Aldi", price: 15, referencePrice: 20 }),
      mk({ merchant: "Coop", price: 2, referencePrice: 20, referenceType: "msrp" }),
      mk({ merchant: "Migros", price: 4, referencePrice: 20, conds: [{ code: "lidl_plus" }] }),
    ];
    const md = pickMarkdowns(deals, NOW);
    expect(md.map((d) => d.merchant)).toEqual(["Denner", "Lidl", "Aldi"]);
    const pcts = md.map((d) => savingPct(d)!);
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);
    expect(pickMarkdowns(deals.slice(0, 2), NOW)).toEqual([]);
  });
  it("épicerie sans quantité ni prix unitaire, ou > 70 % sans prix unitaire : exclue", () => {
    expect(markdownEligible(mk({ size: undefined, unitPrice: undefined, unit: undefined }), NOW)).toBe(false);
    expect(markdownEligible(mk({ price: 2, referencePrice: 20, unitPrice: undefined, unit: undefined }), NOW)).toBe(false);
    expect(markdownEligible(mk({ price: 2, referencePrice: 20 }), NOW)).toBe(true);
  });
});

describe("item 4 : à note égale, le % départage, pas les francs", () => {
  it("−60 % à CHF 3 passe avant −50 % sur un carton à CHF 70", () => {
    const water = mk({ title: "Evian", price: 3, referencePrice: 7.5, unitPrice: 0.33, unit: "l" });
    const wine = mk({ title: "Wein Karton", price: 70, referencePrice: 140, unitPrice: 15.5, unit: "l" });
    expect(rankDeals([wine, water])[0].id).toBe(water.id);
    expect([wine, water].sort(compareDeals)[0].id).toBe(water.id);
  });
});

describe("item 5 : carte", () => {
  it("note plafonnée (unchecked) : pas de pastille de note ; « −50 % » et « statt 20.00 · laut … » visibles", () => {
    const d = mk({ merchant: "Denner" });
    expect(cardScore(d)).toBeUndefined();
    expect(cardScore(mk({ scoreCap: undefined, refObserved: true, score: 7.4 }))).toBe(7.4);
    const el = JSON.stringify(PriceLine({ deal: d, locale: "de" }));
    expect(el).toMatch(/−/);
    expect(el).toMatch(/laut Denner/);
  });
  it("CSS : texte de carte et .lead ≥ 15 px, montant en chiffres tabulaires, pas d'opacité sur une carte expirée", () => {
    const css = readFileSync(path.join(import.meta.dirname, "..", "app", "globals.css"), "utf8");
    const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.[\]]/g, "\\$&")}[^{]*\\{([^}]*)\\}`))?.[1] ?? "";
    for (const sel of [".was", ".card-unit", ".lead", ".intro-facts", ".section-note"]) expect(rule(sel), sel).toMatch(/font-size: var\(--t-callout\)/);
    expect(css).toMatch(/\.card-meta, \.card-sub, \.card-notes \{ font-size: var\(--t-callout\)/);
    expect(rule(".card-price .price")).toMatch(/tabular-nums/);
    expect(css).not.toMatch(/\[data-gone\][^{]*\{[^}]*opacity/);
    expect(css).not.toMatch(/\.card-save/);
  });
});

describe("items 8, 12, 13", () => {
  it("« Mehr aus Studis » : 3 suggestions pour un deal sans prix", () => {
    const studis = Array.from({ length: 5 }, (_, i) => mk({ category: "studenten-rabatte", price: undefined, referencePrice: undefined, verifiedRef: false, title: `S ${i}` }));
    expect(relatedDeals(studis, studis[0])).toHaveLength(3);
  });
  it("marchand lu dans le titre : (IndieGala), bei fnac, HP, Wingo, Quickline", () => {
    expect(resolveMerchant("gamerpower", undefined, "Ancient Evil (IndieGala)")).toBe("IndieGala");
    expect(resolveMerchant("preispirat", undefined, "Samsung P9 microSD 512 GB bei fnac (Kompatibel mit Switch 2)")).toBe("Fnac");
    expect(resolveMerchant("preispirat", undefined, "HP Herbst Sale – bis zu 40%")).toBe("HP Store");
    expect(resolveMerchant("preispirat", undefined, "Wingo Red Pro (Swisscom-Netz)")).toBe("Wingo");
    expect(resolveMerchant("preispirat", undefined, "Quickline Mobile L")).toBe("Quickline");
    expect(resolveMerchant("preispirat", undefined, "Gratis Futterprobe")).toBeUndefined();
  });
  it("entrelacement global : séries ≤ MAX_RUN tant qu'un autre magasin reste ; jamais une carte sans « statt » avant une carte avec", () => {
    const list = [
      ...Array.from({ length: 12 }, () => mk({ merchant: "Volg" })), ...Array.from({ length: 4 }, (_, i) => mk({ merchant: `M${i}` })),
      ...Array.from({ length: 4 }, () => mk({ merchant: "Aldi", verifiedRef: false, score: undefined })),
    ];
    const out = interleave(rankDeals(list));
    const refs = out.map((d) => d.verifiedRef);
    expect(refs.indexOf(false)).toBe(16);
    expect(longestRun(out.slice(0, 12))).toBeLessThanOrEqual(MAX_RUN);
  });
});

describe("item 19 : liens sortants", () => {
  it("refuse identifiants, port non standard, IP littérale, punycode non listé", () => {
    expect(cleanOutbound("https://www.denner.ch@evil.example:8443/x")).toBeNull();
    expect(cleanOutbound("https://www.denner.ch:8443/x")).toBeNull();
    expect(cleanOutbound("https://203.0.113.5/x")).toBeNull();
    expect(cleanOutbound("https://xn--dnner-jua.ch/x")).toBeNull();
    expect(cleanOutbound("https://www.denner.ch:443/x")?.url).toBe("https://www.denner.ch/x");
  });
  it("portail de coupons : « über gutscheine.20min.ch »", () => {
    expect(viaHost("https://gutscheine.20min.ch/x", "Bruno Wickart")).toBe("gutscheine.20min.ch");
  });
});

describe("item 24 : abonnements", () => {
  it("promo de durée inconnue : aucun total sur 24 mois (GoMo 9.95 n'est pas 9.95 × 24)", () => {
    const base = { deal_id: "pp:gomo", source_id: "preispirat", title: "GoMo Abo", family: "subscription", source_url: "https://www.gomo.ch/x", lifecycle: "ACTIVE", current_price: 9.95, activation_fee: 0 };
    expect(projectDeal({ ...base, regular_monthly_price: 29.95 }, FEED, NOW)!.sub?.total24).toBeUndefined();
    expect(projectDeal({ ...base, regular_monthly_price: 29.95 }, FEED, NOW)!.sub?.promoUnknown).toBe(true);
    expect(projectDeal({ ...base, title: "GoMo Abo lebenslang", regular_monthly_price: 29.95 }, FEED, NOW)!.sub?.total24).toBeDefined();
    expect(projectDeal(base, FEED, NOW)!.sub?.total24).toBe(238.8);
  });
});

describe("item 9 : formules commerciales et casse", () => {
  it.each([
    ["Nur noch heute! Exklusiv – CHF 10.-, 20.- oder 30.- Rabatt bei Apfelkiste", "CHF 10.-, 20.- oder 30.- Rabatt bei Apfelkiste"],
    ["QoQa-Exklusiv: Weinpaket Toskana", "Weinpaket Toskana"],
    ["Swisscom blue Mobile S - Aktionspreis", "Swisscom blue Mobile S"],
    ["Apple MacBook Pro 16 Late 2019, CH Schnäppchen / Gebraucht", "Apple MacBook Pro 16 Late 2019, CH Gebraucht"],
    ["Sneaker zu Toppreisen", "Sneaker"],
    ["GORDON'S London Dry Gin", "Gordon’s London Dry Gin"],
    ["Fisher’S Friend", "Fisher’s Friend"],
    ["Game X (metacritic User-Score: 7.0)", "Game X"],
    ["Bankpaket SmartStudents! (PostFinance)", "Bankpaket SmartStudents (PostFinance)"],
    ["Kaffee 500g - neu...", "Kaffee 500 g – neu…"],
  ])("%s", (raw, clean) => expect(cleanTitle(raw, { lang: "de" })).toBe(clean));
  it("« gratis » final retiré quand le prix affiché dit déjà « Gratis »", () => {
    expect(cleanTitle("Harry Potter Hörbuch gratis", { lang: "de", free: true })).toBe("Harry Potter Hörbuch");
  });
});

describe("item 31 : Reisen", () => {
  it("Secret Flying : seulement au départ de la Suisse, titre traduit, plus de « only »", async () => {
    const { secretFlyingTitles } = await import("@/lib/project");
    expect(secretFlyingTitles("European cities to Seattle, USA from only €384 roundtrip")).toBeUndefined();
    expect(secretFlyingTitles("Zurich, Switzerland to Phuket, Thailand for only €485 roundtrip")).toEqual({
      de: "Zürich → Phuket (Thailand) · retour ab € 485", fr: "Zurich → Phuket (Thailand) · aller-retour dès 485 €", en: "Zurich → Phuket (Thailand) · return from €485",
    });
    expect(projectDeal({ deal_id: "fp:1", source_id: "ferienpiraten", title: "Die schönsten Bibliotheken weltweit", family: "travel", source_url: "https://www.ferienpiraten.ch/x", lifecycle: "ACTIVE" }, FEED, NOW)).toBeNull();
  });
});

describe("item 18 : neutralité garantie par la structure", () => {
  it("ni le tri, ni la sélection, ni les catégories n'importent le code d'affiliation", () => {
    for (const f of ["lib/select.ts", "lib/project.ts", "lib/categories.ts", "components/CategoryListing.tsx"]) {
      expect(readFileSync(path.join(import.meta.dirname, "..", f), "utf8"), f).not.toMatch(/from\s+["']@\/lib\/affiliate/);
    }
  });
  it("l'ordre (catégorie, entrelacement, « Grösste Rabatte », « Mehr aus ») est identique avec ou sans programme partenaire", () => {
    const base = Array.from({ length: 30 }, (_, i) => mk({ merchant: `M${i % 4}`, price: 10 + (i % 7), referencePrice: 25, title: `P ${i}` }));
    const flipped = base.map((d, i) => ({ ...d, noAff: i % 2 === 0 ? true : undefined, url: i % 3 ? "https://www.galaxus.ch/x" : d.url }));
    const ids = (l: PublicDeal[]) => l.map((d) => d.id);
    expect(ids(orderCategory(flipped, "supermarkt-aktionen"))).toEqual(ids(orderCategory(base, "supermarkt-aktionen")));
    expect(ids(pickMarkdowns(flipped, NOW))).toEqual(ids(pickMarkdowns(base, NOW)));
    expect(ids(relatedDeals(flipped, flipped[0]))).toEqual(ids(relatedDeals(base, base[0])));
  });
});
