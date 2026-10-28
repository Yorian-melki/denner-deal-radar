"use client";
import { dict, type Locale } from "@/lib/i18n";
import { whatsappUrl } from "@/lib/select";

/** Partage : feuille de partage native (mobile) ; sinon lien WhatsApp.
 * Sans JavaScript, c'est déjà un lien WhatsApp valide (amélioration progressive). */
/** `compact` : icône seule (cartes) — le nom accessible reste « Teilen: <titre> ». */
export function ShareButton({ text, url, title, locale, compact = false }: { text: string; url: string; title: string; locale: Locale; compact?: boolean }) {
  const t = dict(locale);
  const wa = whatsappUrl(text, url);
  return (
    <a
      href={wa}
      target="_blank"
      rel="noopener noreferrer"
      className={compact ? "btn btn-ghost share share-compact" : "btn btn-ghost share"}
      aria-label={`${t.share}: ${title}`}
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
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" />
      </svg>
      <span className={compact ? "sr-only" : undefined}>{t.share}</span>
    </a>
  );
}
