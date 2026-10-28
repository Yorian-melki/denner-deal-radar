"use client";
import { whatsappUrl } from "@/lib/select";

/** Partage : feuille de partage native (mobile) ; sinon lien WhatsApp.
 * Sans JavaScript, c'est déjà un lien WhatsApp valide (amélioration progressive).
 * Icône seule ; le nom accessible reste « Teilen: <titre> ». */
export function ShareButton({ text, url, title, label }: { text: string; url: string; title: string; label: string }) {
  return (
    <a
      href={whatsappUrl(text, url)}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-icon"
      aria-label={`${label}: ${title}`}
      onClick={async (e) => {
        if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
          e.preventDefault();
          try {
            await navigator.share({ title, text, url });
          } catch {
            /* annulé par l'utilisateur : rien à faire */
          }
        }
      }}
    >
      <svg className="icon" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 3v10M6.5 6.5 10 3l3.5 3.5M4.5 10.5v5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-5" />
      </svg>
      <span className="btn-icon-label">{label}</span>
    </a>
  );
}
