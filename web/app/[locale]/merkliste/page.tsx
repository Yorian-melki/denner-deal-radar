import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { dict, isLocale, type Locale } from "@/lib/i18n";
import { alternates, paths } from "@/lib/site";
import { mainCity } from "@/config/cities";

/** Merkliste (rétention, 06.11) : la liste de courses de l'utilisateur, groupée par magasin, avec le
 * total par magasin. Tout reste sur l'appareil (localStorage « list.v1 », rendu par site.js) ;
 * rien n'est envoyé. Page statique, noindex ; sans JavaScript, le texte d'aide reste. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = dict(locale);
  return { title: t.listTitle, description: t.listLead, robots: { index: false, follow: true }, alternates: alternates("/merkliste", locale) };
}

export default async function Merkliste({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const t = dict(locale);
  const city = mainCity();
  return (
    <div className="list-page">
      <nav className="crumbs" aria-label={t.breadcrumb}>
        <a href={paths.city(locale, city.slug)}><Icon name="back" size={16} /><span className="sr-only">{t.backTo(city.name[locale])}</span><span aria-hidden="true">{city.name[locale]}</span></a>
      </nav>
      <header className="intro">
        <h1>{t.listTitle}</h1>
        <p className="lead">{t.listLead}</p>
      </header>
      <div className="list-root" data-list-root="" data-l-items={t.listItems("{n}")} data-l-total={t.listTotal("{sum}")}
        data-l-ended={t.expiredBadge} data-l-remove={t.listRemove} data-l-clear={t.listClearEnded} data-l-share={t.listShare}
        data-l-copied={t.copied} data-l-unknown={t.listUnknownStore} data-l-share-head={t.listShareHead} aria-live="polite">
        <p className="empty">{t.listEmpty}</p>
      </div>
      <p className="section-foot">{t.listPrivacy}</p>
    </div>
  );
}
