/** Consentement publicité (nLPD / RGPD / ePrivacy) — balisage serveur seulement ;
 * la logique (localStorage, 13 mois, rechargement au retrait) est dans public/site.js.
 *
 * Garanties (mode "builtin", défaut) :
 * - aucun script publicitaire ni cookie tiers avant « Akzeptieren » ;
 * - « Ablehnen » aussi visible et aussi simple que « Akzeptieren » (même style, un clic) ;
 *   ignorer la bannière = rien n'est chargé ;
 * - choix conservé 13 mois max (recommandation CNIL), puis redemandé ;
 * - retrait à tout moment (pied de page, /datenschutz).
 * Sans publicité configurée ET autorisée (Impressum complet), rien n'est rendu.
 *
 * TODO (activation AdSense en CH/EEE/UK) : CMP certifiée IAB TCF (NEXT_PUBLIC_CMP_MODE=google-tcf),
 * attendre tcloaded/useractioncomplete avant adsbygoogle ; mettre à jour la CSP. */
export type CmpMode = "builtin" | "google-tcf";
export const CMP_MODE: CmpMode = process.env.NEXT_PUBLIC_CMP_MODE === "google-tcf" ? "google-tcf" : "builtin";

export interface ConsentLabels { text: string; accept: string; decline: string; privacy: string; privacyHref: string }

/** Bannière (en tête du DOM, région nommée) : cachée par défaut, site.js l'affiche si aucun choix valide. */
export function ConsentBanner({ labels, adsEnabled }: { labels: ConsentLabels; adsEnabled: boolean }) {
  if (!adsEnabled || CMP_MODE !== "builtin") return null;
  return (
    <section className="consent" role="region" aria-labelledby="consent-text" data-consent-banner="" hidden>
      <p id="consent-text">{labels.text} <a href={labels.privacyHref}>{labels.privacy}</a></p>
      <div className="consent-actions">
        <button type="button" className="btn btn-secondary" data-consent="denied">{labels.decline}</button>
        <button type="button" className="btn btn-secondary" data-consent="granted">{labels.accept}</button>
      </div>
    </section>
  );
}

/** Lien du pied de page. Sans JS (ou sans publicité) : mène à la section cookies de /datenschutz. */
export function ConsentLink({ label, privacyHref }: { label: string; privacyHref: string }) {
  return <a href={privacyHref} data-consent-open="">{label}</a>;
}

/** Bouton de /datenschutz : rouvre le choix (site.js) ; sans JS, il ne fait rien de trompeur. */
export function ConsentReset({ label }: { label: string; privacyHref?: string }) {
  return <button type="button" className="btn btn-secondary" data-consent-open="">{label}</button>;
}
