import { describe, expect, it } from "vitest";
import { switchPath } from "@/components/LangSwitch";
import { fmtDay, fmtInt, fmtPct, fmtPrice, fmtScore, fmtUpdated } from "@/lib/format";
import { LOCALES } from "@/lib/i18n";
import { monetisationBlockers } from "@/lib/operator";
import { alternates, resolveSiteUrl } from "@/lib/site";

describe("changement de langue : toujours la page équivalente", () => {
  it("remplace seulement le premier segment, garde requête et ancre", () => {
    expect(switchPath("/de/st-gallen/tech-deals", "fr")).toBe("/fr/st-gallen/tech-deals");
    expect(switchPath("/fr/deal/kaffee-1abc", "en")).toBe("/en/deal/kaffee-1abc");
    expect(switchPath("/en", "de")).toBe("/de");
    expect(switchPath("/de/st-gallen/gratis/2", "en", "?q=kaffee", "#x")).toBe("/en/st-gallen/gratis/2?q=kaffee#x");
    expect(switchPath("/de/missing", "fr")).toBe("/fr");
  });
  it("jamais de lien vers la racine", () => {
    for (const l of LOCALES) expect(switchPath("/", l)).toBe(`/${l}`);
  });
  it("hreflang : les trois langues + x-default", () => {
    expect(alternates("/st-gallen", "fr")).toEqual({
      canonical: "/fr/st-gallen",
      languages: { "de-CH": "/de/st-gallen", "fr-CH": "/fr/st-gallen", en: "/en/st-gallen", "x-default": "/de/st-gallen" },
    });
  });
});

describe("URL publique", () => {
  it("un build de production sans URL https valide échoue", () => {
    expect(() => resolveSiteUrl(undefined, true)).toThrow();
    expect(() => resolveSiteUrl("http://localhost:3000", true)).toThrow();
    expect(() => resolveSiteUrl("http://savradar.pages.dev", true)).toThrow();
    expect(resolveSiteUrl("https://savradar.pages.dev/", true)).toBe("https://savradar.pages.dev");
    expect(resolveSiteUrl(undefined, false)).toBe("http://localhost:3000");
  });
});

describe("garde-fou exploitant", () => {
  it("indexation, affiliation et publicité impossibles sans Impressum complet", () => {
    expect(monetisationBlockers({ SITE_INDEXABLE: "1", AFF_AWIN_ID: "1", AFF_BOOKING_AID: "", NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-1" }, false))
      .toEqual(["SITE_INDEXABLE", "NEXT_PUBLIC_ADSENSE_CLIENT", "AFF_AWIN_ID"]);
    expect(monetisationBlockers({ SITE_INDEXABLE: "1" }, true)).toEqual([]);
    expect(monetisationBlockers({}, false)).toEqual([]);
  });
});

describe("formats suisses", () => {
  it("séparateur de milliers, jamais de nombre brut", () => {
    expect(fmtInt(1349, "de")).toBe("1’349");
    expect(fmtInt(12937, "en")).toBe("12’937");
    expect(fmtInt(1349, "fr")).toMatch(/^1\s349$/u);
  });
  it("décimales et pourcentages selon la langue", () => {
    expect(fmtScore(8.2, "de")).toBe("8.2");
    expect(fmtScore(8.2, "fr")).toBe("8,2");
    expect(fmtPct(63.4, "de")).toBe("63%");
    expect(fmtPct(63.4, "fr")).toMatch(/^63\s?%$/u);
    expect(fmtPrice(13.15, "CHF", "de").replace(/\s/gu, " ")).toBe("CHF 13.15");
  });
  it("dates : jour + date, année seulement si utile ; jamais « heute »", () => {
    const ref = new Date("2026-10-28T10:00:00+01:00");
    expect(fmtDay("2026-10-29T23:59:00+01:00", "de", ref)).toBe("Do 29.10.");
    expect(fmtDay("2027-03-05T10:00:00+01:00", "de", ref)).toBe("Fr 05.03.2027");
    expect(fmtDay("2026-10-29T23:59:00+01:00", "fr", ref)).toBe("jeu. 29.10");
    expect(fmtUpdated("2026-10-28T12:34:00+01:00", "de")).toBe("28.10., 12:34");
  });
});
