"use client";

/** Lien sortant : la réécriture affiliée est faite au build (props) ; ici on
 * compte seulement le clic, anonymement, via /api/click (fonction Cloudflare).
 * La mention « Werbelink » est VISIBLE à côté du lien (voir OfferButton), jamais
 * cachée dans un title ; ici seulement un complément pour les lecteurs d'écran. */
export function OutLink(props: {
  href: string; rel: string; affiliate: boolean; dealId: string; source: string; programme?: string;
  children: React.ReactNode; className?: string; srNote?: string;
}) {
  const { href, rel, affiliate, dealId, source, programme, children, className, srNote } = props;
  return (
    <a
      href={href}
      rel={rel}
      target="_blank"
      className={className}
      onClick={() => {
        try {
          const body = JSON.stringify({ deal: dealId, source, affiliate, programme: programme ?? "none", page: location.pathname });
          navigator.sendBeacon?.("/api/click", new Blob([body], { type: "application/json" }));
        } catch {}
      }}
    >
      {children}
      {srNote && <span className="sr-only"> ({srNote})</span>}
    </a>
  );
}
