import { ConsentReset } from "@/components/Consent";

export const metadata = { title: "Datenschutz", robots: { index: false } };

export default function Datenschutz() {
  return (
    <article className="legal">
      <h1>Datenschutzerklärung</h1>
      <p>Wir halten uns an das Schweizer Datenschutzgesetz (DSG/nDSG) und, für Besucher aus der EU, an die DSGVO.</p>
      <h2>Reichweitenmessung</h2>
      <p>Wir nutzen Vercel Web Analytics. Es werden keine Cookies gesetzt und keine personenbezogenen Profile erstellt; erfasst werden anonymisierte Seitenaufrufe und Klicks auf ausgehende Links.</p>
      <h2>Werbung</h2>
      <p>Falls Werbung (Google AdSense) aktiviert ist, wird sie nur nach deiner Einwilligung geladen. Google kann dabei Cookies setzen und Daten in Drittländer übermitteln. Du kannst deine Einwilligung jederzeit widerrufen: <ConsentReset /></p>
      <h2>Werbelinks (Affiliate)</h2>
      <p>Mit * markierte Links führen über ein Partnernetzwerk zum Händler. Das Netzwerk setzt dabei ggf. ein eigenes Cookie, um eine Provision zuzuordnen. Der Preis ändert sich für dich nicht.</p>
      <h2>Hosting</h2>
      <p>Die Website wird bei Vercel Inc. gehostet; dabei werden technisch notwendige Server-Logs verarbeitet.</p>
      <h2>Kontakt</h2>
      <p>Siehe <a href="/impressum">Impressum</a>.</p>
    </article>
  );
}
