"use client";
import { track } from "@vercel/analytics";

/** Lien sortant : la réécriture affiliée est faite côté serveur (props), ici on
 * ne fait que mesurer le clic (événement personnalisé Vercel Analytics, sans cookie). */
export function OutLink(props: {
  href: string; rel: string; affiliate: boolean; dealId: string; source: string; programme?: string;
  children: React.ReactNode; className?: string;
}) {
  const { href, rel, affiliate, dealId, source, programme, children, className } = props;
  return (
    <a
      href={href}
      rel={rel}
      target="_blank"
      className={className}
      onClick={() => {
        try {
          track("outbound_click", { deal: dealId, source, affiliate, programme: programme ?? "none" });
        } catch {}
      }}
    >
      {children}
      {affiliate && <span className="aff-mark" title="Werbelink: Wir erhalten ggf. eine Provision. Der Preis ändert sich für dich nicht.">*</span>}
    </a>
  );
}
