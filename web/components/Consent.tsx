"use client";
import { createContext, useContext, useEffect, useState } from "react";

/** Consentement publicité (nLPD / RGPD / ePrivacy).
 *
 * Garanties (mode "builtin", défaut) :
 * - aucun script publicitaire ni cookie tiers avant « Akzeptieren » (AdSlot ne
 *   charge rien tant que choice !== "granted") ;
 * - « Ablehnen » est aussi visible et aussi simple que « Akzeptieren » (même
 *   style, même niveau, un clic) ; ignorer la bannière = rien n'est chargé ;
 * - choix conservé 13 mois max (recommandation CNIL), puis redemandé ;
 * - retrait à tout moment : <ConsentLink /> (pied de page) ou <ConsentReset />
 *   (/datenschutz) ; un retrait après acceptation recharge la page pour
 *   décharger les scripts Google.
 * Cloudflare Web Analytics est sans cookie et ne dépend pas de ce choix.
 *
 * TODO (activation AdSense en CH/EEE/UK) : Google EXIGE une CMP certifiée IAB TCF.
 * → Activer « Confidentialité et messages » dans AdSense (CMP Google, gratuite),
 *   puis mettre NEXT_PUBLIC_CMP_MODE=google-tcf : la bannière maison disparaît,
 *   la CMP Google (servie avec la balise AdSense) recueille le consentement TCF,
 *   et ConsentLink/ConsentReset ouvrent son message de révocation. Mettre aussi
 *   à jour la CSP (ligne commentée dans public/_headers). À faire vérifier. */
export type Choice = "granted" | "denied" | null;
export type CmpMode = "builtin" | "google-tcf";
export const CMP_MODE: CmpMode = process.env.NEXT_PUBLIC_CMP_MODE === "google-tcf" ? "google-tcf" : "builtin";

const KEY = "consent.ads.v1";
const MAX_AGE_MS = 395 * 24 * 3600 * 1000; // ~13 mois

declare global {
  interface Window { googlefc?: { callbackQueue?: unknown[]; showRevocationMessage?: () => void } }
}

function readStored(): Choice {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw === "granted" || raw === "denied") return null; // ancien format sans date : redemander
    const v = JSON.parse(raw) as { c?: unknown; t?: unknown };
    if ((v.c === "granted" || v.c === "denied") && typeof v.t === "number" && Date.now() - v.t < MAX_AGE_MS) return v.c;
  } catch {}
  return null;
}

const Ctx = createContext<{ choice: Choice; set: (c: Exclude<Choice, null>) => void; reopen: () => void }>({
  choice: null, set: () => {}, reopen: () => {},
});

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setChoice(readStored());
    setReady(true);
  }, []);
  const set = (c: Exclude<Choice, null>) => {
    setChoice(c);
    try { localStorage.setItem(KEY, JSON.stringify({ c, t: Date.now() })); } catch {}
  };
  const reopen = () => {
    const wasGranted = choice === "granted";
    try { localStorage.removeItem(KEY); } catch {}
    if (wasGranted) location.reload(); // décharge les scripts publicitaires déjà chargés
    else setChoice(null);
  };
  const showBanner = ready && choice === null && CMP_MODE === "builtin" && !!process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  return (
    <Ctx.Provider value={{ choice, set, reopen }}>
      {children}
      {showBanner && (
        <div className="consent" role="dialog" aria-labelledby="consent-text">
          <p id="consent-text">
            Wir möchten Werbung (Google AdSense) anzeigen, um diesen Dienst gratis zu halten. Dabei kann Google Cookies setzen
            und Daten in die USA übermitteln. Ohne Zustimmung wird keine Werbung geladen.{" "}
            <span lang="fr">Publicité Google seulement avec votre accord ; sans accord, rien n’est chargé.</span>{" "}
            <a href="/datenschutz#cookies">Datenschutz</a>
          </p>
          <div>
            {/* Même style, même poids : refuser est aussi simple qu'accepter. */}
            <button type="button" onClick={() => set("denied")}>Ablehnen · Refuser</button>{" "}
            <button type="button" onClick={() => set("granted")}>Akzeptieren · Accepter</button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useConsent = () => useContext(Ctx);

/** Ouvre les réglages : bannière maison, ou message de révocation de la CMP Google (TCF). */
function useOpenSettings() {
  const { reopen } = useConsent();
  return () => {
    if (CMP_MODE === "google-tcf") {
      const fc = (window.googlefc = window.googlefc || {});
      (fc.callbackQueue = fc.callbackQueue || []).push(() => window.googlefc?.showRevocationMessage?.());
      return;
    }
    // Pas de publicité configurée : rien à consentir → on montre l'explication.
    if (!process.env.NEXT_PUBLIC_ADSENSE_CLIENT) { location.assign("/datenschutz#cookies"); return; }
    reopen();
  };
}

/** Bouton de retrait / modification, pour /datenschutz. */
export function ConsentReset() {
  const open = useOpenSettings();
  return (
    <button type="button" onClick={open}>
      Cookie-Einstellungen ändern · Modifier le choix
    </button>
  );
}

/** Lien pour le pied de page (app/layout.tsx). Sans JS : mène à /datenschutz#cookies. */
export function ConsentLink() {
  const open = useOpenSettings();
  return (
    <a href="/datenschutz#cookies" onClick={(e) => { e.preventDefault(); open(); }}>
      Cookie-Einstellungen
    </a>
  );
}
