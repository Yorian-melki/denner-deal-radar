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

/** Titre + date de révision ; en anglais, une note : texte disponible en DE/FR, la version DE fait foi. */
export function LegalHead({ locale, title }: { locale: Locale; title: Tri }) {
  const t = dict(locale);
  return (
    <header className="legal-head">
      <h1>{title[locale]}</h1>
      <p className="muted">{REVISION[locale]} {LEGAL_REVISION}</p>
      {t.legalNote && <p className="note-box">{t.legalNote}</p>}
    </header>
  );
}
