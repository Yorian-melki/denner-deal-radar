import Link from "next/link";
import { launchedCities } from "@/config/cities";
import { CityDashboard } from "@/components/CityDashboard";
import { getDeals } from "@/lib/data";
import { dict } from "@/lib/i18n";
import { inCity } from "@/lib/project";
import { JsonLd } from "@/components/JsonLd";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata = { alternates: { canonical: "/" } };

/** Accueil : la ville de lancement en vedette (même règles d'affichage que la
 * page ville, sections plus courtes) + accès aux autres villes lancées. */
export default async function Home() {
  const { deals, generatedAt } = await getDeals();
  const cities = launchedCities();
  const main = cities[0];
  if (!main) return <p>{dict("de").empty}</p>;
  return (
    <>
      {cities.length > 1 && (
        <nav className="city-pills" aria-label={dict(main.locale).nav}>
          {cities.map((c) => <Link key={c.slug} href={`/${c.slug}`} className="chip">{c.name}</Link>)}
        </nav>
      )}
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/`, inLanguage: main.locale }} />
      <CityDashboard city={main} deals={deals.filter((d) => inCity(d, main))} generatedAt={generatedAt} variant="home" />
    </>
  );
}
