/** Identité de l'exploitant (jamais de téléphone : le numéro n'est ni lu ni publié), lue au build depuis les variables NEXT_PUBLIC_OPERATOR_*
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

/** Garde-fou légal (UWG art. 3 al. 1 let. s, LCEN art. 6) : pas d'indexation, pas de
 * liens affiliés, pas de publicité tant que l'exploitant n'est pas identifiable.
 * Renvoie la liste de ce qui est activé à tort (vide = publiable). Fonction pure (tests). */
export function monetisationBlockers(env: Record<string, string | undefined>, complete: boolean): string[] {
  if (complete) return [];
  const on: string[] = [];
  if (env.SITE_INDEXABLE === "1") on.push("SITE_INDEXABLE");
  if (env.NEXT_PUBLIC_ADSENSE_CLIENT) on.push("NEXT_PUBLIC_ADSENSE_CLIENT");
  for (const [k, v] of Object.entries(env)) if (k.startsWith("AFF_") && v) on.push(k);
  return on;
}

/** La monétisation (liens affiliés, publicité, indexation) n'est active que si l'exploitant est identifiable. */
export const MONETISATION_ALLOWED = isOperatorComplete();

/** Environnement effectif pour la réécriture affiliée : sans Impressum complet, les
 * variables AFF_* sont ignorées (liens publiés sans commission) — le site reste
 * déployable, mais aucun lien rémunéré n'est jamais publié sans exploitant identifié. */
export function monetisationEnv(env: Record<string, string | undefined> = process.env, allowed = MONETISATION_ALLOWED) {
  if (allowed) return env;
  return Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith("AFF_")));
}

/** Client AdSense effectif (vide sans Impressum complet). */
export const adClient = () => (MONETISATION_ALLOWED ? process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "" : "");

/** Appelé au build (layout racine) : avertit (annotation GitHub) si des variables de
 * monétisation sont définies alors que l'Impressum est incomplet ; elles sont neutralisées. */
export function warnIfMonetisationBlocked(env: Record<string, string | undefined> = process.env) {
  const on = monetisationBlockers(env, isOperatorComplete());
  if (!on.length) return;
  const msg = `Impressum incomplet (NEXT_PUBLIC_OPERATOR_NAME/ADDRESS/EMAIL) : ${on.join(", ")} ignoré(s) — aucun lien rémunéré, aucune publicité, pas d'indexation.`;
  console.warn(env.GITHUB_ACTIONS ? `::warning::${msg}` : msg);
}

/** Placements payants (sponsors) : 0. Tout sponsor futur n'apparaîtrait que dans un
 * emplacement « Gesponsert », hors de toute liste classée ; le pied de page lit cette
 * constante (round 3, item 44) — jamais un « 0 » écrit en dur. */
export const SPONSORS: readonly { name: string }[] = [];
