import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CITIES } from "@/config/cities";
import { CATEGORIES, categorize, categoryForFamily } from "@/lib/categories";
import { conditionLines, parseCondition } from "@/lib/conditions";
import { DICTS, LOCALES } from "@/lib/i18n";
import { cleanOutbound, viaHost } from "@/lib/outbound";
import { cleanTitle, dealSlug, hasPage, inCity, markPages, projectDeal, projectFeed, quantityMismatch, slugify } from "@/lib/project";
import type { Feed, RawDeal } from "@/lib/types";

const FEED: Feed = { id: "ch-sg", country: "CH", currency: "CHF", url: "x", cities: ["st-gallen"] };
const NOW = new Date("2026-10-27T12:00:00+01:00");
const base: RawDeal = {
  deal_id: "qoqa:1", source_id: "qoqa", title: "Kopfhörer Über-Ohr", family: "flash",
  source_url: "https://www.qoqa.ch/de/offers/1", current_price: 49, reference_price: 99, reference_price_type: "merchant_previous",
  promotion_integrity: "ok", score_confidence: 0.9,
  deal_score: 7.2, geographic_scope_resolved: "ONLINE", lifecycle: "ACTIVE",
  personal_relevance: 0.9, distance_km: 1.2, favorite: true, eligible_home: true,
};

describe("projectDeal", () => {
  it("liste blanche : aucun champ personnel ne fuit", () => {
    const p = projectDeal(base, FEED, NOW)!;
    const json = JSON.stringify(p);
    for (const k of ["personal_relevance", "distance_km", "favorite", "eligible_home", "1.2"]) expect(json).not.toContain(k);
    expect(p).toMatchObject({ price: 49, referencePrice: 99, score: 7.2, category: "tech-deals", cities: ["*"], verifiedRef: true });
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
    expect(p.verifiedRef).toBe(false);
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

  it("historique, type de référence, économie absolue, date de fin déduite", () => {
    const p = projectDeal({
      deal_id: "g:1", source_id: "galaxus", title: "X", family: "tech", source_url: "https://galaxus.ch/x",
      current_price: 10, reference_price: 15, discount_absolute: 5, reference_price_type: "merchant_previous",
      historical_low: 10, historical_median: 14, history_n: 6, canonical_entity_id: "gtin:1", ends_at: "2026-10-30T00:00:00+01:00", ends_inferred: true,
    }, FEED, NOW)!;
    expect(p).toMatchObject({ discountAbs: 5, referenceType: "merchant_previous", historicalLow: 10, historicalMedian: 14, historyN: 6, entityId: "gtin:1", endsInferred: true });
  });
});

/** P0-3 : prix barrés et notes seulement sur des références vérifiables (cas réels du flux). */
describe("honnêteté des références de prix", () => {
  it("ExpressVPN « Bis zu 78 % » (pourcentage du vendeur, confiance 0.2) : pas de note, pas de barré", () => {
    const p = projectDeal({ deal_id: "studentbeans:1", source_id: "studentbeans", title: "ExpressVPN: Bis zu 78 % Rabatt auf das Pro-Paket + 4 Gratismonate", family: "student",
      merchant: "ExpressVPN", source_url: "https://www.studentbeans.com/x", reference_price_type: "stated_percent_only", discount_percentage: 78, deal_score: 9.3, score_confidence: 0.55 }, FEED, NOW)!;
    expect(p.score).toBeUndefined();
    expect(p.verifiedRef).toBe(false);
    expect(p.refKind).toBe("vendor_pct");
  });

  it("Tefal 99.90 « statt » 199 (prix catalogue) : jamais barré, note plafonnée à 6.9", () => {
    const p = projectDeal({ deal_id: "daydeal:9439", source_id: "daydeal", title: "Kochgeschirr-Set Tefal Ingenio Emotion 13-teilig", family: "flash", merchant: "DayDeal",
      current_price: 99.9, reference_price: 199, reference_price_type: "catalog", discount_absolute: 99.1, deal_score: 7, score_confidence: 0.7, promotion_integrity: "ok",
      source_url: "https://www.daydeal.ch/de/category/haushalt-wohnen" }, FEED, NOW)!;
    expect(p.verifiedRef).toBe(false);
    expect(p.refKind).toBe("vendor");
    expect(p.score).toBe(6.9);
    expect(p.scoreCap).toBe("vendor");
    expect(p.category).toBe("haushalt");
  });

  it("PostFinance « 100 Franken Startbonus » : bonus, ni note ni économie", () => {
    const p = projectDeal({ deal_id: "preispirat:766267", source_id: "preispirat", title: "100 Franken Startbonus für Bankpaket SmartStudents! (PostFinance)", family: "free",
      current_price: 0, reference_price: 100, reference_price_type: "competitor", discount_absolute: 100, deal_score: 7.2, score_confidence: 0.25, promotion_integrity: "ok",
      source_url: "https://www.preispirat.ch/100-franken-startbonus/" }, FEED, NOW)!;
    expect(p.score).toBeUndefined();
    expect(p.verifiedRef).toBe(false);
    expect(p.via).toBe("preispirat.ch");
  });

  it("Quickline « −5 % » sans référence : pas de note, abonnement complet (durée, suite, frais, total)", () => {
    const p = projectDeal({ deal_id: "dk:ql", source_id: "dschungelkompass", title: "Quickline Internet L (Aktionspreis)", family: "subscription", merchant: "Quickline",
      current_price: 44, effective_discount: 5, deal_score: 0, score_confidence: 0.4, net_savings: -141.4, commitment_months: 24, activation_fee: 79, price_after_promo: 69, promo_months: 24, unit: "CHF/Monat",
      source_url: "https://www.dschungelkompass.ch/internet/aktionen.xhtml", offer_url: "https://www.quickline.ch/internet?utm_source=dschungelkompass" }, FEED, NOW)!;
    expect(p.score).toBeUndefined();
    expect(p.title).toBe("Quickline Internet L");
    expect(p.unit).toBe("month");
    expect(p.sub).toMatchObject({ months: 24, fee: 79, total24: 44 * 24 + 79 });
    expect(p.url).toBe("https://www.quickline.ch/internet");
  });

  it("GGA Maur : 12 mois à 39, puis 49, frais 49 ; code partenaire tiers jamais republié", () => {
    const p = projectDeal({ deal_id: "dk:gga", source_id: "dschungelkompass", title: "GGA Maur Internet Basic (Aktionspreis)", family: "subscription", merchant: "GGA Maur",
      current_price: 39, deal_score: 0, net_savings: -58.6, commitment_months: 1, activation_fee: 49, price_after_promo: 49, promo_months: 12, unit: "CHF/Monat", requires_coupon: true,
      coupon_code: "KOMPASS26", conditions: ["Aktion: Internet Basic 12 Monate für CHF 39.00, danach 49.00 (Gutscheincode: «KOMPASS26»). Der berechnete Preis gilt durchschnittlich."],
      source_url: "https://www.dschungelkompass.ch/internet/aktionen.xhtml", offer_url: "https://www.gga.ch/dschungelkompass?utm_source=dschungelkompass&utm_medium=cpc " }, FEED, NOW)!;
    expect(p.couponCode).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain("KOMPASS26");
    expect(p.sub).toMatchObject({ months: 1, promoMonths: 12, after: 49, fee: 49, total24: 39 * 12 + 49 * 12 + 49 });
    expect(p.verifiedRef).toBe(false);
  });

  it("prix « au-dessus de l'habituel » (note 0) : jamais barré, et pas de note « 0.0 »", () => {
    const p = projectDeal({ ...base, promotion_integrity: "above_usual_price", deal_score: 0 }, FEED, NOW)!;
    expect(p.score).toBeUndefined();
    expect(p.verifiedRef).toBe(false);
  });

  it("confiance < 0.7 : jamais « sehr gut / Top »", () => {
    const p = projectDeal({ ...base, score_confidence: 0.5, deal_score: 8.4 }, FEED, NOW)!;
    expect(p.score).toBe(6.9);
    expect(p.scoreCap).toBe("confidence");
    expect(p.verifiedRef).toBe(false);
  });

  it("Mövenpick Himmlische 500g au prix d'un pack 3×500g : pas de note (quantité incohérente)", () => {
    const p = projectDeal({ deal_id: "rappn:f77", source_id: "rappn", title: "Mövenpick Himmlische gemahlen 500g", family: "grocery", merchant: "Coop",
      current_price: 13.15, reference_price: 35.85, reference_price_type: "merchant_previous", discount_absolute: 22.7, deal_score: 8.2, score_confidence: 0.85, promotion_integrity: "ok",
      unit: "CHF/kg", unit_price: 8.77, source_url: "https://rappn.ch/de/aktionen/coop/k/sg#offer=f77" }, FEED, NOW)!;
    expect(p.score).toBeUndefined();
    expect(p.verifiedRef).toBe(false);
    expect(quantityMismatch("Mövenpick Bohnenkaffee Caffè Crema 3x500g", 13.15, 8.77, "kg")).toBe(false);
  });

  it("Coop via rappn.ch : le lien mène à l'agrégateur, on le dit", () => {
    const p = projectDeal({ deal_id: "rappn:1", source_id: "rappn", title: "Chopfab Pale Ale 24x500ml", family: "grocery", merchant: "Aligro", current_price: 29.6,
      source_url: "https://rappn.ch/de/aktionen/aligro/k/sg#offer=1" }, FEED, NOW)!;
    expect(p.via).toBe("rappn.ch");
    expect(viaHost("https://www.coop.ch/x", "Coop")).toBeUndefined();
  });
});

describe("liens sortants", () => {
  it("affiliation tiers désemballée vers le marchand ; sinon exclue", () => {
    const c = cleanOutbound("https://clk.tradedoubler.com/click?p=391229&a=3480826&epi=internet&url=https%3A%2F%2Fwww.yallo.ch%2Fde%2Fhome-internet")!;
    expect(c).toEqual({ url: "https://www.yallo.ch/de/home-internet", wasAffiliate: true });
    expect(cleanOutbound("https://www.awin1.com/cread.php?awinmid=1&awinaffid=2")).toBeNull();
    expect(cleanOutbound("http://shop.ch/x?utm_source=a&id=3")).toEqual({ url: "https://shop.ch/x?id=3", wasAffiliate: false });
    expect(cleanOutbound("https://www.amazon.de/dp/X?tag=other-21")).toEqual({ url: "https://www.amazon.de/dp/X", wasAffiliate: true });
  });

  it("un lien tiers désemballé n'est jamais réécrit en lien rémunéré", () => {
    const p = projectDeal({ ...base, offer_url: "https://clk.tradedoubler.com/click?p=1&a=2&url=https%3A%2F%2Fwww.galaxus.ch%2Fx" }, FEED, NOW)!;
    expect(p.url).toBe("https://www.galaxus.ch/x");
    expect(p.noAff).toBe(true);
  });
});

describe("conditions traduites (jamais de français sur une page allemande)", () => {
  it("codes connus", () => {
    expect(parseCondition("dès 4 pièces")).toEqual({ code: "min_qty", n: 4 });
    expect(parseCondition("Achat minimum 2 unités (« ab 2 Stück »)")).toEqual({ code: "min_qty", n: 2 });
    expect(parseCondition("prix Lidl Plus : application Lidl Plus requise")).toEqual({ code: "lidl_plus" });
    expect(parseCondition("Nur in der deutschen und italienischen Schweiz erhältlich")).toEqual({ code: "region", regions: ["de", "it"] });
  });

  it("flux échantillon : aucune ligne DE avec « pièce », « requise », « épuisement »", () => {
    const raw = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "fixtures", "universal.sample.json"), "utf8"));
    const deals = projectFeed(raw.deals, FEED, new Date(raw.generated_at));
    for (const d of deals) {
      const de = conditionLines(d.conds, DICTS.de, "de", (v) => `CHF ${v}`).join(" ");
      expect(de).not.toMatch(/pièce|requise|épuisement|jusqu’à|valable/);
      const fr = conditionLines(d.conds, DICTS.fr, "fr", (v) => `CHF ${v}`).join(" ");
      expect(fr).not.toMatch(/Stück|erhältlich|nur /);
    }
  });

  it("chaque langue traduit chaque code", () => {
    for (const l of LOCALES) for (const k of Object.keys(DICTS.de.cond)) expect(DICTS[l].cond[k]).toBeTruthy();
  });
});

describe("markPages", () => {
  it("toute carte publiée a sa page ; au-delà du plafond, le deal n'est pas publié du tout", () => {
    const mk = (score?: number) => projectDeal({ ...base, deal_id: `q:${score}`, title: `T${score}`, deal_score: score }, FEED, NOW)!;
    const ranked = [mk(6.9), mk(6), mk(5.5), mk(4.9), mk(undefined)];
    expect(markPages(ranked).map(hasPage)).toEqual([true, true, true, true, true]);
    expect(markPages(ranked, 2).map((d) => d.id)).toEqual([ranked[0].id, ranked[1].id]);
  });
});

describe("slugs et titres", () => {
  it("stables, ASCII, uniques par id", () => {
    expect(slugify("Über Äpfel & Café — 2×")).toBe("uber-apfel-cafe-2");
    expect(dealSlug("a:1", "X")).toBe(dealSlug("a:1", "X"));
    expect(dealSlug("a:1", "X")).not.toBe(dealSlug("a:2", "X"));
  });
  it("titres nettoyés", () => {
    expect(cleanTitle("[Neukunden] Salt Mobile Swiss")).toBe("Salt Mobile Swiss");
    expect(cleanTitle("Quickline Internet L (Aktionspreis)")).toBe("Quickline Internet L");
    expect(cleanTitle("MÖVENPICK Mövenpick Kaffee")).toBe("Mövenpick Kaffee");
  });
});

describe("catégories et villes", () => {
  it("chaque famille du scanner a une catégorie", () => {
    const families = ["grocery","retail","tech","flash","surplus","free","secondhand","refurbished","restaurant","student",
      "transport","travel","event","subscription","cashback","coupon","contest","digital_free","local_news"];
    const slugs = new Set(CATEGORIES.map((c) => c.slug));
    for (const f of families) expect(slugs.has(categoryForFamily(f))).toBe(true);
  });
  it("classement par produit, pas par source", () => {
    expect(categorize({ family: "flash", title: "Kochgeschirr-Set Tefal Ingenio Emotion 13-teilig", merchant: "DayDeal" })).toBe("haushalt");
    expect(categorize({ family: "retail", title: "Katzenstreu Klumpstreu 10 l", merchant: "Fressnapf" })).toBe("haushalt");
    expect(categorize({ family: "retail", title: "Vanish Oxi Action Fleckentferner Pulver", merchant: "Denner" })).toBe("supermarkt-aktionen");
    expect(categorize({ family: "retail", title: "Finish Quantum Ultimate Tabs", merchant: "Coop" })).toBe("supermarkt-aktionen");
    expect(categorize({ family: "retail", title: "Ernährungspsychologische Beratung 60 Min", merchant: "Praxis X" })).toBe("lokal");
    expect(categorize({ family: "retail", title: "Samsung Galaxy S25 128 GB", merchant: "Interdiscount" })).toBe("tech-deals");
    expect(categorize({ family: "digital_free", title: "Spotify Premium 3 Monate gratis" })).toBe("gutscheine");
  });
  it("slugs de ville uniques", () => {
    expect(new Set(CITIES.map((c) => c.slug)).size).toBe(CITIES.length);
  });
});

describe("flux réel (échantillon)", () => {
  it("projette l'échantillon sans erreur ; prix « statt » d'abord, puis note", () => {
    const raw = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "fixtures", "universal.sample.json"), "utf8"));
    const deals = projectFeed(raw.deals, FEED, new Date(raw.generated_at));
    expect(deals.length).toBeGreaterThan(50);
    expect(new Set(deals.map((d) => d.slug)).size).toBe(deals.length);
    const now = deals.filter((d) => !d.upcoming);
    // Aucun deal sans prix « statt » ne précède un deal qui en a un (round 2, item 7).
    const firstUnverified = now.findIndex((d) => !d.verifiedRef);
    if (firstUnverified >= 0) expect(now.slice(firstUnverified).some((d) => d.verifiedRef)).toBe(false);
    const verified = now.filter((d) => d.verifiedRef).map((d) => d.score ?? -1);
    expect([...verified].sort((a, b) => b - a)).toEqual(verified);
  });
});

/** Round 2 — régressions et nouvelles règles, sur des cas réels du flux. */
describe("round 2 : prix « statt » des marchands, plafonds honnêtes", () => {
  const energizer: RawDeal = {
    deal_id: "denner:ENERGIZER", source_id: "denner", title: "Energizer Max Batterien AA", family: "retail", merchant: "Denner",
    source_url: "https://www.denner.ch/de/aktionen/energizer", current_price: 17.8, reference_price: 35.8, reference_price_type: "merchant_previous",
    discount_percentage: 50, deal_score: 7.6, score_confidence: 0.85, geographic_scope_resolved: "NATIONAL", lifecycle: "ACTIVE",
    starts_at: "2026-10-27T00:00:00+01:00", ends_at: "2026-11-02T23:59:00+01:00",
  };

  it("Denner (integrity absente) : prix barré affiché, pas de faux motif « dünn », pas de plafond « confidence »", () => {
    const p = projectDeal(energizer, FEED, NOW)!;
    expect(p.verifiedRef).toBe(true);
    expect(p.scoreCap).toBeUndefined();
    expect(p.score).toBe(7.6);
    expect(p.category).toBe("supermarkt-aktionen");
    expect(Object.values(DICTS).map((t) => JSON.stringify(t.scoreCap)).join(" ")).not.toMatch(/dünn|minces|thin/);
  });

  it("aucun deal plafonné « confidence » avec une qualité de données élevée", () => {
    const raw = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "fixtures", "universal.sample.json"), "utf8"));
    for (const d of projectFeed(raw.deals, FEED, new Date(raw.generated_at))) {
      if (d.scoreCap === "confidence") expect(d.confidence ?? 0).toBeLessThan(0.7);
    }
  });

  it("comparaison avec un concurrent annoncée par le marchand : plafonnée « unchecked » sans nos relevés", () => {
    const p = projectDeal({ ...energizer, deal_id: "denner:C", reference_price_type: "competitor" }, FEED, NOW)!;
    expect(p.verifiedRef).toBe(true);
    expect(p.score).toBe(6.9);
    expect(p.scoreCap).toBe("unchecked");
    const obs = projectDeal({ ...energizer, deal_id: "denner:C2", reference_price_type: "competitor", historical_median: 35.5, history_n: 4 }, FEED, NOW)!;
    expect(obs.refObserved).toBe(true);
    expect(obs.scoreCap).toBeUndefined();
  });

  it("référence gonflée (integrity) : jamais barrée, motif « integrity »", () => {
    const p = projectDeal({ ...base, promotion_integrity: "inflated_reference", deal_score: 8 }, FEED, NOW)!;
    expect(p.verifiedRef).toBe(false);
    expect(p.scoreCap).toBe("integrity");
  });

  it("note 0 → pas de note ; « ab morgen » → upcoming ; magasin → inStore", () => {
    expect(projectDeal({ ...base, deal_score: 0 }, FEED, NOW)!.score).toBeUndefined();
    const up = projectDeal({ ...energizer, deal_id: "denner:U", starts_at: "2026-10-28T00:00:00+01:00" }, FEED, NOW)!;
    expect(up.upcoming).toBe(true);
    expect(up.inStore).toBe(true);
  });

  it("contournement géographique jamais publié ; escort jamais en vitrine", () => {
    expect(projectDeal({ ...base, title: "Netflix über Bulgarien abonnieren" }, FEED, NOW)).toBeNull();
    expect(projectDeal({ ...base, title: "Begleiterin für eine Nacht", family: "free" }, FEED, NOW)!.noShowcase).toBe(true);
  });

  it("supermarchés → Supermarkt (sauf électronique)", () => {
    expect(categorize({ family: "retail", title: "Energizer Max Batterien AA", merchant: "Denner" })).toBe("supermarkt-aktionen");
    expect(categorize({ family: "retail", title: "Felix Katzenfutter", merchant: "Denner" })).toBe("supermarkt-aktionen");
    expect(categorize({ family: "retail", title: "Samsung Galaxy A16 Smartphone", merchant: "Lidl" })).toBe("tech-deals");
    expect(categorize({ family: "retail", title: "Pfanne 28 cm", source: "aldi" })).toBe("supermarkt-aktionen");
  });

  it("titres sans marketing (cas réels)", () => {
    expect(cleanTitle("Winterferien in Interlaken 🏔️")).toBe("Winterferien in Interlaken");
    expect(cleanTitle("ERHÖHT 35% Rabatt auf alles")).toBe("35% Rabatt auf alles");
    expect(cleanTitle("Lindt Pralinés zum neuen Tiefstpreis")).toBe("Lindt Pralinés");
    expect(cleanTitle("Lindt Pralinés zum neuen Tiefstpreis", { keepLowest: true })).toBe("Lindt Pralinés zum neuen Tiefstpreis");
    expect(cleanTitle("Kopfhörer XY – nur heute!")).toBe("Kopfhörer XY");
    expect(cleanTitle("100% Bruno Wickart Gutschein für Designmöbel", { discountPct: 10 })).toBe("10% Bruno Wickart Gutschein für Designmöbel");
    expect(cleanTitle("SOLEVITA Bio Shot")).toBe("Solevita Bio Shot");
    expect(cleanTitle("BARBIE/HOT WHEELS Adventskalender")).toBe("Barbie/HOT Wheels Adventskalender");
    expect(cleanTitle("QUALITÉ SUISSE Halbrahm 25% UHT")).toBe("Qualité Suisse Halbrahm 25% UHT");
  });

  it("abonnement : pas de total 24 mois avec une taxe de mise en service inconnue", () => {
    const p = projectDeal({ deal_id: "dk:x", source_id: "dschungelkompass", title: "Go Mobile", family: "subscription", merchant: "Go",
      current_price: 9.9, commitment_months: 1, promo_months: 24, unit: "CHF/Monat", source_url: "https://www.dschungelkompass.ch/x" }, FEED, NOW)!;
    expect(p.sub?.total24).toBeUndefined();
  });

  it("enseigne absente de la ville (Aligro à St. Gallen) : jamais affichée", () => {
    const p = projectDeal({ ...energizer, deal_id: "rappn:a", source_id: "rappn", merchant: "Aligro" }, FEED, NOW)!;
    expect(inCity(p, CITIES[0])).toBe(false);
    expect(inCity(projectDeal(energizer, FEED, NOW)!, CITIES[0])).toBe(true);
  });
});
