import { describe, expect, it } from "vitest";
import { dateText } from "@/components/DealCard";
import { interleave } from "@/components/CategoryListing";
import { DICTS, LOCALES } from "@/lib/i18n";
import { fmtInt, fmtPct, fmtPrice, fmtScore, NBSP } from "@/lib/format";
import { compareDeals } from "@/lib/project";
import { brandKey, pickShowcase, TOP_N } from "@/lib/select";
import { ADVISORY_URL, candidates, routesJson, securityTxt } from "@/scripts/routes.mjs";
import { parseClick, isSameOrigin, toPoint } from "@/functions/api/click";
import { pickLang } from "@/functions/index";
import type { PublicDeal } from "@/lib/types";

let seq = 0;
function mk(p: Partial<PublicDeal> = {}): PublicDeal {
  seq++;
  return {
    id: `d:${seq}`, slug: `d-${seq}`, title: `Deal ${seq}`, source: "src", merchant: `Shop ${seq}`, brand: `B${seq}`,
    family: "tech", category: "tech-deals", geo: "ONLINE", cities: ["*"], country: "CH",
    currency: "CHF", conds: [], url: "https://example.ch/x", attribution: "Shop",
    refKind: "comparable", verifiedRef: true, score: 8, confidence: 0.9, page: true, price: 10, referencePrice: 100, ...p,
  };
}

describe("dates : jamais d'heures ni de minutes, « heute / morgen » en 3 langues", () => {
  const now = new Date("2026-10-28T19:28:00+01:00");
  it("bis heute / bis morgen / ab morgen", () => {
    const today = { endsAt: "2026-10-28T23:59:00+01:00" }, tomorrow = { endsAt: "2026-10-29T23:59:00+01:00" };
    const upcoming = { startsAt: "2026-10-29T00:00:00+01:00", upcoming: true, endsAt: "2026-11-04T23:59:00+01:00" };
    expect(LOCALES.map((l) => dateText(today, l, now))).toEqual(["bis heute", "jusqu’à aujourd’hui", "until today"]);
    expect(LOCALES.map((l) => dateText(tomorrow, l, now))).toEqual(["bis morgen", "jusqu’à demain", "until tomorrow"]);
    expect(LOCALES.map((l) => dateText(upcoming, l, now))).toEqual(["ab morgen", "dès demain", "from tomorrow"]);
    expect(dateText({ endsAt: "2026-11-04T23:59:00+01:00" }, "en", now)).toBe("until Wed 4 Nov");
    for (const l of LOCALES) for (const d of [today, tomorrow, upcoming]) expect(dateText(d, l, now)).not.toMatch(/Std\.|Min\.|\bh\b|min/);
  });
});

describe("textes", () => {
  it("« 1–24 von 78 Angeboten » (datif)", () => {
    expect(DICTS.de.shownRange("1", "24", "78")).toBe("1–24 von 78 Angeboten");
    expect(DICTS.fr.shownRange("1", "24", "78")).toBe("1–24 sur 78 offres");
    expect(DICTS.en.shownRange("1", "24", "78")).toBe("1–24 of 78 offers");
  });
  it("plus de « belegt / établi / documented », plus de « vs. »", () => {
    const all = JSON.stringify(Object.values(DICTS).map((d) => Object.values(d).map((v) => (typeof v === "function" ? String((v as (...a: string[]) => string)("1", "2", "3", "4")) : v))));
    expect(all).not.toMatch(/belegt|établi|documented|\bvs\.?\s/);
  });
  it("note de la vitrine générée depuis les constantes", () => {
    expect(DICTS.de.topRule("7.0", 1)).toBe("Mit Statt-Preis des Händlers · Note ab 7.0 · max. 1 pro Marke");
  });
});

describe("formats suisses identiques dans les 3 langues", () => {
  it("prix, note, entier, pourcentage", () => {
    for (const l of LOCALES) {
      expect(fmtPrice(1349.5, "CHF", l)).toBe(`CHF${NBSP}1’349.50`);
      expect(fmtScore(8.2, l)).toBe("8.2");
      expect(fmtInt(12937, l)).toBe("12’937");
    }
    expect(fmtPct(63.4, "de")).toBe("63%");
    expect(fmtPct(63.4, "fr")).toBe("63 %");
  });
});

describe("vitrine « Am besten bewertet » (round 2, item 2)", () => {
  const now = new Date("2026-10-28T12:00:00+01:00");
  it("seulement des prix « statt », note ≥ 7, ≤ 6 cartes, 0 marque en double, rien de futur", () => {
    const list = [
      mk({ score: 9, verifiedRef: false, refKind: "vendor" }),
      mk({ score: 8.5, brand: "Felix", merchant: "Denner" }),
      mk({ score: 8.4, brand: "Felix", merchant: "Coop" }),
      mk({ score: 8.3, upcoming: true }),
      mk({ score: 6.9 }),
      ...Array.from({ length: 10 }, (_, i) => mk({ score: 7.5 - i * 0.01, category: ["tech-deals", "haushalt", "supermarkt-aktionen", "reisen"][i % 4] })),
    ];
    const top = pickShowcase(list, now);
    expect(top.length).toBeLessThanOrEqual(TOP_N);
    expect(top.every((d) => d.verifiedRef && (d.score ?? 0) >= 7 && !d.upcoming)).toBe(true);
    expect(new Set(top.map(brandKey)).size).toBe(top.length);
  });
  it("masquée sous 3 cartes", () => {
    expect(pickShowcase([mk({ score: 8 }), mk({ score: 8 })], now)).toEqual([]);
  });
  it("action en magasin, dernier jour après 18:00 : hors vitrine", () => {
    const late = new Date("2026-10-28T18:30:00+01:00");
    const store = mk({ score: 9.5, inStore: true, endsAt: "2026-10-28T23:59:00+01:00", category: "supermarkt-aktionen" });
    const others = [mk({ score: 8 }), mk({ score: 8, category: "haushalt" }), mk({ score: 8, category: "reisen" })];
    expect(pickShowcase([store, ...others], late).map((d) => d.id)).not.toContain(store.id);
    expect(pickShowcase([store, ...others], now).map((d) => d.id)).toContain(store.id);
  });
});

describe("classement : un 6.9 sans prix « statt » ne passe jamais devant un 6.7 avec", () => {
  it("compareDeals", () => {
    const a = mk({ score: 6.9, verifiedRef: false }), b = mk({ score: 6.7 });
    expect([a, b].sort(compareDeals)[0].id).toBe(b.id);
  });
  it("Supermarkt : au plus un tiers du même magasin par page de 24", () => {
    const list = [...Array.from({ length: 30 }, () => mk({ merchant: "Coop" })), ...Array.from({ length: 20 }, (_, i) => mk({ merchant: `M${i % 4}` }))];
    const page1 = interleave(list).slice(0, 24);
    expect(page1.filter((d) => d.merchant === "Coop").length).toBeLessThanOrEqual(8);
  });
});

describe("Functions", () => {
  it("/api/click : seulement { deal, page }, page = route du site", () => {
    expect(parseClick({ deal: "denner:1", page: "/de/deal/x-1ab" })).toEqual({ deal: "denner:1", page: "/de/deal/x-1ab" });
    expect(parseClick({ deal: "denner:1", page: "/de/%3Cscript%3E" })).toBeNull();
    expect(parseClick({ deal: "denner:1", page: "/de", affiliate: true })).toBeNull();
    expect(parseClick({ deal: "x", page: "/xx/y" })).toBeNull();
  });
  it("/api/click : id inconnu → aucun point ; programme déduit côté serveur", () => {
    expect(toPoint({ deal: "fake:1", page: "/de" }, { "denner:1": null })).toBeNull();
    expect(toPoint({ deal: "denner:1", page: "/de" }, { "denner:1": null })?.blobs).toEqual(["denner:1", "denner", "none", "/de", "false"]);
    expect(toPoint({ deal: "galaxus:1", page: "/de" }, { "galaxus:1": "tradedoubler" })?.blobs?.[4]).toBe("true");
  });
  it("/api/click : origine et type de requête", () => {
    const req = (h: Record<string, string>) => new Request("https://savradar.pages.dev/api/click", { method: "POST", headers: h });
    expect(isSameOrigin(req({ "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "empty" }))).toBe(true);
    expect(isSameOrigin(req({ "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors" }))).toBe(false);
    expect(isSameOrigin(req({ "Sec-Fetch-Site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(req({}))).toBe(false);
  });
  it("« / » négocie la langue du navigateur", () => {
    expect(pickLang("fr-CH,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(pickLang("en-US,en;q=0.9")).toBe("en");
    expect(pickLang("it-CH, de;q=0.5")).toBe("de");
    expect(pickLang(null)).toBe("de");
  });
  it("404 : candidats du plus précis au plus général, jamais l'accueil nu", () => {
    expect(candidates("de", "/st-gallen/tech-deals/99")).toEqual(["/de/st-gallen/tech-deals/99", "/de/st-gallen/tech-deals", "/de/st-gallen"]);
    expect(candidates("fr", "/deal/kaffee-1ab")).toEqual(["/fr/deal/kaffee-1ab", "/fr/st-gallen"]);
    expect(candidates("en", "")).toEqual(["/en/st-gallen"]);
  });
  it("aucune page vue ne passe par une Function (round 3, item 1)", () => {
    expect(routesJson(false).include).toEqual(["/"]);
    expect(routesJson(true).include).toEqual(["/", "/api/*"]);
  });
  it("security.txt : jamais /impressum ; e-mail seulement s'il est valide (round 3, item 26)", () => {
    const now = new Date("2026-10-29T00:00:00Z");
    expect(securityTxt("https://x.pages.dev", "", now)).toContain(`Contact: ${ADVISORY_URL}`);
    expect(securityTxt("https://x.pages.dev", "a@b.ch", now)).toContain("Contact: mailto:a@b.ch");
    expect(securityTxt("https://x.pages.dev", "", now)).not.toMatch(/impressum/);
    expect(securityTxt("https://x.pages.dev", "", now)).toContain("Expires: 2027-04-27T00:00:00.000Z");
  });
});
