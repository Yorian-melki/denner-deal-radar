export const SITE_NAME = "Deal Radar";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
/** Indexation seulement quand le build vise le domaine définitif (SITE_INDEXABLE=1
 * dans la CI) : jamais *.pages.dev ni les previews, pour éviter le contenu dupliqué. */
export const INDEXABLE = process.env.SITE_INDEXABLE === "1" && !!process.env.NEXT_PUBLIC_SITE_URL;

export const fmtPrice = (v: number | undefined, cur: string) =>
  v === undefined ? "" : new Intl.NumberFormat("de-CH", { style: "currency", currency: cur }).format(v);

export const fmtDate = (iso: string | undefined) =>
  iso ? new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" }).format(new Date(iso)) : "";
