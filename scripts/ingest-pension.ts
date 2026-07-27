// ---------------------------------------------------------------------------
// Ingestion des paramètres de RETRAITE réels (régime général CNAV) depuis
// OpenFisca-France-Pension. Ces paramètres dépendent de la GÉNÉRATION (année de
// naissance) — c'est ainsi que le droit français les définit, réforme 2023
// comprise (loi 2023-270 : âge légal porté à 64 ans, 172 trimestres).
//
// On produit data/pension-parameters.json : pour chaque année de naissance,
//   • ageLegal   : âge d'ouverture des droits (années, décimal mois/12)
//   • trimestres : durée d'assurance cible pour le taux plein
//
// Lancer :  npx tsx scripts/ingest-pension.ts
// Source   :  openfisca/openfisca-france-pension (commit épinglé).
// ---------------------------------------------------------------------------

import yaml from "js-yaml";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PENSION_SHA = "1c454230b1114e9197af509606cfff1de4e16b6b";
const RAW_BASE = `https://raw.githubusercontent.com/openfisca/openfisca-france-pension/${PENSION_SHA}/openfisca_france_pension/parameters/retraites/secteur_prive/regime_general_cnav`;

const BIRTH_MIN = 1940;
const BIRTH_MAX = 1975;

type DatedValues = Record<string, { value: number | null } | null>;
interface GenerationNode {
  values?: DatedValues;
  annee?: { values?: DatedValues };
  mois?: { values?: DatedValues };
  [key: string]: unknown;
}

async function fetchYaml(file: string): Promise<Record<string, GenerationNode>> {
  const url = `${RAW_BASE}/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  return yaml.load(await res.text(), { schema: yaml.JSON_SCHEMA }) as Record<
    string,
    GenerationNode
  >;
}

/** Dernière valeur non nulle d'une map datée (législation en vigueur). */
function latestValue(values: DatedValues | undefined): number | null {
  if (!values) return null;
  const sorted = Object.entries(values)
    .map(([d, v]) => [d, v && typeof v.value === "number" ? v.value : null] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let current: number | null = null;
  for (const [, val] of sorted) if (val !== null) current = val;
  return current;
}

/** Extrait l'année de naissance d'une clé "after_YYYY_MM_DD" / "before_YYYY...". */
function birthYearOfKey(key: string): { year: number; kind: "before" | "after" } | null {
  const m = key.match(/^(before|after)_(\d{4})_\d{2}_\d{2}$/);
  return m ? { year: parseInt(m[2], 10), kind: m[1] as "before" | "after" } : null;
}

/**
 * Construit une série par année de naissance à partir d'un nœud "par génération".
 * Les clés "after_YYYY" valent pour les générations nées à partir de YYYY ;
 * "before_YYYY" couvre les générations antérieures (base la plus ancienne).
 * On propage la valeur de chaque seuil jusqu'au seuil suivant.
 */
function seriesByBirthYear(
  root: Record<string, GenerationNode>,
  extract: (node: GenerationNode) => number | null
): (number | null)[] {
  const thresholds: { year: number; value: number | null }[] = [];
  let baseValue: number | null = null; // valeur "before_*" (générations anciennes)
  for (const [key, node] of Object.entries(root)) {
    const parsed = birthYearOfKey(key);
    if (!parsed || typeof node !== "object" || node === null) continue;
    const value = extract(node);
    if (parsed.kind === "before") baseValue = value;
    else thresholds.push({ year: parsed.year, value });
  }
  thresholds.sort((a, b) => a.year - b.year);

  const out: (number | null)[] = [];
  for (let y = BIRTH_MIN; y <= BIRTH_MAX; y++) {
    let current: number | null = baseValue;
    for (const t of thresholds) {
      if (t.year <= y && t.value !== null) current = t.value;
      else if (t.year > y) break;
    }
    out.push(current);
  }
  return out;
}

async function main() {
  console.log(`Ingestion OpenFisca-France-Pension @ ${PENSION_SHA.slice(0, 10)}…`);

  const [trimtp, aod] = await Promise.all([
    fetchYaml("trimtp.yaml"),
    fetchYaml("aod.yaml"),
  ]);

  // Les nœuds "par génération" sont sous une clé racine descriptive.
  const trimRoot =
    (trimtp.nombre_trimestres_cibles_par_generation as unknown as Record<
      string,
      GenerationNode
    >) ?? trimtp;
  const aodRoot =
    (aod.age_ouverture_droits_age_legal_en_fonction_date_naissance as unknown as Record<
      string,
      GenerationNode
    >) ?? aod;

  const trimestres = seriesByBirthYear(trimRoot, (n) => latestValue(n.values));

  // Âge légal = annee + mois/12.
  const ageLegal = seriesByBirthYear(aodRoot, (n) => {
    const an = latestValue(n.annee?.values);
    const mo = latestValue(n.mois?.values) ?? 0;
    return an === null ? null : Math.round((an + mo / 12) * 100) / 100;
  });

  const birthYears = Array.from(
    { length: BIRTH_MAX - BIRTH_MIN + 1 },
    (_, i) => BIRTH_MIN + i
  );

  const out = {
    meta: {
      description:
        "Paramètres de retraite réels du régime général (CNAV), par année de " +
        "naissance, ingérés depuis OpenFisca-France-Pension. Réforme 2023 incluse " +
        "(loi 2023-270 : âge légal 64 ans, 172 trimestres). Sources JO/Légifrance.",
      source: "openfisca/openfisca-france-pension",
      sourceUrl: "https://github.com/openfisca/openfisca-france-pension",
      commit: PENSION_SHA,
      ingestedAt: new Date().toISOString().slice(0, 10),
      birthYearMin: BIRTH_MIN,
      birthYearMax: BIRTH_MAX,
    },
    birthYears,
    ageLegal,
    trimestresCibles: trimestres,
  };

  const target = resolve(process.cwd(), "data/pension-parameters.json");
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ Écrit ${target}`);
  const i = (y: number) => birthYears.indexOf(y);
  console.log(`  Génération 1950 : âge ${ageLegal[i(1950)]} ans, ${trimestres[i(1950)]} trim.`);
  console.log(`  Génération 1968 : âge ${ageLegal[i(1968)]} ans, ${trimestres[i(1968)]} trim.`);
}

main().catch((e) => {
  console.error("Échec de l'ingestion retraite :", e.message);
  process.exit(1);
});
