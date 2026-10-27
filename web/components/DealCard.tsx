import Link from "next/link";
import { rewriteUrl } from "@/lib/affiliate/rewrite";
import { fmtDate, fmtPrice } from "@/lib/site";
import type { PublicDeal } from "@/lib/types";
import { OutLink } from "@/components/OutLink";

export function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined) return <span className="score score-na" title="Kein überprüfbarer Referenzpreis">–</span>;
  const tier = score >= 7 ? "hi" : score >= 4 ? "mid" : "lo";
  return <span className={`score score-${tier}`} title="Absolute Deal-Note (0–10)">{score.toFixed(1)}</span>;
}

export function DealCard({ deal }: { deal: PublicDeal }) {
  const out = rewriteUrl(deal.url);
  return (
    <article className="card">
      <ScoreBadge score={deal.score} />
      <div className="card-body">
        <h3><Link href={`/deal/${deal.slug}`}>{deal.title}</Link></h3>
        <p className="meta">
          {deal.price !== undefined && <strong>{fmtPrice(deal.price, deal.currency)}</strong>}
          {deal.referencePrice !== undefined && deal.price !== undefined && deal.referencePrice > deal.price && (
            <s>{fmtPrice(deal.referencePrice, deal.currency)}</s>
          )}
          {deal.discountPct !== undefined && <span className="pct">−{Math.round(deal.discountPct)}%</span>}
          {deal.endsAt && <span>bis {fmtDate(deal.endsAt)}</span>}
        </p>
        <p className="src">
          <OutLink href={out.href} rel={out.rel} affiliate={out.affiliate} programme={out.programme} dealId={deal.id} source={deal.source}>
            {deal.merchant ?? deal.attribution} ↗
          </OutLink>
        </p>
      </div>
    </article>
  );
}

export function DealGrid({ deals }: { deals: PublicDeal[] }) {
  if (!deals.length) return <p className="empty">Gerade keine aktiven Deals in dieser Kategorie.</p>;
  return <div className="grid">{deals.map((d) => <DealCard key={d.slug} deal={d} />)}</div>;
}
