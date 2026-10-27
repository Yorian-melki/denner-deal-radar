import { describe, expect, it } from "vitest";
import { activeProgrammes, rewriteUrl } from "@/lib/affiliate/rewrite";
import { parseMidMap } from "@/lib/affiliate/programmes";

const ENV = {
  AFF_TRADEDOUBLER_ID: "999",
  AFF_TRADEDOUBLER_GALAXUS_P: "302027",
  AFF_AWIN_ID: "111",
  AFF_AWIN_MIDS: "brack.ch=12345, revendo.ch=678, bad=x",
  AFF_AMAZON_DE_TAG: "radar-21",
  AFF_ALIEXPRESS_TEMPLATE: "https://s.click.aliexpress.com/deep?dl={url}",
  AFF_BOOKING_AID: "424242",
};

describe("rewriteUrl", () => {
  it("sans identifiant : lien d'origine, jamais sponsorisé", () => {
    const r = rewriteUrl("https://www.galaxus.ch/de/s1/product/x-123", {});
    expect(r).toEqual({ href: "https://www.galaxus.ch/de/s1/product/x-123", affiliate: false, rel: "noopener noreferrer" });
  });

  it("Galaxus via Tradedoubler, URL encodée", () => {
    const r = rewriteUrl("https://www.galaxus.ch/de/daily-deal?x=1&y=2", ENV);
    expect(r.affiliate).toBe(true);
    expect(r.programme).toBe("galaxus");
    expect(r.rel).toContain("sponsored");
    const u = new URL(r.href);
    expect(u.hostname).toBe("clk.tradedoubler.com");
    expect(u.searchParams.get("p")).toBe("302027");
    expect(u.searchParams.get("a")).toBe("999");
    expect(u.searchParams.get("url")).toBe("https://www.galaxus.ch/de/daily-deal?x=1&y=2");
  });

  it("Digitec n'utilise pas l'id de programme Galaxus", () => {
    expect(rewriteUrl("https://www.digitec.ch/de/daily-deal", ENV).affiliate).toBe(false);
  });

  it("Awin : mid par marchand, sous-domaines compris, hôte inconnu ignoré", () => {
    const r = rewriteUrl("https://www.brack.ch/sale", ENV);
    expect(new URL(r.href).searchParams.get("awinmid")).toBe("12345");
    expect(new URL(r.href).searchParams.get("ued")).toBe("https://www.brack.ch/sale");
    expect(rewriteUrl("https://shop.revendo.ch/p", ENV).programme).toBe("awin");
    expect(rewriteUrl("https://www.denner.ch/de/aktionen", ENV).affiliate).toBe(false);
    expect(rewriteUrl("https://notbrack.ch/", ENV).affiliate).toBe(false);
  });

  it("Amazon : ajoute le tag, conserve le chemin", () => {
    const r = rewriteUrl("https://www.amazon.de/dp/B0TEST?th=1", ENV);
    const u = new URL(r.href);
    expect(u.pathname).toBe("/dp/B0TEST");
    expect(u.searchParams.get("tag")).toBe("radar-21");
    expect(u.searchParams.get("th")).toBe("1");
  });

  it("ne détourne jamais un lien déjà affilié par un tiers", () => {
    const foreign = "https://www.amazon.de/dp/B0X?tag=someoneelse-21";
    expect(rewriteUrl(foreign, ENV)).toMatchObject({ href: foreign, affiliate: false });
    const awin = "https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued=x";
    expect(rewriteUrl(awin, ENV).affiliate).toBe(false);
    expect(rewriteUrl("https://www.booking.com/hotel/ch/x.html?aid=1", ENV).href).toContain("aid=1");
  });

  it("AliExpress et Booking", () => {
    const a = rewriteUrl("https://www.aliexpress.com/item/1005.html", ENV);
    expect(a.href).toBe("https://s.click.aliexpress.com/deep?dl=" + encodeURIComponent("https://www.aliexpress.com/item/1005.html"));
    expect(new URL(rewriteUrl("https://www.booking.com/hotel/ch/x.html", ENV).href).searchParams.get("aid")).toBe("424242");
  });

  it("rejette les schémas dangereux et les URL invalides", () => {
    expect(rewriteUrl("javascript:alert(1)", ENV).href).toBe("#");
    expect(rewriteUrl("not a url", ENV).href).toBe("#");
  });

  it("modèles d'environnement invalides ignorés", () => {
    expect(rewriteUrl("https://www.aliexpress.com/item/1.html", { AFF_ALIEXPRESS_TEMPLATE: "http://evil/{url}" }).affiliate).toBe(false);
    expect(rewriteUrl("https://www.booking.com/x", { AFF_BOOKING_AID: "abc" }).affiliate).toBe(false);
    expect(rewriteUrl("https://www.galaxus.ch/x", { AFF_TRADEDOUBLER_ID: "1", AFF_TRADEDOUBLER_GALAXUS_P: "1&a=2" }).affiliate).toBe(false);
  });

  it("parseMidMap et activeProgrammes", () => {
    expect([...parseMidMap(ENV.AFF_AWIN_MIDS)]).toEqual([["brack.ch", "12345"], ["revendo.ch", "678"]]);
    expect(activeProgrammes(ENV)).toEqual(["galaxus", "amazon-de", "aliexpress", "booking", "awin:brack.ch", "awin:revendo.ch"]);
    expect(activeProgrammes({})).toEqual([]);
  });
});
