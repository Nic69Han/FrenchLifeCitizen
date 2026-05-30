// ---------------------------------------------------------------------------
// Accès aux données économiques pré-chargées.
// En V2 ces accesseurs seront remplacés par des requêtes à la base PostgreSQL
// alimentée par l'ingestion des APIs publiques (INSEE, data.gouv, BdF).
// ---------------------------------------------------------------------------

import series from "@/data/economic-series.json";
import fiscal from "@/data/fiscal-rules.json";
import type { StateParams } from "./types";

export const YEAR_MIN = series.meta.yearMin;
export const YEAR_MAX = series.meta.yearMax;
export const YEARS = series.years;
export const SOURCES = series.meta.sources;

function indexOfYear(year: number): number {
  const clamped = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
  return YEARS.indexOf(clamped);
}

/** Lecture générique d'une série annuelle. */
function read(key: keyof typeof series, year: number): number {
  const arr = series[key] as unknown as number[];
  return arr[indexOfYear(year)];
}

export const ipc = (year: number) => read("ipc", year);
export const smicBrut = (year: number) => read("smicBrutMensuel", year);
export const prixCarburant = (year: number) => read("prixCarburantLitre", year);
export const tauxCotisations = (year: number) =>
  read("tauxCotisationsSalariales", year);
export const tauxCreditImmo = (year: number) => read("tauxCreditImmo", year);
export const loyerM2 = (year: number) => read("loyerMoyenM2", year);
export const ageLegal = (year: number) => read("ageLegalRetraite", year);
export const trimestresRequis = (year: number) =>
  read("trimestresRequis", year);
export const allocFamiliales = (year: number) =>
  read("allocFamilialesParEnfant", year);
export const aplBase = (year: number) => read("aplBaseMensuelle", year);

export const IR_BRACKETS = fiscal.incomeTaxBrackets;
export const IR_REFERENCE_YEAR = fiscal.meta.referenceYear;
export const FISCAL_SOURCE = fiscal.meta.source;

/**
 * Construit les curseurs d'État par défaut pour une année donnée, à partir des
 * valeurs historiques réelles. C'est l'état "France réelle" sur lequel
 * l'utilisateur applique ensuite ses modifications en mode "Et si ?".
 */
export function defaultStateParams(year: number): StateParams {
  return {
    tauxCotisationsSalariales: tauxCotisations(year),
    tauxMarginalIR: IR_BRACKETS[IR_BRACKETS.length - 1].rate,
    tvaNormale: 0.2,
    smicBrutMensuel: smicBrut(year),
    allocFamilialesParEnfant: allocFamiliales(year),
    aplMultiplicateur: 1,
    ageLegalRetraite: ageLegal(year),
    trimestresRequis: trimestresRequis(year),
    taxeCarbone: year >= 2014 ? 44 : 0,
    ticpe: 0,
    rsaSocle: Math.round(550 * (ipc(year) / ipc(2026))),
    tauxRemboursementSante: 0.7,
  };
}
