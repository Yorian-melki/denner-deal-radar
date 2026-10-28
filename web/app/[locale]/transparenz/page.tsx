import { LegalHead, legalMetadata, type Tri } from "@/components/Legal";
import { activeProgrammes } from "@/lib/affiliate/rewrite";
import { fmtPct, fmtScore } from "@/lib/format";
import { dict, type Locale } from "@/lib/i18n";
import { PAGE_MIN_SCORE, SCORE_CAP, VERIFY_MIN_CONFIDENCE } from "@/lib/project";
import { HOME_MIN_SCORE, HOME_MIN_SECTION, HISTORY_MIN_OBSERVATIONS, MIN_CONFIDENCE_TOP, PER_BRAND, PER_MERCHANT, TOP_N } from "@/lib/select";
import { PAGE_SIZE } from "@/components/CategoryListing";
import { paths } from "@/lib/site";

const TITLE: Tri = { de: "Methode & Transparenz", fr: "Méthode et transparence", en: "Method & transparency" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return legalMetadata((await params).locale, "transparenz", TITLE, {
    index: true,
    description: {
      de: "Wie die Bewertung entsteht, wie sortiert wird und wie wir Geld verdienen – mit allen Regeln und Zahlen.",
      fr: "Comment la note est calculée, comment le classement est établi et comment nous gagnons de l’argent – toutes les règles et tous les chiffres.",
      en: "How the score is built, how ranking works and how we make money – every rule and number.",
    },
  });
}

/** Toutes les règles citées ici sont lues dans le code (lib/select.ts, lib/project.ts) :
 * la page ne peut pas diverger de ce que le site fait réellement. */
// LAWYER-CHECK : art. 3 al. 1 let. b/i LCD (indications fausses, publicité non signalée)
// et art. L.121-1 s. / L.111-7 Code de la consommation (FR : classement, publicité
// clairement identifiée, critères de classement des plateformes en ligne).
export default async function Transparenz({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = dict(locale);
  const L = (p: string) => paths.page(locale, p);
  const pct = (v: number) => fmtPct(v * 100, locale);
  const sc = (v: number) => fmtScore(v, locale);
  const active = activeProgrammes();
  const tiers: [string, string][] = [
    [`≥ ${sc(8.5)}`, t.scoreTiers.top],
    [`≥ ${sc(7)}`, t.scoreTiers.great],
    [`≥ ${sc(5.5)}`, t.scoreTiers.good],
    [`≥ ${sc(4)}`, t.scoreTiers.ok],
    [`< ${sc(4)}`, t.scoreTiers.weak],
  ];
  const c = {
    de: {
      h1: "Wie die Bewertung entsteht",
      p1: <>Jede Aktion erhält eine Bewertung von 0 bis 10. Sie misst die <strong>belegte Ersparnis</strong> gegenüber einem Vergleichspreis und stammt aus unserem Scanner; die folgenden Regeln kommen danach, und sie können eine Bewertung nur senken, nie erhöhen.</>,
      rules: [
        <>Ein Preis wird nur dann «statt» einem anderen angezeigt, mit Ersparnis in Franken und Prozent, wenn der Vergleichspreis ein <strong>tatsächlich verlangter Preis</strong> ist (früherer Preis beim selben Shop, Preis bei einem anderen Händler, beobachteter Marktpreis), die Aktion unsere Plausibilitätsprüfung besteht und die Datenqualität mindestens {pct(VERIFY_MIN_CONFIDENCE)} beträgt.</>,
        <>Ist der Vergleichspreis eine Angabe des Anbieters (UVP, Katalogpreis, angegebener Warenwert), zeigen wir ihn neutral als «Preisangabe des Anbieters» und begrenzen die Bewertung auf {sc(SCORE_CAP)} (höchstens «gut»).</>,
        <>Ohne belegten Vergleichspreis bleibt die Bewertung ebenfalls bei höchstens {sc(SCORE_CAP)}. Nennt der Anbieter nur einen Prozentsatz, gibt es <strong>keine Bewertung</strong> («Rabatt laut Anbieter»).</>,
        <>Keine Bewertung auch bei unplausiblen Rabatten (meist Datenfehler) und wenn der Preis nicht zur Menge im Titel passt (mehr als 5 % Abweichung vom Grundpreis).</>,
        <>Ist eine «Aktion» teurer als der übliche Preis, steht das auf der Karte («teurer als üblich»).</>,
        <>Einen Preisverlauf zeigen wir erst ab {HISTORY_MIN_OBSERVATIONS} Beobachtungen.</>,
      ],
      tiersTitle: "Stufen",
      h2: "Wie die Reihenfolge entsteht",
      order: [
        <>Sortiert wird nach Bewertung, dann nach belegtem Rabatt. Nicht bewertete Angebote stehen am Ende.</>,
        <>Bestenliste: höchstens {TOP_N} Karten, nur Bewertungen über 0 mit Datenqualität ab {pct(MIN_CONFIDENCE_TOP)}, höchstens {PER_MERCHANT} pro Shop und {PER_BRAND} pro Marke, höchstens ein Drittel aus derselben Kategorie (nur gelockert, wenn sonst Plätze leer blieben). Dienstleistungen sind ausgeschlossen.</>,
        <>Startseite: nur Bewertungen ab {sc(HOME_MIN_SCORE)}; eine Kategorie erscheint erst ab {HOME_MIN_SECTION} Karten.</>,
        <>Studentenrabatte, Gratis-Angebote und Gutscheine haben keine Bewertung (die Prozente stammen von den Anbietern): Sie stehen <strong>neueste zuerst</strong>, höchstens {PER_MERCHANT} pro Shop.</>,
        <>Handy- und Internet-Abos sind nach <strong>Gesamtkosten über 24 Monate</strong> sortiert (Aktionspreis, Folgepreis, Aufschaltgebühr).</>,
        <>Dieselbe Aktion in mehreren Sorten zählt einmal («+2 Sorten»); dasselbe Produkt in mehreren Shops ebenfalls («auch bei 2 weiteren Shops»).</>,
        <>Kategorien zeigen {PAGE_SIZE} Angebote pro Seite. Eigene Detailseiten gibt es ab Bewertung {sc(PAGE_MIN_SCORE)}.</>,
        <><strong>Platzierungen sind nicht käuflich.</strong> Ob ein Link eine Provision bringt, fliesst nicht in Bewertung oder Reihenfolge ein; ein automatischer Test prüft, dass die Reihenfolge mit und ohne Partnerprogramme identisch ist.</>,
      ],
      h3: "Wie wir Geld verdienen",
      money: [
        <><strong>Werbelinks</strong> sind sichtbar als «Werbelink» beschriftet und technisch als <code>rel=&quot;sponsored&quot;</code> markiert. Kaufst du darüber ein, erhalten wir ggf. eine Provision; dein Preis ändert sich nicht.</>,
        <><strong>Anzeigen</strong> (falls aktiviert) sind als «Anzeige» beschriftet, stehen nie in einer Rangliste und laden erst nach deiner Einwilligung (<a href={`${L("datenschutz")}#cookies`}>Datenschutz</a>).</>,
        <><strong>Bezahlte Platzierungen</strong> gibt es nicht.</>,
      ],
      active: (n: string) => `Aktive Partnerprogramme: ${n}`,
      none: "keine",
      h4: "Quellen und Fehler",
      sources: <>Wir lesen nur öffentlich zugängliche Seiten und Feeds und verlinken immer auf die Quelle; massgebend ist die Seite des Anbieters. Führt ein Link zu einer Sammelseite statt zum Händler, steht das auf der Karte («gefunden über …»). Liste und Entfernungsanfragen: <a href={L("quellen")}>Quellen</a>. Fehler gefunden? Kontakt im <a href={L("impressum")}>Impressum</a>.</>,
    },
    fr: {
      h1: "Comment la note est calculée",
      p1: <>Chaque action reçoit une note de 0 à 10. Elle mesure l’<strong>économie établie</strong> par rapport à un prix de comparaison et vient de notre scanner ; les règles ci-dessous s’appliquent ensuite et ne peuvent que baisser une note, jamais l’augmenter.</>,
      rules: [
        <>Un prix n’est affiché « au lieu de » un autre, avec l’économie en francs et en pourcentage, que si le prix de comparaison est un <strong>prix réellement pratiqué</strong> (ancien prix du même magasin, prix chez un autre commerçant, prix de marché observé), que l’action passe notre contrôle de cohérence et que la qualité des données atteint au moins {pct(VERIFY_MIN_CONFIDENCE)}.</>,
        <>Si le prix de comparaison est une indication du vendeur (prix conseillé, catalogue, valeur déclarée), nous l’affichons sobrement (« prix indiqué par le vendeur ») et limitons la note à {sc(SCORE_CAP)} (« bien » au maximum).</>,
        <>Sans prix de comparaison établi, la note reste aussi à {sc(SCORE_CAP)} au maximum. Si le vendeur n’annonce qu’un pourcentage, il n’y a <strong>pas de note</strong> (« selon le vendeur »).</>,
        <>Pas de note non plus pour une remise invraisemblable (souvent une erreur de données) ou un prix qui ne correspond pas à la quantité du titre (écart de plus de 5 % avec le prix unitaire).</>,
        <>Si une « action » est plus chère que le prix habituel, la carte le dit (« plus cher que d’habitude »).</>,
        <>L’historique des prix n’est affiché qu’à partir de {HISTORY_MIN_OBSERVATIONS} relevés.</>,
      ],
      tiersTitle: "Paliers",
      h2: "Comment le classement est établi",
      order: [
        <>Tri par note, puis par remise établie. Les offres sans note sont en fin de liste.</>,
        <>Meilleures notes : au plus {TOP_N} cartes, seulement des notes supérieures à 0 avec une qualité de données d’au moins {pct(MIN_CONFIDENCE_TOP)}, au plus {PER_MERCHANT} par magasin et {PER_BRAND} par marque, au plus un tiers d’une même catégorie (assoupli seulement s’il resterait des places vides). Les prestations de service sont exclues.</>,
        <>Accueil : seulement des notes d’au moins {sc(HOME_MIN_SCORE)} ; une catégorie n’apparaît qu’à partir de {HOME_MIN_SECTION} cartes.</>,
        <>Réductions étudiantes, offres gratuites et codes promo n’ont pas de note (les pourcentages viennent des vendeurs) : elles sont classées <strong>de la plus récente à la plus ancienne</strong>, au plus {PER_MERCHANT} par magasin.</>,
        <>Les abonnements mobile et internet sont triés par <strong>coût total sur 24 mois</strong> (prix promo, prix ensuite, frais de mise en service).</>,
        <>Une même action en plusieurs variétés compte une fois (« +2 variétés ») ; un même produit dans plusieurs magasins aussi (« aussi dans 2 autres magasins »).</>,
        <>Les catégories affichent {PAGE_SIZE} offres par page. Une page détaillée existe à partir d’une note de {sc(PAGE_MIN_SCORE)}.</>,
        <><strong>Aucune place n’est payante.</strong> Qu’un lien rapporte une commission n’entre ni dans la note ni dans l’ordre ; un test automatique vérifie que l’ordre est identique avec et sans programmes partenaires.</>,
      ],
      h3: "Comment nous gagnons de l’argent",
      money: [
        <><strong>Les liens commerciaux</strong> sont signalés en clair (« lien commercial ») et balisés <code>rel=&quot;sponsored&quot;</code>. Si tu achètes par ce lien, nous pouvons toucher une commission ; ton prix ne change pas.</>,
        <><strong>Les publicités</strong> (si activées) sont signalées « publicité », jamais placées dans un classement, et ne se chargent qu’avec ton accord (<a href={`${L("datenschutz")}#cookies`}>confidentialité</a>).</>,
        <><strong>Placements payants</strong> : aucun.</>,
      ],
      active: (n: string) => `Programmes partenaires actifs : ${n}`,
      none: "aucun",
      h4: "Sources et erreurs",
      sources: <>Nous ne lisons que des pages et flux publics et renvoyons toujours vers la source ; seule la page du vendeur fait foi. Si un lien mène à un agrégateur plutôt qu’au commerçant, la carte l’indique (« trouvé via … »). Liste et demandes de retrait : <a href={L("quellen")}>sources</a>. Une erreur ? Contact dans les <a href={L("impressum")}>mentions légales</a>.</>,
    },
    en: {
      h1: "How the score is built",
      p1: <>Every deal gets a score from 0 to 10. It measures the <strong>documented saving</strong> against a comparison price and comes from our scanner; the rules below are applied afterwards and can only lower a score, never raise it.</>,
      rules: [
        <>A price is shown “instead of” another, with the saving in francs and percent, only if the comparison price is a <strong>price actually charged</strong> (previous price at the same shop, price at another retailer, observed market price), the deal passes our consistency check and data quality is at least {pct(VERIFY_MIN_CONFIDENCE)}.</>,
        <>If the comparison price is the seller’s own figure (RRP, catalogue price, stated value), we show it neutrally (“seller’s stated price”) and cap the score at {sc(SCORE_CAP)} (“good” at most).</>,
        <>Without a documented comparison price the score is also capped at {sc(SCORE_CAP)}. If the seller only states a percentage, there is <strong>no score</strong> (“according to the seller”).</>,
        <>No score either for implausible discounts (usually a data error) or when the price does not match the quantity in the title (more than 5% off the unit price).</>,
        <>If a “deal” costs more than the usual price, the card says so (“pricier than usual”).</>,
        <>Price history is shown only from {HISTORY_MIN_OBSERVATIONS} observations.</>,
      ],
      tiersTitle: "Tiers",
      h2: "How ranking works",
      order: [
        <>Sorted by score, then by documented discount. Unrated offers come last.</>,
        <>Top list: at most {TOP_N} cards, only scores above 0 with data quality of at least {pct(MIN_CONFIDENCE_TOP)}, at most {PER_MERCHANT} per shop and {PER_BRAND} per brand, at most a third from one category (relaxed only if places would otherwise stay empty). Services are excluded.</>,
        <>Home page: only scores of at least {sc(HOME_MIN_SCORE)}; a category appears only with {HOME_MIN_SECTION} or more cards.</>,
        <>Student discounts, freebies and coupons have no score (the percentages come from the sellers): they are listed <strong>newest first</strong>, at most {PER_MERCHANT} per shop.</>,
        <>Mobile and internet plans are sorted by <strong>total cost over 24 months</strong> (promo price, follow-up price, activation fee).</>,
        <>The same deal in several varieties counts once (“+2 varieties”); the same product at several shops too (“also at 2 other shops”).</>,
        <>Categories show {PAGE_SIZE} offers per page. Detail pages exist from a score of {sc(PAGE_MIN_SCORE)}.</>,
        <><strong>Placement cannot be bought.</strong> Whether a link earns a commission never enters the score or the order; an automated test checks that the order is identical with and without partner programmes.</>,
      ],
      h3: "How we make money",
      money: [
        <><strong>Ad links</strong> are visibly labelled “Ad link” and technically marked <code>rel=&quot;sponsored&quot;</code>. If you buy through one, we may earn a commission; your price does not change.</>,
        <><strong>Ads</strong> (if enabled) are labelled “Advertisement”, never placed inside a ranking, and only load after your consent (<a href={`${L("datenschutz")}#cookies`}>privacy</a>).</>,
        <><strong>Paid placements</strong>: none.</>,
      ],
      active: (n: string) => `Active partner programmes: ${n}`,
      none: "none",
      h4: "Sources and errors",
      sources: <>We only read public pages and feeds and always link to the source; the seller’s page is authoritative. If a link leads to an aggregator rather than the retailer, the card says so (“found via …”). List and removal requests: <a href={L("quellen")}>sources</a>. Found an error? Contact details in the <a href={L("impressum")}>imprint</a>.</>,
    },
  }[locale];
  return (
    <article className="legal">
      <LegalHead locale={locale} title={TITLE} />
      <h2 id="bewertung">{c.h1}</h2>
      <p>{c.p1}</p>
      <ul>{c.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
      <h3>{c.tiersTitle}</h3>
      <dl className="facts facts-compact">
        {tiers.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <h2 id="reihenfolge">{c.h2}</h2>
      <ul>{c.order.map((r, i) => <li key={i}>{r}</li>)}</ul>
      <h2 id="provision">{c.h3}</h2>
      <ul>{c.money.map((r, i) => <li key={i}>{r}</li>)}</ul>
      <p className="muted">{c.active(active.length ? active.join(", ") : c.none)}</p>
      <h2 id="quellen">{c.h4}</h2>
      <p>{c.sources}</p>
    </article>
  );
}
