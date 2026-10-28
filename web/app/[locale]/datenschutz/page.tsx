import Link from "next/link";
import { ConsentReset } from "@/components/Consent";
import { SITE_NAME } from "@/lib/site";
import { LEGAL_REVISION, isOperatorComplete, operator } from "../impressum/operator";

export const metadata = { title: "Datenschutz · Confidentialité", robots: { index: false } };

// LAWYER-CHECK : (1) le responsable vit en Suisse et vise aussi l'UE → art. 3(2) RGPD
// applicable ; vérifier si un représentant UE (art. 27 RGPD) est exigé ou si
// l'exception « traitement occasionnel, faible risque » (art. 27(2)) s'applique.
// (2) Transferts USA : Cloudflare et Google certifiés EU-US DPF / Swiss-US DPF —
// vérifier la certification active au lancement (dataprivacyframework.gov).
// (3) Durées de conservation Cloudflare à reconfirmer dans leurs docs au lancement.
export default function Datenschutz() {
  const o = operator();
  const controller = isOperatorComplete(o) ? (
    <p>{o.name}, {o.address.join(", ")}, <a href={`mailto:${o.email}`}>{o.email}</a></p>
  ) : (
    <p className="warn">Vorschau — Angaben zum Verantwortlichen folgen vor dem Start. / Prévisualisation — identité du responsable ajoutée avant le lancement.</p>
  );
  const ads = !!process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  return (
    <article className="legal">
      <h1>Datenschutzerklärung · Politique de confidentialité</h1>
      <p className="muted"><a href="#de">Deutsch</a> · <a href="#fr">Français</a> · Stand / version : {LEGAL_REVISION}</p>

      <section id="de" lang="de">
        <h2>Kurz gesagt</h2>
        <p>{SITE_NAME} braucht kein Konto, setzt ohne deine Einwilligung keine Cookies und erstellt keine Profile. Wir halten uns an das Schweizer Datenschutzgesetz (DSG) und, für Besucher aus der EU/dem EWR, an die DSGVO.</p>
        <h2>Verantwortlicher</h2>
        {controller}
        <h2>1. Hosting und Server-Logs (Cloudflare)</h2>
        <p>Die Website läuft bei Cloudflare, Inc. (USA) als Auftragsverarbeiter. Bei jedem Aufruf verarbeitet Cloudflare technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser-Kennung), um die Seite auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage: berechtigtes Interesse an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO; Art. 31 DSG). Wir selbst speichern keine IP-Adressen.</p>
        <h2>2. Reichweitenmessung (Cloudflare Web Analytics)</h2>
        <p>Wir zählen Seitenaufrufe mit Cloudflare Web Analytics. Es werden <strong>keine Cookies</strong> gesetzt, kein Fingerprinting betrieben und keine Profile erstellt; wir sehen nur zusammengefasste Zahlen (Seite, Herkunftsseite, Land, Gerätetyp). Rechtsgrundlage: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).</p>
        <h2>3. Anonymer Klickzähler</h2>
        <p>Klickst du auf einen Link zu einem Händler, speichern wir nur: Deal-Kennung, Quelle, Partnerprogramm, aufgerufene Seite und ob es ein Werbelink war — <strong>ohne IP-Adresse, Cookie oder Kennung</strong>. Speicherdauer: höchstens 3 Monate (Cloudflare Workers Analytics Engine).</p>
        <h2 id="cookies">4. Cookies, lokaler Speicher und Werbung</h2>
        <p>Wir setzen selbst keine Cookies. Deine Werbe-Entscheidung wird nur lokal in deinem Browser gespeichert (localStorage, technisch notwendig, höchstens 13 Monate) und nicht übertragen.</p>
        <p>{ads ? "Werbung (Google AdSense, Google Ireland Ltd. / Google LLC) wird" : "Derzeit wird keine Werbung angezeigt. Falls wir Werbung (Google AdSense) aktivieren, wird sie"} <strong>nur nach deiner ausdrücklichen Einwilligung</strong> geladen (Art. 6 Abs. 1 lit. a DSGVO). Google kann dann Cookies setzen und Daten in die USA übermitteln (EU-US/Swiss-US Data Privacy Framework). Ablehnen ist genauso einfach wie Zustimmen; ohne Entscheidung wird nichts geladen. Du kannst deine Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen: <ConsentReset /></p>
        <h2>5. Werbelinks (Affiliate)</h2>
        <p>Mit * markierte Links führen über ein Partnernetzwerk (z. B. Tradedoubler, Awin, CJ) zum Händler. Erst <strong>nach deinem Klick</strong>, also beim Netzwerk bzw. Händler, kann ein Cookie gesetzt werden, um eine Provision zuzuordnen. Dafür sind das Netzwerk und der Händler verantwortlich; es gelten deren Datenschutzerklärungen. Wir erhalten nur zusammengefasste Provisionsberichte, keine Angaben zu deiner Person. Der Preis ändert sich für dich nicht.</p>
        <h2>6. Kontakt per E-Mail</h2>
        <p>Schreibst du uns (z. B. eine Entfernungsanfrage), verwenden wir deine E-Mail-Adresse und Nachricht nur zur Bearbeitung und löschen sie, wenn die Sache erledigt ist, ausser eine gesetzliche Aufbewahrungspflicht verlangt etwas anderes.</p>
        <h2>7. Deine Rechte</h2>
        <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie auf Widerruf einer Einwilligung (Art. 15–21 DSGVO; Art. 25 ff. DSG). Schreib uns dazu an die oben genannte Adresse. Du kannst dich ausserdem beim EDÖB (Schweiz, <a href="https://www.edoeb.admin.ch" rel="noopener noreferrer">edoeb.admin.ch</a>) oder bei der Datenschutzbehörde deines EU-Landes beschweren (Frankreich: <a href="https://www.cnil.fr" rel="noopener noreferrer">CNIL</a>).</p>
        <p>Es gibt keine automatisierte Einzelentscheidung und kein Profiling. Kontakt und Anbieterkennzeichnung: <Link href="/impressum">Impressum</Link>.</p>
      </section>

      <section id="fr" lang="fr">
        <h2>En bref</h2>
        <p>{SITE_NAME} ne demande aucun compte, ne dépose aucun cookie sans votre accord et ne crée aucun profil. Nous appliquons la loi suisse sur la protection des données (LPD) et, pour les visiteurs de l’UE/EEE, le RGPD.</p>
        <h2>Responsable du traitement</h2>
        {controller}
        <h2>1. Hébergement et journaux serveur (Cloudflare)</h2>
        <p>Le site est hébergé par Cloudflare, Inc. (États-Unis), sous-traitant. À chaque visite, Cloudflare traite les données techniques nécessaires (adresse IP, horodatage, adresse demandée, navigateur) pour servir la page et la protéger contre les attaques. Base légale : intérêt légitime à un fonctionnement sûr (art. 6, 1, f RGPD ; art. 31 LPD). Nous ne conservons nous-mêmes aucune adresse IP.</p>
        <h2>2. Mesure d’audience (Cloudflare Web Analytics)</h2>
        <p>Mesure <strong>sans cookie</strong>, sans empreinte numérique ni profil ; nous ne voyons que des totaux (page, page d’origine, pays, type d’appareil). Base légale : intérêt légitime.</p>
        <h2>3. Compteur de clics anonyme</h2>
        <p>Lors d’un clic vers un marchand, nous enregistrons uniquement : identifiant de l’offre, source, programme partenaire, page et caractère publicitaire du lien — <strong>sans adresse IP, cookie ni identifiant</strong>. Conservation : 3 mois maximum.</p>
        <h2 id="cookies-fr">4. Cookies, stockage local et publicité</h2>
        <p>Nous ne déposons aucun cookie. Votre choix publicitaire est conservé uniquement dans votre navigateur (localStorage, strictement nécessaire, 13 mois maximum).</p>
        <p>{ads ? "La publicité (Google AdSense, Google Ireland Ltd. / Google LLC) n’est chargée" : "Aucune publicité n’est affichée actuellement. Si nous activons Google AdSense, la publicité ne sera chargée"} <strong>qu’après votre consentement explicite</strong> (art. 6, 1, a RGPD). Google peut alors déposer des cookies et transférer des données aux États-Unis (Data Privacy Framework UE-US / Suisse-US). Refuser est aussi simple qu’accepter ; sans choix, rien n’est chargé. Retrait à tout moment : <ConsentReset /></p>
        <h2>5. Liens affiliés</h2>
        <p>Les liens marqués * passent par un réseau partenaire (p. ex. Tradedoubler, Awin, CJ). C’est seulement <strong>après votre clic</strong>, chez le réseau ou le marchand, qu’un cookie peut être déposé pour attribuer une commission ; ils en sont responsables selon leurs propres politiques. Nous recevons uniquement des rapports agrégés, sans donnée vous concernant. Le prix ne change pas pour vous.</p>
        <h2>6. Contact par e-mail</h2>
        <p>Si vous nous écrivez (p. ex. demande de retrait), votre adresse et votre message servent uniquement à traiter la demande et sont supprimés ensuite, sauf obligation légale de conservation.</p>
        <h2>7. Vos droits</h2>
        <p>Accès, rectification, effacement, limitation, portabilité, opposition et retrait du consentement (art. 15 à 21 RGPD ; art. 25 s. LPD) : écrivez à l’adresse ci-dessus. Vous pouvez saisir le PFPDT (Suisse) ou la CNIL (France) / l’autorité de votre pays. Aucune décision automatisée, aucun profilage.</p>
      </section>
    </article>
  );
}
