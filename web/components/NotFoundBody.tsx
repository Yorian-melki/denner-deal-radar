import { mainCity } from "@/config/cities";
import { dict, type Locale } from "@/lib/i18n";
import { paths } from "@/lib/site";

/** 404 localisée : un message générique (on ne prétend pas savoir que c'était un
 * deal expiré) + retour vers la ville principale dans la même langue. */
export function NotFoundBody({ locale }: { locale: Locale }) {
  const t = dict(locale);
  const city = mainCity();
  return (
    <section className="nf">
      <h1>{t.notFoundTitle}</h1>
      <p>{t.notFoundText}</p>
      <p><a href={paths.city(locale, city.slug)} className="btn btn-primary">{t.notFoundCta(city.name[locale])}</a></p>
    </section>
  );
}
