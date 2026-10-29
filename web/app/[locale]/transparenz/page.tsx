import { LegalHead, legalMetadata, type Tri } from "@/components/Legal";
import { activeProgrammes } from "@/lib/affiliate/rewrite";
import { fmtPct, fmtScore } from "@/lib/format";
import { dict, type Locale } from "@/lib/i18n";
import { BADGE_MIN_SCORE, OBSERVED_MAX_GAP, OBSERVED_MIN_N, SCORE_CAP, STORE_CLOSING_HOUR, VERIFY_MIN_CONFIDENCE } from "@/lib/project";
import {
  HOME_MIN_SCORE, HOME_MIN_SECTION, HISTORY_MIN_OBSERVATIONS, MARKDOWN_MAX_PCT_WITHOUT_UNIT, MARKDOWN_MIN_SHOWN, MARKDOWN_N, MARKDOWN_N_MOBILE, MARKDOWN_PER_STORE,
  MIN_CONFIDENCE_TOP, PER_BRAND, PER_MERCHANT, SECTION_N, TOP_MIN_SCORE, TOP_MIN_SHOWN, TOP_N,
} from "@/lib/select";
import { ALCOHOL_FREE_TOP, MAX_RUN, PAGE_SIZE } from "@/components/CategoryListing";
import { getDeals } from "@/lib/data";
import { paths } from "@/lib/site";
import { operator } from "@/lib/operator";

const TITLE: Tri = { de: "Methode & Transparenz", fr: "Méthode et transparence", en: "Method & transparency" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return legalMetadata((await params).locale, "transparenz", TITLE, {
    index: true,
    description: {
      de: "Wie die Bewertung entsteht, wie sortiert wird und wie wir Geld verdienen – mit allen Regeln und Zahlen.",
      fr: "Comment la note est calculée, comment se fait le classement et comment nous gagnons de l’argent – toutes les règles et tous les chiffres.",
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
  // « Am besten bewertet » n'est décrit que s'il peut s'afficher (un Statt-Preis confirmé par nos relevés, round 4, item 3).
  const topPossible = (await getDeals()).deals.some((d) => d.refObserved && (d.score ?? 0) >= TOP_MIN_SCORE);
  // Aucune promesse de contact tant qu'aucune adresse n'est publiée (round 3, item 26).
  const contact = !!operator().email;
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
      p1: <>Jede Aktion erhält eine Bewertung von 0 bis 10. Sie misst die Ersparnis gegenüber einem Vergleichspreis und stammt aus unserem Scanner; die folgenden Regeln kommen danach, und sie können eine Bewertung nur senken, nie erhöhen.</>,
      rules: [
        <>Ein Preis wird nur dann «statt» einem anderen angezeigt, mit Ersparnis in Franken und Prozent, wenn der Händler einen <strong>früher verlangten Preis</strong> (oder einen Konkurrenzpreis) angibt, nichts in unseren Daten dagegen spricht und die Datenqualität mindestens {pct(VERIFY_MIN_CONFIDENCE)} beträgt. Dieser «Statt-Preis» ist die <strong>Angabe des Händlers</strong>, nicht unsere Prüfung: Wir schreiben «laut Händler». «Von uns beobachtet» steht nur, wenn mindestens {OBSERVED_MIN_N} eigene Preisbeobachtungen höchstens {pct(OBSERVED_MAX_GAP)} vom Statt-Preis abweichen.</>,
        <>Eine Bewertung zeigen wir <strong>nur neben dem Statt-Preis</strong>, auf dem sie beruht. Solange unsere eigenen Beobachtungen den Statt-Preis nicht bestätigen, ist sie auf {sc(SCORE_CAP)} begrenzt (höchstens «gut»). Dann schreiben wir «unter dem Statt-Preis von …», nie «günstiger als zuvor».</>,
        <>Ist der Vergleichspreis eine Angabe des Anbieters (UVP, Katalogpreis, Warenwert), zeigen wir ihn neutral als «Preisangabe des Anbieters». Eine Bewertung gibt es dann <strong>nicht</strong>.</>,
        <>Keine Bewertung auch bei zu wenig verlässlichen Daten (unter {pct(VERIFY_MIN_CONFIDENCE)}), bei einem nicht angezeigten Konkurrenzpreis und bei reinen Prozentangaben («laut Anbieter»). Eine Bewertung von 0 zeigen wir nie. Unter {sc(BADGE_MIN_SCORE)} zeigen wir keine Zahl, nur Preis und Händler.</>,
        <>Keine Bewertung auch bei unplausiblen Rabatten (meist Datenfehler) und wenn der Preis nicht zur Menge im Titel passt (mehr als 5 % Abweichung vom Grundpreis).</>,
        <>Ist eine «Aktion» gleich teuer oder teurer als der Preis, den wir sonst beobachten, ist sie kein Angebot: Wir zeigen sie <strong>nicht</strong>.</>,
        <>Einen Preisverlauf zeigen wir erst ab {HISTORY_MIN_OBSERVATIONS} Beobachtungen.</>,
      ],
      tiersTitle: "Stufen",
      h2: "Wie die Reihenfolge entsteht",
      order: [
        <>Angebote mit sichtbarem Statt-Preis stehen <strong>immer zuerst</strong>, nach der angezeigten Bewertung (nur wenn unsere Beobachtungen den Statt-Preis bestätigen), dann nach Rabatt in Prozent, dann nach Ersparnis pro Kilo oder Liter (nicht nach Franken: ein Weinkarton überholt so nie −50 % auf Wasser). Danach folgen die übrigen Angebote, neueste zuerst. Aktionen, die erst später beginnen, stehen am Ende. Nie mehr als {MAX_RUN} Karten desselben Ladens hintereinander, solange ein anderer Laden folgen kann. Über jeder Liste steht, wie sie sortiert ist.</>,
        <>«Grösste Rabatte – laut Händler» (Stadtseite, oben): die {MARKDOWN_N} Aktionen ({MARKDOWN_N_MOBILE} auf dem Handy) mit dem höchsten Rabatt in Prozent unter dem <strong>früheren Preis laut Händler</strong> — weder UVP noch Konkurrenzpreis, von uns nicht bestätigt. Höchstens {MARKDOWN_PER_STORE} pro Laden und pro Marke, ohne Alkohol, ohne Bedingung wie Kundenkarte, App oder Mindestmenge, Datenqualität ab {pct(MIN_CONFIDENCE_TOP)}, Supermarkt nur mit bekannter Menge; über {fmtPct(MARKDOWN_MAX_PCT_WITHOUT_UNIT, locale)} nur mit Grundpreis. Unter {MARKDOWN_MIN_SHOWN} Karten entfällt der Block.</>,
        ...(topPossible ? [<>«Am besten bewertet»: höchstens {TOP_N} Karten, ohne Auffüllen — nur mit Statt-Preis des Händlers, Bewertung ab {sc(TOP_MIN_SCORE)}, Datenqualität ab {pct(MIN_CONFIDENCE_TOP)}, höchstens {PER_MERCHANT} pro Shop und {PER_BRAND} pro Marke, höchstens ein Drittel aus derselben Kategorie. Sind es weniger als {TOP_MIN_SHOWN}, entfällt die Liste. Nicht dabei: Aktionen, die erst morgen beginnen, und Ladenaktionen am letzten Tag nach {STORE_CLOSING_HOUR}:00 Uhr. Dienstleistungen sind ausgeschlossen.</>] : []),
        <>Stadtseite: danach Rubriken mit je {SECTION_N} Karten. Zuerst die Rubriken mit den meisten sichtbaren Statt-Preisen (Bewertung ab {sc(HOME_MIN_SCORE)}), dann Studis, Gratis zuletzt. Eine Rubrik erscheint erst ab {HOME_MIN_SECTION} Karten. Alle anderen Kategorien über die Leiste oben.</>,
        <>Studentenrabatte sind nach dem <strong>Rabatt laut Anbieter</strong> sortiert, dann nach Enddatum. Gratis-Angebote und Gutscheine stehen <strong>neueste zuerst</strong>. Auf der Stadtseite höchstens {PER_MERCHANT} pro Shop.</>,
        <>Handy- und Internet-Abos sind nach <strong>Gesamtkosten über 24 Monate</strong> sortiert (Aktionspreis, Folgepreis, Aufschaltgebühr).</>,
        <>Dieselbe Aktion in mehreren Sorten zählt einmal («+2 Sorten»); dasselbe Produkt in mehreren Shops ebenfalls («auch bei 2 weiteren Shops»).</>,
        <>Kategorien zeigen {PAGE_SIZE} Angebote pro Seite. Jede Karte führt auf eine eigene Detailseite; erst dort führt ein Knopf (in neuem Tab) zum Anbieter.</>,
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
      hidden: "Was wir nicht zeigen",
      hiddenList: [
        <>Angebote, die die Nutzungsbedingungen eines Dienstes umgehen (z. B. Abos «über Bulgarien», VPN-Tricks).</>,
        <>«Aktionen», deren Preis gleich hoch oder höher ist als der übliche Preis, den wir beobachtet haben.</>,
        <>Begleit-, Erotik- und Erwachsenenmarken erscheinen nie auf der Stadtseite, bei Studis, bei Gratis oder in einer Bestenliste. Angebote ohne bekannten Händler ebenfalls nicht.</>,
        <>Gewinnspiele und Glücksräder (kein Angebot) sowie Tabakwaren. <strong>Spirituosen gar nicht</strong> (Alkoholgesetz). Wein, Bier und Schaumwein nie auf der Stadtseite, in Bestenlisten oder in Vorschlägen unter einem anderen Produkt, und nie unter den ersten {ALCOHOL_FREE_TOP} Karten einer Liste.</>,
        <>Abgelaufene Aktionen: Ihre Seite bleibt 30 Tage erreichbar, als «abgelaufen» markiert, ohne Knopf zum Anbieter.</>,
        <>Werbewörter aus Titeln («ERHÖHT», «zum neuen Tiefstpreis», «nur heute», Emojis); «Tiefstpreis» nur, wenn unsere eigenen Daten es zeigen.</>,
        <>Ladenaktionen von Ketten ohne Filiale in der Nähe (St. Gallen: Aligro).</>,
        <>Die Liste ist überwiegend schweizweit: Supermarkt-Aktionen gelten meist in allen Filialen, Online-Angebote überall.</>,
      ],
      h4: "Quellen und Fehler",
      sources: <>Wir lesen nur öffentlich zugängliche Seiten und Feeds und verlinken immer auf die Quelle; massgebend ist die Seite des Anbieters. Führt ein Link zu einer Sammelseite statt zum Händler, steht das auf der Karte («gefunden über …»). Liste und Entfernungsanfragen: <a href={L("quellen")}>Quellen</a>. Fehler gefunden? {contact ? <>Kontakt im <a href={L("impressum")}>Impressum</a>.</> : "Die Kontaktadresse folgt vor dem öffentlichen Start."}</>,
    },
    fr: {
      h1: "Comment la note est calculée",
      p1: <>Chaque action reçoit une note de 0 à 10. Elle mesure l’économie par rapport à un prix de comparaison et vient de notre scanner ; les règles ci-dessous s’appliquent ensuite et ne peuvent que baisser une note, jamais l’augmenter.</>,
      rules: [
        <>Un prix n’est affiché « au lieu de » un autre, avec l’économie en francs et en pourcentage, que si le commerçant indique un <strong>prix pratiqué auparavant</strong> (ou un prix concurrent), que rien dans nos données ne le contredit et que la qualité des données atteint au moins {pct(VERIFY_MIN_CONFIDENCE)}. Ce prix barré est <strong>l’indication du commerçant</strong>, pas notre vérification : nous écrivons « selon le commerçant ». « Observé par nous » n’apparaît que si au moins {OBSERVED_MIN_N} de nos relevés s’écartent de {pct(OBSERVED_MAX_GAP)} au plus du prix barré.</>,
        <>Une note n’apparaît <strong>qu’à côté du prix barré</strong> qui la fonde. Tant que nos propres relevés ne confirment pas ce prix barré, elle est limitée à {sc(SCORE_CAP)} (« bien » au maximum). Nous écrivons alors « de moins que le prix barré de … », jamais « de moins qu’avant ».</>,
        <>Si le prix de comparaison est une indication du vendeur (prix conseillé, catalogue, valeur déclarée), nous l’affichons sobrement (« prix indiqué par le vendeur »). Il n’y a alors <strong>pas de note</strong>.</>,
        <>Pas de note non plus avec des données insuffisantes (moins de {pct(VERIFY_MIN_CONFIDENCE)}), avec un prix concurrent non affiché, ni pour un simple pourcentage (« selon le vendeur »). Une note de 0 n’est jamais affichée. Sous {sc(BADGE_MIN_SCORE)}, aucun chiffre, seulement le prix et le commerçant.</>,
        <>Pas de note non plus pour une remise invraisemblable (souvent une erreur de données) ou un prix qui ne correspond pas à la quantité du titre (écart de plus de 5 % avec le prix unitaire).</>,
        <>Si une « action » coûte autant ou plus que le prix que nous observons d’habitude, ce n’est pas une bonne affaire : nous ne la montrons <strong>pas</strong>.</>,
        <>L’historique des prix n’est affiché qu’à partir de {HISTORY_MIN_OBSERVATIONS} relevés.</>,
      ],
      tiersTitle: "Paliers",
      h2: "Comment se fait le classement",
      order: [
        <>Les offres avec prix barré visible passent <strong>toujours en premier</strong>, par note affichée (seulement si nos relevés confirment le prix barré), puis par réduction en pour cent, puis par économie au kilo ou au litre (pas en francs : un carton de vin ne passe ainsi jamais devant −50 % sur l’eau). Viennent ensuite les autres offres, les plus récentes d’abord. Celles qui commencent plus tard sont en fin de liste. Jamais plus de {MAX_RUN} cartes du même magasin à la suite, tant qu’un autre magasin peut suivre. Chaque liste indique son ordre au-dessus des cartes.</>,
        <>« Plus fortes baisses – selon le commerçant » (page de la ville, en haut) : les {MARKDOWN_N} actions ({MARKDOWN_N_MOBILE} sur mobile) avec la plus forte baisse en pour cent sous le <strong>prix antérieur indiqué par le commerçant</strong> — ni prix conseillé ni prix concurrent, non confirmé par nous. Au plus {MARKDOWN_PER_STORE} par magasin et par marque, sans alcool, sans condition (carte client, appli, quantité minimale), qualité des données dès {pct(MIN_CONFIDENCE_TOP)}, supermarché seulement avec quantité connue ; au-delà de {fmtPct(MARKDOWN_MAX_PCT_WITHOUT_UNIT, locale)}, seulement avec prix unitaire. Sous {MARKDOWN_MIN_SHOWN} cartes, le bloc disparaît.</>,
        ...(topPossible ? [<>« Les mieux notées » : au plus {TOP_N} cartes, sans remplissage — seulement avec prix barré du commerçant, note dès {sc(TOP_MIN_SCORE)}, qualité des données dès {pct(MIN_CONFIDENCE_TOP)}, au plus {PER_MERCHANT} par magasin et {PER_BRAND} par marque, au plus un tiers d’une même catégorie. Sous {TOP_MIN_SHOWN} cartes, la liste disparaît. Exclues : les actions qui ne commencent que demain et les actions en magasin le dernier jour après {STORE_CLOSING_HOUR} h. Les prestations de service sont exclues.</>] : []),
        <>Page de la ville : ensuite des rubriques de {SECTION_N} cartes. D’abord celles qui montrent le plus de prix barrés (note dès {sc(HOME_MIN_SCORE)}), puis Étudiants, Gratuit en dernier. Une rubrique n’apparaît qu’à partir de {HOME_MIN_SECTION} cartes. Les autres catégories via la barre du haut.</>,
        <>Les réductions étudiantes sont triées selon la <strong>réduction annoncée par le vendeur</strong>, puis la date de fin. Offres gratuites et codes promo : <strong>les plus récentes d’abord</strong>. Sur la page de la ville, au plus {PER_MERCHANT} par magasin.</>,
        <>Les abonnements mobile et internet sont triés par <strong>coût total sur 24 mois</strong> (prix promo, prix ensuite, frais de mise en service).</>,
        <>Une même action en plusieurs variétés compte une fois (« +2 variétés ») ; un même produit dans plusieurs magasins aussi (« aussi dans 2 autres magasins »).</>,
        <>Les catégories affichent {PAGE_SIZE} offres par page. Chaque carte mène à sa propre page ; c’est seulement là qu’un bouton (nouvel onglet) mène au vendeur.</>,
        <><strong>Aucune place n’est payante.</strong> Qu’un lien rapporte une commission n’entre ni dans la note ni dans l’ordre ; un test automatique vérifie que l’ordre est identique avec et sans programmes partenaires.</>,
      ],
      h3: "Comment nous gagnons de l’argent",
      money: [
        <><strong>Les liens publicitaires</strong> sont signalés en clair (« lien publicitaire (affilié) ») et balisés <code>rel=&quot;sponsored&quot;</code>. Si tu achètes par ce lien, nous pouvons toucher une commission ; ton prix ne change pas.</>,
        <><strong>Les publicités</strong> (si activées) sont signalées « publicité », jamais placées dans un classement, et ne se chargent qu’avec ton accord (<a href={`${L("datenschutz")}#cookies`}>confidentialité</a>).</>,
        <><strong>Placements payants</strong> : aucun.</>,
      ],
      active: (n: string) => `Programmes partenaires actifs : ${n}`,
      none: "aucun",
      hidden: "Ce que nous ne montrons pas",
      hiddenList: [
        <>Les offres qui contournent les conditions d’un service (p. ex. abonnements « via la Bulgarie », astuces VPN).</>,
        <>Les « actions » dont le prix est égal ou supérieur au prix habituel que nous avons observé.</>,
        <>Les offres d’escorte, érotiques ou de marques pour adultes n’apparaissent jamais sur la page de la ville, chez Étudiants, chez Gratuit ni dans un classement. Les offres sans commerçant connu non plus.</>,
        <>Les concours et roues de la fortune (ce ne sont pas des offres) et le tabac. <strong>Aucun spiritueux</strong> (loi sur l’alcool). Vin, bière et mousseux jamais sur la page de la ville, dans un classement ni en suggestion sous un autre produit, et jamais parmi les {ALCOHOL_FREE_TOP} premières cartes d’une liste.</>,
        <>Les actions terminées : leur page reste accessible 30 jours, marquée « terminée », sans bouton vers le vendeur.</>,
        <>Les mots publicitaires des titres (« ERHÖHT », « nouveau prix le plus bas », « aujourd’hui seulement », émojis) ; « prix le plus bas » seulement si nos propres données le montrent.</>,
        <>Les actions en magasin d’enseignes sans magasin à proximité (Saint-Gall : Aligro).</>,
        <>La liste est surtout nationale : les actions de supermarché valent en général dans tous les magasins, les offres en ligne partout.</>,
      ],
      h4: "Sources et erreurs",
      sources: <>Nous ne lisons que des pages et flux publics et renvoyons toujours vers la source ; seule la page du vendeur fait foi. Si un lien mène à un agrégateur plutôt qu’au commerçant, la carte l’indique (« trouvé via … »). Liste et demandes de retrait : <a href={L("quellen")}>sources</a>. Une erreur ? {contact ? <>Contact dans les <a href={L("impressum")}>mentions légales</a>.</> : "L’adresse de contact sera publiée avant le lancement public."}</>,
    },
    en: {
      h1: "How the score is built",
      p1: <>Every deal gets a score from 0 to 10. It measures the saving against a comparison price and comes from our scanner; the rules below are applied afterwards and can only lower a score, never raise it.</>,
      rules: [
        <>A price is shown “instead of” another, with the saving in francs and percent, only if the retailer states a <strong>price it charged before</strong> (or a competitor’s price), nothing in our data contradicts it and data quality is at least {pct(VERIFY_MIN_CONFIDENCE)}. This “instead of” price is <strong>the retailer’s statement</strong>, not our check: we write “according to the retailer”. “Observed by us” appears only when at least {OBSERVED_MIN_N} of our own price observations are within {pct(OBSERVED_MAX_GAP)} of it.</>,
        <>A score is shown <strong>only next to the was price</strong> it is based on. Until our own observations confirm that was price, the score is capped at {sc(SCORE_CAP)} (“good” at most). We then write “below …’s was price”, never “less than before”.</>,
        <>If the comparison price is the seller’s own figure (RRP, catalogue price, stated value), we show it neutrally (“seller’s stated price”). There is then <strong>no score</strong>.</>,
        <>No score either with too little reliable data (below {pct(VERIFY_MIN_CONFIDENCE)}), with a competitor’s price we do not show, or for a bare percentage (“according to the seller”). A score of 0 is never shown. Below {sc(BADGE_MIN_SCORE)} we show no number, only price and retailer.</>,
        <>No score either for implausible discounts (usually a data error) or when the price does not match the quantity in the title (more than 5% off the unit price).</>,
        <>If a “deal” costs the same as or more than the price we usually observe, it is not a deal: we do <strong>not</strong> show it.</>,
        <>Price history is shown only from {HISTORY_MIN_OBSERVATIONS} observations.</>,
      ],
      tiersTitle: "Tiers",
      h2: "How ranking works",
      order: [
        <>Offers with a visible was price <strong>always come first</strong>, by the displayed score (only when our observations confirm the was price), then by percent off, then by saving per kilo or litre (not in francs: a case of wine never overtakes −50% on water). All other offers follow, newest first. Deals that start later come last. Never more than {MAX_RUN} cards from one store in a row while another store can follow. Every list states its order above the cards.</>,
        <>“Biggest markdowns – as stated by the retailer” (top of the city page): the {MARKDOWN_N} deals ({MARKDOWN_N_MOBILE} on mobile) with the highest percentage below the <strong>retailer’s stated previous price</strong> — neither RRP nor a competitor’s price, not confirmed by us. At most {MARKDOWN_PER_STORE} per store and per brand, no alcohol, no conditions (loyalty card, app, minimum quantity), data quality from {pct(MIN_CONFIDENCE_TOP)}, supermarket deals only with a known quantity; above {fmtPct(MARKDOWN_MAX_PCT_WITHOUT_UNIT, locale)} only with a unit price. With fewer than {MARKDOWN_MIN_SHOWN} cards the block is not shown.</>,
        ...(topPossible ? [<>“Top rated”: at most {TOP_N} cards, never padded — only with the retailer’s “instead of” price, score from {sc(TOP_MIN_SCORE)}, data quality from {pct(MIN_CONFIDENCE_TOP)}, at most {PER_MERCHANT} per shop and {PER_BRAND} per brand, at most a third from one category. With fewer than {TOP_MIN_SHOWN}, the list is not shown. Excluded: deals that only start tomorrow and in-store deals on their last day after {STORE_CLOSING_HOUR}:00. Services are excluded.</>] : []),
        <>City page: then sections of {SECTION_N} cards. First the sections with the most visible was prices (score from {sc(HOME_MIN_SCORE)}), then Students, Free last. A section appears only with {HOME_MIN_SECTION} or more cards. All other categories via the bar at the top.</>,
        <>Student discounts are sorted by the <strong>discount stated by the seller</strong>, then by end date. Freebies and coupons: <strong>newest first</strong>. On the city page, at most {PER_MERCHANT} per shop.</>,
        <>Mobile and internet plans are sorted by <strong>total cost over 24 months</strong> (promo price, follow-up price, activation fee).</>,
        <>The same deal in several varieties counts once (“+2 varieties”); the same product at several shops too (“also at 2 other shops”).</>,
        <>Categories show {PAGE_SIZE} offers per page. Every card opens its own detail page; only there does a button (new tab) lead to the seller.</>,
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
      hidden: "What we do not show",
      hiddenList: [
        <>Offers that circumvent a service’s terms (e.g. subscriptions “via Bulgaria”, VPN tricks).</>,
        <>“Deals” priced at or above the usual price we have observed.</>,
        <>Escort, adult offers and adult brands never appear on the city page, in Students, in Free or in a top list. Offers without a known retailer do not either.</>,
        <>Contests and prize wheels (not offers) and tobacco. <strong>No spirits at all</strong> (Swiss alcohol law). Wine, beer and sparkling wine never on the city page, in a top list or suggested under another product, and never among the first {ALCOHOL_FREE_TOP} cards of a list.</>,
        <>Ended deals: their page stays reachable for 30 days, marked “ended”, without a button to the seller.</>,
        <>Marketing words in titles (“ERHÖHT”, “new lowest price”, “today only”, emojis); “lowest price” only when our own data shows it.</>,
        <>In-store deals of chains with no shop nearby (St. Gallen: Aligro).</>,
        <>The list is mostly nationwide: supermarket deals usually apply in every branch, online offers everywhere.</>,
      ],
      h4: "Sources and errors",
      sources: <>We only read public pages and feeds and always link to the source; the seller’s page is authoritative. If a link leads to an aggregator rather than the retailer, the card says so (“found via …”). List and removal requests: <a href={L("quellen")}>sources</a>. Found an error? {contact ? <>Contact details in the <a href={L("impressum")}>imprint</a>.</> : "A contact address will be published before the public launch."}</>,
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
      <h2 id="nicht-gezeigt">{c.hidden}</h2>
      <ul>{c.hiddenList.map((r, i) => <li key={i}>{r}</li>)}</ul>
      <h2 id="quellen">{c.h4}</h2>
      <p>{c.sources}</p>
    </article>
  );
}
