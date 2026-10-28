import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { LEGAL_REVISION, operator } from "../impressum/operator";
import { loadSources } from "./sources";

export const metadata = {
  title: "Quellen & Entfernung · Sources et retrait",
  description: "Welche öffentlichen Quellen wir lesen, wie, und wie Rechteinhaber eine Entfernung verlangen.",
};

// LAWYER-CHECK : réutilisation de données publiques — CH : art. 5 let. c LCD (reprise
// d'un résultat de travail par procédé technique) ; UE : droit sui generis des bases de
// données (directive 96/9/CE, art. 7 ; FR : art. L.342-1 CPI, extraction substantielle) ;
// CGU des sources. Mitigation : faits seulement, pas d'images, lien vers l'original,
// retrait en 7 jours. Vérifier les CGU de chaque source avant le lancement public.
const SUBJECT = "Entfernungsanfrage / Demande de retrait";
const BODY = [
  "Quelle oder Seite (URL) / Source ou page (URL) :",
  "",
  "Was soll entfernt werden? / Que faut-il retirer ? (ganze Quelle / einzelne Angebote — source entière / offres précises)",
  "",
  "Ihre Beziehung zur Quelle (Rechteinhaber, Vertreter) / Votre lien avec la source (titulaire, mandataire) :",
  "",
].join("\n");

export default function Quellen() {
  const sources = loadSources();
  const { email } = operator();
  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`
    : null;
  const takedown = (label: string) =>
    mailto ? (
      <p><a className="cta" href={mailto}>{label}</a></p>
    ) : (
      <p className="warn">Kontakt-E-Mail folgt vor dem Start (<Link href="/impressum">Impressum</Link>). / L’adresse de contact sera publiée avant le lancement.</p>
    );

  return (
    <article className="legal">
      <h1>Quellen &amp; Entfernung · Sources et retrait</h1>
      <p className="muted"><a href="#de">Deutsch</a> · <a href="#fr">Français</a> · <a href="#liste">Liste</a> · Stand / version : {LEGAL_REVISION}</p>

      <section id="de" lang="de">
        <h2>Wie wir Quellen nutzen</h2>
        <ul>
          <li>Nur <strong>öffentlich zugängliche</strong> Seiten, Feeds und Schnittstellen, ohne Login und ohne Umgehung technischer Schutzmassnahmen.</li>
          <li><strong>robots.txt</strong> wird vor dem Abruf geprüft (mindestens alle 20 Stunden neu) und eingehalten, inklusive Crawl-Delay; Abrufe sind selten und massvoll.</li>
          <li>Wir übernehmen nur <strong>Fakten</strong>: Produktname (gekürzt), Preis, Referenzpreis, Gültigkeitsdaten, Bedingungen. <strong>Keine Bilder, keine vollständigen Beschreibungen</strong>, keine Kundenbewertungen.</li>
          <li>Jedes Angebot nennt seine Quelle und <strong>verlinkt auf das Original</strong>; massgebend ist immer die Seite des Anbieters.</li>
        </ul>
        <h2 id="entfernung">Entfernung verlangen</h2>
        <p>Sie sind Rechteinhaber oder Betreiber einer Quelle und möchten nicht (oder nur teilweise) auf {SITE_NAME} erscheinen? Ein Klick genügt — keine Begründung nötig. Wir <strong>antworten innerhalb von 7 Tagen</strong> und entfernen die Inhalte mit dem nächsten Neuaufbau der Website (dieser erfolgt alle 2 Stunden).</p>
        {takedown("Entfernung per E-Mail anfragen")}
      </section>

      <section id="fr" lang="fr">
        <h2>Comment nous utilisons les sources</h2>
        <ul>
          <li>Uniquement des pages, flux et interfaces <strong>publics</strong>, sans connexion ni contournement de mesure technique.</li>
          <li><strong>robots.txt</strong> est vérifié avant collecte (au moins toutes les 20 heures) et respecté, délai entre requêtes compris ; la fréquence reste faible.</li>
          <li>Nous ne reprenons que des <strong>faits</strong> : nom du produit (abrégé), prix, prix de référence, dates, conditions. <strong>Ni images, ni descriptions complètes</strong>, ni avis clients.</li>
          <li>Chaque offre cite sa source et <strong>renvoie vers l’original</strong>, qui fait foi.</li>
        </ul>
        <h2 id="retrait">Demander un retrait</h2>
        <p>Vous êtes titulaire de droits ou éditeur d’une source et ne souhaitez pas (ou plus) figurer sur {SITE_NAME} ? Un clic suffit, sans justification. <strong>Réponse sous 7 jours</strong> ; le retrait s’applique dès la reconstruction suivante du site (toutes les 2 heures).</p>
        {takedown("Demander un retrait par e-mail")}
      </section>

      <section id="liste">
        <h2>Aktuelle Quellen · Sources actuelles ({sources.length})</h2>
        {sources.length ? (
          <ul>
            {sources.map((s) => (
              <li key={s.domain}>{s.name} — <a href={s.url} rel="noopener noreferrer nofollow">{s.domain}</a></li>
            ))}
          </ul>
        ) : (
          <p className="muted">Liste derzeit nicht verfügbar. / Liste momentanément indisponible.</p>
        )}
        <p className="muted">Manche Quellen sind selbst Sammelseiten (z. B. Preisvergleiche); dort verlinken wir zusätzlich den Händler. / Certaines sources sont elles-mêmes des agrégateurs ; le marchand est alors aussi lié.</p>
      </section>
    </article>
  );
}
