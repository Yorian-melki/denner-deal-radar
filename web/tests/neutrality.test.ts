import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rewriteUrl } from "@/lib/affiliate/rewrite";
import { projectFeed } from "@/lib/project";
import { balancedSections, pickTop } from "@/lib/select";
import { CATEGORIES } from "@/lib/categories";
import type { Feed } from "@/lib/types";

const FEED: Feed = { id: "ch-sg", country: "CH", currency: "CHF", url: "x", cities: ["st-gallen"] };
const raw = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "fixtures", "universal.sample.json"), "utf8"));

/** Toutes les variables d'affiliation actives, pour tous les réseaux. */
const AFF_ENV: Record<string, string> = {
  AFF_TRADEDOUBLER_ID: "123", AFF_TRADEDOUBLER_GALAXUS_P: "1", AFF_TRADEDOUBLER_DIGITEC_P: "2",
  AFF_AWIN_ID: "9", AFF_AWIN_MIDS: "brack.ch=1,revendo.ch=2", AFF_AMAZON_DE_TAG: "x-21",
  AFF_ALIEXPRESS_TEMPLATE: "https://s.click.aliexpress.com/deep_link.htm?dl_target={url}", AFF_BOOKING_AID: "77",
};

describe("neutralité : la commission n'influence jamais l'ordre", () => {
  it("même classement, même vitrine, mêmes sections avec ou sans programmes partenaires", () => {
    const now = new Date(raw.generated_at);
    const saved = { ...process.env };
    const run = () => {
      const deals = projectFeed(raw.deals, FEED, now);
      return {
        order: deals.map((d) => d.id),
        top: pickTop(deals).map((d) => d.id),
        sections: balancedSections(deals, CATEGORIES.map((c) => c.slug)).map((s) => [s.slug, s.items.map((d) => d.id)]),
      };
    };
    const without = run();
    Object.assign(process.env, AFF_ENV);
    try {
      expect(rewriteUrl("https://www.galaxus.ch/x", process.env).affiliate).toBe(true); // les programmes sont bien actifs
      expect(run()).toEqual(without);
    } finally {
      for (const k of Object.keys(AFF_ENV)) if (!(k in saved)) delete process.env[k];
    }
  });

  it("le flux public ne contient aucun champ de commission dans les deals projetés", () => {
    const deals = projectFeed(raw.deals, FEED, new Date(raw.generated_at));
    const json = JSON.stringify(deals).toLowerCase();
    for (const k of ["commission", "cashback_rate", "epc", "payout", "score_components"]) expect(json).not.toContain(k);
  });
});
