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
import pension from "@/data/pension-parameters.json";
import type { StateParams } from "./types";

export const YEAR_MIN = series.meta.yearMin;
export const YEAR_MAX = series.meta.yearMax;
export const YEARS = series.years;
export const SOURCES = series.meta.sources;
export const LEGAL_SOURCE = legal.meta;
export const PENSION_SOURCE = pension.meta;

// --- Paramètres de retraite réels par génération (OpenFisca-France-Pension) -
const BIRTH_MIN = pension.meta.birthYearMin;
const BIRTH_MAX = pension.meta.birthYearMax;

function pensionByBirthYear(
  arr: (number | null)[],
  birthYear: number
): number | null {
  const clamped = Math.min(BIRTH_MAX, Math.max(BIRTH_MIN, birthYear));
  return arr[clamped - BIRTH_MIN];
}

/** Âge légal de départ réel pour la génération née cette année-là. */
export function ageLegalGeneration(birthYear: number): number {
  return pensionByBirthYear(pension.ageLegal, birthYear) ?? 62;
}

/** Durée d'assurance cible (trimestres taux plein) pour la génération. */
export function trimestresCiblesGeneration(birthYear: number): number {
  return pensionByBirthYear(pension.trimestresCibles, birthYear) ?? 168;
}

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
export const tauxCreditImmo = (year: number) => read("tauxCreditImmo", year);
export const loyerM2 = (year: number) => read("loyerMoyenM2", year);
export const aplBase = (year: number) => read("aplBaseMensuelle", year);

/**
 * Montant de prime d'activité calibré pour un·e célibataire au SMIC.
 * Créée en janvier 2016 (remplacement du RSA activité) ; revalorisation
 * exceptionnelle de +80€ effective janvier 2019 (gilets jaunes).
 * Source : CNAF / barème légal. Indexé sur l'IPC.
 */
export function primeActiviteBase(year: number): number {
  if (year < 2016) return 0;
  // Pré-boost (2016-2018) : ~120€ ; post-boost (2019+) : ~200€ en valeur 2026
  if (year < 2019) return Math.round(120 * ipc(year) / ipc(2018));
  return Math.round(200 * ipc(year) / ipc(2026));
}

/**
 * Paramètres retraite "en vigueur" une année calendaire donnée : on prend la
 * génération qui atteint alors l'âge légal (~62 ans avant), pour alimenter les
 * curseurs d'État par défaut. Valeurs réelles par génération (CNAV).
 */
export const ageLegal = (year: number) => ageLegalGeneration(year - 62);
export const trimestresRequis = (year: number) =>
  trimestresCiblesGeneration(year - 62);

// --- Paramètres légaux réels (OpenFisca-France) ----------------------------
export const smicBrut = (year: number) => readLegal("smicBrutMensuel", year);
export const tvaNormale = (year: number) => readLegal("tvaNormale", year);
export const rsaSocle = (year: number) => readLegal("rsaSocleBase", year);
export const pssMensuel = (year: number) => readLegal("pssMensuel", year);
/** Taux de cotisations salariales effectif réel (vieillesse+maladie+CSG/CRDS+ARRCO). */
export const tauxCotisations = (year: number) =>
  readLegal("tauxCotisationsSalariales", year);
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
    tvaReduite: 0.055,                  // TVA alimentation constante depuis 2000
    smicBrutMensuel: smicBrut(year),
    allocFamilialesParEnfant: Math.round(allocFamillesDeuxEnfants(year) / 2),
    aplMultiplicateur: 1,
    primeActiviteRevalorisation: 1,     // PA réelle (1 = valeur légale)
    ageLegalRetraite: ageLegal(year),
    trimestresRequis: trimestresRequis(year),
    taxeCarbone: year >= 2014 ? 44 : 0,
    ticpe: 0,
    rsaSocle: rsaSocle(year),
    tauxRemboursementSante: 0.7,
    taxeFonciereTauxM2: 12,             // ~12 €/m²/an, taux national moyen 2026
    tauxCotisationsPatronales: 0.42,    // ~42 % cotisations patronales (hors allègements Fillon)
    // Loi TEPA 2007-2011 puis supprimée 2012-2018, rétablie par Macron 2019 (cap 7 500 €/an)
    exonerationHeuresSup:
      year >= 2019 || (year >= 2007 && year < 2012) ? 1 : 0,
    tauxPFU: 0.30,                      // PFU créé en 2018 (12,8 % IR + 17,2 % prélèv. soc.)
  };
}
