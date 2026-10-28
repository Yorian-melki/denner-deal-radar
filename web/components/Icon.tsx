/** Jeu d'icônes unique : 20×20, trait 1.75, currentColor. Les chaînes i18n ne
 * contiennent aucune flèche ; l'icône est toujours décorative (aria-hidden). */
const PATHS = {
  arrow: "M4 10h11M11 5.5 15.5 10 11 14.5",
  external: "M7 5h8v8M15 5 5.5 14.5",
  chevron: "M5.5 8 10 12.5 14.5 8",
  share: "M10 3v10M6.5 6.5 10 3l3.5 3.5M4.5 10.5v5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-5",
  info: "M10 9v5M10 6.2v.1M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  back: "M16 10H5M9 5.5 4.5 10 9 14.5",
  link: "M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : "icon"} width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
