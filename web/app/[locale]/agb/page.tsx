import { SITE_NAME, paths } from "@/lib/site";
import { LegalHead, legalMetadata } from "@/components/Legal";
import type { Locale } from "@/lib/i18n";
import { LEGAL_REVISION } from "@/lib/operator";


// LAWYER-CHECK : (1) limitation de responsabilité — CH : art. 100 al. 1 CO (dol / faute
// grave non excluables) ; FR/UE : clauses abusives (art. L.212-1 et R.212-1 C. consom.),
// dommages corporels jamais excluables. (2) Droit applicable / for : un consommateur UE
// garde la protection impérative et le for de son pays (Rome I art. 6, Bruxelles I bis
// art. 17-18 ; pour la Suisse : Convention de Lugano). Formulation volontairement prudente.
const TITLE = { de: "Nutzungsbedingungen", fr: "Conditions d’utilisation", en: "Terms of use" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return legalMetadata((await params).locale, "agb", TITLE);
}

export default async function Agb({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const L = (p: string, h = "") => `${paths.page(locale, p)}${h}`;
  return (
    <article className="legal">
      <LegalHead locale={locale} title={TITLE} bodyLang={locale === "fr" ? "fr" : "de"} />

      {locale !== "fr" && (
      <section id="de" lang="de-CH">
        <h2>1. Leistung</h2>
        <p>{SITE_NAME} ist ein kostenloser Informationsdienst ohne Konto. Wir sammeln öffentlich zugängliche Angebote automatisch, bewerten sie (<a href={L("transparenz")}>so funktioniert die Note</a>) und verlinken auf die Originalquelle. Wir sind <strong>kein Verkäufer</strong>: Ein Kaufvertrag kommt nur zwischen dir und dem jeweiligen Händler zustande, zu dessen Bedingungen.</p>
        <h2>2. Keine Gewähr für Preise und Verfügbarkeit</h2>
        <p>Angaben werden automatisch übernommen und können veraltet, unvollständig oder fehlerhaft sein (z. B. regionale Preise, Mengenbeschränkungen, Kundenkarten, ausverkaufte Artikel). <strong>Massgebend ist immer die Seite des Händlers.</strong> Unsere Note ist eine Einschätzung, keine Kaufempfehlung oder Zusicherung.</p>
        <h2>3. Haftung</h2>
        <p>Soweit gesetzlich zulässig, haften wir nicht für Schäden aus der Nutzung der Angaben oder verlinkter Seiten. Unberührt bleibt die Haftung für Vorsatz und grobe Fahrlässigkeit, für Schäden an Leben, Körper oder Gesundheit sowie nach zwingenden Verbraucherschutzvorschriften.</p>
        <h2>4. Externe Links</h2>
        <p>Für verlinkte Seiten sind deren Betreiber verantwortlich. Werbelinks sind sichtbar als «Werbelink» beschriftet.</p>
        <h2>5. Faire Nutzung</h2>
        <p>Automatisierte Abrufe sind nur im Rahmen unserer <a href="/robots.txt">robots.txt</a> und ohne übermässige Last erlaubt. Die Notenberechnung und unsere Texte dürfen nicht systematisch kopiert und als eigener Dienst angeboten werden. Missbrauch (z. B. Manipulation der Klickstatistik) ist untersagt.</p>
        <h2>6. Änderungen, Recht</h2>
        <p>Wir können den Dienst und diese Bedingungen jederzeit ändern oder einstellen; massgebend ist die hier veröffentlichte Fassung. Es gilt Schweizer Recht. Zwingende Verbraucherschutzvorschriften und Gerichtsstände deines Wohnsitzstaates bleiben vorbehalten. Kontakt: <a href={L("impressum")}>Impressum</a>.</p>
      </section>
      )}

      {locale === "fr" && (
      <section id="fr" lang="fr-CH">
        <h2>1. Service</h2>
        <p>{SITE_NAME} est un service d’information gratuit, sans compte. Nous rassemblons automatiquement des offres publiques, les notons (<a href={L("transparenz")}>méthode</a>) et renvoyons vers la source. Nous <strong>ne vendons rien</strong> : tout achat est conclu entre toi et le marchand, à ses conditions.</p>
        <h2>2. Aucune garantie sur les prix et la disponibilité</h2>
        <p>Les informations sont reprises automatiquement et peuvent être obsolètes, incomplètes ou erronées (prix régionaux, quantités limitées, cartes de fidélité, ruptures de stock). <strong>Seul le site du marchand fait foi.</strong> Notre note est une appréciation, ni un conseil d’achat ni une garantie.</p>
        <h2>3. Responsabilité</h2>
        <p>Dans la mesure permise par la loi, nous déclinons toute responsabilité pour les dommages liés à l’utilisation des informations ou des sites liés. Restent réservées la responsabilité pour faute intentionnelle ou lourde, pour atteinte à la vie, au corps ou à la santé, et les dispositions impératives de protection des consommateurs.</p>
        <h2>4. Liens externes</h2>
        <p>Les sites liés relèvent de leurs éditeurs. Les liens affiliés sont signalés en clair par la mention « lien publicitaire (affilié) ».</p>
        <h2>5. Usage loyal</h2>
        <p>L’accès automatisé n’est permis que dans le respect de notre <a href="/robots.txt">robots.txt</a> et sans charge excessive. La reprise systématique de nos notes et textes pour un service concurrent est interdite, de même que toute manipulation des statistiques.</p>
        <h2>6. Modifications, droit applicable</h2>
        <p>Nous pouvons modifier ou arrêter le service et ces conditions à tout moment ; la version publiée ici fait foi. Le droit suisse s’applique, sous réserve des dispositions impératives et des fors protecteurs de ton pays de résidence. Contact : <a href={L("impressum")}>mentions légales</a>.</p>
      </section>
      )}
    </article>
  );
}
