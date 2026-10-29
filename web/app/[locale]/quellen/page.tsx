import { SITE_NAME, paths } from "@/lib/site";
import { LegalHead, legalMetadata } from "@/components/Legal";
import type { Locale } from "@/lib/i18n";
import { LEGAL_REVISION, operator } from "@/lib/operator";
import { loadSources } from "@/lib/sources";


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
  "Ihre Beziehung zur Quelle (Rechteinhaber, Vertreter) / Lien avec la source (titulaire, mandataire) :",
  "",
].join("\n");

const TITLE = { de: "Quellen & Entfernung", fr: "Sources et retrait", en: "Sources & removal" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return legalMetadata((await params).locale, "quellen", TITLE, { index: true, description: { de: "Welche öffentlichen Quellen wir lesen, wie, und wie Rechteinhaber eine Entfernung verlangen.", fr: "Quelles sources publiques nous lisons, comment, et comment demander un retrait.", en: "Which public sources we read, how, and how rights holders can request removal." } });
}

export default async function Quellen({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const L = (p: string, h = "") => `${paths.page(locale, p)}${h}`;
  const sources = loadSources();
  const { email } = operator();
  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`
    : null;
  const takedown = (label: string) =>
    mailto ? (
      <p><a className="btn btn-secondary" href={mailto}>{label}</a></p>
    ) : (
      <p className="note-box">{locale === "fr" ? <>L’adresse de contact sera publiée avant le lancement (<a href={L("impressum")}>mentions légales</a>).</> : <>Kontakt-E-Mail folgt vor dem Start (<a href={L("impressum")}>Impressum</a>).</>}</p>
    );

  return (
    <article className="legal">
      <LegalHead locale={locale} title={TITLE} bodyLang={locale === "fr" ? "fr" : "de"} />

      {locale !== "fr" && (
      <section id="de" lang="de-CH">
        <h2>Wie wir Quellen nutzen</h2>
        <ul>
          <li>Nur <strong>öffentlich zugängliche</strong> Seiten, Feeds und Schnittstellen, ohne Login und ohne Umgehung technischer Schutzmassnahmen.</li>
          <li><strong>robots.txt</strong> wird vor dem Abruf geprüft (mindestens alle 20 Stunden neu) und eingehalten, inklusive Crawl-Delay; Abrufe sind selten und massvoll.</li>
          <li>Wir übernehmen nur <strong>Fakten</strong>: Produktname (gekürzt), Preis, Referenzpreis, Gültigkeitsdaten, Bedingungen. <strong>Keine Bilder, keine vollständigen Beschreibungen</strong>, keine Kundenbewertungen.</li>
          <li>Jedes Angebot nennt seine Quelle und <strong>verlinkt auf das Original</strong>; massgebend ist immer die Seite des Anbieters.</li>
        </ul>
        <h2 id="entfernung">Entfernung verlangen</h2>
        <p>Sie sind Rechteinhaber oder Betreiber einer Quelle und möchten nicht (oder nur teilweise) auf {SITE_NAME} erscheinen? {mailto ? "Eine E-Mail genügt, mit der Schaltfläche unten" : "Sobald die Kontaktadresse veröffentlicht ist, genügt eine E-Mail"} — keine Begründung nötig. {mailto && <>Wir <strong>antworten innerhalb von 7 Tagen</strong> und </>}{mailto ? "entfernen" : "Wir entfernen"} die Inhalte mit dem nächsten Neuaufbau der Website (dieser erfolgt alle 2 Stunden).</p>
        {takedown("Entfernung per E-Mail anfragen")}
      </section>
      )}

      {locale === "fr" && (
      <section id="fr" lang="fr-CH">
        <h2>Comment nous utilisons les sources</h2>
        <ul>
          <li>Uniquement des pages, flux et interfaces <strong>publics</strong>, sans connexion ni contournement de mesure technique.</li>
          <li><strong>robots.txt</strong> est vérifié avant collecte (au moins toutes les 20 heures) et respecté, délai entre requêtes compris ; la fréquence reste faible.</li>
          <li>Nous ne reprenons que des <strong>faits</strong> : nom du produit (abrégé), prix, prix de référence, dates, conditions. <strong>Ni images, ni descriptions complètes</strong>, ni avis clients.</li>
          <li>Chaque offre cite sa source et <strong>renvoie vers l’original</strong>, qui fait foi.</li>
        </ul>
        <h2 id="retrait">Demander un retrait</h2>
        <p>Titulaire de droits ou éditeur d’une source, tu ne souhaites pas (ou plus) figurer sur {SITE_NAME} ? {mailto ? "Un e-mail suffit, avec le bouton ci-dessous" : "Dès que l’adresse de contact sera publiée, un e-mail suffira"}, sans justification. {mailto && <><strong>Réponse sous 7 jours</strong> ; </>}le retrait s’applique dès la reconstruction suivante du site (toutes les 2 heures).</p>
        {takedown("Demander un retrait par e-mail")}
      </section>
      )}

      <section id="liste">
        <h2>{locale === "fr" ? "Sources actuelles" : locale === "en" ? "Current sources" : "Aktuelle Quellen"} ({sources.length})</h2>
        {sources.length ? (
          <ul>
            {sources.map((s) => (
              <li key={s.domain}>{s.name} — <a href={s.url} rel="noopener noreferrer nofollow">{s.domain}</a></li>
            ))}
          </ul>
        ) : (
          <p className="muted">{locale === "fr" ? "Liste momentanément indisponible." : "Liste derzeit nicht verfügbar."}</p>
        )}
        <p className="muted">{locale === "fr" ? "Certaines sources sont elles-mêmes des agrégateurs ; la carte l’indique alors (« trouvé via … »)." : "Manche Quellen sind selbst Sammelseiten (z. B. Preisvergleiche); die Karte sagt das dann («gefunden über …»)."}</p>
      </section>
    </article>
  );
}
