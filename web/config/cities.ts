import type { Locale } from "@/lib/i18n";
import type { Feed } from "@/lib/types";

/** Registre multi-ville. Ajouter une ville = une entrée ici + un flux du scanner
 * (même schéma JSON). Les villes sans flux local reçoivent quand même les deals
 * nationaux et en ligne de leur pays — d'où `launched` pour ne publier que les
 * villes qui ont au moins une vraie source locale. */
export interface City {
  slug: string;
  name: string;
  country: string;
  /** Langue de l'interface pour toutes les pages de la ville (lib/i18n.ts). */
  locale: Locale;
  feed?: string;
  launched: boolean;
}

export const CITIES: City[] = [
  { slug: "st-gallen", name: "St. Gallen", country: "CH", locale: "de", feed: "ch-sg", launched: true },
  // Prêtes (langue, pays) ; `launched: true` seulement avec un vrai flux local.
  { slug: "zuerich", name: "Zürich", country: "CH", locale: "de", launched: false },
  { slug: "bern", name: "Bern", country: "CH", locale: "de", launched: false },
  { slug: "basel", name: "Basel", country: "CH", locale: "de", launched: false },
  { slug: "lausanne", name: "Lausanne", country: "CH", locale: "fr", launched: false },
  { slug: "geneve", name: "Genève", country: "CH", locale: "fr", launched: false },
];

export const FEEDS: Feed[] = [
  {
    id: "ch-sg",
    country: "CH",
    currency: "CHF",
    url:
      process.env.DATA_URL_CH_SG ??
      "https://yorian-melki.github.io/denner-deal-radar/data/universal.json",
    cities: ["st-gallen"],
  },
];

export const launchedCities = () => CITIES.filter((c) => c.launched);
export const cityBySlug = (slug: string) => CITIES.find((c) => c.slug === slug && c.launched);

/** Langue d'une route à partir de son premier segment (/<ville>/…) ; défaut DE. */
export const localeForPath = (pathname: string | null | undefined): Locale => {
  const seg = (pathname ?? "/").split("/")[1] ?? "";
  return CITIES.find((c) => c.slug === seg)?.locale ?? "de";
};
