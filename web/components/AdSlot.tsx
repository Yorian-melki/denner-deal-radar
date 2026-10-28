const CLIENT_RE = /^ca-pub-\d{10,20}$/;
const SLOT_RE = /^\d{1,20}$/;

/** Emplacement publicitaire — balisage serveur. Rien n'est chargé (aucune requête,
 * aucun cookie) tant que : (1) un client AdSense valide est configuré ET autorisé
 * (Impressum complet, lib/operator.ts adClient), (2) un slot valide existe, (3) le
 * visiteur a accepté (public/site.js charge alors la balise). Hauteur réservée dès le
 * build (CLS 0) ; jamais dans une liste classée ni entre un prix et son bouton.
 * Les identifiants sont validés (regex) avant d'entrer dans une URL de script. */
export function AdSlot({ slot, label, client: rawClient }: { slot?: string; label: string; client: string }) {
  const rawSlot = slot ?? process.env.NEXT_PUBLIC_ADSENSE_SLOT ?? "";
  const client = CLIENT_RE.test(rawClient) ? rawClient : "";
  const s = SLOT_RE.test(rawSlot) ? rawSlot : "";
  if (!client || !s) return null;
  return (
    <aside className="ad" aria-label={label} data-ad-client={client} data-ad-slot={s}>
      <span className="ad-label">{label}</span>
    </aside>
  );
}
