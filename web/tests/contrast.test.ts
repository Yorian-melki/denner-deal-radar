import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Contrastes du design system (app/globals.css), clair ET sombre :
 * texte ≥ 4.5:1 (WCAG 1.4.3), bordures de contrôle ≥ 3:1 (WCAG 1.4.11). */
const css = readFileSync(path.join(import.meta.dirname, "..", "app", "globals.css"), "utf8");

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) out[m[1]] = m[2];
  return out;
}
const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)")));
const darkBlock = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
const dark = { ...light, ...tokens(darkBlock.slice(0, darkBlock.indexOf("}\n}") + 1)) };

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TEXT: [string, string][] = [
  ["fg", "bg"], ["fg", "surface"], ["fg", "fill"], ["muted", "bg"], ["muted", "surface"], ["muted", "fill"],
  ["accent", "bg"], ["accent", "surface"], ["accent-fg", "accent"], ["accent-strong", "accent-tint"], ["bg", "fg"],
];
// Puces (round 3, item 18) : texte --fg sur --surface (inactive) et --fill (active) ; bordure --control sur --bg.
const CONTROL: [string, string][] = [["control", "bg"], ["control", "surface"], ["focus", "bg"], ["focus", "surface"]];

describe.each([["clair", light], ["sombre", dark]] as const)("thème %s", (_name, t) => {
  it.each(TEXT)("texte --%s sur --%s ≥ 4.5:1", (fg, bg) => {
    expect(t[fg], fg).toBeDefined();
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(CONTROL)("contrôle --%s sur --%s ≥ 3:1", (fg, bg) => {
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe("échelle typographique", () => {
  it("font-size et font-weight seulement via les jetons", () => {
    const rules = css.slice(css.indexOf("/* ---------- Base"));
    for (const m of rules.matchAll(/font-size:\s*([^;]+);/g)) expect(m[1], m[0]).toMatch(/^(var\(--t-[a-z0-9]+\)|inherit|0\.95em|0\.58em|28px)$/);
    for (const m of rules.matchAll(/font-weight:\s*([^;]+);/g)) expect(m[1], m[0]).toMatch(/^var\(--w-(regular|medium|semi|bold)\)$/);
  });
});
