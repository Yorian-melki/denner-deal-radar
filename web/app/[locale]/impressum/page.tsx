import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { HOST, LEGAL_REVISION, isOperatorComplete, operator } from "./operator";

export const metadata = { title: "Impressum · Mentions légales", robots: { index: false } };

// LAWYER-CHECK (CH) : art. 3 al. 1 let. s LCD/UWG — nom, adresse postale, e-mail suffisent
// pour une personne physique ; pas d'inscription au registre du commerce tant que le
// chiffre d'affaires < 100 000 CHF/an (art. 931 CO, ORC art. 36). À reconfirmer.
// LAWYER-CHECK (FR) : art. 6 III LCEN — personne physique éditant à titre professionnel :
// nom, prénom, domicile, téléphone, directeur de la publication, hébergeur. Si une
// micro-entreprise est créée : ajouter SIREN/SIRET (et n° TVA le cas échéant).
export default function Impressum() {
  const o = operator();
  const complete = isOperatorComplete(o);
  const identity = complete ? (
    <p>
      {o.name}<br />
      {o.address.map((l, i) => <span key={i}>{l}<br /></span>)}
      E-Mail: <a href={`mailto:${o.email}`}>{o.email}</a>
      {o.phone && <><br />Tel.: {o.phone}</>}
    </p>
  ) : (
    <p className="warn">Vorschau-Version — die Angaben zum Betreiber werden vor dem öffentlichen Start ergänzt. / Version de prévisualisation — l’identité de l’éditeur sera ajoutée avant le lancement public.</p>
  );
  return (
    <article className="legal">
      <h1>Impressum · Mentions légales</h1>
      <p className="muted"><a href="#de">Deutsch</a> · <a href="#fr">Français</a> · Stand / version : {LEGAL_REVISION}</p>

      <section id="de" lang="de">
        <h2>Betreiber und Verantwortlicher</h2>
        <p>{SITE_NAME} ist ein privat betriebenes Informationsangebot einer natürlichen Person (kein Unternehmen, kein Handelsregistereintrag).</p>
        {identity}
        <p className="muted">Angaben gemäss Art. 3 Abs. 1 lit. s UWG (Schweiz) und Art. 6 III LCEN (Frankreich). Verantwortlich für den Inhalt: der oben genannte Betreiber.</p>
        <h2>Hosting</h2>
        <p>{HOST.name}, {HOST.address}, Tel. {HOST.phone}, <a href={HOST.web} rel="noopener noreferrer">{HOST.web}</a></p>
        <h2>Was dieser Dienst ist</h2>
        <p>{SITE_NAME} sammelt öffentlich zugängliche Angebote (Produkt, Preis, Datum) automatisch, bewertet sie und verlinkt auf die Originalquelle. Wir verkaufen nichts. Für Preise, Verfügbarkeit und Bedingungen ist allein der jeweilige Anbieter massgebend. Details: <Link href="/agb">Nutzungsbedingungen</Link>, <Link href="/transparenz">Transparenz</Link>, <Link href="/quellen">Quellen &amp; Entfernung</Link>, <Link href="/datenschutz">Datenschutz</Link>.</p>
        <h2>Externe Links</h2>
        <p>Für Inhalte verlinkter Seiten sind ausschliesslich deren Betreiber verantwortlich. Bei Kenntnis von Rechtsverletzungen entfernen wir den betreffenden Link umgehend.</p>
        <h2>Marken und Rechte</h2>
        <p>Genannte Marken und Händlernamen gehören ihren Inhabern und dienen nur der Bezeichnung des Angebots. Rechteinhaber können die Entfernung von Inhalten jederzeit verlangen: <Link href="/quellen#entfernung">Entfernungsanfrage</Link>.</p>
      </section>

      <section id="fr" lang="fr">
        <h2>Éditeur et responsable</h2>
        <p>{SITE_NAME} est un service d’information édité par une personne physique (pas de société, pas d’inscription au registre du commerce).</p>
        {identity}
        <p className="muted">Informations fournies au titre de l’art. 6 III de la loi n° 2004-575 du 21 juin 2004 (LCEN) et de l’art. 3 al. 1 let. s LCD (Suisse). Directeur de la publication : l’éditeur nommé ci-dessus.</p>
        <h2>Hébergeur</h2>
        <p>{HOST.name}, {HOST.address}, tél. {HOST.phone}, <a href={HOST.web} rel="noopener noreferrer">{HOST.web}</a></p>
        <h2>Nature du service</h2>
        <p>{SITE_NAME} rassemble automatiquement des offres publiques (produit, prix, dates), les note et renvoie vers la source d’origine. Nous ne vendons rien. Seul le site du marchand fait foi pour le prix, la disponibilité et les conditions. Voir aussi : <Link href="/agb#fr">conditions d’utilisation</Link>, <Link href="/transparenz#fr">transparence</Link>, <Link href="/quellen#fr">sources et retrait</Link>, <Link href="/datenschutz#fr">confidentialité</Link>.</p>
        <h2>Liens externes</h2>
        <p>Les sites liés relèvent de la seule responsabilité de leurs éditeurs. Tout lien signalé comme illicite est retiré sans délai.</p>
        <h2>Marques et droits</h2>
        <p>Les marques et noms de marchands cités appartiennent à leurs titulaires et servent uniquement à désigner l’offre. Tout titulaire de droits peut demander un retrait : <Link href="/quellen#retrait">demande de retrait</Link>.</p>
      </section>
    </article>
  );
}
