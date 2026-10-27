export const SITE_NAME = "Deal Radar";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "");
/** Seule la production est indexable (les previews Vercel restent en noindex). */
export const INDEXABLE = process.env.VERCEL_ENV === "production" && !!process.env.NEXT_PUBLIC_SITE_URL;
export const REVALIDATE_SECONDS = 1800;

export const fmtPrice = (v: number | undefined, cur: string) =>
  v === undefined ? "" : new Intl.NumberFormat("de-CH", { style: "currency", currency: cur }).format(v);

export const fmtDate = (iso: string | undefined) =>
  iso ? new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" }).format(new Date(iso)) : "";
