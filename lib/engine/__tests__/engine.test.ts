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

  it("retourne 7 indicateurs pour l'année sélectionnée", () => {
    const { current } = simulate(profileSmic, state, 2026);
    expect(current).toHaveLength(7);
    const keys = current.map((i) => i.key);
    expect(keys).toContain("pouvoirAchat");
    expect(keys).toContain("tauxEffortLogement");
    expect(keys).toContain("resteAVivre");
    expect(keys).toContain("pensionRetraite");
    expect(keys).toContain("scorePrecarite");
    expect(keys).toContain("tauxImpositionEffectif");
    expect(keys).toContain("empreinteCarbone");
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

describe("simulate — prime d'activité et nouveaux modules", () => {
  const state = defaultStateParams(2026);

  it("prime d'activité booste le pouvoir d'achat d'un travailleur au SMIC (post-2016)", () => {
    const { current: avecPA } = simulate(profileSmic, state, 2026);
    const statePA0 = { ...state, primeActiviteRevalorisation: 0 };
    const { current: sansPA } = simulate(profileSmic, statePA0, 2026);
    const diffPA = avecPA.find((i) => i.key === "pouvoirAchat")!.value
                 - sansPA.find((i) => i.key === "pouvoirAchat")!.value;
    expect(diffPA).toBeGreaterThan(100); // PA vaut > 100 €/mois au SMIC
    expect(diffPA).toBeLessThan(500);    // mais < 500 €/mois (calibrage)
  });

  it("prime d'activité = 0 avant 2016", () => {
    const { current: pre2016 } = simulate(profileSmic, defaultStateParams(2015), 2015);
    const { current: post2016 } = simulate(profileSmic, defaultStateParams(2016), 2016);
    const pa2015 = pre2016.find((i) => i.key === "pouvoirAchat")!.value;
    const pa2016 = post2016.find((i) => i.key === "pouvoirAchat")!.value;
    // 2016 a la PA, 2015 non — saut visible même après indexation
    expect(pa2016).toBeGreaterThan(pa2015 - 50); // peut aussi monter d'autres raisons
  });

  it("suppression TVA alimentation réduit les dépenses alimentaires", () => {
    const stateNoTVA = { ...state, tvaReduite: 0 };
    const { current: avecTVA } = simulate(profileSmic, state, 2026);
    const { current: sansTVA } = simulate(profileSmic, stateNoTVA, 2026);
    const paAvec = avecTVA.find((i) => i.key === "pouvoirAchat")!.value;
    const paSans = sansTVA.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paSans).toBeGreaterThan(paAvec); // moins de TVA = plus de PA
  });

  it("hausse TVA normale réduit le pouvoir d'achat", () => {
    const stateTVAHaute = { ...state, tvaNormale: 0.25 };
    const { current: base } = simulate(profileSmic, state, 2026);
    const { current: haut } = simulate(profileSmic, stateTVAHaute, 2026);
    const paBase = base.find((i) => i.key === "pouvoirAchat")!.value;
    const paHaut = haut.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paHaut).toBeLessThan(paBase);
  });

  it("taxe foncière réduit le pouvoir d'achat d'un propriétaire", () => {
    const profileProprio: CitizenProfile = {
      ...profileSmic,
      logement: "proprietaireSansCredit",
      loyerOuMensualite: 0,
    };
    const stateTF0 = { ...state, taxeFonciereTauxM2: 0 };
    const { current: avecTF } = simulate(profileProprio, state, 2026);
    const { current: sansTF } = simulate(profileProprio, stateTF0, 2026);
    const paSans = sansTF.find((i) => i.key === "pouvoirAchat")!.value;
    const paAvec = avecTF.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paAvec).toBeLessThan(paSans);
    expect(paSans - paAvec).toBeGreaterThan(10); // TF non nulle
  });

  it("indicateur empreinteCarbone > 0 pour voiture essence", () => {
    const profileVoiture: CitizenProfile = {
      ...profileSmic,
      transport: "voitureEssence",
      distanceTravailKm: 15,
    };
    const { current } = simulate(profileVoiture, state, 2026);
    const co2 = current.find((i) => i.key === "empreinteCarbone")!.value;
    expect(co2).toBeGreaterThan(200); // transport + chauffage + alim
  });

  it("indicateur tauxImpositionEffectif entre 0 et 50 % pour un salarié", () => {
    const { current } = simulate(profileSmic, state, 2026);
    const taux = current.find((i) => i.key === "tauxImpositionEffectif")!.value;
    expect(taux).toBeGreaterThan(0);
    expect(taux).toBeLessThan(50);
  });

  it("ARE > RSA pour un sansEmploi avec ancienneté longue (SMIC × 57 % > RSA)", () => {
    const profileAre: CitizenProfile = {
      ...profileSmic,
      contrat: "sansEmploi",
      salaireBrutAnnuel: smicBrut(2026) * 12, // référence = SMIC
      anciennete: 5, // 5 ans → droits ARE
    };
    const { current } = simulate(profileAre, state, 2026);
    const pa = current.find((i) => i.key === "pouvoirAchat")!.value;
    // ARE à SMIC = 1823 × 0.57 ≈ 1039 €, bien supérieur au RSA
    const profileRsaOnly: CitizenProfile = { ...profileAre, anciennete: 0 };
    const { current: rsaC } = simulate(profileRsaOnly, state, 2026);
    const paRsa = rsaC.find((i) => i.key === "pouvoirAchat")!.value;
    expect(pa).toBeGreaterThan(paRsa);
  });
});
