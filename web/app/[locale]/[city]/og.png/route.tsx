import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { cityBySlug, launchedCities, mainCity } from "@/config/cities";
import { getDeals } from "@/lib/data";
import { fmtInt } from "@/lib/format";
import { LOCALES, dict, isLocale, type Locale } from "@/lib/i18n";
import { inCity } from "@/lib/project";
import { verifiedCount } from "@/lib/select";
import { SITE_NAME } from "@/lib/site";

/** Image de partage (Open Graph) par langue et par ville, générée au build avec
 * SITE_NAME et la MÊME police que le site (Inter) : changer de marque = changer la
 * variable. Contenu factuel (titre + nombre de faits), aucun montant agrégé. */
export const dynamic = "force-static";

const size = { width: 1200, height: 630 };

export const generateStaticParams = () => LOCALES.flatMap((locale) => launchedCities().map((c) => ({ locale, city: c.slug })));

const font = (w: number) => readFile(path.join(process.cwd(), "node_modules", "@fontsource", "inter", "files", `inter-latin-${w}-normal.woff`));

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; city: string }> }) {
  const p = await params;
  const locale: Locale = isLocale(p.locale) ? p.locale : "de";
  const city = cityBySlug(p.city) ?? mainCity();
  const t = dict(locale);
  let facts = t.tagline;
  try {
    const { deals } = await getDeals();
    facts = t.factsVerified(fmtInt(verifiedCount(deals.filter((d) => inCity(d, city))), locale));
  } catch {
    /* sans données : slogan seul */
  }
  const [regular, bold] = await Promise.all([font(400), font(700)]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#f5f5f7", color: "#1d1d1f", fontFamily: "Inter" }}>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.8 }}>{SITE_NAME}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2.4 }}>{t.dealsIn(city.name[locale])}</div>
          <div style={{ fontSize: 34, fontWeight: 400, color: "#515154" }}>{facts}</div>
        </div>
        <div style={{ display: "flex", width: 96, height: 8, borderRadius: 4, background: "#0a7a50" }} />
      </div>
    ),
    { ...size, fonts: [{ name: "Inter", data: regular, weight: 400, style: "normal" }, { name: "Inter", data: bold, weight: 700, style: "normal" }] },
  );
}
