import { ImageResponse } from "next/og";
import { cityBySlug, launchedCities, mainCity } from "@/config/cities";
import { getDeals } from "@/lib/data";
import { fmtInt } from "@/lib/format";
import { LOCALES, dict, isLocale, type Locale } from "@/lib/i18n";
import { inCity } from "@/lib/project";
import { canonical } from "@/lib/select";
import { SITE_NAME } from "@/lib/site";

/** Image de partage (Open Graph) par langue et par ville, générée au build avec
 * SITE_NAME (même tuile monogramme que l'en-tête) : changer de marque = changer la
 * variable. Police par défaut de next/og (aucun fichier de police embarqué).
 * Contenu factuel (titre + nombre d'actions), aucun montant agrégé. Round 4, item 30 : interlettrage 0
 * (la police par défaut rendait « Aktionen  in » avec un double espace à −2.4). */
export const dynamic = "force-static";

const size = { width: 1200, height: 630 };

export const generateStaticParams = () => LOCALES.flatMap((locale) => launchedCities().map((c) => ({ locale, city: c.slug })));

/** Glyphes sûrs pour la police par défaut (NBSP → espace, trait d'union insécable → « - »). */
const plain = (s: string) => s.replace(/\u00a0/g, " ").replace(/\u2011/g, "-");

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; city: string }> }) {
  const p = await params;
  const locale: Locale = isLocale(p.locale) ? p.locale : "de";
  const city = cityBySlug(p.city) ?? mainCity();
  const t = dict(locale);
  let facts = t.tagline;
  try {
    const { deals } = await getDeals();
    // Même compteur que la ligne de faits de la page (round 3, item 16).
    facts = t.factsCount(fmtInt(canonical(deals.filter((d) => inCity(d, city))).length, locale));
  } catch {
    /* sans données : slogan seul */
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#f5f5f7", color: "#1d1d1f" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 14, background: "#1d1d1f", color: "#f5f5f7", fontSize: 40, fontWeight: 700 }}>{SITE_NAME.trim().charAt(0).toUpperCase()}</div>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: 0 }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05, letterSpacing: 0, whiteSpace: "nowrap" }}>{plain(t.dealsIn(city.name[locale]))}</div>
          <div style={{ fontSize: 34, fontWeight: 400, color: "#515154" }}>{plain(facts)}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
