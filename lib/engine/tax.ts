// ---------------------------------------------------------------------------
// Impôt sur le revenu — barème progressif RÉEL avec quotient familial.
// Les tranches proviennent du barème légal daté (OpenFisca-France) propre à
// chaque année ; aucune réindexation n'est nécessaire (les seuils sont déjà
// ceux en vigueur). Le curseur d'État ne module que le taux de la tranche haute.
// ---------------------------------------------------------------------------

import { irBrackets } from "./data";
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
 * Impôt sur le revenu annuel, barème réel de l'année.
 * @param revenuNetImposable revenu net imposable annuel du foyer
 * @param year année de simulation (sélectionne le barème légal)
 * @param parts nombre de parts fiscales
 * @param tauxMarginal taux de la tranche haute (curseur d'État)
 */
export function impotRevenuAnnuel(
  revenuNetImposable: number,
  year: number,
  parts: number,
  tauxMarginal: number
): number {
  const brackets = irBrackets(year);
  if (brackets.length === 0) return 0;
  const quotient = revenuNetImposable / parts;

  let impotParPart = 0;
  for (let i = 0; i < brackets.length; i++) {
    const min = brackets[i].threshold;
    const max =
      i + 1 < brackets.length ? brackets[i + 1].threshold : Infinity;
    // La tranche haute prend la valeur du curseur ; les autres sont réelles.
    const rate = i === brackets.length - 1 ? tauxMarginal : brackets[i].rate;
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
