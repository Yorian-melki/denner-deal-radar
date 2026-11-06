/** V2-C rangs 0 à 3 (V2C_FIABILITE_MINIMUM.md §2.1, §2.7) : la couche web affiche ce que dit la source. */
import { describe, expect, it } from "vitest";
import { PriceLine, stateLine } from "@/components/DealCard";
import { DICTS } from "@/lib/i18n";
import { packSize, projectDeal, savingPct } from "@/lib/project";
import type { Feed, RawDeal } from "@/lib/types";

const FEED: Feed = { id: "ch-sg", country: "CH", currency: "CHF", url: "x", cities: ["st-gallen"] };
const NOW = new Date("2026-11-06T15:00:00+01:00");
const text = (el: unknown) => JSON.stringify(el);

describe("rang 0 et porte fail-closed : fraîcheur affichée", () => {
  const lidl: RawDeal = {
    deal_id: "lidl:10061263", source_id: "lidl", title: "Triangle Spinach & Tomato", family: "grocery", merchant: "Lidl",
    current_price: 1.29, source_url: "https://www.lidl.ch/p/de-CH/triangle/p10061263", lifecycle: "ACTIVE",
    geographic_scope_resolved: "NATIONAL", last_seen_at: "2026-11-06T09:00:00+01:00",
  };
  it("« Zuletzt an der Quelle gesehen » lit last_verified_at, sinon last_seen_at (plus jamais vide)", () => {
    expect(projectDeal({ ...lidl, last_verified_at: "2026-11-06T13:08:41+01:00" }, FEED, NOW)!.lastSeenAt).toBe("2026-11-06T13:08:41+01:00");
    expect(projectDeal(lidl, FEED, NOW)!.lastSeenAt).toBe("2026-11-06T09:00:00+01:00");
  });
  it("VERIFIED : « an der Quelle gesehen <jour> » ; UNCONFIRMED (X_NOT_RECHECKED) : « unbestätigt · Quelle zuletzt erreicht »", () => {
    const v = projectDeal({ ...lidl, state: "VERIFIED", last_verified_at: "2026-11-06T13:08:41+01:00" }, FEED, NOW)!;
    expect(stateLine(v, "de", NOW)).toMatch(/^an der Quelle gesehen /);
    const u = projectDeal({ ...lidl, state: "UNCONFIRMED", state_reason: "X_NOT_RECHECKED", last_seen_at: "2026-11-04T09:00:00+01:00" }, FEED, NOW)!;
    expect(stateLine(u, "de", NOW)).toMatch(/^unbestätigt · Quelle zuletzt erreicht /);
    expect(u.noShowcase).toBe(true);
    // Aucun libellé d'auto-éloge (test anti-« geprüft ») dans les trois langues.
    for (const l of ["de", "fr", "en"] as const) {
      for (const s of [stateLine(v, l, NOW), stateLine(u, l, NOW)]) expect(s).not.toMatch(/geprüft|vérifi|verified|ehrlich|honn|honest/i);
    }
  });
});

describe("règles de lecture", () => {
  it("C_ONLINE_FLAG : Rappn « Nur online » n'est jamais « Im Laden » et porte la condition « nur online »", () => {
    const coop: RawDeal = {
      deal_id: "rappn:e356f920", source_id: "rappn", title: "Nestea Lemon 6 x 1.5 l", family: "grocery", merchant: "Coop",
      current_price: 8.95, source_url: "https://rappn.ch/de/aktionen/coop/k/sg#offer=e356f920", lifecycle: "ACTIVE",
      geographic_scope: "ONLINE", online_only: true, conditions: ["nur online"],
    };
    const p = projectDeal(coop, FEED, NOW)!;
    expect(p.inStore).toBeUndefined();
    expect(p.conds.map((c) => c.code)).toContain("online_only");
    expect(DICTS.de.cond.online_only).toBe("nur online");
    expect(projectDeal({ ...coop, online_only: undefined, geographic_scope: "LOCAL", conditions: [] }, FEED, NOW)!.inStore).toBe(true);
  });

  it("P_FROM_PRICE : QoQa « Ab 59.90 bis 249.– » → « ab CHF 59.90 », sans économie ni note", () => {
    const q: RawDeal = {
      deal_id: "qoqa:99960", source_id: "qoqa", title: "Cloudpillo", family: "flash", merchant: "QoQa", current_price: 59.9,
      price_max: 249, reference_price: 99.9, reference_price_type: "competitor", score_confidence: 0.9, deal_score: 8,
      source_url: "https://www.qoqa.ch/de/offers/99960", lifecycle: "ACTIVE",
    };
    const p = projectDeal(q, FEED, NOW)!;
    expect(p.priceFrom).toBe(true);
    expect(p.score).toBeUndefined();
    expect(savingPct(p)).toBeUndefined();
    expect(text(PriceLine({ deal: p, locale: "de" }))).toMatch(/"ab"/);
    expect(projectDeal({ ...q, price_max: undefined }, FEED, NOW)!.priceFrom).toBeUndefined();
  });

  it("P_ZERO_NONFREE : « 3 Monate kostenlos, danach CHF 44 » n'est pas affiché « Gratis »", () => {
    const sak: RawDeal = {
      deal_id: "dschungelkompass:internet:sak-internet-m", source_id: "dschungelkompass", title: "SAK Internet M (Aktionspreis)",
      family: "subscription", merchant: "SAK", current_price: 0, promo_months: 3, price_after_promo: 44, zero_then_price: 44,
      unit: "CHF/Monat", offer_url: "https://www.sak-digital.ch/privat/internet/", lifecycle: "ACTIVE",
    };
    const p = projectDeal(sak, FEED, NOW)!;
    expect(p.zeroThen).toBe(44);
    const el = text(PriceLine({ deal: p, locale: "de" }));
    expect(el).toMatch(/3 Mt\. gratis/);
    expect(el).toMatch(/dann CHF.*44/);
    expect(el).not.toMatch(/"Gratis"/);
  });

  it("Q_PARSE_SANITY : « Maximal 250 Stück » et « 1000 ml & 150 ml » ne sont jamais une quantité", () => {
    expect(packSize(undefined, "Bürostuhl «Songmics Office»", { description: "Maximal 250 Stück zum reduzierten Einzelpreis verfügbar." })).toBeUndefined();
    expect(packSize("2 Behälter, 1000 ml & 150 ml", "Solis Multi Chopper")?.text).toBeUndefined();
    expect(packSize("6 x 75 cl", "Rioja")?.text).toBe("6 × 75 cl");
    expect(packSize("28 Stück", "Eier")?.pieces).toBe(28);
    const chair: RawDeal = {
      deal_id: "preispirat:773460", source_id: "preispirat", title: "Bürostuhl «Songmics Office» (45 – 54.50 cm)", family: "retail",
      current_price: 94, size_unknown: true, description: "Maximal 250 Stück", source_url: "https://www.preispirat.ch/x/", lifecycle: "ACTIVE",
    };
    expect(projectDeal(chair, FEED, NOW)!.size).toBeUndefined();
  });

  it("P_REF_IMPLAUSIBLE : référence retirée par le scanner → ni « statt » ni « sonst »", () => {
    const ottos: RawDeal = {
      deal_id: "rappn:550d0d0b", source_id: "rappn", title: "Samsung Kühl-Gefrierkombination RB7300 R", family: "retail", merchant: "Otto's",
      current_price: 649, reference_price_type: "none", ref_hidden: true, source_url: "https://rappn.ch/de/aktionen/ottos/k/sg#offer=550d0d0b",
      lifecycle: "ACTIVE",
    };
    const p = projectDeal(ottos, FEED, NOW)!;
    expect(p.referencePrice).toBeUndefined();
    expect(text(PriceLine({ deal: p, locale: "de" }))).not.toMatch(/3.?229|statt|sonst/);
  });
});
