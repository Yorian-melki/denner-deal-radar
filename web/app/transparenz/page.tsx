import { activeProgrammes } from "@/lib/affiliate/rewrite";

export const metadata = { title: "Transparenz: Wie wir Geld verdienen und bewerten" };

export default function Transparenz() {
  const active = activeProgrammes();
  return (
    <article className="legal">
      <h1>Transparenz</h1>
      <h2>Wie die Note entsteht</h2>
      <p>Jede Aktion erhält eine absolute Note von 0 bis 10, berechnet aus der echten Ersparnis gegenüber einem überprüfbaren Referenzpreis (früherer Preis desselben Händlers, Marktpreis, beobachtete Preishistorie). Aufgeblasene «statt»-Preise werden korrigiert. Ohne überprüfbaren Referenzpreis gibt es keine Note.</p>
      <h2>Wie wir Geld verdienen</h2>
      <p>Einige Links sind Werbelinks (mit * markiert): Kaufst du darüber ein, erhalten wir ggf. eine Provision vom Händler. <strong>Die Provision hat keinen Einfluss auf Note oder Reihenfolge</strong> — die Sortierung ist rein nach Note. Eventuell zeigen wir zusätzlich klar als «Anzeige» gekennzeichnete Werbung.</p>
      <p className="muted">Aktive Partnerprogramme: {active.length ? active.join(", ") : "keine"}.</p>
      <h2>Quellen</h2>
      <p>Wir lesen nur öffentlich zugängliche Seiten und Feeds, respektieren robots.txt und Crawl-Delays, und verlinken immer auf die Originalquelle.</p>
    </article>
  );
}
