"use client";
import { useEffect, useRef } from "react";
import { useConsent } from "@/components/Consent";

declare global { interface Window { adsbygoogle?: unknown[] } }

/** Emplacement publicitaire. Rien n'est chargé tant que : (1) un client AdSense
 * est configuré, (2) le visiteur a accepté. Sinon : espace vide, aucune requête. */
export function AdSlot({ slot }: { slot?: string }) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const s = slot ?? process.env.NEXT_PUBLIC_ADSENSE_SLOT;
  const { choice } = useConsent();
  const pushed = useRef(false);
  const enabled = !!client && !!s && choice === "granted";

  useEffect(() => {
    if (!enabled || pushed.current) return;
    const id = "adsbygoogle-js";
    if (!document.getElementById(id)) {
      const el = document.createElement("script");
      el.id = id;
      el.async = true;
      el.crossOrigin = "anonymous";
      el.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
      document.head.appendChild(el);
    }
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); pushed.current = true; } catch {}
  }, [enabled, client]);

  if (!enabled) return null;
  return (
    <aside className="ad" aria-label="Anzeige">
      <span className="ad-label">Anzeige</span>
      <ins className="adsbygoogle" style={{ display: "block" }} data-ad-client={client} data-ad-slot={s} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
