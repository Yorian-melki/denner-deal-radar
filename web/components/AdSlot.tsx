"use client";
import { useEffect, useRef } from "react";
import { CMP_MODE, useConsent } from "@/components/Consent";

declare global { interface Window { adsbygoogle?: unknown[] } }

const CLIENT_RE = /^ca-pub-\d{10,20}$/;
const SLOT_RE = /^\d{1,20}$/;

/** Emplacement publicitaire. Rien n'est chargé (aucune requête, aucun cookie)
 * tant que : (1) un client AdSense valide est configuré, (2) un slot valide
 * existe, (3) le consentement est donné :
 *  - mode "builtin" : le visiteur a cliqué « Akzeptieren » dans la bannière maison ;
 *  - mode "google-tcf" (NEXT_PUBLIC_CMP_MODE) : la balise AdSense est chargée et
 *    c'est la CMP Google certifiée TCF qui recueille le consentement avant toute
 *    publicité personnalisée / cookie (exigence Google en CH/EEE/UK).
 * Les identifiants sont validés (regex) avant d'entrer dans une URL de script. */
export function AdSlot({ slot }: { slot?: string }) {
  const rawClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
  const rawSlot = slot ?? process.env.NEXT_PUBLIC_ADSENSE_SLOT ?? "";
  const client = CLIENT_RE.test(rawClient) ? rawClient : "";
  const s = SLOT_RE.test(rawSlot) ? rawSlot : "";
  const { choice } = useConsent();
  const pushed = useRef(false);
  const consented = CMP_MODE === "google-tcf" || choice === "granted";
  const enabled = !!client && !!s && consented;

  useEffect(() => {
    if (!enabled || pushed.current) return;
    const id = "adsbygoogle-js";
    if (!document.getElementById(id)) {
      const el = document.createElement("script");
      el.id = id;
      el.async = true;
      el.crossOrigin = "anonymous";
      el.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      document.head.appendChild(el);
    }
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); pushed.current = true; } catch {}
  }, [enabled, client]);

  if (!enabled) return null;
  return (
    <aside className="ad" aria-label="Anzeige">
      <span className="ad-label">Anzeige · Publicité</span>
      <ins className="adsbygoogle" style={{ display: "block" }} data-ad-client={client} data-ad-slot={s} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
