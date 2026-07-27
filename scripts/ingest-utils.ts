// ---------------------------------------------------------------------------
// Utilitaires partagés pour les scripts d'ingestion FranceSim.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";

export const YEAR_MIN = 2000;
export const YEAR_MAX = 2026;
export const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);

/** Agrège des observations mensuelles/trimestrielles en moyennes annuelles. */
export function toAnnualMean(periodValues: Map<string, number>): Map<number, number> {
  const buckets = new Map<number, number[]>();
  for (const [period, value] of periodValues) {
    const year = Number(period.slice(0, 4));
    if (year < YEAR_MIN || year > YEAR_MAX) continue;
    const arr = buckets.get(year);
    if (arr) arr.push(value);
    else buckets.set(year, [value]);
  }
  const out = new Map<number, number>();
  for (const [year, vals] of buckets) {
    out.set(year, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return out;
}

/**
 * Construit un tableau aligné sur YEAR_MIN..YEAR_MAX.
 * Les années manquantes de fin sont comblées par report de la dernière valeur.
 */
export function toAlignedArray(
  annual: Map<number, number>,
  round = 2
): (number | null)[] {
  const arr: (number | null)[] = YEARS.map((y) => {
    const v = annual.get(y);
    return v === undefined ? null : Number(v.toFixed(round));
  });
  for (let i = 1; i < arr.length; i++) if (arr[i] === null) arr[i] = arr[i - 1];
  return arr;
}

/** Lit un fichier JSON de données. */
export function readDataFile(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** Écrit un fichier JSON de données (no-op en dry-run). */
export function writeDataFile(
  path: string,
  data: unknown,
  dryRun: boolean
): void {
  if (dryRun) return;
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}
