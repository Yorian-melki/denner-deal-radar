import type { Metadata } from "next";
import { LEGAL_REVISION } from "@/lib/operator";
import { dict, isLocale, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/site";

export type Tri = Record<Locale, string>;

/** Métadonnées d'une page légale : titre dans la langue, hreflang, noindex. */
export function legalMetadata(locale: string, slug: string, title: Tri, opts: { index?: boolean; description?: Tri } = {}): Metadata {
  const l: Locale = isLocale(locale) ? locale : "de";
  return {
    title: title[l],
    ...(opts.description ? { description: opts.description[l] } : {}),
    alternates: alternates(`/${slug}`, l),
    ...(opts.index ? {} : { robots: { index: false } }),
  };
}

const REVISION: Tri = { de: "Stand", fr: "Version du", en: "Last updated" };

/** Titre + date de révision. La note « version allemande » n'apparaît QUE si le corps
 * de la page n'est pas dans la langue de la page (`bodyLang`), jamais au-dessus d'un
 * texte déjà traduit (round 2, item 8). */
export function LegalHead({ locale, title, bodyLang = locale }: { locale: Locale; title: Tri; bodyLang?: Locale }) {
  const t = dict(locale);
  return (
    <header className="legal-head">
      <h1>{title[locale]}</h1>
      <p className="muted">{REVISION[locale]} {LEGAL_REVISION}</p>
      {bodyLang !== locale && t.legalFallback && <p className="note-box">{t.legalFallback}</p>}
    </header>
  );
}
