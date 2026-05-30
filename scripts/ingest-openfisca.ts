// ---------------------------------------------------------------------------
// Ingestion des paramètres LÉGAUX RÉELS de la France depuis OpenFisca-France.
//
// OpenFisca-France (https://github.com/openfisca/openfisca-france) est le moteur
// open-source qui encode le droit fiscal et social français : chaque paramètre
// (SMIC, barème IR, TVA, RSA, allocations familiales…) y est stocké en YAML avec
// ses valeurs DATÉES et SOURCÉES (références JO / Légifrance / décrets).
//
// Ce script télécharge ces fichiers (commit épinglé pour la reproductibilité),
// résout la valeur en vigueur au 1er janvier de chaque année 2000–2026, et écrit
// data/legal-parameters.json avec la provenance complète.
//
// Lancer :  npx tsx scripts/ingest-openfisca.ts
//
// NB : OpenFisca encode le DROIT (paramètres légaux), pas les STATISTIQUES.
//      Les séries statistiques INSEE (IPC/inflation, carburant, loyers, taux de
//      crédit) ne s'y trouvent pas et restent dans data/economic-series.json,
//      explicitement signalées comme non officielles tant qu'INSEE/data.gouv ne
//      sont pas accessibles depuis cet environnement (politique réseau).
// ---------------------------------------------------------------------------

import yaml from "js-yaml";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Commit épinglé d'OpenFisca-France (reproductibilité).
const OPENFISCA_SHA = "9793bc729d0fb914bfc3b270f8f1aba47a700015";
const RAW_BASE = `https://raw.githubusercontent.com/openfisca/openfisca-france/${OPENFISCA_SHA}/openfisca_france/parameters`;

const YEAR_MIN = 2000;
const YEAR_MAX = 2026;
const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);

/** Un nœud de paramètre OpenFisca : { values: { "YYYY-MM-DD": { value } } }. */
interface ParamNode {
  values?: Record<string, { value: number } | null>;
  metadata?: { reference?: unknown };
}

async function fetchYaml(path: string): Promise<ParamNode> {
  const url = `${RAW_BASE}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  // JSON_SCHEMA empêche js-yaml de convertir les clés "YYYY-MM-DD" en objets
  // Date : on veut les garder comme chaînes ISO pour la comparaison "as of".
  return yaml.load(await res.text(), { schema: yaml.JSON_SCHEMA }) as ParamNode;
}

// Taux de conversion officiel franc → euro (loi du 14/04/1998).
const FRANC_PAR_EURO = 6.55957;

/**
 * Résout une map { "YYYY-MM-DD": { value } } "as of" : dernière valeur dont la
 * date d'effet est ≤ date cible (un barème s'applique jusqu'à sa modification).
 */
function resolveDateMap(
  map: Record<string, { value: number } | null> | undefined,
  isoDate: string
): number | null {
  if (!map) return null;
  // On garde TOUTES les dates d'effet, y compris celles à `value: null` :
  // dans OpenFisca, une entrée explicitement nulle abroge le paramètre (ex.
  // tranche d'IR supprimée). Filtrer les nulls ressusciterait à tort la valeur
  // précédente. On lit donc la dernière entrée ≤ date cible, nulle ou non.
  const dated = Object.entries(map)
    .map(([d, v]) => [d, v && typeof v.value === "number" ? v.value : null] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let current: number | null = null;
  for (const [d, val] of dated) {
    if (d <= isoDate) current = val;
    else break;
  }
  return current;
}

/** Valeur "as of" pour un nœud paramètre standard (avec `values`). */
function valueAsOf(node: ParamNode, isoDate: string): number | null {
  return resolveDateMap(node.values, isoDate);
}

/** Série annuelle (valeur au 1er janvier de chaque année). */
function yearlySeries(node: ParamNode): (number | null)[] {
  return YEARS.map((y) => valueAsOf(node, `${y}-01-01`));
}

async function main() {
  console.log(`Ingestion OpenFisca-France @ ${OPENFISCA_SHA.slice(0, 10)}…`);

  // --- Téléchargement des paramètres légaux réels --------------------------
  const [
    smicMensuel,
    nbHeuresMois,
    smicHoraire,
    irBareme,
    tvaNormale,
    rsaBase,
    bmaf,
    afTaux2enf,
  ] = await Promise.all([
    fetchYaml("marche_travail/salaire_minimum/smic/smic_b_mensuel.yaml"),
    fetchYaml("marche_travail/salaire_minimum/smic/nb_heures_travail_mensuel.yaml"),
    fetchYaml("marche_travail/salaire_minimum/smic/smic_b_horaire.yaml"),
    fetchYaml("impot_revenu/bareme_ir_depuis_1945/bareme.yaml"),
    fetchYaml("taxation_indirecte/tva/taux_normal.yaml"),
    fetchYaml(
      "prestations_sociales/solidarite_insertion/minima_sociaux/rsa/rsa_m/montant_de_base_du_rsa.yaml"
    ),
    fetchYaml("prestations_sociales/prestations_familiales/bmaf/bmaf.yaml"),
    fetchYaml(
      "prestations_sociales/prestations_familiales/prestations_generales/af/af_cm/taux/enf2.yaml"
    ),
  ]);

  // --- SMIC brut mensuel ----------------------------------------------------
  // smic_b_mensuel donne le mensuel à partir de 2002 ; avant, on le reconstitue
  // depuis l'horaire × nb d'heures. Les valeurs antérieures à l'euro (2002) sont
  // exprimées en francs → conversion au taux officiel 6,55957 F/€.
  const smicMensuelSerie = YEARS.map((y) => {
    const enEuro = y >= 2002;
    const conv = (f: number) => (enEuro ? f : f / FRANC_PAR_EURO);
    const direct = valueAsOf(smicMensuel, `${y}-01-01`);
    if (direct) return Math.round(conv(direct));
    const horaire = valueAsOf(smicHoraire, `${y}-01-01`);
    const heures = valueAsOf(nbHeuresMois, `${y}-01-01`) ?? 151.67;
    return horaire ? Math.round(conv(horaire * heures)) : null;
  });

  // --- Barème IR : tranches en vigueur au 1er janvier de chaque année -------
  // Le barème OpenFisca s'applique aux revenus de l'année ; on l'expose tel quel.
  // Dans le barème IR, chaque tranche expose `threshold` et `rate` comme des
  // maps datées { "YYYY-MM-DD": { value } } directement (pas de wrapper `values`).
  // Les seuils antérieurs à 2002 sont en francs → conversion en euros.
  type DatedMap = Record<string, { value: number } | null>;
  const irBracketsByYear: Record<number, { threshold: number; rate: number }[]> = {};
  const brackets = (irBareme as unknown as {
    brackets: { threshold: DatedMap; rate: DatedMap }[];
  }).brackets;
  for (const y of YEARS) {
    const conv = (f: number) => (y >= 2002 ? f : f / FRANC_PAR_EURO);
    irBracketsByYear[y] = brackets
      .map((b) => {
        const threshold = resolveDateMap(b.threshold, `${y}-01-01`);
        const rate = resolveDateMap(b.rate, `${y}-01-01`);
        return {
          threshold: threshold === null ? null : Math.round(conv(threshold)),
          rate,
        };
      })
      .filter(
        (b): b is { threshold: number; rate: number } =>
          b.threshold !== null && b.rate !== null
      );
  }

  // --- Allocations familiales (2 enfants) = BMAF × taux ---------------------
  const afDeuxEnfants = YEARS.map((y) => {
    const base = valueAsOf(bmaf, `${y}-01-01`);
    const taux = valueAsOf(afTaux2enf, `${y}-01-01`);
    return base && taux ? Math.round(base * taux) : null;
  });

  const out = {
    meta: {
      description:
        "Paramètres légaux réels de la France, ingérés depuis OpenFisca-France " +
        "(droit fiscal et social encodé, valeurs datées et sourcées JO/Légifrance).",
      source: "openfisca/openfisca-france",
      sourceUrl: "https://github.com/openfisca/openfisca-france",
      commit: OPENFISCA_SHA,
      ingestedAt: new Date().toISOString().slice(0, 10),
      yearMin: YEAR_MIN,
      yearMax: YEAR_MAX,
      note:
        "OpenFisca encode le DROIT (paramètres légaux), pas les statistiques. " +
        "IPC, carburant, loyers, taux de crédit restent dans economic-series.json.",
    },
    years: YEARS,
    smicBrutMensuel: smicMensuelSerie,
    tvaNormale: YEARS.map((y) => valueAsOf(tvaNormale, `${y}-01-01`)),
    rsaSocleBase: YEARS.map((y) => {
      const v = valueAsOf(rsaBase, `${y}-01-01`);
      return v ? Math.round(v) : null;
    }),
    allocFamilialesDeuxEnfants: afDeuxEnfants,
    bmaf: YEARS.map((y) => valueAsOf(bmaf, `${y}-01-01`)),
    irBracketsByYear,
  };

  const target = resolve(process.cwd(), "data/legal-parameters.json");
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ Écrit ${target}`);
  console.log(`  SMIC 2000→2026 : ${smicMensuelSerie[0]} → ${smicMensuelSerie.at(-1)} €`);
  console.log(
    `  Tranches IR 2026 : ${irBracketsByYear[2026].length} ` +
      `(taux max ${(irBracketsByYear[2026].at(-1)!.rate * 100).toFixed(0)} %)`
  );
  console.log(
    `  Alloc. fam. 2 enfants 2026 : ${afDeuxEnfants.at(-1)} €/mois`
  );
}

main().catch((e) => {
  console.error("Échec de l'ingestion :", e.message);
  process.exit(1);
});
