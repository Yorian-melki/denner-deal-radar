import { ConsentReset } from "@/components/Consent";
import { SITE_NAME, ANALYTICS_TOKEN, paths } from "@/lib/site";
import { LegalHead, legalMetadata } from "@/components/Legal";
import type { Locale } from "@/lib/i18n";
import { isOperatorComplete, operator, adClient } from "@/lib/operator";

// LAWYER-CHECK : (1) le responsable vit en Suisse et vise aussi l'UE → art. 3(2) RGPD
// applicable ; vérifier si un représentant UE (art. 27 RGPD) est exigé ou si
// l'exception « traitement occasionnel, faible risque » (art. 27(2)) s'applique.
// (2) Transferts USA : Cloudflare et Google certifiés EU-US DPF / Swiss-US DPF —
// vérifier la certification active au lancement (dataprivacyframework.gov).
// (3) Durées de conservation Cloudflare à reconfirmer dans leurs docs au lancement.
// Règle (round 2, item 8) : chaque phrase décrit ce que le site fait RÉELLEMENT dans ce
// build — la mesure d'audience n'est décrite que si le script est chargé (ANALYTICS_TOKEN).
const TITLE = { de: "Datenschutzerklärung", fr: "Politique de confidentialité", en: "Privacy policy" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return legalMetadata((await params).locale, "datenschutz", TITLE);
}

export default async function Datenschutz({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const L = (p: string, h = "") => `${paths.page(locale, p)}${h}`;
  const o = operator();
  const complete = isOperatorComplete(o);
  const controller = complete ? (
    <p>{o.name}, {o.address.join(", ")}, <a href={`mailto:${o.email}`}>{o.email}</a></p>
  ) : (
    <p className="note-box">{{ de: "Vorschau: Angaben zum Verantwortlichen folgen vor dem Start.", fr: "Prévisualisation : l’identité du responsable sera ajoutée avant le lancement.", en: "Preview: the controller’s details will be added before launch." }[locale]}</p>
  );
  const ads = !!adClient();
  const analytics = !!ANALYTICS_TOKEN;

  if (locale === "fr") return (
    <article className="legal">
      <LegalHead locale={locale} title={TITLE} />
      <section id="fr">
        <h2>En bref</h2>
        <p>{SITE_NAME} ne demande aucun compte, ne dépose aucun cookie sans ton accord et ne crée aucun profil. Nous appliquons la loi suisse sur la protection des données (LPD) et, pour les visiteurs de l’UE/EEE, le RGPD.</p>
        <h2>Responsable du traitement</h2>
        {controller}
        <h2>1. Hébergement et journaux serveur (Cloudflare)</h2>
        <p>Le site est hébergé par Cloudflare, Inc. (États-Unis), sous-traitant. À chaque visite, Cloudflare traite les données techniques nécessaires (adresse IP, horodatage, adresse demandée, navigateur) pour servir la page et la protéger contre les attaques. Base légale : intérêt légitime à un fonctionnement sûr (art. 6, 1, f RGPD ; art. 31 LPD). Transfert aux États-Unis : Data Privacy Framework UE-US et Suisse-US. Nous ne conservons nous-mêmes aucune adresse IP.</p>
        <h2>2. Mesure d’audience</h2>
        {analytics
          ? <p>Nous comptons les pages vues avec Cloudflare Web Analytics, <strong>sans cookie</strong>, sans empreinte numérique ni profil ; nous ne voyons que des totaux (page, page d’origine, pays, type d’appareil). Base légale : intérêt légitime (art. 6, 1, f RGPD).</p>
          : <p>Il n’y a actuellement <strong>aucune mesure d’audience</strong> : aucun script d’analyse n’est chargé.</p>}
        <h2>3. Compteur de clics anonyme</h2>
        <p>Lors d’un clic vers un marchand, nous enregistrons uniquement l’identifiant de l’offre et la page — <strong>sans adresse IP, cookie ni identifiant</strong>. Base légale : intérêt légitime (savoir quelles sources sont utiles). Conservation : 3 mois maximum.</p>
        <h2 id="cookies">4. Cookies, stockage local et publicité</h2>
        <p>Nous ne déposons aucun cookie. {ads ? "Ton choix publicitaire est conservé uniquement dans ton navigateur (localStorage, strictement nécessaire, 13 mois maximum) et n’est jamais transmis." : "Rien n’est enregistré dans ton navigateur."}</p>
        <p>{ads ? "La publicité (Google AdSense, Google Ireland Ltd. / Google LLC) n’est chargée" : "Aucune publicité n’est affichée actuellement. Si nous activons Google AdSense, la publicité ne sera chargée"} <strong>qu’après ton consentement explicite</strong> (art. 6, 1, a RGPD). Google peut alors déposer des cookies et transférer des données aux États-Unis (Data Privacy Framework UE-US / Suisse-US). Refuser est aussi simple qu’accepter ; sans choix, rien n’est chargé.{ads && <> Retrait à tout moment : <ConsentReset label="Modifier mon choix" /></>}</p>
        <h2>5. Liens commerciaux (affiliation)</h2>
        <p>Les liens signalés « lien commercial » passent par un réseau partenaire (p. ex. Tradedoubler, Awin, CJ). C’est seulement <strong>après ton clic</strong>, chez le réseau ou le marchand, qu’un cookie peut être déposé pour attribuer une commission ; ils en sont responsables selon leurs propres politiques. Nous recevons uniquement des rapports agrégés, sans donnée te concernant. Le prix ne change pas pour toi.</p>
        <h2>6. Contact par e-mail</h2>
        <p>Si tu nous écris (p. ex. demande de retrait), ton adresse et ton message servent uniquement à traiter la demande et sont supprimés ensuite, sauf obligation légale de conservation.</p>
        <h2>7. Tes droits</h2>
        <p>Accès, rectification, effacement, limitation, portabilité, opposition et retrait du consentement (art. 15 à 21 RGPD ; art. 25 s. LPD) : écris-nous via les coordonnées des <a href={L("impressum")}>mentions légales</a>. Tu peux saisir le PFPDT (Suisse) ou la CNIL (France) / l’autorité de ton pays. Aucune décision automatisée, aucun profilage.</p>
      </section>
    </article>
  );

  if (locale === "en") return (
    <article className="legal">
      <LegalHead locale={locale} title={TITLE} />
      <section id="en">
        <h2>In short</h2>
        <p>{SITE_NAME} needs no account, sets no cookies without your consent and builds no profiles. We follow the Swiss Federal Act on Data Protection (FADP) and, for visitors from the EU/EEA, the GDPR.</p>
        <h2>Controller</h2>
        {controller}
        <h2>1. Hosting and server logs (Cloudflare)</h2>
        <p>The site is hosted by Cloudflare, Inc. (USA) as a processor. On every request Cloudflare processes technically necessary data (IP address, time, requested address, browser identifier) to deliver the page and protect it against attacks. Legal basis: legitimate interest in secure operation (Art. 6(1)(f) GDPR; Art. 31 FADP). Transfer to the USA: EU-US and Swiss-US Data Privacy Framework. We do not store IP addresses ourselves.</p>
        <h2>2. Audience measurement</h2>
        {analytics
          ? <p>We count page views with Cloudflare Web Analytics: <strong>no cookies</strong>, no fingerprinting, no profiles; we only see totals (page, referrer, country, device type). Legal basis: legitimate interest (Art. 6(1)(f) GDPR).</p>
          : <p>There is currently <strong>no audience measurement</strong>: no analytics script is loaded.</p>}
        <h2>3. Anonymous click counter</h2>
        <p>When you click a link to a retailer, we store only the deal identifier and the page — <strong>no IP address, cookie or identifier</strong>. Legal basis: legitimate interest (knowing which sources are useful). Retention: at most 3 months.</p>
        <h2 id="cookies">4. Cookies, local storage and ads</h2>
        <p>We set no cookies. {ads ? "Your ad choice is stored only in your browser (localStorage, strictly necessary, at most 13 months) and is never transmitted." : "Nothing is stored in your browser."}</p>
        <p>{ads ? "Ads (Google AdSense, Google Ireland Ltd. / Google LLC) are loaded" : "No ads are shown at the moment. If we enable Google AdSense, ads will be loaded"} <strong>only after your explicit consent</strong> (Art. 6(1)(a) GDPR). Google may then set cookies and transfer data to the USA (EU-US / Swiss-US Data Privacy Framework). Declining is as easy as accepting; without a choice, nothing is loaded.{ads && <> Withdraw at any time: <ConsentReset label="Change cookie settings" /></>}</p>
        <h2>5. Ad links (affiliate)</h2>
        <p>Links labelled “Ad link” go to the retailer through a partner network (e.g. Tradedoubler, Awin, CJ). Only <strong>after your click</strong>, at the network or retailer, may a cookie be set to attribute a commission; they are responsible for it under their own privacy policies. We only receive aggregated commission reports, never data about you. Your price does not change.</p>
        <h2>6. Contact by e-mail</h2>
        <p>If you write to us (e.g. a removal request), we use your address and message only to handle it and delete them once it is settled, unless the law requires us to keep them.</p>
        <h2>7. Your rights</h2>
        <p>You have the right to access, rectification, erasure, restriction, portability and objection, and to withdraw consent (Art. 15–21 GDPR; Art. 25 ff. FADP): write to us using the details in the <a href={L("impressum")}>imprint</a>. You can also complain to the FDPIC (Switzerland, <a href="https://www.edoeb.admin.ch" rel="noopener noreferrer">edoeb.admin.ch</a>) or the data protection authority of your EU country. No automated individual decisions, no profiling.</p>
      </section>
    </article>
  );

  return (
    <article className="legal">
      <LegalHead locale={locale} title={TITLE} />
      <section id="de">
        <h2>Kurz gesagt</h2>
        <p>{SITE_NAME} braucht kein Konto, setzt ohne deine Einwilligung keine Cookies und erstellt keine Profile. Wir halten uns an das Schweizer Datenschutzgesetz (DSG) und, für Besucher aus der EU/dem EWR, an die DSGVO.</p>
        <h2>Verantwortlicher</h2>
        {controller}
        <h2>1. Hosting und Server-Logs (Cloudflare)</h2>
        <p>Die Website läuft bei Cloudflare, Inc. (USA) als Auftragsverarbeiter. Bei jedem Aufruf verarbeitet Cloudflare technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser-Kennung), um die Seite auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage: berechtigtes Interesse an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO; Art. 31 DSG). Übermittlung in die USA: EU-US und Swiss-US Data Privacy Framework (DPF). Wir selbst speichern keine IP-Adressen.</p>
        <h2>2. Reichweitenmessung</h2>
        {analytics
          ? <p>Wir zählen Seitenaufrufe mit Cloudflare Web Analytics. Es werden <strong>keine Cookies</strong> gesetzt, kein Fingerprinting betrieben und keine Profile erstellt; wir sehen nur zusammengefasste Zahlen (Seite, Herkunftsseite, Land, Gerätetyp). Rechtsgrundlage: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).</p>
          : <p>Derzeit findet <strong>keine Reichweitenmessung</strong> statt: Es wird kein Analyse-Skript geladen.</p>}
        <h2>3. Anonymer Klickzähler</h2>
        <p>Klickst du auf einen Link zu einem Händler, speichern wir nur die Deal-Kennung und die aufgerufene Seite — <strong>ohne IP-Adresse, Cookie oder Kennung</strong>. Rechtsgrundlage: berechtigtes Interesse (welche Quellen nützlich sind). Speicherdauer: höchstens 3 Monate (Cloudflare Workers Analytics Engine).</p>
        <h2 id="cookies">4. Cookies, lokaler Speicher und Werbung</h2>
        <p>Wir setzen selbst keine Cookies. {ads ? "Deine Werbe-Entscheidung wird nur lokal in deinem Browser gespeichert (localStorage, technisch notwendig, höchstens 13 Monate) und nicht übertragen." : "In deinem Browser wird nichts gespeichert."}</p>
        <p>{ads ? "Werbung (Google AdSense, Google Ireland Ltd. / Google LLC) wird" : "Derzeit wird keine Werbung angezeigt. Falls wir Werbung (Google AdSense) aktivieren, wird sie"} <strong>nur nach deiner ausdrücklichen Einwilligung</strong> geladen (Art. 6 Abs. 1 lit. a DSGVO). Google kann dann Cookies setzen und Daten in die USA übermitteln (EU-US/Swiss-US Data Privacy Framework). Ablehnen ist genauso einfach wie Zustimmen; ohne Entscheidung wird nichts geladen.{ads && <> Du kannst deine Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen: <ConsentReset label="Cookie-Einstellungen ändern" /></>}</p>
        <h2>5. Werbelinks (Affiliate)</h2>
        <p>Als «Werbelink» beschriftete Links führen über ein Partnernetzwerk (z. B. Tradedoubler, Awin, CJ) zum Händler. Erst <strong>nach deinem Klick</strong>, also beim Netzwerk bzw. Händler, kann ein Cookie gesetzt werden, um eine Provision zuzuordnen. Dafür sind das Netzwerk und der Händler verantwortlich; es gelten deren Datenschutzerklärungen. Wir erhalten nur zusammengefasste Provisionsberichte, keine Angaben zu deiner Person. Der Preis ändert sich für dich nicht.</p>
        <h2>6. Kontakt per E-Mail</h2>
        <p>Schreibst du uns (z. B. eine Entfernungsanfrage), verwenden wir deine E-Mail-Adresse und Nachricht nur zur Bearbeitung und löschen sie, wenn die Sache erledigt ist, ausser eine gesetzliche Aufbewahrungspflicht verlangt etwas anderes.</p>
        <h2>7. Deine Rechte</h2>
        <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie auf Widerruf einer Einwilligung (Art. 15–21 DSGVO; Art. 25 ff. DSG). Schreib uns dazu über die Kontaktangaben im <a href={L("impressum")}>Impressum</a>. Du kannst dich ausserdem beim EDÖB (Schweiz, <a href="https://www.edoeb.admin.ch" rel="noopener noreferrer">edoeb.admin.ch</a>) oder bei der Datenschutzbehörde deines EU-Landes beschweren (Frankreich: <a href="https://www.cnil.fr" rel="noopener noreferrer">CNIL</a>).</p>
        <p>Es gibt keine automatisierte Einzelentscheidung und kein Profiling.</p>
      </section>
    </article>
  );
}
