import type { MetadataRoute } from "next";
import { launchedCities } from "@/config/cities";
import { CATEGORIES } from "@/lib/categories";
import { getDeals } from "@/lib/data";
import { hasPage, inCity } from "@/lib/project";
import { SITE_URL } from "@/lib/site";


export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { deals, generatedAt } = await getDeals();
  const lastModified = generatedAt ? new Date(generatedAt) : new Date();
  const out: MetadataRoute.Sitemap = [{ url: `${SITE_URL}/`, lastModified, changeFrequency: "hourly", priority: 1 }];
  for (const c of launchedCities()) {
    out.push({ url: `${SITE_URL}/${c.slug}`, lastModified, changeFrequency: "hourly", priority: 0.9 });
    for (const cat of CATEGORIES) {
      if (deals.some((d) => d.category === cat.slug && inCity(d, c)))
        out.push({ url: `${SITE_URL}/${c.slug}/${cat.slug}`, lastModified, changeFrequency: "daily", priority: 0.8 });
    }
  }
  for (const d of deals) {
    if (hasPage(d)) out.push({ url: `${SITE_URL}/deal/${d.slug}`, lastModified, changeFrequency: "daily", priority: 0.5 });
  }
  return out;
}
