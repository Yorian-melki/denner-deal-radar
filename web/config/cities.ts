import type { Locale } from "@/lib/i18n";
import type { Feed } from "@/lib/types";

/** Registre multi-ville. Ajouter une ville = une entrée ici + un flux du scanner
 * (même schéma JSON). Les villes sans flux local reçoivent quand même les deals
 * nationaux et en ligne de leur pays — d'où `launched` pour ne publier que les
 * villes qui ont au moins une vraie source locale. La langue ne dépend PAS de la
 * ville : chaque page existe en DE, FR et EN (préfixe d'URL). */
export interface City {
  slug: string;
  /** Nom par langue (Genf / Genève / Geneva). */
  name: Record<Locale, string>;
  country: string;
  feed?: string;
  launched: boolean;
}

const same = (n: string): Record<Locale, string> => ({ de: n, fr: n, en: n });

export const CITIES: City[] = [
  { slug: "st-gallen", name: { de: "St. Gallen", fr: "Saint-Gall", en: "St. Gallen" }, country: "CH", feed: "ch-sg", launched: true },
  // Prêtes ; `launched: true` seulement avec un vrai flux local.
  { slug: "zuerich", name: { de: "Zürich", fr: "Zurich", en: "Zurich" }, country: "CH", launched: false },
  { slug: "bern", name: { de: "Bern", fr: "Berne", en: "Bern" }, country: "CH", launched: false },
  { slug: "basel", name: { de: "Basel", fr: "Bâle", en: "Basel" }, country: "CH", launched: false },
  { slug: "lausanne", name: same("Lausanne"), country: "CH", launched: false },
  { slug: "geneve", name: { de: "Genf", fr: "Genève", en: "Geneva" }, country: "CH", launched: false },
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
/** Ville principale (accueil, 404, liens de retour). */
export const mainCity = () => launchedCities()[0] ?? CITIES[0];
