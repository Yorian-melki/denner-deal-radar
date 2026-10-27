import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CITIES } from "@/config/cities";
import { AdSlot } from "@/components/AdSlot";
import { ScoreBadge } from "@/components/DealCard";
import { OutLink } from "@/components/OutLink";
import { rewriteUrl } from "@/lib/affiliate/rewrite";
import { categoryBySlug } from "@/lib/categories";
import { getDeals } from "@/lib/data";
import { fmtDate, fmtPrice } from "@/lib/site";

export const revalidate = 1800;
// Les 300 meilleurs deals sont pré-générés ; les autres à la première visite (ISR).
export const dynamicParams = true;
export async function generateStaticParams() {
  const { deals } = await getDeals();
  return deals.slice(0, 300).map((d) => ({ slug: d.slug }));
}

type P = { params: Promise<{ slug: string }> };

async function find(slug: string) {
  const { deals } = await getDeals();
  return deals.find((d) => d.slug === slug);
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const d = await find((await params).slug);
  if (!d) return { robots: { index: false } };
  const price = d.price !== undefined ? ` für ${fmtPrice(d.price, d.currency)}` : "";
  return {
    title: `${d.title}${price}`,
    description: `${d.title}${price}${d.discountPct ? ` (−${Math.round(d.discountPct)}%)` : ""} bei ${d.merchant ?? d.attribution}. Deal-Note ${d.score?.toFixed(1) ?? "–"}/10.`,
    alternates: { canonical: `/deal/${d.slug}` },
    // Un deal non évalué est peu utile seul : pas d'indexation.
    ...(d.score === undefined ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function DealPage({ params }: P) {
  const d = await find((await params).slug);
  if (!d) notFound();
  const out = rewriteUrl(d.url);
  const cat = categoryBySlug(d.category);
  const city = d.cities.includes("*") ? CITIES[0] : CITIES.find((c) => c.slug === d.cities[0]);
  const jsonLd = d.price !== undefined ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: d.title,
    ...(d.merchant ? { brand: { "@type": "Brand", name: d.merchant } } : {}),
    offers: {
      "@type": "Offer",
      price: d.price.toFixed(2),
      priceCurrency: d.currency,
      url: d.url,
      ...(d.endsAt ? { priceValidUntil: d.endsAt.slice(0, 10) } : {}),
      ...(d.merchant ? { seller: { "@type": "Organization", name: d.merchant } } : {}),
    },
  } : null;
  return (
    <article className="deal">
      {city && cat && <p className="crumbs"><Link href={`/${city.slug}`}>{city.name}</Link> › <Link href={`/${city.slug}/${cat.slug}`}>{cat.label}</Link></p>}
      <h1><ScoreBadge score={d.score} /> {d.title}</h1>
      <p className="big">
        {d.price !== undefined && <strong>{fmtPrice(d.price, d.currency)}</strong>}{" "}
        {d.referencePrice !== undefined && d.price !== undefined && d.referencePrice > d.price && <s>{fmtPrice(d.referencePrice, d.currency)}</s>}{" "}
        {d.discountPct !== undefined && <span className="pct">−{Math.round(d.discountPct)}%</span>}
      </p>
      <ul className="facts">
        {d.unitPrice !== undefined && d.unit && <li>Grundpreis: {d.unitPrice.toFixed(2)} {d.unit}</li>}
        {d.startsAt && <li>Ab {fmtDate(d.startsAt)}</li>}
        {d.endsAt && <li>Bis {fmtDate(d.endsAt)}</li>}
        {d.requiresStudent && <li>Nur für Studierende</li>}
        {d.couponCode && <li>Code: <code>{d.couponCode}</code></li>}
        {d.conditions.map((c) => <li key={c}>{c}</li>)}
        <li>Bewertungssicherheit: {d.confidence !== undefined ? `${Math.round(d.confidence * 100)}%` : "unbekannt"}</li>
      </ul>
      <p>
        <OutLink className="cta" href={out.href} rel={out.rel} affiliate={out.affiliate} programme={out.programme} dealId={d.id} source={d.source}>
          Zum Angebot bei {d.merchant ?? d.attribution}
        </OutLink>
      </p>
      <p className="muted">Quelle: {d.attribution}. Angaben ohne Gewähr — massgebend ist die Seite des Anbieters.</p>
      <AdSlot />
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
    </article>
  );
}
