import { describe, it, expect } from "vitest";
import {
  ageLegalGeneration,
  trimestresCiblesGeneration,
  defaultStateParams,
  ipc,
  smicBrut,
  rsaSocle,
  YEAR_MIN,
  YEAR_MAX,
} from "../data";

// ---------------------------------------------------------------------------
// Grille CNAV réelle (réforme 2023 incluse) — source OpenFisca-France-Pension
// Ces valeurs font office de contrat : si elles changent, c'est une rupture.
// ---------------------------------------------------------------------------
describe("Grille CNAV — âge légal par génération", () => {
  it("génération 1945 → 60 ans", () => {
    expect(ageLegalGeneration(1945)).toBe(60);
  });

  it("génération 1955 → 62 ans", () => {
    expect(ageLegalGeneration(1955)).toBe(62);
  });

  it("génération 1965 → 63.25 ans (réforme 2023)", () => {
    expect(ageLegalGeneration(1965)).toBe(63.25);
  });

  it("génération 1968 → 64 ans (réforme 2023, plein)", () => {
    expect(ageLegalGeneration(1968)).toBe(64);
  });
});

describe("Grille CNAV — trimestres requis par génération", () => {
  it("génération 1945 → 160 trimestres", () => {
    expect(trimestresCiblesGeneration(1945)).toBe(160);
  });

  it("génération 1955 → 166 trimestres", () => {
    expect(trimestresCiblesGeneration(1955)).toBe(166);
  });

  it("génération 1965 → 172 trimestres", () => {
    expect(trimestresCiblesGeneration(1965)).toBe(172);
  });

  it("génération 1968 → 172 trimestres", () => {
    expect(trimestresCiblesGeneration(1968)).toBe(172);
  });
});

// ---------------------------------------------------------------------------
// Paramètres légaux réels 2026 (OpenFisca-France)
// ---------------------------------------------------------------------------
describe("Paramètres légaux 2026", () => {
  it("SMIC brut mensuel 2026 = 1823 €", () => {
    expect(smicBrut(2026)).toBe(1823);
  });

  it("RSA socle 2026 = 647 €", () => {
    expect(rsaSocle(2026)).toBe(647);
  });

  it("defaultStateParams 2026 — curseurs cohérents", () => {
    const s = defaultStateParams(2026);
    expect(s.smicBrutMensuel).toBe(1823);
    expect(s.rsaSocle).toBe(647);
    expect(s.tauxCotisationsSalariales).toBeGreaterThan(0.1);
    expect(s.tauxCotisationsSalariales).toBeLessThan(0.25);
    expect(s.tauxMarginalIR).toBe(0.45);
    expect(s.ageLegalRetraite).toBeGreaterThanOrEqual(62);
    expect(s.trimestresRequis).toBeGreaterThanOrEqual(166);
  });
});

// ---------------------------------------------------------------------------
// IPC réel INSEE (série 001763852, base 2000 = 100)
// ---------------------------------------------------------------------------
describe("IPC INSEE — cohérence des données réelles", () => {
  it("base 2000 = 100", () => {
    expect(ipc(YEAR_MIN)).toBe(100);
  });

  it("IPC 2010 entre 115 et 120 (inflation cumulée ~17 %)", () => {
    expect(ipc(2010)).toBeGreaterThan(115);
    expect(ipc(2010)).toBeLessThan(120);
  });

  it("IPC 2020 entre 125 et 135", () => {
    expect(ipc(2020)).toBeGreaterThan(125);
    expect(ipc(2020)).toBeLessThan(135);
  });

  it("IPC 2024 entre 140 et 155 (poussée inflationniste 2021-2023)", () => {
    expect(ipc(2024)).toBeGreaterThan(140);
    expect(ipc(2024)).toBeLessThan(155);
  });

  it("IPC croissant de 2000 à 2024 (pas de déflation prolongée)", () => {
    for (let y = YEAR_MIN + 1; y <= 2024; y++) {
      expect(ipc(y)).toBeGreaterThanOrEqual(ipc(YEAR_MIN));
    }
  });

  it("clamping : année hors bornes retourne une valeur (pas undefined)", () => {
    expect(ipc(1990)).toBeTypeOf("number");
    expect(ipc(2099)).toBeTypeOf("number");
  });
});
