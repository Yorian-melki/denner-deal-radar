import type { Metadata } from "next";
import { NotFoundBody } from "@/components/NotFoundBody";
import { dict, isLocale, type Locale } from "@/lib/i18n";

/** Gabarit de la 404 par langue : scripts/postbuild.mjs copie /<langue>/missing.html
 * vers /<langue>/404.html (Cloudflare Pages sert la 404.html la plus proche du chemin
 * demandé : /fr/xyz → /fr/404.html, en français, avec le sélecteur de langue). */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? dict(locale).notFoundTitle : "404", robots: { index: false, follow: false } };
}

export default async function Missing({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <NotFoundBody locale={locale as Locale} />;
}
