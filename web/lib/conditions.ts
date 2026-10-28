/** Conditions d'un deal → codes traduisibles. Le scanner écrit ses conditions
 * en français ou recopie le texte allemand du marchand ; une page DE ne doit
 * jamais afficher « pièce » ni « requise ». Table de correspondance en attendant
 * des codes côté scanner ; un texte inconnu n'est affiché que dans sa langue. */
import type { Dict, Locale } from "@/lib/i18n";

export type Cond =
  | { code: string }
  | { code: "min_qty"; n: number }
  | { code: "cumulus"; n: number }
  | { code: "region"; regions: string[] }
  | { code: "min_order"; amount: number }
  | { code: "text"; text: string; lang: Locale | "?" };

const REGION_WORDS: [RegExp, string][] = [[/deutsch/i, "de"], [/franz/i, "fr"], [/ital/i, "it"]];

/** Langue probable d'un court texte (heuristique sur mots-outils). */
export function guessLang(s: string): Locale | "?" {
  const t = ` ${s.toLowerCase()} `;
  const fr = (t.match(/ (le|la|les|des|du|de|et|sur|pour|avec|dès|jusqu|prix|valable|pièces?|requise?|offert|gratuit)[ ’']/g) ?? []).length;
  const de = (t.match(/ (der|die|das|und|mit|für|nur|ab|bei|nicht|auf|statt|anstatt|stück|erhältlich|gratis|aktion|monate?n?) /g) ?? []).length;
  if (fr > de) return "fr";
  if (de > fr) return "de";
  return "?";
}

export function parseCondition(raw: string): Cond | null {
  const s = raw.trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if (/épuisement du stock|solange vorrat/i.test(s)) return { code: "while_stocks" };
  if ((m = s.match(/(?:dès|ab|minimum)\s+(\d+)\s*(?:pièces?|stück|unités?)/i))) return { code: "min_qty", n: Number(m[1]) };
  if (/lidl plus/i.test(s)) return { code: /plus bas|günstiger/i.test(s) ? "lidl_plus_lower" : "lidl_plus" };
  if (/gamme d.articles|tout un assortiment|ganze[ns]? sortiment/i.test(s)) return { code: "range" };
  if (/plusieurs sortes|mehrere sorten/i.test(s)) return { code: "variants_vary" };
  if ((m = s.match(/(\d+)\s*x\s*points?\s*cumulus|(\d+)x\s*cumulus/i))) return { code: "cumulus", n: Number(m[1] ?? m[2]) };
  if (/poids approximatif|prix au poids|poids variable/i.test(s)) return { code: "by_weight" };
  if (/nicht mit anderen .*kumulierbar|non cumulable/i.test(s)) return { code: "no_combine" };
  if (/kleineren verkaufsstellen|pas dans tous les magasins/i.test(s)) return { code: "small_stores" };
  if (/neukund|nouveaux? clients?/i.test(s)) return { code: "new_customers" };
  if ((m = s.match(/^nur in der (.+) schweiz erhältlich/i))) {
    const regions = REGION_WORDS.filter(([re]) => re.test(m![1])).map(([, r]) => r);
    if (regions.length) return { code: "region", regions };
  }
  return { code: "text", text: s, lang: guessLang(s) };
}

/** Conditions déduites des champs structurés du scanner. */
export function structuredConditions(d: {
  requires_membership?: unknown; requires_account?: unknown; requires_coupon?: unknown; requires_student?: unknown;
  minimum_quantity?: unknown; minimum_order_value?: unknown;
}): Cond[] {
  const out: Cond[] = [];
  if (typeof d.minimum_quantity === "number" && d.minimum_quantity > 1) out.push({ code: "min_qty", n: d.minimum_quantity });
  if (typeof d.minimum_order_value === "number" && d.minimum_order_value > 0) out.push({ code: "min_order", amount: d.minimum_order_value });
  if (d.requires_membership === true) out.push({ code: "membership" });
  if (d.requires_coupon === true) out.push({ code: "coupon" });
  if (d.requires_account === true) out.push({ code: "account" });
  return out;
}

const key = (c: Cond) => ("n" in c ? `${c.code}:${c.n}` : c.code === "text" ? `t:${(c as { text: string }).text}` : c.code);

/** Fusionne, dédoublonne (une seule quantité minimale), ordonne par importance. */
export function mergeConditions(list: (Cond | null)[]): Cond[] {
  const seen = new Set<string>();
  const out: Cond[] = [];
  for (const c of list) {
    if (!c) continue;
    if (c.code === "min_qty" && out.some((x) => x.code === "min_qty")) continue;
    if (c.code === "lidl_plus_lower" && out.some((x) => x.code === "lidl_plus")) continue;
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  const rank = (c: Cond) => ["lidl_plus", "membership", "account", "min_qty", "min_order", "coupon", "new_customers", "region"].indexOf(c.code);
  return out.sort((a, b) => (rank(a) < 0 ? 99 : rank(a)) - (rank(b) < 0 ? 99 : rank(b)));
}

/** Conditions qui changent vraiment le prix pour l'utilisateur : montrées sur la carte. */
export const CARD_CONDITIONS = new Set(["lidl_plus", "membership", "min_qty", "min_order", "coupon", "new_customers", "region"]);

/** Texte d'une condition dans la langue de la page ; null = texte d'une autre
 * langue (remplacé par « autres conditions chez le vendeur »). */
export function conditionText(c: Cond, t: Dict, locale: Locale, fmtMoney: (v: number) => string): string | null {
  switch (c.code) {
    case "min_qty": return t.condMinQty((c as { n: number }).n);
    case "cumulus": return t.condCumulus((c as { n: number }).n);
    case "min_order": return t.condMinOrder(fmtMoney((c as { amount: number }).amount));
    case "region": return t.condRegion((c as { regions: string[] }).regions.map((r) => t.regions[r]).join(t.regionJoin));
    case "text": {
      const x = c as { text: string; lang: Locale | "?" };
      return x.lang === locale ? x.text : null;
    }
    default: return t.cond[c.code] ?? null;
  }
}

/** Liste prête à afficher : traduite, textes d'une autre langue regroupés en une ligne. */
export function conditionLines(conds: Cond[], t: Dict, locale: Locale, fmtMoney: (v: number) => string): string[] {
  const lines: string[] = [];
  let other = false;
  for (const c of conds) {
    const s = conditionText(c, t, locale, fmtMoney);
    if (s) lines.push(s);
    else other = true;
  }
  if (other) lines.push(t.condOther);
  return [...new Set(lines)];
}
