// ---------------------------------------------------------------------------
// Déciles de revenu D1–D9 — profils représentatifs d'un salarié célibataire
// à temps complet, calibrés sur les salaires nets INSEE DADS (France, 2023).
//
// Conversion : net mensuel → brut annuel via taux de cotisations salariales
// moyen ~22 % (cotisations + CSG/CRDS). Arrondi à 500€ pour la lisibilité.
//
// Source : INSEE, DADS 2023 — Distribution des salaires nets mensuels ETP.
// ---------------------------------------------------------------------------

import { simulate } from "./index";
import type { CitizenProfile, StateParams, Indicator } from "./types";
import { smicBrut } from "./data";

export interface DecilePoint {
  decile: string;     // "D1" … "D9"
  rank: number;       // 1–9
  salaireBrutAnnuel: number;
  salaireNetMensuel: number;
  baseline: Indicator[];
  scenario: Indicator[];
}

// Salaires bruts annuels représentatifs par décile (célibataire ETP, 2023→2026).
// Valeur minimale = SMIC (D1 souvent en-deçà ou proche du SMIC).
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

function buildProfile(brut: number, year: number): CitizenProfile {
  const smic = smicBrut(year);
  return {
    nom: "Archétype",
    age: 35,
    situationFamiliale: "celibataire",
    nbEnfants: 0,
    csp: brut < smic * 12 * 1.3 ? "employe" : brut < 50_000 ? "profIntermediaire" : "cadre",
    salaireBrutAnnuel: Math.max(brut, smic * 12),
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
}

export function simulateDeciles(
  baselineState: StateParams,
  scenarioState: StateParams,
  year: number
): DecilePoint[] {
  return DECILE_BRUT_ANNUEL.map((brut, i) => {
    const profile = buildProfile(brut, year);
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
