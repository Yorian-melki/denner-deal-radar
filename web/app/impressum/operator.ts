/** Identité de l'exploitant, lue au build depuis les variables NEXT_PUBLIC_OPERATOR_*
 * (GitHub → Variables). Aucune donnée personnelle n'est codée en dur dans le dépôt.
 * Utilisé par Impressum, Datenschutz, AGB et Quellen. */
const clean = (v: string | undefined) => (v ?? "").trim();
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

export function operator() {
  const email = clean(process.env.NEXT_PUBLIC_OPERATOR_EMAIL);
  return {
    name: clean(process.env.NEXT_PUBLIC_OPERATOR_NAME),
    /** Adresse postale ; « | » ou retour à la ligne = saut de ligne affiché. */
    address: clean(process.env.NEXT_PUBLIC_OPERATOR_ADDRESS).split(/\s*[|\n]\s*/).filter(Boolean),
    email: EMAIL_RE.test(email) ? email : "",
    /** LCEN art. 6 III 1 a (personne physique éditant à titre professionnel) : téléphone. */
    phone: clean(process.env.NEXT_PUBLIC_OPERATOR_PHONE),
  };
}

export const isOperatorComplete = (o = operator()) => !!(o.name && o.address.length && o.email);

/** Date de dernière révision des textes juridiques (à mettre à jour à chaque changement). */
export const LEGAL_REVISION = "28.10.2026";

/** Hébergeur (LCEN art. 6 III 1 d) — LAWYER-CHECK : vérifier adresse/téléphone à jour sur cloudflare.com. */
export const HOST = {
  name: "Cloudflare, Inc.",
  address: "101 Townsend St., San Francisco, CA 94107, USA",
  phone: "+1 650 319 8930",
  web: "https://www.cloudflare.com",
};
