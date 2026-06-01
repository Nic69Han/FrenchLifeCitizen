import { describe, it, expect } from "vitest";
import { computeMacroImpact, soldePctPib, dettePctPib, pibMd } from "../macro";
import { defaultStateParams } from "../data";

describe("données macro Eurostat 2024", () => {
  it("solde APU 2024 entre −7 et −4 % PIB (déficit réel)", () => {
    expect(soldePctPib(2024)).toBeGreaterThan(-7);
    expect(soldePctPib(2024)).toBeLessThan(-4);
  });

  it("dette 2024 entre 100 et 120 % PIB", () => {
    expect(dettePctPib(2024)).toBeGreaterThan(100);
    expect(dettePctPib(2024)).toBeLessThan(120);
  });

  it("PIB nominal 2024 entre 2500 et 3500 Md€", () => {
    expect(pibMd(2024)).toBeGreaterThan(2500);
    expect(pibMd(2024)).toBeLessThan(3500);
  });
});

describe("computeMacroImpact — baseline", () => {
  const state = defaultStateParams(2024);
  const impact = computeMacroImpact(state, 2024);

  it("delta total nul si curseurs identiques au baseline", () => {
    expect(Math.abs(impact.deltaTotalPp)).toBeLessThan(0.01);
  });

  it("solde projeté ≈ solde réel (pas de choc)", () => {
    expect(Math.abs(impact.soldePibProjecte - impact.soldePibRef)).toBeLessThan(0.05);
  });

  it("aucun détail de levier si baseline inchangé", () => {
    expect(impact.details).toHaveLength(0);
  });
});

describe("computeMacroImpact — choc TVA +5 pp", () => {
  const state = { ...defaultStateParams(2024), tvaNormale: 0.25 };
  const impact = computeMacroImpact(state, 2024);

  it("hausse TVA améliore le solde", () => {
    expect(impact.deltaTotalPp).toBeGreaterThan(0);
  });

  it("delta TVA présent dans les détails", () => {
    const tvaDelta = impact.details.find((d) => d.label === "TVA normale");
    expect(tvaDelta).toBeDefined();
    expect(tvaDelta!.deltaSoldePp).toBeGreaterThan(0);
  });

  it("delta TVA de l'ordre de 1 pp PIB", () => {
    expect(impact.deltaTotalPp).toBeGreaterThan(0.5);
    expect(impact.deltaTotalPp).toBeLessThan(3);
  });
});

describe("computeMacroImpact — hausse RSA +200 €", () => {
  const state = { ...defaultStateParams(2024), rsaSocle: defaultStateParams(2024).rsaSocle + 200 };
  const impact = computeMacroImpact(state, 2024);

  it("hausse RSA dégrade le solde", () => {
    expect(impact.deltaTotalPp).toBeLessThan(0);
  });
});

describe("computeMacroImpact — retraite +2 ans", () => {
  const state = { ...defaultStateParams(2024), ageLegalRetraite: defaultStateParams(2024).ageLegalRetraite + 2 };
  const impact = computeMacroImpact(state, 2024);

  it("retraite plus tardive améliore le solde", () => {
    expect(impact.deltaTotalPp).toBeGreaterThan(0);
  });
});
