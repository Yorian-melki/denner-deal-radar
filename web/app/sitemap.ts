import type { MetadataRoute } from "next";
import { launchedCities } from "@/config/cities";
import { categoryList, pageCount } from "@/components/CategoryListing";
import { CATEGORIES } from "@/lib/categories";
import { getDeals } from "@/lib/data";
import { HTML_LANG, LOCALES } from "@/lib/i18n";
import { hasPage, inCity } from "@/lib/project";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/** Une entrée par page et par langue, chacune avec ses alternatives hreflang. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { deals, generatedAt } = await getDeals();
  const lastModified = generatedAt ? new Date(generatedAt) : new Date();
  const out: MetadataRoute.Sitemap = [];
  const add = (rest: string, changeFrequency: "hourly" | "daily", priority: number) => {
    const languages: Record<string, string> = {};
    for (const l of LOCALES) languages[HTML_LANG[l]] = `${SITE_URL}/${l}${rest}`;
    for (const l of LOCALES) out.push({ url: `${SITE_URL}/${l}${rest}`, lastModified, changeFrequency, priority, alternates: { languages } });
  };
  add("", "hourly", 1);
  for (const c of launchedCities()) {
    add(`/${c.slug}`, "hourly", 0.9);
    const here = deals.filter((d) => inCity(d, c));
    for (const cat of CATEGORIES) {
      const n = categoryList(here, cat.slug).length;
      if (!n) continue;
      add(`/${c.slug}/${cat.slug}`, "daily", 0.8);
      for (let p = 2; p <= pageCount(n); p++) add(`/${c.slug}/${cat.slug}/${p}`, "daily", 0.4);
    }
  }
  for (const d of deals) if (hasPage(d)) add(`/deal/${d.slug}`, "daily", 0.5);
  return out;
}
