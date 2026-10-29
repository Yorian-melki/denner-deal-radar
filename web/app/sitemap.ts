import type { MetadataRoute } from "next";
import { launchedCities } from "@/config/cities";
import { categoryList, pageCount, storesOf } from "@/components/CategoryListing";
import { CATEGORIES } from "@/lib/categories";
import { getDeals } from "@/lib/data";
import { HTML_LANG, LOCALES } from "@/lib/i18n";
import { hasPage, inCity } from "@/lib/project";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/** Une entrée par page et par langue (chaque <loc> répond 200), avec hreflang et x-default. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { deals, generatedAt } = await getDeals();
  const lastModified = generatedAt ? new Date(generatedAt) : new Date();
  const out: MetadataRoute.Sitemap = [];
  const add = (rest: string, changeFrequency: "hourly" | "daily", priority: number, modified: Date = lastModified) => {
    const languages: Record<string, string> = {};
    for (const l of LOCALES) languages[HTML_LANG[l]] = `${SITE_URL}/${l}${rest}`;
    languages["x-default"] = `${SITE_URL}/de${rest}`;
    for (const l of LOCALES) out.push({ url: `${SITE_URL}/${l}${rest}`, lastModified: modified, changeFrequency, priority, alternates: { languages } });
  };
  // Pas d'entrée /de, /fr, /en : ces URL redirigent (302) vers la ville (round 3, item 38).
  for (const c of launchedCities()) {
    add(`/${c.slug}`, "hourly", 0.9);
    const here = deals.filter((d) => inCity(d, c));
    for (const cat of CATEGORIES) {
      const n = categoryList(here, cat.slug).length;
      if (!n) continue;
      add(`/${c.slug}/${cat.slug}`, "daily", 0.8);
      for (let p = 2; p <= pageCount(n); p++) add(`/${c.slug}/${cat.slug}/${p}`, "daily", 0.4);
    }
    // Pages magasin de Supermarkt (round 4, item 32), toutes leurs pages.
    for (const st of storesOf(here)) {
      const n = categoryList(here, "supermarkt-aktionen", st.slug).length;
      add(`/${c.slug}/supermarkt-aktionen/${st.slug}`, "daily", 0.6);
      for (let p = 2; p <= pageCount(n); p++) add(`/${c.slug}/supermarkt-aktionen/${st.slug}/${p}`, "daily", 0.3);
    }
  }
  // lastmod propre à chaque deal (dernier relevé), jamais celui du build entier.
  const seen = (d: (typeof deals)[number]) => { const t = Date.parse(d.lastSeenAt ?? d.firstSeenAt ?? ""); return Number.isFinite(t) ? new Date(t) : lastModified; };
  for (const d of deals) if (hasPage(d)) add(`/deal/${d.slug}`, "daily", 0.5, seen(d));
  return out;
}
