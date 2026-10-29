/** « / » : redirection 302 vers la ville dans la langue du navigateur (Accept-Language :
 * fr* → /fr, en* → /en, sinon /de). Les URL explicites (/de, /fr/…) ne sont jamais
 * redirigées selon la langue (round 2, item 36). */
import { secure } from "../lib/edgeHeaders";

const MAIN_CITY = "st-gallen";

export function pickLang(acceptLanguage: string | null): "de" | "fr" | "en" {
  const prefs = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = Number((params.find((p) => p.trim().startsWith("q=")) ?? "q=1").trim().slice(2));
      return { lang: tag.split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const p of prefs) if (p.lang === "de" || p.lang === "fr" || p.lang === "en") return p.lang;
  return "de";
}

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  const url = new URL(request.url);
  const lang = pickLang(request.headers.get("Accept-Language"));
  const res = new Response(null, {
    status: 302,
    headers: { Location: `/${lang}/${MAIN_CITY}${url.search}`, Vary: "Accept-Language", "Cache-Control": "private, max-age=86400" },
  });
  return secure(res, url);
};
