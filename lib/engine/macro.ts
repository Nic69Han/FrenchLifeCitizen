// ---------------------------------------------------------------------------
// Estimateur d'impact macro-budgétaire des curseurs d'État.
//
// Principe : partir des séries réelles Eurostat (data/macro-series.json) pour
// l'année de référence, puis estimer l'effet marginal de chaque levier fiscal
// en % PIB. On obtient un delta solde APU et une projection de dette.
//
// Tout est exprimé en % PIB (grandeur universelle des finances publiques) et
// en Md€ pour la lisibilité.
// ---------------------------------------------------------------------------

import macroData from "@/data/macro-series.json";
import type { StateParams } from "./types";
import { defaultStateParams, YEAR_MIN, YEAR_MAX } from "./data";

// --- Lecture des séries Eurostat -------------------------------------------

const YEARS_MACRO = macroData.meta.years as number[];

function idxMacro(year: number): number {
  const clamped = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
  return YEARS_MACRO.indexOf(clamped);
}

function readMacro(key: keyof typeof macroData, year: number): number {
  const arr = macroData[key] as unknown as (number | null)[];
  return (arr[idxMacro(year)] ?? 0) as number;
}

/** Solde APU (% PIB) — déficit si négatif. */
export const soldePctPib = (year: number) => readMacro("soldePctPib", year);
/** Dette publique Maastricht (% PIB). */
export const dettePctPib = (year: number) => readMacro("dettePubliquePctPib", year);
/** PIB nominal (Md€). */
export const pibMd = (year: number) => readMacro("pibNominalMd", year);

// --- Élasticités calibrées (ordre de grandeur macro France) ----------------
// Sources : CPO, Rapport économique PLF, littérature OCDE.
//
// Unité : variation du solde APU en pp de PIB pour une variation de 1 pp du
// taux concerné. Conventions :
//   (+) hausse du taux → améliore le solde (recette ou économie)
//   (−) hausse du taux → dégrade le solde (dépense ou fuite)

const ELAST = {
  // Hausse de 1 pp de cotisations salariales : +0.4 pp solde (recette directe)
  cotisationsSalariales: 0.4,
  // Hausse de 1 pp taux marginal IR (effet sur le rendement total ~0.05 pp PIB)
  tauxMarginalIR: 0.05,
  // Hausse de 1 pp TVA normale : +0.25 pp solde (assiette ~55 % PIB × 0.45 part régime normal)
  tva: 0.25,
  // Hausse du SMIC de 1 % → +0.06 % PIB cotisations patronales + salariales et TVA
  //   mais aussi +0.04 % PIB prestations + fonctionnement → net ~+0.02 % PIB solde
  smicPct: 0.02,
  // Hausse de 10 € RSA/mois sur ~2,2M bénéficiaires → ~2,6 Md€/an ≈ 0.09 % PIB
  rsa10Euros: -0.09,
  // Hausse de 10 % APL : dépense ~17 Md€ × 10 % = 1.7 Md€ ≈ 0.06 % PIB
  aplMult10Pct: -0.06,
  // Hausse d'1 an de l'âge légal de retraite : économie nette ~4 Md€ ≈ 0.14 % PIB
  ageLegal1An: 0.14,
  // Hausse de 4 trimestres requis : économie nette ~2 Md€ ≈ 0.07 % PIB
  trimestres4: 0.07,
  // Taxe carbone : +10 €/tonne → recette ~2.3 Md€ ≈ 0.08 % PIB
  taxeCarbone10Eur: 0.08,
  // TICPE : +0.10 €/litre → recette ~3.5 Md€ ≈ 0.12 % PIB
  ticpe10Ct: 0.12,
  // Remboursement santé +1 pp → dépense ~1 Md€ ≈ 0.035 % PIB
  tauxRembSante: -0.035,
} as const;

// --- Résultat de l'analyse macro -------------------------------------------

export interface MacroDelta {
  /** Intitulé du levier activé. */
  label: string;
  /** Variation du solde APU en pp PIB (+= amélioration). */
  deltaSoldePp: number;
  /** Variation en Md€. */
  deltaMd: number;
}

export interface MacroImpact {
  /** Solde APU réel pour l'année de référence (% PIB). */
  soldePibRef: number;
  /** Solde APU projeté avec les curseurs actuels (% PIB). */
  soldePibProjecte: number;
  /** Solde réel en Md€. */
  soldeRefMd: number;
  /** Solde projeté en Md€. */
  soldeProjecteMd: number;
  /** Dette projetée (% PIB). */
  dettePibProjectee: number;
  /** Dette projetée en Md€. */
  detteProjecteeMd: number;
  /** PIB de référence (Md€). */
  pibRef: number;
  /** Détail des deltas par levier. */
  details: MacroDelta[];
  /** Delta total solde (pp PIB). */
  deltaTotalPp: number;
}

/**
 * Calcule l'impact macro-budgétaire des curseurs `state` par rapport au
 * baseline réel de l'`year`.
 */
export function computeMacroImpact(state: StateParams, year: number): MacroImpact {
  const ref = defaultStateParams(year);
  const pibRef = pibMd(year);
  const soldePibRef = soldePctPib(year);
  const detteRef = dettePctPib(year);

  const details: MacroDelta[] = [];

  function push(label: string, deltaPp: number) {
    if (Math.abs(deltaPp) < 0.005) return; // ignore les effets négligeables
    details.push({
      label,
      deltaSoldePp: deltaPp,
      deltaMd: (deltaPp / 100) * pibRef,
    });
  }

  // Cotisations salariales
  {
    const d = (state.tauxCotisationsSalariales - ref.tauxCotisationsSalariales) * 100;
    if (Math.abs(d) > 0.01) push("Cotisations salariales", d * ELAST.cotisationsSalariales);
  }

  // Taux marginal IR
  {
    const d = (state.tauxMarginalIR - ref.tauxMarginalIR) * 100;
    if (Math.abs(d) > 0.1) push("Taux marginal IR", d * ELAST.tauxMarginalIR);
  }

  // TVA normale
  {
    const d = (state.tvaNormale - ref.tvaNormale) * 100;
    if (Math.abs(d) > 0.1) push("TVA normale", d * ELAST.tva);
  }

  // SMIC
  {
    const pct = ((state.smicBrutMensuel - ref.smicBrutMensuel) / ref.smicBrutMensuel) * 100;
    if (Math.abs(pct) > 0.1) push("SMIC", pct * ELAST.smicPct);
  }

  // RSA
  {
    const d = (state.rsaSocle - ref.rsaSocle) / 10;
    if (Math.abs(d) > 0.1) push("RSA socle", d * ELAST.rsa10Euros);
  }

  // APL
  {
    const pct = (state.aplMultiplicateur - ref.aplMultiplicateur) * 100;
    if (Math.abs(pct) > 0.1) push("APL", (pct / 10) * ELAST.aplMult10Pct);
  }

  // Âge légal retraite
  {
    const d = state.ageLegalRetraite - ref.ageLegalRetraite;
    if (Math.abs(d) > 0.1) push("Âge légal retraite", d * ELAST.ageLegal1An);
  }

  // Trimestres requis
  {
    const d = (state.trimestresRequis - ref.trimestresRequis) / 4;
    if (Math.abs(d) > 0.1) push("Trimestres requis", d * ELAST.trimestres4);
  }

  // Taxe carbone
  {
    const d = (state.taxeCarbone - ref.taxeCarbone) / 10;
    if (Math.abs(d) > 0.1) push("Taxe carbone", d * ELAST.taxeCarbone10Eur);
  }

  // TICPE
  {
    const d = state.ticpe / 0.1;
    if (Math.abs(d) > 0.1) push("TICPE", d * ELAST.ticpe10Ct);
  }

  // Remboursement santé
  {
    const d = (state.tauxRemboursementSante - ref.tauxRemboursementSante) * 100;
    if (Math.abs(d) > 0.1) push("Remboursement santé", d * ELAST.tauxRembSante);
  }

  const deltaTotalPp = details.reduce((s, d) => s + d.deltaSoldePp, 0);
  const soldePibProjecte = soldePibRef + deltaTotalPp;

  // Projection naive de la dette : dette(t+1) ≈ dette(t) − solde + croissance_PIB_nominale
  // On suppose croissance nominale constante ~3 % (inflation ~2 % + réel ~1 %)
  // et un horizon glissant d'un an.
  const croissanceNom = 0.03;
  const dettePibProjectee = (detteRef - soldePibProjecte) / (1 + croissanceNom);

  return {
    soldePibRef,
    soldePibProjecte,
    soldeRefMd: (soldePibRef / 100) * pibRef,
    soldeProjecteMd: (soldePibProjecte / 100) * pibRef,
    dettePibProjectee,
    detteProjecteeMd: (dettePibProjectee / 100) * pibRef,
    pibRef,
    details,
    deltaTotalPp,
  };
}
