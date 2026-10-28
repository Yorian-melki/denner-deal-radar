"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localeForPath } from "@/config/cities";
import { dict } from "@/lib/i18n";

export default function NotFound() {
  const t = dict(localeForPath(usePathname()));
  return (
    <section className="nf">
      <h1>{t.notFoundTitle}</h1>
      <p>{t.notFoundText}</p>
      <p><Link href="/" className="btn btn-primary">{t.notFoundCta}</Link></p>
    </section>
  );
}
