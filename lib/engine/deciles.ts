// ---------------------------------------------------------------------------
// Déciles de revenu D1–D9 — profils représentatifs calibrés INSEE DADS 2023.
//
// Trois types de ménage disponibles :
//   "celibataire"    — salarié célibataire 35 ans, locataire (défaut)
//   "famille"        — couple marié 35 ans, 2 enfants, locataire
//   "retraite"       — retraité 67 ans, propriétaire sans crédit
//
// Pour le type "famille", le salaire brut du décile est celui du conjoint
// principal ; le foyer bénéficie des allocations familiales et d'une APL
// plus élevée (surface 70 m²).
// Pour le type "retraite", le salaire brut = salaire de référence de
// carrière (calcul de la pension proportionnel à l'ancienneté 40 ans).
// ---------------------------------------------------------------------------

import { simulate } from "./index";
import type { CitizenProfile, StateParams, Indicator } from "./types";
import { smicBrut } from "./data";

export type MenageType = "celibataire" | "famille" | "retraite";

export interface DecilePoint {
  decile: string;
  rank: number;
  salaireBrutAnnuel: number;
  salaireNetMensuel: number;
  baseline: Indicator[];
  scenario: Indicator[];
}

// Salaires bruts annuels représentatifs par décile (ETP, 2023→2026).
const DECILE_BRUT_ANNUEL = [
  21_600,   // D1  ≈ 1 400 € net/mois  (proche SMIC)
  26_000,   // D2  ≈ 1 700 € net/mois
  29_500,   // D3  ≈ 1 920 € net/mois
  32_500,   // D4  ≈ 2 115 € net/mois
  35_500,   // D5  ≈ 2 310 € net/mois  (médiane)
  40_000,   // D6  ≈ 2 600 € net/mois
  46_500,   // D7  ≈ 3 025 € net/mois
  57_500,   // D8  ≈ 3 740 € net/mois
  85_000,   // D9  ≈ 5 525 € net/mois
];

function csp(brut: number, smic12: number): CitizenProfile["csp"] {
  if (brut < smic12 * 1.3) return "employe";
  if (brut < 50_000) return "profIntermediaire";
  return "cadre";
}

function buildProfile(
  brut: number,
  year: number,
  type: MenageType
): CitizenProfile {
  const smic = smicBrut(year);
  const brutEffectif = Math.max(brut, smic * 12);

  const base: CitizenProfile = {
    nom: "Archétype",
    age: 35,
    situationFamiliale: "celibataire",
    nbEnfants: 0,
    csp: csp(brutEffectif, smic * 12),
    salaireBrutAnnuel: brutEffectif,
    contrat: "cdi",
    anciennete: 8,
    logement: "locatairePrive",
    surfaceM2: 40,
    chauffage: "electrique",
    loyerOuMensualite: 0,
    transport: "transportCommun",
    distanceTravailKm: 12,
    sante: "bonne",
    budgetAlimentaireMensuel: 350,
    abonnementsMensuels: 60,
    loisirsMensuels: 100,
  };

  if (type === "famille") {
    return {
      ...base,
      situationFamiliale: "marie",
      nbEnfants: 2,
      surfaceM2: 70,
      budgetAlimentaireMensuel: 700,
      abonnementsMensuels: 100,
      loisirsMensuels: 150,
    };
  }

  if (type === "retraite") {
    return {
      ...base,
      age: 67,
      contrat: "retraite",
      anciennete: 40,
      logement: "proprietaireSansCredit",
      surfaceM2: 80,
      loyerOuMensualite: 0,
      transport: "voitureEssence",
      distanceTravailKm: 0,
      budgetAlimentaireMensuel: 400,
      abonnementsMensuels: 70,
      loisirsMensuels: 120,
    };
  }

  return base;
}

export function simulateDeciles(
  baselineState: StateParams,
  scenarioState: StateParams,
  year: number,
  menage: MenageType = "celibataire"
): DecilePoint[] {
  return DECILE_BRUT_ANNUEL.map((brut, i) => {
    const profile = buildProfile(brut, year, menage);
    const bSim = simulate(profile, baselineState, year);
    const sSim = simulate(profile, scenarioState, year);
    return {
      decile: `D${i + 1}`,
      rank: i + 1,
      salaireBrutAnnuel: profile.salaireBrutAnnuel,
      salaireNetMensuel: Math.round(profile.salaireBrutAnnuel / 12 * 0.78),
      baseline: bSim.current,
      scenario: sSim.current,
    };
  });
}
