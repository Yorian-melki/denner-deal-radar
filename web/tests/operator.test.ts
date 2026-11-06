import { describe, expect, it } from "vitest";
import { isOperatorComplete, normPhone, normSiret, operator, siren } from "@/lib/operator";

const ENV = {
  NEXT_PUBLIC_OPERATOR_NAME: "Test Person",
  NEXT_PUBLIC_OPERATOR_SIRET: "123 456 789 00012",
  NEXT_PUBLIC_OPERATOR_ADDRESS: "Domiciliataire SAS | 1 rue Exemple | 75000 Paris | France",
  NEXT_PUBLIC_OPERATOR_EMAIL: "contact@example.ch",
};

describe("operator (micro-entreprise + domiciliation)", () => {
  it("formate le SIRET et refuse les valeurs invalides", () => {
    expect(normSiret("12345678900012")).toBe("123 456 789 00012");
    expect(normSiret("1234")).toBe("");
    expect(normSiret("12345678900012x")).toBe("");
  });
  it("n'accepte qu'un numéro plausible", () => {
    expect(normPhone("+33 9 70 00 00 00")).toBe("+33 9 70 00 00 00");
    expect(normPhone("appelle-moi")).toBe("");
    expect(normPhone("")).toBe("");
  });
  it("complet seulement avec nom, SIRET, adresse et e-mail", () => {
    const o = operator(ENV);
    expect(o.address).toEqual(["Domiciliataire SAS", "1 rue Exemple", "75000 Paris", "France"]);
    expect(siren(o)).toBe("123 456 789");
    expect(o.phone).toBe("");
    expect(isOperatorComplete(o)).toBe(true);
    expect(isOperatorComplete(operator({ ...ENV, NEXT_PUBLIC_OPERATOR_SIRET: "" }))).toBe(false);
    expect(isOperatorComplete(operator({ ...ENV, NEXT_PUBLIC_OPERATOR_EMAIL: "pas-un-mail" }))).toBe(false);
  });
  it("TVA facultative, format FR", () => {
    expect(operator({ ...ENV, NEXT_PUBLIC_OPERATOR_VAT: "FR12 123456789" }).vat).toBe("FR12123456789");
    expect(operator({ ...ENV, NEXT_PUBLIC_OPERATOR_VAT: "DE123" }).vat).toBe("");
  });
});
