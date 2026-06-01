// ---------------------------------------------------------------------------
// Ingestion des séries macro publiques depuis Eurostat SDMX-JSON.
//
// Trois datasets :
//   gov_10dd_edpt1  → déficit (B9) et dette (GD) en % PIB
//   nama_10_gdp     → PIB nominal (Md€)
//   gov_10a_main    → recettes/dépenses APU détaillées (% PIB)
//
// Lancer :  npx tsx scripts/ingest-eurostat.ts            (écrit le fichier)
//           npx tsx scripts/ingest-eurostat.ts --dry-run  (affiche sans écrire)
//
// Aucune clé API nécessaire. Données officielles Eurostat — critères de
// Maastricht pour la France (source : Eurostat / Commission européenne).
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const YEAR_MIN = 2000;
const YEAR_MAX = 2026;
const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);
const EUROSTAT_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";

// ---------------------------------------------------------------------------
// Parsing Eurostat SDMX-JSON (format 2.0)
// ---------------------------------------------------------------------------
interface EurostatDataset {
  value: Record<string, number>;
  id: string[];
  size: number[];
  dimension: Record<string, {
    category: { index: Record<string, number>; label: Record<string, string> };
  }>;
}

function extractSeries(
  ds: EurostatDataset,
  filters: Record<string, string>
): Map<number, number> {
  const out = new Map<number, number>();
  const timeIdx = ds.id.indexOf("time");
  const timeDim = ds.dimension["time"];
  const timeLabels = Object.values(timeDim.category.label) as string[];

  // Calculer l'offset de base selon les filtres
  const strides: number[] = new Array(ds.id.length).fill(1);
  for (let i = ds.id.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * ds.size[i + 1];
  }

  let baseOffset = 0;
  for (const [dim, val] of Object.entries(filters)) {
    const dIdx = ds.id.indexOf(dim);
    if (dIdx === -1) continue;
    const catIdx = ds.dimension[dim].category.index[val] ?? 0;
    baseOffset += catIdx * strides[dIdx];
  }

  for (let t = 0; t < ds.size[timeIdx]; t++) {
    const year = parseInt(timeLabels[t]);
    if (year < YEAR_MIN || year > YEAR_MAX) continue;
    const flatIdx = baseOffset + t;
    const v = ds.value[String(flatIdx)];
    if (typeof v === "number" && Number.isFinite(v)) out.set(year, v);
  }
  return out;
}

async function fetchEurostat(
  dataset: string,
  params: Record<string, string>
): Promise<EurostatDataset> {
  const qs = new URLSearchParams({ ...params, sinceTimePeriod: String(YEAR_MIN), format: "JSON" });
  const url = `${EUROSTAT_BASE}/${dataset}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Eurostat HTTP ${res.status}: ${url}`);
  return (await res.json()) as EurostatDataset;
}

// ---------------------------------------------------------------------------
// Assemblage d'un tableau aligné YEAR_MIN..YEAR_MAX
// ---------------------------------------------------------------------------
function toAlignedArray(series: Map<number, number>, round = 2): (number | null)[] {
  const arr: (number | null)[] = YEARS.map((y) => {
    const v = series.get(y);
    return v !== undefined ? Number(v.toFixed(round)) : null;
  });
  // Propager la dernière valeur connue vers l'avenir (projection constante)
  for (let i = 1; i < arr.length; i++) if (arr[i] === null) arr[i] = arr[i - 1];
  return arr;
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const target = resolve(process.cwd(), "data/macro-series.json");

  console.log(`Ingestion Eurostat → macro-series.json${dryRun ? " (dry-run)" : ""}`);

  const realized: string[] = [];
  const data: Record<string, unknown> = {};

  async function ingest(
    label: string,
    key: string,
    dataset: string,
    params: Record<string, string>,
    filterOverride: Record<string, string> = {},
    round = 2
  ) {
    try {
      const ds = await fetchEurostat(dataset, params);
      const series = extractSeries(ds, { ...params, ...filterOverride });
      if (series.size === 0) throw new Error("aucune donnée parsée");
      data[key] = toAlignedArray(series, round);
      realized.push(key);
      const lastYear = Math.max(...series.keys());
      console.log(`✓ ${key} (${label}) — ${series.size} années, dernier=${lastYear}: ${series.get(lastYear)}`);
    } catch (e) {
      console.warn(`⚠ ${key} (${label}) : ${(e as Error).message} — valeur calibrée conservée`);
    }
  }

  // --- Déficit APU (% PIB) ---
  await ingest("déficit APU", "soldePctPib", "gov_10dd_edpt1",
    { geo: "FR", unit: "PC_GDP", na_item: "B9", sector: "S13" });

  // --- Dette Maastricht (% PIB) ---
  await ingest("dette Maastricht", "dettePubliquePctPib", "gov_10dd_edpt1",
    { geo: "FR", unit: "PC_GDP", na_item: "GD", sector: "S13" });

  // --- PIB nominal (Md€) ---
  {
    try {
      const ds = await fetchEurostat("nama_10_gdp", { geo: "FR", unit: "CP_MEUR", na_item: "B1GQ" });
      const series = extractSeries(ds, {});
      const md = new Map<number, number>();
      series.forEach((v, y) => md.set(y, Math.round(v / 1000))); // M€ → Md€
      data["pibNominalMd"] = toAlignedArray(md, 0);
      realized.push("pibNominalMd");
      console.log(`✓ pibNominalMd — PIB 2024: ${md.get(2024)} Md€`);
    } catch (e) {
      console.warn(`⚠ pibNominalMd : ${(e as Error).message}`);
    }
  }

  // --- APU détaillées (% PIB) ---
  const apuParams = { geo: "FR", unit: "PC_GDP", sector: "S13" };
  const apuSeries: [string, string, string][] = [
    ["recettesTotalesPctPib", "TR", "Recettes totales"],
    ["depensesTotalesPctPib", "TE", "Dépenses totales"],
    ["tvaPctPib", "D211REC", "TVA"],
    ["irMenagesPctPib", "D51A_C1REC", "IR ménages"],
    ["isSocietesPctPib", "D51B_C2REC", "IS sociétés"],
    ["cotisationsSocialesPctPib", "D61REC", "Cotisations sociales"],
    ["interetsDettePctPib", "D41PAY", "Intérêts dette"],
    ["prestationsSocialesPctPib", "D62PAY", "Prestations sociales"],
    ["retraitesPctPib", "D62PAY_GF1002", "Retraites vieillesse"],
    ["chomagePctPib", "D62PAY_GF1005", "Assurance chômage"],
  ];

  // Un seul appel pour tout le dataset APU
  let apuDs: EurostatDataset | null = null;
  try {
    apuDs = await fetchEurostat("gov_10a_main", apuParams);
    console.log("✓ Dataset gov_10a_main chargé");
  } catch (e) {
    console.warn(`⚠ gov_10a_main : ${(e as Error).message}`);
  }

  if (apuDs) {
    for (const [key, naItem, label] of apuSeries) {
      try {
        const series = extractSeries(apuDs, { na_item: naItem });
        if (series.size === 0) throw new Error("aucune donnée");
        data[key] = toAlignedArray(series);
        realized.push(key);
        console.log(`  ✓ ${key} (${label}) — ${series.size} années`);
      } catch (e) {
        console.warn(`  ⚠ ${key} (${label}) : ${(e as Error).message}`);
      }
    }
  }

  // --- Métadonnées ---
  data["meta"] = {
    yearMin: YEAR_MIN,
    yearMax: YEAR_MAX,
    years: YEARS,
    seriesReelles: realized,
    derniereIngestionEurostat: new Date().toISOString().slice(0, 10),
    source: "Eurostat — gov_10dd_edpt1, gov_10a_main, nama_10_gdp. " +
      "Périmètre : France (FR), Administrations Publiques (S13), critères Maastricht. " +
      "Données officielles European Statistical Office.",
  };

  if (dryRun) {
    console.log("\n(dry-run) Aucun fichier écrit.");
    console.log(`Séries obtenues : ${realized.join(", ")}`);
    return;
  }

  writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n✓ Écrit ${target} — ${realized.length} séries réelles`);
}

main().catch((e) => {
  console.error("Échec ingestion Eurostat :", e.message);
  process.exit(1);
});
