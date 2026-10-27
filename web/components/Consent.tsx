"use client";
import { createContext, useContext, useEffect, useState } from "react";

/** Consentement minimal (nLPD/RGPD) : la pub n'est chargée qu'après « Akzeptieren ».
 * Vercel Web Analytics est sans cookie et ne dépend pas de ce choix.
 * Pour AdSense en EEE/UK/CH, Google exige une CMP certifiée TCF : à remplacer par
 * « Datenschutz & Mitteilungen » d'AdSense lors de l'activation (voir MONETISATION_MVP.md). */
export type Choice = "granted" | "denied" | null;
const KEY = "consent.ads.v1";
const Ctx = createContext<{ choice: Choice; set: (c: Exclude<Choice, null>) => void }>({ choice: null, set: () => {} });

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "granted" || v === "denied") setChoice(v);
    } catch {}
    setReady(true);
  }, []);
  const set = (c: Exclude<Choice, null>) => {
    setChoice(c);
    try { localStorage.setItem(KEY, c); } catch {}
  };
  return (
    <Ctx.Provider value={{ choice, set }}>
      {children}
      {ready && choice === null && process.env.NEXT_PUBLIC_ADSENSE_CLIENT && (
        <div className="consent" role="dialog" aria-label="Cookie-Einstellungen">
          <p>
            Wir möchten Werbung anzeigen, um diesen Dienst gratis zu halten. Dabei kann Google Cookies setzen.{" "}
            <a href="/datenschutz">Datenschutz</a>
          </p>
          <div>
            <button onClick={() => set("denied")}>Ablehnen</button>
            <button className="primary" onClick={() => set("granted")}>Akzeptieren</button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useConsent = () => useContext(Ctx);

export function ConsentReset() {
  return (
    <button onClick={() => { try { localStorage.removeItem(KEY); } catch {} location.reload(); }}>
      Cookie-Einstellungen zurücksetzen
    </button>
  );
}
