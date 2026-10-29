/** Langue des titres par source (WCAG 3.1.2 : un titre allemand sur une page FR/EN
 * est balisé lang="de-CH"). L'heuristique de lib/conditions.ts (guessLang) ne sert
 * plus que de repli pour les sources multilingues. */
import { guessLang } from "@/lib/conditions";
import type { Locale } from "@/lib/i18n";

const BY_SOURCE: Record<string, Locale> = {
  denner: "de", rappn: "de", lidl: "de", aldi: "de", migros: "de", volg: "de", coop: "de", aligro: "de",
  preispirat: "de", daydeal: "de", digitec_daily: "de", galaxus_daily: "de", dg_daily: "de", brack: "de",
  gutscheine_20min: "de", dschungelkompass: "de", revendo: "de", ferienpiraten: "de", tutti_free: "de",
  anibis_free: "de", grabenhalle_events: "de", kut_events: "de", saiten_events: "de", stadtsg_news: "de",
  poinz: "fr",
};

/** Langue du titre d'un deal ; « ? » si inconnue (on laisse la langue de la page). */
export function titleLang(source: string, title: string): Locale | "?" {
  if (BY_SOURCE[source]) return BY_SOURCE[source];
  // Marqueurs sûrs d'un titre (round 3, item 8) : umlauts, « Rabatt » → allemand ; « Student Discount », « % off » → anglais.
  if (/[äöüß]|\bRabatt\b|studentenrabatt/i.test(title)) return "de";
  if (/\bstudent discount\b|\d\s?%\s*off\b|\bup to\b/i.test(title)) return "en";
  return guessLang(title);
}
