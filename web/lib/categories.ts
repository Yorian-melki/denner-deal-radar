/** Catégories publiques (une page par ville × catégorie, mêmes slugs dans les
 * trois langues ; libellés dans lib/i18n.ts CATEGORY_TEXT).
 * Classement d'après le PRODUIT, pas d'après la source : famille du scanner,
 * puis enseigne, puis mots-clés du titre et de la rubrique du marchand. */
export interface Category {
  slug: string;
  families: string[];
  /** Exclue des vitrines « top » (services : pas de prix comparable). */
  noTop?: boolean;
  /** Pas de note (pourcentage annoncé par le vendeur) : ordre neutre (plus récent d'abord). */
  unrated?: boolean;
}

/** Ordre d'affichage (puces, sections) : d'abord ce qui sert le plus aux étudiants. */
export const CATEGORIES: Category[] = [
  { slug: "studenten-rabatte", families: ["student"], unrated: true },
  { slug: "gratis", families: ["free", "digital_free"], unrated: true },
  { slug: "supermarkt-aktionen", families: ["grocery", "surplus"] },
  { slug: "tech-deals", families: ["tech"] },
  { slug: "haushalt", families: [] },
  { slug: "refurbished", families: ["refurbished", "secondhand"] },
  { slug: "gutscheine", families: ["coupon", "cashback"], unrated: true },
  { slug: "handy-abos", families: ["subscription"] },
  { slug: "events", families: ["event", "local_news"] },
  { slug: "reisen", families: ["travel", "transport"] },
  { slug: "lokal", families: ["restaurant"], noTop: true },
  { slug: "shopping", families: ["retail", "flash", "contest"] },
];

const BY_FAMILY = new Map(CATEGORIES.flatMap((c) => c.families.map((f) => [f, c.slug] as const)));
export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);

const SUPERMARKETS = /^(denner|migros|coop|aldi|aldi suisse|lidl|volg|spar|aligro|landi|prodega|topcc|farmy)$/i;
/** Consommables de ménage vendus en supermarché (restent dans Supermarkt). */
const CONSUMABLES =
  /wasch|putz|spül|reinig|vanish|finish|persil|ariel|calgon|somat|toilettenpapier|haushaltpapier|taschentücher|shampoo|duschgel|zahnpasta|deo\b|windeln|kosmetik|katzenstreu|tierfutter|katzenfutter|hundefutter/i;
const TECH =
  /\b(laptop|notebook|macbook|smartphone|iphone|ipad|tablet|galaxy|pixel|monitor|bildschirm|fernseher|tv|oled|qled|kopfhörer|headphones?|earbuds|airpods|in-ear|lautsprecher|speaker|soundbar|ssd|festplatte|usb|router|mesh|wlan|kamera|camera|objektiv|drucker|printer|tastatur|keyboard|maus|mouse|gaming|konsole|playstation|ps5|xbox|nintendo|smartwatch|garmin|powerbank|ladegerät|charger|beamer|projektor|drohne|e-reader|kindle|grafikkarte|prozessor)\b|computer|elektronik|tech & mobile/i;
const HOUSEHOLD =
  /pfanne|kochgeschirr|kochtopf|\btopf|messer|besteck|küche|staubsauger|saugroboter|kaffeemaschine|kaffeevollautomat|mixer|wasserkocher|airfryer|heissluft|bettwäsche|kissen|bettdecke|matratze|möbel|sofa|stuhl|tisch|lampe|leuchte|katzenstreu|kratzbaum|tierbedarf|aufbewahrung|handtuch|teppich|vorhang|heimtextil|deko|garten|werkzeug|bohrmaschine|akkuschrauber|grill|haushalt|wohnen/i;
const SERVICES = /massage(?!pistole|gerät|kissen)|praxis|beratung|consultation|coaching|coiffeur|friseur|kosmetikstudio|therapie|psycholog|ernährungs|physio|nachhilfe|fahrschule|umzugs/i;
const TRIAL = /probeabo|testabo|gratis testen|kostenlos testen|free trial|essai gratuit|\d+\s*monate?\s*(gratis|kostenlos)|gratismonate?/i;

export interface Classifiable { family: string; title: string; merchant?: string; category?: string }

/** Essai gratuit à renouvellement automatique (sort de « Gratis », étiquette « Testabo »). */
export const isTrial = (d: Pick<Classifiable, "title">) => TRIAL.test(d.title);

export function categorize(d: Classifiable): string {
  const fam = d.family;
  const text = `${d.title} ${d.category ?? ""}`;
  const merchant = (d.merchant ?? "").trim();
  if (fam === "student") return "studenten-rabatte";
  if (fam === "free" || fam === "digital_free") return isTrial(d) ? "gutscheine" : "gratis";
  if (fam === "subscription") return "handy-abos";
  if (fam === "refurbished" || fam === "secondhand") return "refurbished";
  if (fam === "coupon" || fam === "cashback") return "gutscheine";
  if (fam === "event" || fam === "local_news") return "events";
  if (fam === "travel" || fam === "transport") return "reisen";
  if (fam === "restaurant" || SERVICES.test(d.title)) return "lokal";
  if (fam === "grocery" || fam === "surplus") {
    // Non-alimentaire durable d'un discounter (poêle, aspirateur) : rangé selon le produit.
    if (!CONSUMABLES.test(text) && TECH.test(d.title)) return "tech-deals";
    if (!CONSUMABLES.test(text) && HOUSEHOLD.test(d.title)) return "haushalt";
    return "supermarkt-aktionen";
  }
  // retail, flash, tech, contest… : d'après le produit.
  if (CONSUMABLES.test(text)) return SUPERMARKETS.test(merchant) ? "supermarkt-aktionen" : "haushalt";
  if (TECH.test(text) && !HOUSEHOLD.test(d.title)) return "tech-deals";
  if (HOUSEHOLD.test(text)) return "haushalt";
  if (fam === "tech") return "tech-deals";
  return BY_FAMILY.get(fam) ?? "shopping";
}

/** Compatibilité : catégorie d'une famille seule (sans titre). */
export const categoryForFamily = (family: string) => categorize({ family, title: "" });
