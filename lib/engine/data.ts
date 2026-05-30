// ---------------------------------------------------------------------------
// Accès aux données du moteur. Deux sources, de natures différentes :
//
//  1. data/legal-parameters.json — PARAMÈTRES LÉGAUX RÉELS de la France,
//     ingérés depuis OpenFisca-France (droit fiscal/social encodé, valeurs
//     datées et sourcées JO/Légifrance). Régénérable : `npx tsx scripts/ingest-openfisca.ts`.
//     → SMIC, barème IR par année, TVA, RSA, allocations familiales.
//
//  2. data/economic-series.json — SÉRIES STATISTIQUES (IPC/inflation, carburant,
//     loyers, taux de crédit, cotisations, paramètres retraite). Ordres de
//     grandeur calibrés, NON officiels : OpenFisca n'encode pas ces statistiques
//     et les APIs INSEE/data.gouv ne sont pas accessibles depuis cet
//     environnement (politique réseau). À remplacer dès qu'INSEE sera joignable.
// ---------------------------------------------------------------------------

import series from "@/data/economic-series.json";
import legal from "@/data/legal-parameters.json";
import type { StateParams } from "./types";

export const YEAR_MIN = series.meta.yearMin;
export const YEAR_MAX = series.meta.yearMax;
export const YEARS = series.years;
export const SOURCES = series.meta.sources;
export const LEGAL_SOURCE = legal.meta;

function indexOfYear(year: number): number {
  const clamped = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
  return YEARS.indexOf(clamped);
}

/** Lecture d'une série statistique (economic-series.json). */
function read(key: keyof typeof series, year: number): number {
  const arr = series[key] as unknown as number[];
  return arr[indexOfYear(year)];
}

/** Lecture d'une série de paramètres légaux réels (legal-parameters.json). */
function readLegal(key: keyof typeof legal, year: number): number {
  const arr = legal[key] as unknown as (number | null)[];
  const v = arr[indexOfYear(year)];
  return v ?? 0;
}

// --- Séries statistiques (non officielles) ---------------------------------
export const ipc = (year: number) => read("ipc", year);
export const prixCarburant = (year: number) => read("prixCarburantLitre", year);
export const tauxCotisations = (year: number) =>
  read("tauxCotisationsSalariales", year);
export const tauxCreditImmo = (year: number) => read("tauxCreditImmo", year);
export const loyerM2 = (year: number) => read("loyerMoyenM2", year);
export const ageLegal = (year: number) => read("ageLegalRetraite", year);
export const trimestresRequis = (year: number) =>
  read("trimestresRequis", year);
export const aplBase = (year: number) => read("aplBaseMensuelle", year);

// --- Paramètres légaux réels (OpenFisca-France) ----------------------------
export const smicBrut = (year: number) => readLegal("smicBrutMensuel", year);
export const tvaNormale = (year: number) => readLegal("tvaNormale", year);
export const rsaSocle = (year: number) => readLegal("rsaSocleBase", year);
/** Allocations familiales mensuelles réelles pour 2 enfants (base BMAF). */
export const allocFamillesDeuxEnfants = (year: number) =>
  readLegal("allocFamilialesDeuxEnfants", year);

/** Tranche d'imposition : seuil d'entrée (€) et taux marginal. */
export interface IRBracket {
  threshold: number;
  rate: number;
}

/** Barème IR RÉEL en vigueur pour l'année (tranches datées OpenFisca). */
export function irBrackets(year: number): IRBracket[] {
  const byYear = legal.irBracketsByYear as Record<string, IRBracket[]>;
  const clamped = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
  return byYear[String(clamped)] ?? [];
}

/** Taux marginal de la tranche haute pour l'année (curseur d'État par défaut). */
export function tauxMarginalHaut(year: number): number {
  const b = irBrackets(year);
  return b.length ? b[b.length - 1].rate : 0.45;
}

export const FISCAL_SOURCE = legal.meta.source;

/**
 * Construit les curseurs d'État par défaut pour une année donnée, à partir des
 * valeurs réelles. C'est l'état "France réelle" sur lequel l'utilisateur
 * applique ensuite ses modifications en mode "Et si ?".
 */
export function defaultStateParams(year: number): StateParams {
  return {
    tauxCotisationsSalariales: tauxCotisations(year),
    tauxMarginalIR: tauxMarginalHaut(year),
    tvaNormale: tvaNormale(year),
    smicBrutMensuel: smicBrut(year),
    allocFamilialesParEnfant: Math.round(allocFamillesDeuxEnfants(year) / 2),
    aplMultiplicateur: 1,
    ageLegalRetraite: ageLegal(year),
    trimestresRequis: trimestresRequis(year),
    taxeCarbone: year >= 2014 ? 44 : 0,
    ticpe: 0,
    rsaSocle: rsaSocle(year),
    tauxRemboursementSante: 0.7,
  };
}
