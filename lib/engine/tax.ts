// ---------------------------------------------------------------------------
// Impôt sur le revenu — barème progressif avec quotient familial.
// Les seuils du barème de référence (2024) sont réindexés sur l'IPC pour les
// autres années, et la tranche haute peut être modulée par le curseur d'État.
// ---------------------------------------------------------------------------

import {
  IR_BRACKETS,
  IR_REFERENCE_YEAR,
  ipc,
} from "./data";
import type { CitizenProfile, StateParams } from "./types";

/** Nombre de parts fiscales selon la situation familiale et les enfants. */
export function partsFiscales(profile: CitizenProfile): number {
  const enCouple = ["couple", "marie"].includes(profile.situationFamiliale);
  let parts = enCouple ? 2 : 1;
  // 0,5 part par enfant, 1 part à partir du 3e.
  for (let i = 0; i < profile.nbEnfants; i++) {
    parts += i >= 2 ? 1 : 0.5;
  }
  return parts;
}

/**
 * Impôt sur le revenu annuel.
 * @param revenuNetImposable revenu net imposable annuel du foyer
 * @param year année de simulation (pour réindexer les seuils)
 * @param parts nombre de parts fiscales
 * @param tauxMarginal taux de la tranche haute (curseur d'État)
 */
export function impotRevenuAnnuel(
  revenuNetImposable: number,
  year: number,
  parts: number,
  tauxMarginal: number
): number {
  const facteur = ipc(year) / ipc(IR_REFERENCE_YEAR);
  const quotient = revenuNetImposable / parts;

  let impotParPart = 0;
  for (let i = 0; i < IR_BRACKETS.length; i++) {
    const b = IR_BRACKETS[i];
    const min = b.min * facteur;
    const max = b.max === null ? Infinity : b.max * facteur;
    // La tranche haute prend la valeur du curseur ; les autres sont fixes.
    const rate = i === IR_BRACKETS.length - 1 ? tauxMarginal : b.rate;
    if (quotient > min) {
      impotParPart += (Math.min(quotient, max) - min) * rate;
    }
  }
  return Math.max(0, impotParPart * parts);
}

export function impotMensuel(
  profile: CitizenProfile,
  revenuNetAvantImpotAnnuel: number,
  year: number,
  state: StateParams
): number {
  const parts = partsFiscales(profile);
  // Abattement forfaitaire de 10 % pour frais professionnels.
  const imposable = revenuNetAvantImpotAnnuel * 0.9;
  return (
    impotRevenuAnnuel(imposable, year, parts, state.tauxMarginalIR) / 12
  );
}
