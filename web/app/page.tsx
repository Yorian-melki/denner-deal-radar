import Link from "next/link";
import { launchedCities } from "@/config/cities";
import { DealGrid } from "@/components/DealCard";
import { getDeals } from "@/lib/data";
import { inCity } from "@/lib/project";

export const revalidate = 1800;

export default async function Home() {
  const { deals } = await getDeals();
  const cities = launchedCities();
  return (
    <>
      <section className="hero">
        <h1>Die besten Deals deiner Stadt — ehrlich bewertet</h1>
        <p>Supermarkt-Aktionen, Tech-Tagesangebote, Gratis-Sachen und Studentenrabatte. Jede Aktion bekommt eine absolute Note von 0 bis 10 — gemessen an der echten Ersparnis, nicht am Werbe-Prozentsatz.</p>
        <p className="cities">{cities.map((c) => <Link key={c.slug} href={`/${c.slug}`} className="pill">{c.name}</Link>)}</p>
      </section>
      {cities.map((c) => (
        <section key={c.slug}>
          <h2>Top-Deals in {c.name}</h2>
          <DealGrid deals={deals.filter((d) => inCity(d, c)).slice(0, 12)} />
          <p><Link href={`/${c.slug}`}>Alle Deals in {c.name} →</Link></p>
        </section>
      ))}
    </>
  );
}
