import fs from "node:fs";
import path from "node:path";

/** Liste publique des sources, lue AU BUILD depuis docs/source_registry.json
 * (registre du scanner, à la racine du dépôt). On publie seulement les sources
 * réellement branchées : statut INTEGRATED, ou PARTIAL avec connecteur prêt
 * (scan manuel). Une par domaine. Si le registre est absent (build isolé de web/),
 * repli sur une liste vide et la page l'indique. */
export type PublicSource = { name: string; domain: string; url: string };

type Entry = { name?: string; url?: string; status?: string; status_reason?: string };

export function displayDomain(host: string): string {
  const h = host.replace(/^www\./, "").toLowerCase();
  const labels = h.split(".");
  return labels.length > 3 ? labels.slice(-2).join(".") : h;
}

const shortName = (n: string) => n.split(/\s+[–(-]\s*/)[0].trim();

export function publicSources(entries: Entry[]): PublicSource[] {
  const seen = new Map<string, PublicSource>();
  for (const e of entries) {
    const live = e.status === "INTEGRATED" || (e.status === "PARTIAL" && /^Connecteur prêt/i.test(e.status_reason ?? ""));
    if (!live || !e.url || !e.name) continue;
    let u: URL;
    try { u = new URL(e.url); } catch { continue; }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    const domain = displayDomain(u.hostname);
    if (!seen.has(domain)) seen.set(domain, { name: shortName(e.name), domain, url: `https://${domain}` });
  }
  return [...seen.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}

export function loadSources(): PublicSource[] {
  for (const p of [path.join(process.cwd(), "..", "docs", "source_registry.json"), path.join(process.cwd(), "docs", "source_registry.json")]) {
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      if (Array.isArray(data)) return publicSources(data);
    } catch {}
  }
  return [];
}
