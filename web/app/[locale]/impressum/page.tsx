import { SITE_NAME, paths } from "@/lib/site";
import { LegalHead, legalMetadata } from "@/components/Legal";
import type { Locale } from "@/lib/i18n";
import { HOST, LEGAL_REVISION, isOperatorComplete, operator } from "@/lib/operator";


// LAWYER-CHECK (CH) : art. 3 al. 1 let. s LCD/UWG — nom, adresse postale, e-mail suffisent
// pour une personne physique ; pas d'inscription au registre du commerce tant que le
// chiffre d'affaires < 100 000 CHF/an (art. 931 CO, ORC art. 36). À reconfirmer.
// Le droit français (LCEN) n'est plus cité : l'éditeur est en Suisse (round 2, item 14).
// LAWYER-CHECK : confirmer qu'aucune obligation LCEN ne s'applique à un éditeur suisse visant aussi la France.
const TITLE = { de: "Impressum", fr: "Mentions légales", en: "Imprint" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return legalMetadata((await params).locale, "impressum", TITLE);
}

export default async function Impressum({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const L = (p: string, h = "") => `${paths.page(locale, p)}${h}`;
  const o = operator();
  const complete = isOperatorComplete(o);
  const identity = complete ? (
    <p>
      {o.name}<br />
      {o.address.map((l, i) => <span key={i}>{l}<br /></span>)}
      E-Mail: <a href={`mailto:${o.email}`}>{o.email}</a>
      {/* Jamais de numéro de téléphone de l’exploitant publié (règle du projet). */}
    </p>
  ) : (
    <p className="note-box">{locale === "fr" ? "Version de prévisualisation : l’identité de l’éditeur sera ajoutée avant le lancement public." : "Vorschau-Version: Die Angaben zum Betreiber werden vor dem öffentlichen Start ergänzt."}</p>
  );
  return (
    <article className="legal">
      <LegalHead locale={locale} title={TITLE} bodyLang={locale === "fr" ? "fr" : "de"} />

      {locale !== "fr" && (
      <section id="de" lang="de-CH">
        <h2>Betreiber und Verantwortlicher</h2>
        <p>{SITE_NAME} ist ein privat betriebenes Informationsangebot einer natürlichen Person (kein Unternehmen, kein Handelsregistereintrag).</p>
        {identity}
        <p className="muted">Angaben gemäss Art. 3 Abs. 1 lit. s UWG (Schweiz).{complete ? ` Verantwortlich für den Inhalt: ${o.name}.` : ""}</p>
        <h2>Hosting</h2>
        <p>{HOST.name}, {HOST.address}, Tel. {HOST.phone}, <a href={HOST.web} rel="noopener noreferrer">{HOST.web}</a></p>
        <h2>Was dieser Dienst ist</h2>
        <p>{SITE_NAME} sammelt öffentlich zugängliche Angebote (Produkt, Preis, Datum) automatisch, bewertet sie und verlinkt auf die Originalquelle. Wir verkaufen nichts. Für Preise, Verfügbarkeit und Bedingungen ist allein der jeweilige Anbieter massgebend. Details: <a href={L("agb")}>Nutzungsbedingungen</a>, <a href={L("transparenz")}>Transparenz</a>, <a href={L("quellen")}>Quellen &amp; Entfernung</a>, <a href={L("datenschutz")}>Datenschutz</a>.</p>
        <h2>Externe Links</h2>
        <p>Für Inhalte verlinkter Seiten sind ausschliesslich deren Betreiber verantwortlich. Bei Kenntnis von Rechtsverletzungen entfernen wir den betreffenden Link umgehend.</p>
        <h2>Marken und Rechte</h2>
        <p>Genannte Marken und Händlernamen gehören ihren Inhabern und dienen nur der Bezeichnung des Angebots. Rechteinhaber können die Entfernung von Inhalten jederzeit verlangen: <a href={L("quellen", "#entfernung")}>Entfernungsanfrage</a>.</p>
      </section>
      )}

      {locale === "fr" && (
      <section id="fr" lang="fr-CH">
        <h2>Éditeur et responsable</h2>
        <p>{SITE_NAME} est un service d’information édité par une personne physique (pas de société, pas d’inscription au registre du commerce).</p>
        {identity}
        <p className="muted">Informations fournies au titre de l’art. 3 al. 1 let. s LCD (Suisse).{complete ? ` Responsable du contenu : ${o.name}.` : ""}</p>
        <h2>Hébergeur</h2>
        <p>{HOST.name}, {HOST.address}, tél. {HOST.phone}, <a href={HOST.web} rel="noopener noreferrer">{HOST.web}</a></p>
        <h2>Nature du service</h2>
        <p>{SITE_NAME} rassemble automatiquement des offres publiques (produit, prix, dates), les note et renvoie vers la source d’origine. Nous ne vendons rien. Seul le site du marchand fait foi pour le prix, la disponibilité et les conditions. Voir aussi : <a href={L("agb")}>conditions d’utilisation</a>, <a href={L("transparenz")}>transparence</a>, <a href={L("quellen")}>sources et retrait</a>, <a href={L("datenschutz")}>confidentialité</a>.</p>
        <h2>Liens externes</h2>
        <p>Les sites liés relèvent de la seule responsabilité de leurs éditeurs. Tout lien signalé comme illicite est retiré sans délai.</p>
        <h2>Marques et droits</h2>
        <p>Les marques et noms de marchands cités appartiennent à leurs titulaires et servent uniquement à désigner l’offre. Tout titulaire de droits peut demander un retrait : <a href={L("quellen", "#retrait")}>demande de retrait</a>.</p>
      </section>
      )}
    </article>
  );
}
