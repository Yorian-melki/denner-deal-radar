import Link from "next/link";
import { activeProgrammes } from "@/lib/affiliate/rewrite";
import { LEGAL_REVISION } from "../impressum/operator";

export const metadata = { title: "Transparenz: Wie wir bewerten und Geld verdienen" };

// LAWYER-CHECK : art. 3 al. 1 let. b/i LCD (indications fausses, publicité non signalée)
// et art. L.121-1 s. / L.111-7 Code de la consommation (FR : classement, publicité
// clairement identifiée, critères de classement des plateformes en ligne).
export default function Transparenz() {
  const active = activeProgrammes();
  const list = active.length ? active.join(", ") : null;
  return (
    <article className="legal">
      <h1>Transparenz · Transparence</h1>
      <p className="muted"><a href="#de">Deutsch</a> · <a href="#fr">Français</a> · Stand / version : {LEGAL_REVISION}</p>

      <section id="de" lang="de">
        <h2>Wie die Note entsteht</h2>
        <p>Jede Aktion erhält eine absolute Note von 0 bis 10. Sie misst die <strong>echte Ersparnis</strong> gegenüber einem überprüfbaren Referenzpreis: früherer Preis desselben Händlers, Marktpreis bei anderen Händlern oder die von uns beobachtete Preisgeschichte. Aufgeblasene «statt»-Preise werden korrigiert. Ohne überprüfbaren Referenzpreis gibt es <strong>keine Note</strong> (–). Unplausible Rabatte (z. B. über 80 % bei Lebensmitteln, meist ein Datenfehler) werden ebenfalls nicht benotet.</p>
        <h2>Wie die Reihenfolge entsteht</h2>
        <p>Sortiert wird <strong>nur nach Note</strong>, dann nach Rabatt; nicht benotete Aktionen stehen am Ende. <strong>Platzierungen sind nicht käuflich</strong>: Kein Händler kann für eine bessere Note oder Position bezahlen, und eine Provision hat keinen Einfluss auf Note oder Reihenfolge.</p>
        <h2>Wie wir Geld verdienen</h2>
        <ul>
          <li><strong>Werbelinks (Affiliate)</strong>, mit * markiert und technisch als <code>rel=&quot;sponsored&quot;</code> gekennzeichnet: Kaufst du darüber ein, erhalten wir ggf. eine Provision vom Händler. Der Preis ändert sich für dich nicht. Ob ein Link ein Werbelink ist, hängt nur davon ab, ob der Händler ein Partnerprogramm hat — nicht von der Note.</li>
          <li><strong>Anzeigen</strong> (falls aktiviert): immer klar als «Anzeige» beschriftet, getrennt von der Deal-Liste, und nur nach deiner Einwilligung (<Link href="/datenschutz#cookies">Datenschutz</Link>).</li>
          <li><strong>Gesponserte Inhalte</strong> gibt es derzeit nicht. Sollte es sie je geben, werden sie deutlich als «Gesponsert» markiert und nie in die benotete Rangliste gemischt.</li>
        </ul>
        <p className="muted">Aktive Partnerprogramme: {list ?? "keine"}.</p>
        <h2>Quellen und Fehler</h2>
        <p>Wir lesen nur öffentlich zugängliche Seiten und Feeds, respektieren robots.txt und verlinken immer auf die Originalquelle; massgebend ist immer die Seite des Anbieters. Liste und Entfernungsanfragen: <Link href="/quellen">Quellen</Link>. Einen Preisfehler gefunden? Schreib uns (siehe <Link href="/impressum">Impressum</Link>).</p>
      </section>

      <section id="fr" lang="fr">
        <h2>Comment la note est calculée</h2>
        <p>Chaque offre reçoit une note absolue de 0 à 10 qui mesure l’<strong>économie réelle</strong> par rapport à un prix de référence vérifiable (ancien prix du même marchand, prix du marché, historique de prix observé). Les prix « barrés » gonflés sont corrigés. Sans référence vérifiable : <strong>pas de note</strong> (–). Les remises invraisemblables (souvent une erreur de données) ne sont pas notées.</p>
        <h2>Comment le classement est établi</h2>
        <p>Tri <strong>uniquement par note</strong>, puis par remise ; les offres sans note sont en fin de liste. <strong>Aucune place n’est payante</strong> : aucun marchand ne peut payer pour une meilleure note ou position, et les commissions n’ont aucune influence.</p>
        <h2>Comment nous gagnons de l’argent</h2>
        <ul>
          <li><strong>Liens affiliés</strong>, marqués * et balisés <code>rel=&quot;sponsored&quot;</code> : en cas d’achat, le marchand peut nous verser une commission ; votre prix ne change pas.</li>
          <li><strong>Publicités</strong> (si activées) : toujours signalées « Anzeige / Publicité », séparées des offres, et seulement avec votre consentement.</li>
          <li><strong>Contenu sponsorisé</strong> : aucun aujourd’hui ; s’il y en a un jour, il sera clairement marqué « sponsorisé » et jamais mêlé au classement noté.</li>
        </ul>
        <p className="muted">Programmes partenaires actifs : {list ?? "aucun"}.</p>
        <h2>Sources et erreurs</h2>
        <p>Seules des pages et flux publics sont lus, robots.txt est respecté, la source est toujours liée et fait foi. Liste et demandes de retrait : <Link href="/quellen#fr">sources</Link>. Une erreur de prix ? Écrivez-nous (voir <Link href="/impressum#fr">mentions légales</Link>).</p>
      </section>
    </article>
  );
}
