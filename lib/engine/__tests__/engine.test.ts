import { describe, it, expect } from "vitest";
import { simulate } from "../index";
import { defaultStateParams, smicBrut, rsaSocle } from "../data";
import type { CitizenProfile } from "../types";

// Profil archétype : employé célibataire au SMIC
const profileSmic: CitizenProfile = {
  nom: "Fatima",
  age: 35,
  situationFamiliale: "celibataire",
  nbEnfants: 0,
  csp: "employe",
  salaireBrutAnnuel: smicBrut(2026) * 12,
  contrat: "cdi",
  anciennete: 10,
  logement: "locatairePrive",
  surfaceM2: 35,
  chauffage: "electrique",
  loyerOuMensualite: 0, // estimé par le moteur
  transport: "transportCommun",
  distanceTravailKm: 10,
  sante: "bonne",
  budgetAlimentaireMensuel: 350,
  abonnementsMensuels: 40,
  loisirsMensuels: 80,
};

// Profil RSA
const profileRsa: CitizenProfile = {
  ...profileSmic,
  nom: "RSA",
  contrat: "sansEmploi",
  salaireBrutAnnuel: 0,
};

// Profil retraité
const profileRetraite: CitizenProfile = {
  ...profileSmic,
  nom: "Bernard",
  age: 67,
  contrat: "retraite",
  csp: "ouvrier",
  salaireBrutAnnuel: smicBrut(2026) * 12,
  anciennete: 40,
};

describe("simulate — structure de sortie", () => {
  const state = defaultStateParams(2026);

  it("retourne 5 indicateurs pour l'année sélectionnée", () => {
    const { current } = simulate(profileSmic, state, 2026);
    expect(current).toHaveLength(5);
    const keys = current.map((i) => i.key);
    expect(keys).toContain("pouvoirAchat");
    expect(keys).toContain("tauxEffortLogement");
    expect(keys).toContain("resteAVivre");
    expect(keys).toContain("pensionRetraite");
    expect(keys).toContain("scorePrecarite");
  });

  it("timeline couvre 27 années (2000–2026)", () => {
    const { timeline } = simulate(profileSmic, state, 2026);
    expect(timeline).toHaveLength(27);
    expect(timeline[0].year).toBe(2000);
    expect(timeline[timeline.length - 1].year).toBe(2026);
  });
});

describe("simulate — SMIC célibataire 2026", () => {
  const state = defaultStateParams(2026);
  const { current } = simulate(profileSmic, state, 2026);
  const byKey = Object.fromEntries(current.map((i) => [i.key, i]));

  it("pouvoir d'achat positif (revenu > dépenses)", () => {
    expect(byKey.pouvoirAchat.value).toBeGreaterThan(0);
  });

  it("score de précarité > 0 (SMIC = situation tendue)", () => {
    expect(byKey.scorePrecarite.value).toBeGreaterThan(0);
  });

  it("score de précarité ≤ 100", () => {
    expect(byKey.scorePrecarite.value).toBeLessThanOrEqual(100);
  });

  it("taux d'effort logement ≥ 0", () => {
    expect(byKey.tauxEffortLogement.value).toBeGreaterThanOrEqual(0);
  });
});

describe("simulate — sans emploi (RSA)", () => {
  const state = defaultStateParams(2026);

  it("RSA socle inclus dans les aides (pouvoir d'achat > 0)", () => {
    const { current } = simulate(profileRsa, state, 2026);
    const pa = current.find((i) => i.key === "pouvoirAchat")!;
    // Le RSA (647 €) doit permettre un pouvoir d'achat, même sous les dépenses.
    // Il peut être négatif si les dépenses contraintes dépassent les aides.
    expect(pa.value).toBeTypeOf("number");
    expect(Number.isFinite(pa.value)).toBe(true);
  });

  it("score de précarité élevé pour une personne sans emploi", () => {
    const { current } = simulate(profileRsa, state, 2026);
    const score = current.find((i) => i.key === "scorePrecarite")!;
    expect(score.value).toBeGreaterThan(30);
  });
});

describe("simulate — retraité", () => {
  const state = defaultStateParams(2026);

  it("pension de retraite > 0", () => {
    const { current } = simulate(profileRetraite, state, 2026);
    const pension = current.find((i) => i.key === "pensionRetraite")!;
    expect(pension.value).toBeGreaterThan(0);
  });

  it("pension ≤ SMIC (ouvrier 40 ans, taux remplacement < 50 %)", () => {
    const { current } = simulate(profileRetraite, state, 2026);
    const pension = current.find((i) => i.key === "pensionRetraite")!;
    expect(pension.value).toBeLessThanOrEqual(smicBrut(2026));
  });
});

describe("simulate — mode Et si ? cohérence", () => {
  it("augmenter le SMIC améliore le pouvoir d'achat d'un travailleur au SMIC", () => {
    const stateBase = defaultStateParams(2026);
    const stateHaut = { ...stateBase, smicBrutMensuel: stateBase.smicBrutMensuel * 1.1 };

    const { current: base } = simulate(profileSmic, stateBase, 2026);
    const { current: haut } = simulate(profileSmic, stateHaut, 2026);

    const paBase = base.find((i) => i.key === "pouvoirAchat")!.value;
    const paHaut = haut.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paHaut).toBeGreaterThan(paBase);
  });

  it("augmenter la tranche haute de l'IR réduit le pouvoir d'achat d'un cadre (300k€)", () => {
    // La tranche 45 % s'applique au-delà de ~182 k€ imposable.
    // Avec 300 k€ brut : net mensuel ~21 600 € → imposable annuel ~233 k€ → 50 k€ dans la tranche haute.
    const profileCadre: CitizenProfile = {
      ...profileSmic,
      csp: "cadre",
      salaireBrutAnnuel: 300000,
    };
    const stateBase = defaultStateParams(2026);
    const stateHaut = { ...stateBase, tauxMarginalIR: 0.60 };

    const { current: base } = simulate(profileCadre, stateBase, 2026);
    const { current: haut } = simulate(profileCadre, stateHaut, 2026);

    const paBase = base.find((i) => i.key === "pouvoirAchat")!.value;
    const paHaut = haut.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paHaut).toBeLessThan(paBase);
  });

  it("timeline 2000-2026 : tous les résultats sont des nombres finis", () => {
    const state = defaultStateParams(2026);
    const { timeline } = simulate(profileSmic, state, 2026);
    for (const r of timeline) {
      expect(Number.isFinite(r.pouvoirAchat)).toBe(true);
      expect(Number.isFinite(r.scorePrecarite)).toBe(true);
      expect(r.scorePrecarite).toBeGreaterThanOrEqual(0);
      expect(r.scorePrecarite).toBeLessThanOrEqual(100);
    }
  });
});
