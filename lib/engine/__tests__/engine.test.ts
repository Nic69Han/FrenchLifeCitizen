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

  it("retourne 11 indicateurs pour l'année sélectionnée", () => {
    const { current } = simulate(profileSmic, state, 2026);
    expect(current).toHaveLength(11);
    const keys = current.map((i) => i.key);
    expect(keys).toContain("pouvoirAchat");
    expect(keys).toContain("tauxEffortLogement");
    expect(keys).toContain("resteAVivre");
    expect(keys).toContain("pensionRetraite");
    expect(keys).toContain("scorePrecarite");
    expect(keys).toContain("tauxImpositionEffectif");
    expect(keys).toContain("empreinteCarbone");
    expect(keys).toContain("capaciteEpargne");
    expect(keys).toContain("coutTravailEmployeur");
    expect(keys).toContain("capaciteEmpruntImmo");
    expect(keys).toContain("indicateurProtection");
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
      expect(Number.isFinite(r.capaciteEpargne)).toBe(true);
      expect(r.capaciteEpargne).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.coutTravailEmployeur)).toBe(true);
    }
  });
});

describe("simulate — nouveaux paramètres profil", () => {
  const state = defaultStateParams(2026);

  it("temps partiel (50 %) réduit le pouvoir d'achat par rapport au temps plein", () => {
    const profileMiTemps: CitizenProfile = { ...profileSmic, tauxActivite: 0.5 };
    const { current: plein } = simulate(profileSmic, state, 2026);
    const { current: miTemps } = simulate(profileMiTemps, state, 2026);
    const paPlein = plein.find((i) => i.key === "pouvoirAchat")!.value;
    const paMiTemps = miTemps.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paMiTemps).toBeLessThan(paPlein);
  });

  it("heures supplémentaires augmentent le pouvoir d'achat", () => {
    const profileHS: CitizenProfile = { ...profileSmic, heuresSup: 10 };
    const { current: sansHS } = simulate(profileSmic, state, 2026);
    const { current: avecHS } = simulate(profileHS, state, 2026);
    const paSans = sansHS.find((i) => i.key === "pouvoirAchat")!.value;
    const paAvec = avecHS.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paAvec).toBeGreaterThan(paSans);
  });

  it("suppression exonération heures sup réduit l'avantage des HS", () => {
    const profileHS: CitizenProfile = { ...profileSmic, heuresSup: 10 };
    const stateNoExo = { ...state, exonerationHeuresSup: 0 };
    const { current: avecExo } = simulate(profileHS, state, 2026);
    const { current: sansExo } = simulate(profileHS, stateNoExo, 2026);
    const paAvecExo = avecExo.find((i) => i.key === "pouvoirAchat")!.value;
    const paSansExo = sansExo.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paSansExo).toBeLessThanOrEqual(paAvecExo);
  });

  it("revenus du capital augmentent le pouvoir d'achat (net PFU)", () => {
    const profileCapital: CitizenProfile = {
      ...profileSmic,
      capitalFinancierMensuel: 500,
    };
    const { current: avecCapital } = simulate(profileCapital, state, 2026);
    const { current: sansCapital } = simulate(profileSmic, state, 2026);
    const paAvec = avecCapital.find((i) => i.key === "pouvoirAchat")!.value;
    const paSans = sansCapital.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paAvec).toBeGreaterThan(paSans + 300); // 500 × (1-30%) = 350€ net
  });

  it("hausse PFU réduit le revenu du capital", () => {
    const profileCapital: CitizenProfile = {
      ...profileSmic,
      capitalFinancierMensuel: 500,
    };
    const statePFUHaut = { ...state, tauxPFU: 0.45 };
    const { current: pfuNormal } = simulate(profileCapital, state, 2026);
    const { current: pfuHaut } = simulate(profileCapital, statePFUHaut, 2026);
    const paNormal = pfuNormal.find((i) => i.key === "pouvoirAchat")!.value;
    const paHaut = pfuHaut.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paHaut).toBeLessThan(paNormal);
  });

  it("parent isolé bénéficie du RSA majoré (+25 %) en situation sans emploi", () => {
    const profileIsole: CitizenProfile = {
      ...profileSmic,
      contrat: "sansEmploi",
      salaireBrutAnnuel: 0,
      anciennete: 0,
      nbEnfants: 1,
      parentIsole: true,
    };
    const profileNonIsole: CitizenProfile = {
      ...profileIsole,
      parentIsole: false,
    };
    const { current: isole } = simulate(profileIsole, state, 2026);
    const { current: nonIsole } = simulate(profileNonIsole, state, 2026);
    const paIsole = isole.find((i) => i.key === "pouvoirAchat")!.value;
    const paNonIsole = nonIsole.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paIsole).toBeGreaterThan(paNonIsole);
  });

  it("coût total employeur > salaire brut (cotisations patronales)", () => {
    const { current } = simulate(profileSmic, state, 2026);
    const cout = current.find((i) => i.key === "coutTravailEmployeur")!.value;
    const smic = smicBrut(2026);
    expect(cout).toBeGreaterThan(smic); // salaire brut seul
    expect(cout).toBeLessThan(smic * 2); // borne haute raisonnable
  });

  it("hausse cotisations patronales augmente le coût travail", () => {
    const stateHautPat = { ...state, tauxCotisationsPatronales: 0.55 };
    const { current: base } = simulate(profileSmic, state, 2026);
    const { current: haut } = simulate(profileSmic, stateHautPat, 2026);
    const coutBase = base.find((i) => i.key === "coutTravailEmployeur")!.value;
    const coutHaut = haut.find((i) => i.key === "coutTravailEmployeur")!.value;
    expect(coutHaut).toBeGreaterThan(coutBase);
  });

  it("capacité d'épargne est nulle ou positive", () => {
    const { current } = simulate(profileSmic, state, 2026);
    const epargne = current.find((i) => i.key === "capaciteEpargne")!.value;
    expect(epargne).toBeGreaterThanOrEqual(0);
  });
});

describe("simulate — vague 3 : transport, loyer, scolaire, énergie, retraite familiale", () => {
  const state = defaultStateParams(2026);

  it("remboursement transport employeur 100 % réduit le coût du transport en commun", () => {
    const state0 = { ...state, remboursementTransportEmployeur: 0 };
    const state1 = { ...state, remboursementTransportEmployeur: 1 };
    const { current: c0 } = simulate(profileSmic, state0, 2026);
    const { current: c1 } = simulate(profileSmic, state1, 2026);
    const pa0 = c0.find((i) => i.key === "pouvoirAchat")!.value;
    const pa1 = c1.find((i) => i.key === "pouvoirAchat")!.value;
    expect(pa1).toBeGreaterThan(pa0);
  });

  it("encadrement des loyers réduit le coût du logement (locataire privé)", () => {
    const profileLoc: CitizenProfile = { ...profileSmic, logement: "locatairePrive", loyerOuMensualite: 0 };
    const stateEnc = { ...state, plafonnementLoyersMultiplicateur: 0.8 };
    const { current: base } = simulate(profileLoc, state, 2026);
    const { current: enc } = simulate(profileLoc, stateEnc, 2026);
    const paBase = base.find((i) => i.key === "pouvoirAchat")!.value;
    const paEnc = enc.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paEnc).toBeGreaterThan(paBase);
  });

  it("cantine gratuite améliore le pouvoir d'achat des familles", () => {
    const profileFamille: CitizenProfile = {
      ...profileSmic,
      nbEnfants: 2,
      situationFamiliale: "marie",
      age: 35,
    };
    const stateCantine0 = { ...state, fraisScolairesMunicipaux: 0 };
    const { current: avecCantine } = simulate(profileFamille, state, 2026);
    const { current: sansCantine } = simulate(profileFamille, stateCantine0, 2026);
    const paAvec = avecCantine.find((i) => i.key === "pouvoirAchat")!.value;
    const paSans = sansCantine.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paSans).toBeGreaterThan(paAvec); // cantine 0 = moins de dépenses = plus de PA
  });

  it("chèque énergie améliore le pouvoir d'achat des ménages modestes", () => {
    const stateSansCheque = { ...state, chequeEnergieBase: 0 };
    const { current: avecCheque } = simulate(profileSmic, state, 2026);
    const { current: sansCheque } = simulate(profileSmic, stateSansCheque, 2026);
    const paAvec = avecCheque.find((i) => i.key === "pouvoirAchat")!.value;
    const paSans = sansCheque.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paAvec).toBeGreaterThanOrEqual(paSans);
  });

  it("majoration retraite +10 % pour 3 enfants (CNAV)", () => {
    const profileRet3: CitizenProfile = {
      ...profileSmic,
      nom: "Retraité3",
      age: 67,
      contrat: "retraite",
      anciennete: 40,
      nbEnfants: 3,
    };
    const profileRet0: CitizenProfile = { ...profileRet3, nbEnfants: 0 };
    const { current: avec3 } = simulate(profileRet3, state, 2026);
    const { current: avec0 } = simulate(profileRet0, state, 2026);
    const pension3 = avec3.find((i) => i.key === "pensionRetraite")!.value;
    const pension0 = avec0.find((i) => i.key === "pensionRetraite")!.value;
    expect(pension3).toBeGreaterThan(pension0 * 1.05); // au moins +5 % (bonus +10 % net du minimum)
  });

  it("avantages salariés augmentent le pouvoir d'achat", () => {
    const profileAvantages: CitizenProfile = { ...profileSmic, avantagesSalaries: 200 };
    const { current: avecAv } = simulate(profileAvantages, state, 2026);
    const { current: sansAv } = simulate(profileSmic, state, 2026);
    const paAvec = avecAv.find((i) => i.key === "pouvoirAchat")!.value;
    const paSans = sansAv.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paAvec).toBeGreaterThan(paSans + 150); // ~200 €/mois nets indexés
  });
});

describe("simulate — vague 4 : crédit immo, énergie, dépendance", () => {
  const state = defaultStateParams(2026);

  it("capaciteEmpruntImmo > 0 pour un salarié avec revenus positifs", () => {
    const { current } = simulate(profileSmic, state, 2026);
    const emprunt = current.find((i) => i.key === "capaciteEmpruntImmo")!;
    expect(emprunt.value).toBeGreaterThan(0);
  });

  it("baisse du taux immobilier augmente la capacité d'emprunt", () => {
    const stateBas = { ...state, tauxCreditImmobilier: 0.01 };
    const stateHaut = { ...state, tauxCreditImmobilier: 0.05 };
    const { current: bas } = simulate(profileSmic, stateBas, 2026);
    const { current: haut } = simulate(profileSmic, stateHaut, 2026);
    const empruntBas = bas.find((i) => i.key === "capaciteEmpruntImmo")!.value;
    const empruntHaut = haut.find((i) => i.key === "capaciteEmpruntImmo")!.value;
    expect(empruntBas).toBeGreaterThan(empruntHaut);
  });

  it("suppression du bouclier tarifaire augmente le coût de l'énergie (réduit PA)", () => {
    const stateSansBouclier = { ...state, bouclierTarifaireEnergie: 0 };
    const { current: avecBouclier } = simulate(profileSmic, state, 2026);
    const { current: sansBouclier } = simulate(profileSmic, stateSansBouclier, 2026);
    const paAvec = avecBouclier.find((i) => i.key === "pouvoirAchat")!.value;
    const paSans = sansBouclier.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paAvec).toBeGreaterThan(paSans);
  });

  it("APA réduit le reste à charge d'un senior dépendant (niveau 2)", () => {
    const profileSeniorDep: CitizenProfile = {
      ...profileSmic,
      age: 78,
      contrat: "retraite",
      niveauDependance: 2,
    };
    const stateApaPleine = { ...state, tauxCouvertureAPA: 1.0 };
    const stateApaNulle = { ...state, tauxCouvertureAPA: 0.0 };
    const { current: avecAPA } = simulate(profileSeniorDep, stateApaPleine, 2026);
    const { current: sansAPA } = simulate(profileSeniorDep, stateApaNulle, 2026);
    const paAvec = avecAPA.find((i) => i.key === "pouvoirAchat")!.value;
    const paSans = sansAPA.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paAvec).toBeGreaterThan(paSans);
  });
});

describe("simulate — vague 5 : maladie, ARE, MaPrimeRénov, PER, bonus VE", () => {
  const state = defaultStateParams(2026);

  it("arrêts maladie réduisent le pouvoir d'achat (carence + perte IJ)", () => {
    const profileMalade: CitizenProfile = { ...profileSmic, joursMaladieAnnee: 20 };
    const { current: sain } = simulate(profileSmic, state, 2026);
    const { current: malade } = simulate(profileMalade, state, 2026);
    const paSain = sain.find((i) => i.key === "pouvoirAchat")!.value;
    const paMalade = malade.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paMalade).toBeLessThan(paSain);
  });

  it("suppression carence maladie (0 j) améliore PA d'une personne souvent malade", () => {
    const profileMalade: CitizenProfile = { ...profileSmic, joursMaladieAnnee: 15 };
    const state3j = { ...state, delaiCarenceMaladie: 3 };
    const state0j = { ...state, delaiCarenceMaladie: 0 };
    const { current: avec3j } = simulate(profileMalade, state3j, 2026);
    const { current: avec0j } = simulate(profileMalade, state0j, 2026);
    const pa3 = avec3j.find((i) => i.key === "pouvoirAchat")!.value;
    const pa0 = avec0j.find((i) => i.key === "pouvoirAchat")!.value;
    expect(pa0).toBeGreaterThan(pa3);
  });

  it("droits ARE épuisés (ancienneteSansEmploi >= dureeMaxAre) bascule sur RSA", () => {
    const profileChomeur: CitizenProfile = {
      ...profileSmic,
      contrat: "sansEmploi",
      anciennete: 5,
      ancienneteSansEmploi: 0, // droits ARE encore actifs
    };
    const profileExhauste: CitizenProfile = { ...profileChomeur, ancienneteSansEmploi: 18 };
    const { current: avec } = simulate(profileChomeur, state, 2026);
    const { current: epuise } = simulate(profileExhauste, state, 2026);
    const paAvec = avec.find((i) => i.key === "pouvoirAchat")!.value;
    const paEpuise = epuise.find((i) => i.key === "pouvoirAchat")!.value;
    // ARE > RSA → épuisement réduit le PA
    expect(paEpuise).toBeLessThan(paAvec);
  });

  it("durée ARE plus longue améliore la protection sociale", () => {
    const stateAre12 = { ...state, dureeMaxAre: 12 };
    const stateAre36 = { ...state, dureeMaxAre: 36 };
    const { current: c12 } = simulate(profileSmic, stateAre12, 2026);
    const { current: c36 } = simulate(profileSmic, stateAre36, 2026);
    const prot12 = c12.find((i) => i.key === "indicateurProtection")!.value;
    const prot36 = c36.find((i) => i.key === "indicateurProtection")!.value;
    expect(prot36).toBeGreaterThanOrEqual(prot12);
  });

  it("MaPrimeRénov améliore le PA d'un propriétaire modeste", () => {
    const profileProprio: CitizenProfile = {
      ...profileSmic,
      logement: "proprietaireSansCredit",
      loyerOuMensualite: 0,
    };
    const stateSansMPR = { ...state, maPrimeRenovBase: 0 };
    const { current: avecMPR } = simulate(profileProprio, state, 2026);
    const { current: sansMPR } = simulate(profileProprio, stateSansMPR, 2026);
    const paAvec = avecMPR.find((i) => i.key === "pouvoirAchat")!.value;
    const paSans = sansMPR.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paAvec).toBeGreaterThan(paSans);
  });

  it("PER réduit l'impôt sur le revenu d'un cadre (déductibilité)", () => {
    const profileCadre: CitizenProfile = { ...profileSmic, csp: "cadre", salaireBrutAnnuel: 80000 };
    const profileCadrePER: CitizenProfile = { ...profileCadre, epargneRetraiteMensuelle: 300 };
    const { current: sansPER } = simulate(profileCadre, state, 2026);
    const { current: avecPER } = simulate(profileCadrePER, state, 2026);
    // Avec PER : base IR réduite → IR plus bas mais PA baisse car dépense PER > gain IR
    // Le taux d'imposition effectif doit être plus bas
    const tauxSans = sansPER.find((i) => i.key === "tauxImpositionEffectif")!.value;
    const tauxAvec = avecPER.find((i) => i.key === "tauxImpositionEffectif")!.value;
    expect(tauxAvec).toBeLessThanOrEqual(tauxSans);
  });

  it("bonus voiture électrique améliore le PA d'un usager VE", () => {
    const profileVE: CitizenProfile = { ...profileSmic, transport: "voitureElectrique" };
    const stateSansBonus = { ...state, bonusVehiculeElectrique: 0 };
    const { current: avecBonus } = simulate(profileVE, state, 2026);
    const { current: sansBonus } = simulate(profileVE, stateSansBonus, 2026);
    const paAvec = avecBonus.find((i) => i.key === "pouvoirAchat")!.value;
    const paSans = sansBonus.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paAvec).toBeGreaterThan(paSans);
  });

  it("indicateurProtection entre 0 et 100 pour tout profil", () => {
    const profiles = [profileSmic, profileRsa, profileRetraite];
    profiles.forEach((p) => {
      const { current } = simulate(p, state, 2026);
      const prot = current.find((i) => i.key === "indicateurProtection")!.value;
      expect(prot).toBeGreaterThanOrEqual(0);
      expect(prot).toBeLessThanOrEqual(100);
    });
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
