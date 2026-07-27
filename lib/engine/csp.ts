// ---------------------------------------------------------------------------
// Caractéristiques par catégorie socioprofessionnelle (CSP).
//
// Ces coefficients différencient les profils au-delà du seul salaire : à revenu
// égal, un cadre, un ouvrier, un indépendant ou un fonctionnaire n'ont pas la
// même dynamique de carrière, le même risque de précarité, ni le même taux de
// remplacement à la retraite. Valeurs : ordres de grandeur calibrés sur les
// publications INSEE / DREES / DARES (à affiner avec données réelles en V2).
// ---------------------------------------------------------------------------

import type { CSP } from "./types";

export interface CSPProfile {
  /** Libellé lisible. */
  label: string;
  /**
   * Pente de carrière : croissance réelle annuelle du salaire au-delà de
   * l'inflation, sur la timeline. Forte pour les cadres, plate pour les
   * ouvriers/employés. Sert à différencier les trajectoires 2000–2026.
   */
  penteCarriere: number;
  /**
   * Facteur de risque de précarité (multiplie la composante "emploi" du score).
   * > 1 = plus exposé (intérim ouvrier), < 1 = protégé (fonctionnaire).
   */
  risqueEmploi: number;
  /**
   * Taux de remplacement retraite relatif (1 = référence régime général).
   * Les fonctionnaires et certains régimes ont un taux plus favorable ; les
   * indépendants cotisent souvent moins → pension plus faible.
   */
  remplacementRetraite: number;
  /**
   * Part du salaire soumise au régime indépendant (cotisations différentes).
   * 0 = salarié classique, 1 = pleinement indépendant.
   */
  partIndependant: number;
}

export const CSP_PROFILES: Record<CSP, CSPProfile> = {
  ouvrier: {
    label: "Ouvrier",
    penteCarriere: 0.004,
    risqueEmploi: 1.35,
    remplacementRetraite: 0.95,
    partIndependant: 0,
  },
  employe: {
    label: "Employé",
    penteCarriere: 0.006,
    risqueEmploi: 1.2,
    remplacementRetraite: 0.97,
    partIndependant: 0,
  },
  profIntermediaire: {
    label: "Profession intermédiaire",
    penteCarriere: 0.012,
    risqueEmploi: 0.95,
    remplacementRetraite: 1.0,
    partIndependant: 0,
  },
  cadre: {
    label: "Cadre",
    penteCarriere: 0.02,
    risqueEmploi: 0.7,
    remplacementRetraite: 1.05,
    partIndependant: 0,
  },
  agriculteur: {
    label: "Agriculteur",
    penteCarriere: 0.003,
    risqueEmploi: 1.25,
    remplacementRetraite: 0.7,
    partIndependant: 1,
  },
  artisanCommercant: {
    label: "Artisan-commerçant",
    penteCarriere: 0.009,
    risqueEmploi: 1.15,
    remplacementRetraite: 0.8,
    partIndependant: 1,
  },
  independant: {
    label: "Indépendant",
    penteCarriere: 0.011,
    risqueEmploi: 1.1,
    remplacementRetraite: 0.78,
    partIndependant: 1,
  },
  fonctionnaire: {
    label: "Fonctionnaire",
    penteCarriere: 0.008,
    risqueEmploi: 0.4,
    remplacementRetraite: 1.1,
    partIndependant: 0,
  },
};

export const cspProfile = (csp: CSP): CSPProfile => CSP_PROFILES[csp];
