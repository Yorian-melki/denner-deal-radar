import { ImageResponse } from "next/og";
import { cityBySlug, launchedCities } from "@/config/cities";
import { getDeals } from "@/lib/data";
import { dict } from "@/lib/i18n";
import { inCity } from "@/lib/project";
import { weeklySavings } from "@/lib/select";
import { SITE_NAME, fmtMoneyRound } from "@/lib/site";

/** Image de partage (Open Graph) par ville, générée au build avec SITE_NAME :
 * changer de marque = changer la variable, l'image suit. */
export const dynamic = "force-static";

const size = { width: 1200, height: 630 };

export const generateStaticParams = () => launchedCities().map((c) => ({ city: c.slug }));

export async function GET(_req: Request, { params }: { params: Promise<{ city: string }> }) {
  const city = cityBySlug((await params).city) ?? launchedCities()[0];
  const t = dict(city.locale);
  let line = t.tagline;
  try {
    const { deals, generatedAt } = await getDeals();
    const here = deals.filter((d) => inCity(d, city));
    const { total } = weeklySavings(here, generatedAt ? new Date(generatedAt) : new Date());
    const cur = here.find((d) => d.currency)?.currency ?? "CHF";
    if (total >= 1) line = `${t.heroKicker(city.name)}: ${fmtMoneyRound(total, cur, city.locale)} ${t.heroSavings}`;
  } catch {
    /* sans données : slogan seul */
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0c0e11", color: "#f4f4ef" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 72, height: 72, borderRadius: 36, border: "6px solid #c6f432", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: "#c6f432" }} />
          </div>
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 30, color: "#c6f432", textTransform: "uppercase", letterSpacing: 2 }}>{city.name}</div>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 1000 }}>{line}</div>
        </div>
        <div style={{ fontSize: 26, color: "#a9adb5" }}>{t.topTodayNote}</div>
      </div>
    ),
    size,
  );
}
