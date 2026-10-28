import { NotFoundBody } from "@/components/NotFoundBody";

/** Repli de notFound() au build (paramètre invalide). En production, les 404 sont
 * servies par Cloudflare depuis /<langue>/404.html (voir app/[locale]/missing et
 * scripts/postbuild.mjs), donc toujours dans la langue de l'URL demandée. */
export default function NotFound() {
  return <NotFoundBody locale="de" />;
}
