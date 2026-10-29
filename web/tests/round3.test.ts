import { describe, expect, it } from "vitest";
import { MAX_RUN, interleave, orderCategory, sortNote } from "@/components/CategoryListing";
import { PriceLine, savingText } from "@/components/DealCard";
import { isPastWeek } from "@/lib/blocklist";
import { DICTS, LOCALES } from "@/lib/i18n";
import { canonicalMerchant, merchantFromTitle, resolveMerchant } from "@/lib/merchant";
import { cleanOutbound } from "@/lib/outbound";
import { cleanTitle, compareDeals, dealSlug, endedAt, endsFromTitle, projectDeal, projectExpired, rankDeals, stableKey, studentTitles } from "@/lib/project";
import { homeOrder, pickShowcase, pickTop, relatedDeals, showsRef, shownScore } from "@/lib/select";
import type { Feed, PublicDeal, RawDeal } from "@/lib/types";

const FEED: Feed = { id: "ch-sg", country: "CH", currency: "CHF", url: "x", cities: ["st-gallen"] };
const NOW = new Date("2026-10-29T10:00:00+01:00");

let seq = 0;
function mk(p: Partial<PublicDeal> = {}): PublicDeal {
  seq++;
  return {
    id: `r3:${seq}`, slug: `r3-${seq}`, title: `Deal ${seq}`, source: "src", merchant: `Shop ${seq}`, brand: `B${seq}`,
    family: "tech", category: "tech-deals", geo: "ONLINE", cities: ["*"], country: "CH",
    currency: "CHF", conds: [], url: "https://example.ch/x", attribution: "Shop",
    refKind: "comparable", verifiedRef: true, score: 6, confidence: 0.9, page: true, price: 10, referencePrice: 20, ...p,
  };
}

describe("item 2 : une note n'existe que si sa base est visible", () => {
  it("Big Brain non vérifié 6.9 vs HP vérifié 4.6 : HP classé premier ; pas de badge sans .was", () => {
    const bigBrain = mk({ title: "Big Brain Academy", score: 6.9, verifiedRef: false, referencePrice: undefined });
    const hp = mk({ title: "HP LaserJet", score: 4.6 });
    expect(rankDeals([bigBrain, hp])[0].id).toBe(hp.id);
    expect(shownScore(bigBrain)).toBeUndefined();
    expect(shownScore(hp)).toBeUndefined(); // < 5 : pas de chiffre
    expect(shownScore(mk({ score: 6.2 }))).toBe(6.2);
  });
  it("vendeur (UVP), confidence < 0.7, concurrent sans prix rendu : aucune note", () => {
    const raw: RawDeal = { deal_id: "x:1", source_id: "daydeal", title: "Kopfhörer", family: "flash", source_url: "https://www.daydeal.ch/x",
      current_price: 49, reference_price: 99, reference_price_type: "msrp", deal_score: 7, score_confidence: 0.9, lifecycle: "ACTIVE" };
    expect(projectDeal(raw, FEED, NOW)!.score).toBeUndefined();
    expect(projectDeal({ ...raw, reference_price_type: "merchant_previous", score_confidence: 0.6 }, FEED, NOW)!.score).toBeUndefined();
    expect(projectDeal({ ...raw, reference_price_type: "competitor", reference_price: undefined }, FEED, NOW)!.score).toBeUndefined();
  });
  it("phrase de tri générée : « Neueste zuerst » quand aucune carte n'a de Statt-Preis", () => {
    expect(sortNote([mk({ verifiedRef: false })], "tech-deals", "de")).toBe(DICTS.de.sortedByNewestPlain);
    expect(sortNote([mk()], "tech-deals", "de")).toBe(DICTS.de.sortedByScore(MAX_RUN, false));
  });
  it("Handy-Abos : sans note", () => {
    const p = projectDeal({ deal_id: "dk:1", source_id: "dschungelkompass", title: "Salt Mobile", family: "subscription", source_url: "https://www.salt.ch/x",
      current_price: 20, reference_price: 40, reference_price_type: "merchant_previous", deal_score: 6.8, score_confidence: 0.9, lifecycle: "ACTIVE" }, FEED, NOW)!;
    expect(p.category).toBe("handy-abos");
    expect(p.score).toBeUndefined();
  });
});

describe("item 3 : un « statt » non observé n'est pas un historique", () => {
  const denner: RawDeal = { deal_id: "denner:dn-1-week-20261029", source_id: "denner", title: "Finish Geschirrspülcaps Ultra All in 1", family: "grocery",
    merchant: "Denner", source_url: "https://www.denner.ch/x", current_price: 11.95, reference_price: 27.35, reference_price_type: "merchant_previous",
    deal_score: 7.7, score_confidence: 0.85, lifecycle: "ACTIVE" };
  it("plafond 6.9 et « unter dem Statt-Preis von Denner », jamais « als zuvor »", () => {
    const p = projectDeal(denner, FEED, NOW)!;
    expect(p.score).toBe(6.9);
    expect(p.scoreCap).toBe("unchecked");
    for (const l of LOCALES) expect(savingText(p, l)).not.toMatch(/zuvor|qu’avant|than before/);
    expect(savingText(p, "de")).toBe("CHF 15.40 unter dem Statt-Preis von Denner");
    expect(savingText(p, "fr")).toBe("CHF 15.40 de moins que le prix barré de Denner");
    expect(savingText(p, "en")).toBe("CHF 15.40 below Denner’s was price");
    const obs = projectDeal({ ...denner, historical_median: 27.2, history_n: 4 }, FEED, NOW)!;
    expect(savingText(obs, "de")).toMatch(/als zuvor$/);
  });
  it("une seule économie par carte (round 4, item 5 : la pastille « −N % », plus de phrase en CHF)", () => {
    const p = projectDeal(denner, FEED, NOW)!;
    const el = JSON.stringify(PriceLine({ deal: p, locale: "de" }));
    expect(el.match(/günstiger/g) ?? []).toHaveLength(1);
    expect(el).not.toMatch(/unter dem Statt-Preis|als zuvor/);
    expect(el).toMatch(/laut Denner/);
  });
  it("ogDescription : la clause « Statt-Preis » seulement avec un .was", () => {
    expect(DICTS.de.ogDescription("", "Denner", false)).not.toMatch(/Statt-Preis/);
    expect(DICTS.de.ogDescription("", "Denner", true)).toMatch(/Statt-Preis/);
  });
});

describe("item 4 : vitrine et ordre de l'accueil", () => {
  it("une seule catégorie éligible : pas de plafond d'un tiers par catégorie", () => {
    const deals = Array.from({ length: 6 }, (_, i) => mk({ score: 8, category: "supermarkt-aktionen", merchant: `M${i}` }));
    expect(pickTop(deals, { n: 6, minScore: 7, requireRef: true, now: NOW })).toHaveLength(6);
    expect(pickShowcase(deals, NOW)).toHaveLength(6);
  });
  it("vitrine vide : sections avec .was d'abord, Studis ensuite, Gratis en dernier", () => {
    const sections = [
      { slug: "studenten-rabatte", total: 3, items: [mk({ verifiedRef: false })] },
      { slug: "gratis", total: 3, items: [mk({ verifiedRef: false })] },
      { slug: "supermarkt-aktionen", total: 3, items: [mk(), mk()] },
    ];
    const order = homeOrder(sections).map((s) => s.slug);
    expect(order).toEqual(["supermarkt-aktionen", "studenten-rabatte", "gratis"]);
    expect(homeOrder(sections)[0].items.some(showsRef)).toBe(true);
  });
});

describe("item 6 : titres sans marketing ni urgence, slugs stables", () => {
  it("préfixes, urgence, superlatifs, Abholung, mAh, pourcentages, marque doublée", () => {
    expect(cleanTitle("Brand: ERHÖHT 35% Rabatt auf alles")).toBe("Brand: 35% Rabatt auf alles");
    expect(cleanTitle("Erhöht 35% Rabatt")).toBe("35% Rabatt");
    expect(cleanTitle("Exklusiv! Samsung Galaxy S25 nur noch heute")).toBe("Samsung Galaxy S25");
    expect(cleanTitle("Anker Nexode20000mAh Powerbank zum neuen Bestpreis")).toBe("Anker Nexode 20000mAh Powerbank");
    expect(cleanTitle("Dyson V15 zum besten Preis bei MediaMarkt", { merchant: "MediaMarkt" })).toBe("Dyson V15");
    expect(cleanTitle("Weber Grill (Abholung)")).toBe("Weber Grill");
    expect(cleanTitle("Fnac: Fnac-Karte: 5 % Rabatt", { lang: "de" })).toBe("Fnac-Karte: 5% Rabatt");
    expect(cleanTitle("Laptop zum Tiefstpreis", { keepLowest: true })).toBe("Laptop zum Tiefstpreis");
    for (const t of ["Exklusiv! TV nur noch heute", "Powerbank zum neuen Tiefstpreis", "ERHÖHT 35% Rabatt"]) {
      const slug = dealSlug("x:1", cleanTitle(t));
      expect(slug).not.toMatch(/zum-neuen|tiefstpreis|erhoht|exklusiv|nur-noch/);
    }
  });
  it("le slug ne dépend pas de la semaine", () => {
    expect(stableKey("denner:dn-123-week-20261029")).toBe("denner:dn-123");
    expect(dealSlug("denner:dn-123-week-20261029", "Kaffee")).toBe(dealSlug("denner:dn-123-week-20261105", "Kaffee"));
    expect(stableKey("galaxus_daily:11034194:2026-10-23")).toBe("galaxus_daily:11034194");
  });
  it("« bis zum 29.10. (17 Uhr) » : date de fin parsée, retirée du titre", () => {
    expect(endsFromTitle("Gratis Kaffee bis zum 29.10. (17 Uhr)", NOW)).toBe("2026-10-29T17:00:00+01:00");
    expect(cleanTitle("Gratis Kaffee bis zum 29.10. (17 Uhr)")).toBe("Gratis Kaffee");
  });
});

describe("item 7 : jamais un agrégateur comme marchand", () => {
  it("marchand du titre, marque ≠ marchand, graphies", () => {
    expect(resolveMerchant("preispirat", undefined, "Dyson V15 bei MediaMarkt")).toBe("MediaMarkt");
    expect(resolveMerchant("preispirat", undefined, "Gratis Futterprobe für Hunde")).toBeUndefined();
    // Round 4, item 12 : le prestataire nommé en tête (Sky), jamais la marque mal attribuée (Apple).
    expect(resolveMerchant("preispirat", "Apple", "Sky Show 3 Monate gratis")).toBe("Sky");
    expect(resolveMerchant("preispirat", "Preispirat", "X")).toBeUndefined();
    expect(resolveMerchant("denner", undefined, "Kaffee")).toBe("Denner");
    expect(canonicalMerchant("ALDI SUISSE")).toBe("Aldi");
    expect(merchantFromTitle("HP LaserJet im HP Store")).toBe("HP Store");
  });
  it("deal sans marchand : « Händler unbekannt », jamais en vitrine", () => {
    const p = projectDeal({ deal_id: "preispirat:1", source_id: "preispirat", title: "Gratis Futterprobe", family: "free", source_url: "https://www.preispirat.ch/x", lifecycle: "ACTIVE" }, FEED, NOW)!;
    expect(p.merchant).toBeUndefined();
    expect(p.noShowcase).toBe(true);
    expect(p.attribution).toBe("Preispirat");
    expect(JSON.stringify(p)).not.toMatch(/\(preispirat\.ch\)/);
  });
});

describe("item 8 : Studis", () => {
  it("titres reconstruits par langue", () => {
    expect(studentTitles("Acer: 15% Studentenrabatt")).toEqual({ de: "Acer: 15% Rabatt für Studierende", fr: "Acer : 15 % de réduction étudiante", en: "Acer: 15% student discount" });
    expect(studentTitles("G-STAR: Bis zu 40 % Rabatt")?.en).toBe("G-STAR: up to 40% student discount");
    // Round 4, item 10 : titre allemand gardé en DE (plus précis), repli traduit en FR/EN.
    const on = studentTitles("On: 15% Rabatt auf Trainer für Schüler", "de")!;
    expect(on.de).toBeUndefined();
    expect(on.fr).toBe("On\u202f: 15\u202f% de réduction étudiante");
    expect(on.en).toBe("On: 15% student discount");
  });
  it("marques pour adultes : jamais sur l'accueil, Studis ni Gratis", () => {
    const p = projectDeal({ deal_id: "studentbeans:1", source_id: "studentbeans", title: "Lovense: 20% Student Discount", family: "student", merchant: "Lovense",
      source_url: "https://www.lovense.com/x", discount_percentage: 20, reference_price_type: "stated_percent_only", lifecycle: "ACTIVE" }, FEED, NOW)!;
    expect(p.adult).toBe(true);
    expect(p.noShowcase).toBe(true);
  });
  it("Studis : réduction annoncée décroissante, puis fin la plus proche", () => {
    const a = mk({ category: "studenten-rabatte", discountPct: 10 }), b = mk({ category: "studenten-rabatte", discountPct: 30 });
    expect(orderCategory([a, b], "studenten-rabatte")[0].id).toBe(b.id);
  });
});

describe("item 9 : traceurs", () => {
  it("DoubleClick Swisscom désemballé vers l'URL du marchand, sans paramètre de campagne", () => {
    const u = "https://ad.doubleclick.net/ddm/trackclk/N1136344.3733467DSCHUNGELKOMPASS/B23556242.261915231;dc_trk_aid=457377450;dc_trk_cid=125463914;dc_lat=;dc_rdid=;tag_for_child_directed_treatment=;tfua=;ltd=?https://www.swisscom.ch/de/privatkunden/mobile-handy-abo/blue-mobile-s.html?campID=DI_5765674_R1GR1229_125463914";
    expect(cleanOutbound(u)?.url).toBe("https://www.swisscom.ch/de/privatkunden/mobile-handy-abo/blue-mobile-s.html");
    expect(cleanOutbound("https://bit.ly/abc")).toBeNull();
  });
});

describe("items 10, 15, 31 : expirés, concours, spiritueux", () => {
  it("pierre tombale : terminé depuis ≤ 30 jours, jamais un deal vivant", () => {
    const d: RawDeal = { deal_id: "denner:dn-9-week-20261022", source_id: "denner", title: "Mövenpick Caffè Crema 3x500g", family: "grocery", merchant: "Denner",
      source_url: "https://www.denner.ch/x", current_price: 13.15, reference_price: 35.85, reference_price_type: "merchant_previous", lifecycle: "EXPIRED",
      ends_at: "2026-10-28T23:59:00+01:00", deal_score: 8, score_confidence: 0.85 };
    expect(endedAt(d, NOW)).toBe("2026-10-28T23:59:00+01:00");
    expect(endedAt({ ...d, ends_at: "2026-09-01T23:59:00+02:00" }, NOW)).toBeUndefined();
    const t = projectExpired([d], FEED, NOW, new Set());
    expect(t).toHaveLength(1);
    expect(t[0].endedAt).toBe("2026-10-28T23:59:00+01:00");
    expect(projectExpired([d], FEED, NOW, new Set([t[0].slug]))).toHaveLength(0);
  });
  it("concours et semaines passées jamais publiés", () => {
    const base: RawDeal = { deal_id: "p:1", source_id: "preispirat", title: "Avia Gewinnspiel", family: "free", source_url: "https://x.ch/x", lifecycle: "ACTIVE" };
    expect(projectDeal(base, FEED, NOW)).toBeNull();
    expect(isPastWeek("100% Rabatt Games KW43", NOW)).toBe(true);
    expect(isPastWeek("100% Rabatt Games KW44", NOW)).toBe(false);
  });
  it("gin Lidl avec ancien prix : plus publié du tout (round 4, item 2) ; Kirschstengeli reste", () => {
    const p = projectDeal({ deal_id: "lidl:1", source_id: "lidl", title: "Gordon's London Dry Gin 70cl", family: "grocery", merchant: "Lidl",
      source_url: "https://www.lidl.ch/x", current_price: 14.99, reference_price: 21.99, reference_price_type: "merchant_previous",
      discount_percentage: 32, deal_score: 7.5, score_confidence: 0.9, lifecycle: "ACTIVE" }, FEED, NOW);
    expect(p).toBeNull();
    const k = projectDeal({ deal_id: "lidl:2", source_id: "lidl", title: "Kirschstengeli 200g", family: "grocery", source_url: "https://www.lidl.ch/x", lifecycle: "ACTIVE" }, FEED, NOW)!;
    expect(k).not.toBeNull();
    expect(k.alcohol).toBeUndefined();
  });
});

describe("items 13, 14 : maillage et diversité", () => {
  it("« Mehr aus » : toujours jusqu'à 3 deals, jamais le courant, triés par le comparateur unique", () => {
    const d = mk({ category: "tech-deals" });
    const pool = [d, ...Array.from({ length: 5 }, () => mk({ category: "tech-deals", verifiedRef: false })), mk({ category: "tech-deals" })];
    const r = relatedDeals(pool, d);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.id)).not.toContain(d.id);
    expect([...r].sort(compareDeals).map((x) => x.id)).toEqual(r.map((x) => x.id));
    expect(showsRef(r[0])).toBe(true);
  });
  it("jamais 3 cartes consécutives du même marchand", () => {
    const list = [...Array.from({ length: 6 }, () => mk({ merchant: "Otto's" })), ...Array.from({ length: 3 }, (_, i) => mk({ merchant: `M${i}` }))];
    const out = interleave(list);
    for (let i = 2; i < out.length; i++) {
      const same = out[i].merchant === out[i - 1].merchant && out[i].merchant === out[i - 2].merchant;
      if (same) expect(out.slice(i).every((x) => x.merchant === out[i].merchant)).toBe(true);
    }
  });
});

describe("items 22, 23 : catégories et dates d'événements", () => {
  it("montres et bijoux en Shopping, accessoires Revendo hors Refurbished, avis communaux en Lokal", async () => {
    const { categorize } = await import("@/lib/categories");
    expect(categorize({ family: "tech", title: "Tissot PRX Powermatic 80", merchant: "Christ" })).toBe("shopping");
    expect(categorize({ family: "tech", title: "Apple Watch Series 10", merchant: "Digitec" })).toBe("tech-deals");
    expect(categorize({ family: "refurbished", title: "Panzerglas Schutzfolie", source: "revendo" })).toBe("shopping");
    expect(categorize({ family: "refurbished", title: "iPhone 14 128 GB (Zustand: sehr gut)", source: "revendo" })).toBe("refurbished");
    expect(categorize({ family: "local_news", title: "Nachsammlung Kehricht" })).toBe("lokal");
  });
  it("concert d'un soir : jour et heure, jamais « ab »", async () => {
    const { dateText } = await import("@/components/DealCard");
    const t = dateText({ category: "events", startsAt: "2026-12-09T20:00:00+01:00", upcoming: true }, "de", NOW);
    expect(t).toBe("Mi 9.12., 20:00");
    expect(dateText({ category: "events", startsAt: "2026-12-09T20:00:00+01:00", upcoming: true }, "fr", NOW)).toBe("mer. 9 déc., 20 h");
    expect(dateText({ category: "events", startsAt: "2026-12-09T20:00:00+01:00", upcoming: true }, "en", NOW)).toBe("Wed 9 Dec, 8 pm");
  });
});
