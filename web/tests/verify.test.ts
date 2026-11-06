/** Phase 0 de fiabilité (étude R2 §3) : la couche web lit l'état de vérification du scanner. */
import { describe, expect, it } from "vitest";
import { CITIES } from "@/config/cities";
import { endedAt, inCity, isLive, plausibleUnitPrice, projectDeal, projectExpired, regionExcluded } from "@/lib/project";
import type { Feed, RawDeal } from "@/lib/types";

const FEED: Feed = { id: "ch-sg", country: "CH", currency: "CHF", url: "x", cities: ["st-gallen"] };
const NOW = new Date("2026-11-06T15:00:00+01:00");
const SG = CITIES.find((c) => c.slug === "st-gallen")!;
const lidl: RawDeal = {
  deal_id: "lidl:10061263", source_id: "lidl", title: "Triangle Spinach & Tomato", family: "grocery", merchant: "Lidl",
  current_price: 1.29, source_url: "https://www.lidl.ch/p/de-CH/triangle-spinach-tomato/p10061263",
  lifecycle: "ACTIVE", geographic_scope_resolved: "NATIONAL", first_seen_at: "2026-11-02T10:00:00+01:00",
};

describe("X_SOURCE_STALE, 404 et drapeaux de fin", () => {
  it("SUSPECT, HIDDEN et ENDED ne sont jamais listées ; UNCONFIRMED l'est, hors vitrines", () => {
    for (const state of ["SUSPECT", "HIDDEN", "ENDED"]) {
      expect(isLive({ ...lidl, state }, NOW)).toBe(false);
      expect(projectDeal({ ...lidl, state }, FEED, NOW)).toBeNull();
    }
    expect(projectDeal({ ...lidl, state: "VERIFIED" }, FEED, NOW)).not.toBeNull();
    const u = projectDeal({ ...lidl, state: "UNCONFIRMED" }, FEED, NOW)!;
    expect(u.unconfirmed).toBe(true);
    expect(u.noShowcase).toBe(true);
  });

  it("source en panne : pas de pierre tombale (l'offre peut revenir) ; fin prouvée : page « abgelaufen »", () => {
    expect(endedAt({ ...lidl, state: "HIDDEN", state_reason: "X_SOURCE_STALE", verified_at: "2026-11-04T12:00:01+01:00" }, NOW)).toBeUndefined();
    expect(endedAt({ ...lidl, state: "SUSPECT", state_reason: "T_GONE_404_PENDING" }, NOW)).toBeUndefined();
    const gone = { ...lidl, state: "ENDED", state_reason: "T_GONE_404", state_since: "2026-11-06T14:20:03+01:00" };
    expect(endedAt(gone, NOW)).toBe("2026-11-06T14:20:03+01:00");
    const [tomb] = projectExpired([gone], FEED, NOW, new Set());
    expect(tomb.endedAt).toBe("2026-11-06T14:20:03+01:00");
  });

  it("« Zuletzt an der Quelle gesehen » = dernière vérification réussie du scanner, jamais l'heure du flux", () => {
    const p = projectDeal({ ...lidl, verified_at: "2026-11-06T13:08:41+01:00" }, FEED, NOW)!;
    expect(p.lastSeenAt).toBe("2026-11-06T13:08:41+01:00");
    expect(projectDeal(lidl, FEED, NOW)!.lastSeenAt).toBeUndefined();
  });
});

describe("règles de région et de magasin proche", () => {
  const lucul: RawDeal = {
    deal_id: "denner:dn-1028951-week-20261105", source_id: "denner", title: "Lucul Fondue Chinoise-Mix", family: "grocery", merchant: "Denner",
    current_price: 6.95, source_url: "https://www.denner.ch/de/aktionen/lucul", geographic_scope_resolved: "NATIONAL",
    conditions: ["Nur in der französischen Schweiz erhältlich"], lifecycle: "ACTIVE",
  };

  it("les 15 Denner « nur Romandie » (eligible_home=false) ne sont dans aucune liste de Saint-Gall", () => {
    const p = projectDeal(lucul, FEED, NOW)!;
    expect(p.cities).toEqual([]);
    expect(inCity(p, SG)).toBe(false);
    // Même sans la condition texte : eligible_home=false suffit (lu, jamais publié).
    const q = projectDeal({ ...lucul, conditions: [], eligible_home: false }, FEED, NOW)!;
    expect(q.cities).toEqual([]);
    expect(JSON.stringify(q)).not.toContain("eligible_home");
    expect(projectDeal({ ...lucul, conditions: [], eligible_home: true }, FEED, NOW)!.cities).toEqual(["*"]);
  });

  it("motifs « Nur in der … » : la Suisse alémanique incluse reste listée", () => {
    expect(regionExcluded({ ...lucul, conditions: ["Nur in der französischen und italienischen Schweiz erhältlich"] })).toBe(true);
    expect(regionExcluded({ ...lucul, conditions: ["Nur in der italienischen Schweiz erhältlich"] })).toBe(true);
    expect(regionExcluded({ ...lucul, conditions: [], title: "Vin rouge (nur Romandie)" })).toBe(true);
    expect(regionExcluded({ ...lucul, conditions: [], title: "AIR WICK Aroma-Öl (Aktion nur in der Deutsch- und Westschweiz gültig)" })).toBe(false);
    expect(regionExcluded({ ...lucul, conditions: ["Nur in der deutschen und italienischen Schweiz erhältlich"] })).toBe(false);
    expect(regionExcluded({ ...lucul, conditions: [], region_excluded: true })).toBe(true);
  });

  it("Aligro (aucune filiale à Saint-Gall) : retirée des listes SG", () => {
    const p = projectDeal({ deal_id: "rappn:1", source_id: "rappn", title: "Granarolo Grana Padano 1 kg", family: "grocery", merchant: "Aligro",
      current_price: 14.9, source_url: "https://rappn.ch/de/aktionen/aligro/k/sg#offer=1", geographic_scope_resolved: "TRAVEL_ACCESSIBLE" }, FEED, NOW)!;
    expect(SG.absentChains).toContain("aligro");
    expect(inCity(p, SG)).toBe(false);
  });
});

describe("cohérence du prix unitaire", () => {
  it("jamais « 11'990 CHF/kg » ; un parfum à 1 396 CHF/l reste juste", () => {
    const p = projectDeal({ ...lidl, deal_id: "aldi:777752", source_id: "aldi", merchant: "ALDI SUISSE", title: "COUNTRY'S BEST Schweinsplätzli",
      current_price: 11.99, unit_price: 11990, unit: "CHF/kg", package_size: "1 KG/ATG" }, FEED, NOW)!;
    expect(p.unitPrice).toBeUndefined();
    expect(plausibleUnitPrice(1396, "l", "Thierry Mugler Angel Elixir Eau de Parfum")).toBe(1396);
    expect(plausibleUnitPrice(11.99, "kg", "Schweinsplätzli")).toBe(11.99);
  });
});
