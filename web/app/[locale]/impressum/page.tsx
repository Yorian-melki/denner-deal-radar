import { SITE_NAME, paths } from "@/lib/site";
import { LegalHead, legalMetadata } from "@/components/Legal";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { HOST, isOperatorComplete, operator, siren, type Operator } from "@/lib/operator";
import { activeProgrammes } from "@/lib/affiliate/rewrite";

// Cas : micro-entreprise française (entrepreneur individuel), adresse = domiciliation agréée.
// Bases : LCEN art. 1-1 (ex-art. 6 III, déplacé par la loi SREN 2024) et art. 19 (France) ;
// art. 3 al. 1 let. s LCD/UWG (Suisse) ; L121-3 C. conso. et principes CSL (signalement publicité).
// LAWYER-CHECK : (1) art. 1-1 LCEN dit « domicile » — l'adresse de domiciliation est l'usage
// courant et la solution recommandée aux EI par le gouvernement (QE 12588, 26.05.2026) ;
// (2) téléphone : exigé par le texte français, non exigé par la CJUE (C-298/07) si un autre
// moyen rapide existe — le code affiche NEXT_PUBLIC_OPERATOR_PHONE s'il est posé (numéro virtuel).
// Toutes les données viennent des variables NEXT_PUBLIC_OPERATOR_* ; rien n'est codé en dur.
const TITLE = { de: "Impressum", fr: "Mentions légales", en: "Imprint" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return legalMetadata((await params).locale, "impressum", TITLE);
}

type Txt = {
  publisher: string; intro: (o: Operator) => string; siret: string; reg: (o: Operator) => string; vat: string;
  addr: string; email: string; phone: string; fast: string; preview: string; director: string; host: string;
  basis: string; aff: string; affText: (n: number, L: (p: string, h?: string) => string) => ReactNode;
  what: string; whatText: (L: (p: string, h?: string) => string) => ReactNode; ext: string; extText: string;
  marks: string; marksText: (L: (p: string, h?: string) => string) => ReactNode; lang: string;
};

const T: Record<Locale, Txt> = {
  de: {
    lang: "de-CH",
    publisher: "Herausgeber",
    intro: (o) => `${SITE_NAME} wird herausgegeben von ${o.name}, Einzelunternehmer nach französischem Recht (micro-entreprise).`,
    siret: "SIRET", reg: (o) => `Eingetragen im französischen Unternehmensregister (RNE)${o.rcs ? ` und im ${o.rcs} ${siren(o)}` : ""}`,
    vat: "USt-IdNr.", addr: "Geschäftsadresse (Domizil)", email: "E-Mail", phone: "Telefon",
    fast: "Am schnellsten erreichst du uns per E-Mail; wir antworten in der Regel innert 48 Stunden.",
    preview: "Vorschau-Version: Die Angaben zum Herausgeber werden vor dem öffentlichen Start ergänzt.",
    director: "Verantwortlich für den Inhalt (directeur de la publication)",
    host: "Hosting",
    basis: "Angaben gemäss Art. 1-1 und 19 LCEN (Frankreich) und Art. 3 Abs. 1 lit. s UWG (Schweiz).",
    aff: "Werbung und Affiliate-Links",
    affText: (n, L) => <>
      <p>{SITE_NAME} ist kostenlos und finanziert sich über Affiliate-Programme (z. B. Awin, CJ, Tradedoubler). Kaufst du nach einem Klick auf einen Link, der mit «Werbelink» beschriftet ist, kann uns der Händler eine Provision zahlen. Dein Preis ändert sich dadurch nicht. Diese Links sind im Knopf sichtbar beschriftet und technisch als <code>rel=&quot;sponsored&quot;</code> markiert.</p>
      <p>Die Reihenfolge der Angebote hängt nie von einer Provision ab; es gibt keine bezahlten Platzierungen. {n === 0 ? "Derzeit ist kein Werbelink aktiv." : `Derzeit aktive Programme: ${n}.`} Kriterien und Einzelheiten: <a href={L("transparenz", "#provision")}>Transparenz</a>.</p>
    </>,
    what: "Was dieser Dienst ist",
    whatText: (L) => <>{SITE_NAME} sammelt öffentlich zugängliche Angebote (Produkt, Preis, Datum) automatisch, bewertet sie und verlinkt auf die Originalquelle. Wir verkaufen nichts. Für Preise, Verfügbarkeit und Bedingungen ist allein der jeweilige Anbieter massgebend. Details: <a href={L("agb")}>Nutzungsbedingungen</a>, <a href={L("transparenz")}>Transparenz</a>, <a href={L("quellen")}>Quellen &amp; Entfernung</a>, <a href={L("datenschutz")}>Datenschutz</a>.</>,
    ext: "Externe Links",
    extText: "Für Inhalte verlinkter Seiten sind ausschliesslich deren Betreiber verantwortlich. Bei Kenntnis von Rechtsverletzungen entfernen wir den betreffenden Link umgehend.",
    marks: "Marken und Rechte",
    marksText: (L) => <>Genannte Marken und Händlernamen gehören ihren Inhabern und dienen nur der Bezeichnung des Angebots. Rechteinhaber können die Entfernung von Inhalten jederzeit verlangen: <a href={L("quellen", "#entfernung")}>Entfernungsanfrage</a>.</>,
  },
  fr: {
    lang: "fr-CH",
    publisher: "Éditeur",
    intro: (o) => `${SITE_NAME} est édité par ${o.name}, entrepreneur individuel (micro-entreprise de droit français).`,
    siret: "SIRET", reg: (o) => `Immatriculé au Registre national des entreprises (RNE)${o.rcs ? ` et au ${o.rcs} sous le n° ${siren(o)}` : ""}`,
    vat: "N° de TVA intracommunautaire", addr: "Adresse (domiciliation)", email: "E-mail", phone: "Téléphone",
    fast: "Le moyen le plus rapide de nous joindre est l’e-mail ; nous répondons en général sous 48 heures.",
    preview: "Version de prévisualisation : l’identité de l’éditeur sera ajoutée avant le lancement public.",
    director: "Directeur de la publication",
    host: "Hébergeur",
    basis: "Informations fournies au titre des art. 1-1 et 19 de la LCEN (France) et de l’art. 3 al. 1 let. s LCD (Suisse).",
    aff: "Publicité et liens d’affiliation",
    affText: (n, L) => <>
      <p>{SITE_NAME} est gratuit et se finance par des programmes d’affiliation (p. ex. Awin, CJ, Tradedoubler). Si tu achètes après avoir cliqué sur un lien marqué « lien publicitaire (affilié) », le marchand peut nous verser une commission. Ton prix ne change pas. Ces liens sont signalés sur le bouton et marqués techniquement <code>rel=&quot;sponsored&quot;</code>.</p>
      <p>L’ordre des offres ne dépend jamais d’une commission ; il n’y a aucun placement payant. {n === 0 ? "Actuellement, aucun lien publicitaire n’est actif." : `Programmes actifs actuellement : ${n}.`} Critères de classement et détails : <a href={L("transparenz", "#provision")}>transparence</a>.</p>
    </>,
    what: "Nature du service",
    whatText: (L) => <>{SITE_NAME} rassemble automatiquement des offres publiques (produit, prix, dates), les note et renvoie vers la source d’origine. Nous ne vendons rien. Seul le site du marchand fait foi pour le prix, la disponibilité et les conditions. Voir aussi : <a href={L("agb")}>conditions d’utilisation</a>, <a href={L("transparenz")}>transparence</a>, <a href={L("quellen")}>sources et retrait</a>, <a href={L("datenschutz")}>confidentialité</a>.</>,
    ext: "Liens externes",
    extText: "Les sites liés relèvent de la seule responsabilité de leurs éditeurs. Tout lien signalé comme illicite est retiré sans délai.",
    marks: "Marques et droits",
    marksText: (L) => <>Les marques et noms de marchands cités appartiennent à leurs titulaires et servent uniquement à désigner l’offre. Tout titulaire de droits peut demander un retrait : <a href={L("quellen", "#retrait")}>demande de retrait</a>.</>,
  },
  en: {
    lang: "en",
    publisher: "Publisher",
    intro: (o) => `${SITE_NAME} is published by ${o.name}, sole trader under French law (micro-entreprise).`,
    siret: "SIRET", reg: (o) => `Registered in the French National Business Register (RNE)${o.rcs ? ` and the ${o.rcs} under no. ${siren(o)}` : ""}`,
    vat: "EU VAT no.", addr: "Business address (registered office service)", email: "E-mail", phone: "Phone",
    fast: "The fastest way to reach us is e-mail; we usually reply within 48 hours.",
    preview: "Preview version: the publisher’s details will be added before the public launch.",
    director: "Responsible for content (directeur de la publication)",
    host: "Hosting",
    basis: "Information provided under Art. 1-1 and 19 LCEN (France) and Art. 3(1)(s) UCA/UWG (Switzerland).",
    aff: "Advertising and affiliate links",
    affText: (n, L) => <>
      <p>{SITE_NAME} is free and funded by affiliate programmes (e.g. Awin, CJ, Tradedoubler). If you buy after clicking a link labelled “Ad link”, the retailer may pay us a commission. Your price does not change. These links are labelled on the button and marked <code>rel=&quot;sponsored&quot;</code>.</p>
      <p>The order of offers never depends on a commission; there are no paid placements. {n === 0 ? "No ad link is active at the moment." : `Programmes currently active: ${n}.`} Ranking criteria and details: <a href={L("transparenz", "#provision")}>transparency</a>.</p>
    </>,
    what: "What this service is",
    whatText: (L) => <>{SITE_NAME} automatically collects publicly available offers (product, price, dates), rates them and links to the original source. We sell nothing. Only the retailer’s site is binding for price, availability and terms. See also: <a href={L("agb")}>terms of use</a>, <a href={L("transparenz")}>transparency</a>, <a href={L("quellen")}>sources &amp; removal</a>, <a href={L("datenschutz")}>privacy</a>.</>,
    ext: "External links",
    extText: "Linked sites are the sole responsibility of their operators. Any link reported as unlawful is removed without delay.",
    marks: "Trademarks and rights",
    marksText: (L) => <>Trademarks and retailer names belong to their owners and are used only to identify the offer. Rights holders can request removal at any time: <a href={L("quellen", "#entfernung")}>removal request</a>.</>,
  },
};

export default async function Impressum({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = T[locale] ?? T.de;
  const L = (p: string, h = "") => `${paths.page(locale, p)}${h}`;
  const o = operator();
  const complete = isOperatorComplete(o);
  const programmes = activeProgrammes().length;
  const c = locale === "fr" ? "\u00a0: " : ": ";
  return (
    <article className="legal">
      <LegalHead locale={locale} title={TITLE} />
      <section id={locale} lang={t.lang}>
        <h2>{t.publisher}</h2>
        {complete ? (
          <>
            <p>{t.intro(o)}</p>
            <p>
              {t.addr}{c}<br />
              {o.name}<br />
              {o.address.map((l, i) => <span key={i}>{l}<br /></span>)}
            </p>
            <p>
              {t.siret}{c} {o.siret}<br />
              {t.reg(o)}<br />
              {o.vat && <>{t.vat}{c} {o.vat}<br /></>}
              {t.email}{c} <a href={`mailto:${o.email}`}>{o.email}</a>
              {o.phone && <><br />{t.phone}{c} <a href={`tel:${o.phone.replace(/[^\d+]/g, "")}`}>{o.phone}</a></>}
            </p>
            <p className="muted">{t.fast}</p>
            <p>{t.director}{c} {o.name}</p>
          </>
        ) : (
          <p className="note-box">{t.preview}</p>
        )}
        <p className="muted">{t.basis}</p>
        <h2>{t.host}</h2>
        <p>{HOST.name}, {HOST.address}, {locale === "fr" ? "tél." : "Tel."} {HOST.phone}, <a href={HOST.web} rel="noopener noreferrer">{HOST.web}</a></p>
        <h2 id={locale === "fr" ? "affiliation" : "affiliate"}>{t.aff}</h2>
        {t.affText(programmes, L)}
        <h2>{t.what}</h2>
        <p>{t.whatText(L)}</p>
        <h2>{t.ext}</h2>
        <p>{t.extText}</p>
        <h2>{t.marks}</h2>
        <p>{t.marksText(L)}</p>
      </section>
    </article>
  );
}
