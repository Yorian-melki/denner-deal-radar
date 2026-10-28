"use client";

/** Lien sortant : la réécriture affiliée est faite au build (props) ; ici on
 * compte seulement le clic, anonymement, via /api/click (fonction Cloudflare). */
export function OutLink(props: {
  href: string; rel: string; affiliate: boolean; dealId: string; source: string; programme?: string;
  children: React.ReactNode; className?: string;
  /** Explication localisée de l'astérisque (lien rémunéré). */
  affTitle?: string;
}) {
  const { href, rel, affiliate, dealId, source, programme, children, className } = props;
  const affTitle = props.affTitle ?? "Werbelink: Wir erhalten ggf. eine Provision. Der Preis ändert sich für dich nicht.";
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
      {affiliate && <><span className="aff-mark" title={affTitle} aria-hidden="true">*</span><span className="sr-only"> ({affTitle})</span></>}
    </a>
  );
}
