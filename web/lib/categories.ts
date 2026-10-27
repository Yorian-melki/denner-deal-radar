/** Familles du scanner → catégories publiques (une page SEO par ville × catégorie). */
export interface Category { slug: string; label: string; families: string[]; intro: string }

export const CATEGORIES: Category[] = [
  { slug: "supermarkt-aktionen", label: "Supermarkt-Aktionen", families: ["grocery", "surplus"],
    intro: "Wochenaktionen von Denner, Migros, Coop, Aldi, Lidl und Volg — nach echter Ersparnis sortiert." },
  { slug: "tech-deals", label: "Tech & Elektronik", families: ["tech", "flash"],
    intro: "Tagesangebote und Flash-Sales (Digitec, Galaxus, DayDeal, QoQa) mit geprüftem Referenzpreis." },
  { slug: "refurbished", label: "Refurbished", families: ["refurbished", "secondhand"],
    intro: "Generalüberholte Smartphones und Laptops — Zustand und Preis transparent." },
  { slug: "gratis", label: "Gratis", families: ["free", "digital_free"],
    intro: "Kostenlose Games, Gratis-Artikel und Freebies." },
  { slug: "studenten-rabatte", label: "Studentenrabatte", families: ["student"],
    intro: "Rabatte für Studierende (UNiDAYS, Student Beans und mehr)." },
  { slug: "gutscheine", label: "Gutscheine & Cashback", families: ["coupon", "cashback"],
    intro: "Gutscheincodes und Cashback-Angebote von Schweizer Shops." },
  { slug: "handy-abos", label: "Handy-Abos", families: ["subscription"],
    intro: "Aktionen für Handy- und Internet-Abos — Preis über die ganze Laufzeit gerechnet." },
  { slug: "events", label: "Events & Ausgang", families: ["event", "local_news"],
    intro: "Gratis- und Spar-Events in der Stadt." },
  { slug: "reisen", label: "Reisen", families: ["travel", "transport"],
    intro: "Flug- und Reisedeals ab der Region." },
  { slug: "shopping", label: "Shopping", families: ["retail", "restaurant", "contest"],
    intro: "Weitere Rabatte im Handel." },
];

const BY_FAMILY = new Map(CATEGORIES.flatMap((c) => c.families.map((f) => [f, c.slug] as const)));
export const categoryForFamily = (family: string) => BY_FAMILY.get(family) ?? "shopping";
export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
