// ---------------------------------------------------------------------------
// Ingestion des SÉRIES STATISTIQUES réelles depuis l'INSEE (base BDM).
//
// L'INSEE BDM (Banque de Données Macroéconomiques) expose les séries
// chronologiques officielles via une API SDMX. Ce script télécharge les séries
// pertinentes (IPC/inflation en priorité), les agrège en moyenne annuelle,
// rebase l'IPC en base 2000 = 100 (cohérent avec le moteur), puis fusionne le
// résultat dans data/economic-series.json — de façon NON DESTRUCTIVE : si une
// série échoue (réseau, idbank), les valeurs calibrées existantes sont
// conservées et la série reste marquée "non officielle".
//
// Lancer :  npx tsx scripts/ingest-insee.ts            (écrit le fichier)
//           npx tsx scripts/ingest-insee.ts --dry-run  (affiche sans écrire)
//
// Réseau : nécessite l'accès à api.insee.fr. Dans l'environnement d'exécution
// actuel, cet hôte est bloqué (politique réseau — host_not_allowed) ; le script
// est prêt et s'activera dès qu'une session disposera de l'accès. Si l'API
// requiert une clé, la fournir via la variable d'environnement INSEE_API_KEY.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const YEAR_MIN = 2000;
const YEAR_MAX = 2026;

const INSEE_BDM_BASE = "https://api.insee.fr/series/BDM/V1/data/SERIES_BDM";
const INSEE_API_KEY = process.env.INSEE_API_KEY ?? "";

// --- Registre des séries à ingérer -----------------------------------------
// Chaque entrée relie une clé de economic-series.json à une série INSEE (idbank)
// et décrit sa transformation. Les séries dont l'idbank vaut null restent
// calibrées (source non INSEE : Banque de France, DGEC, data.gouv) — documentées
// ici pour la suite.
interface SeriesSpec {
  key: string; // clé dans economic-series.json
  idbank: string | null; // identifiant de série INSEE BDM
  label: string; // libellé humain
  source: string; // provenance officielle
  rebaseTo2000?: boolean; // rebaser pour que l'an 2000 = 100
  round?: number; // décimales de sortie
}

const REGISTRY: SeriesSpec[] = [
  {
    key: "ipc",
    idbank: "001763852", // IPC - Ensemble des ménages - France - Base 2015
    label: "Indice des prix à la consommation (ensemble des ménages, France)",
    source: "INSEE — BDM série 001763852 (IPC ensemble, base 2015)",
    rebaseTo2000: true,
    round: 1,
  },
  // Les séries ci-dessous ne relèvent pas de l'INSEE BDM : à brancher sur leurs
  // API respectives (idbank null ⇒ valeurs calibrées conservées pour l'instant).
  {
    key: "tauxCreditImmo",
    idbank: null, // BCE — MIR dataset (branché via fetchEcbMir, ci-dessous)
    label: "Taux moyen des crédits immobiliers aux particuliers (>5 ans, nouveaux contrats)",
    source: "BCE — MIR/M.FR.B.A2C.F.R.A.2250.EUR.N",
    round: 2,
  },
  {
    key: "prixCarburantLitre",
    idbank: null, // DGEC / data.gouv — prix moyens des carburants
    label: "Prix moyen du litre de carburant (SP95/Gazole)",
    source: "Ministère de la Transition écologique / data.gouv (à brancher)",
    round: 2,
  },
  {
    key: "loyerMoyenM2",
    idbank: null, // Observatoires des loyers / INSEE (pas de série BDM nationale simple)
    label: "Loyer moyen au m²",
    source: "Observatoires locaux des loyers / INSEE (à brancher)",
    round: 1,
  },
];

// --- Parsing SDMX-XML -------------------------------------------------------
// L'API BDM renvoie du SDMX-ML/XML par défaut. On extrait les attributs
// TIME_PERIOD et OBS_VALUE des éléments <Obs/> avec une regex simple.
function parseSdmxXml(text: string): Map<string, number> {
  const out = new Map<string, number>();
  // Cherche TIME_PERIOD avant OBS_VALUE (ordre habituel)
  const re1 = /<Obs\s[^>]*TIME_PERIOD="([^"]+)"[^>]*OBS_VALUE="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(text)) !== null) {
    const v = parseFloat(m[2]);
    if (Number.isFinite(v)) out.set(m[1], v);
  }
  // Garde aussi l'ordre inverse (OBS_VALUE avant TIME_PERIOD)
  const re2 = /<Obs\s[^>]*OBS_VALUE="([^"]+)"[^>]*TIME_PERIOD="([^"]+)"/g;
  while ((m = re2.exec(text)) !== null) {
    const v = parseFloat(m[1]);
    if (Number.isFinite(v) && !out.has(m[2])) out.set(m[2], v);
  }
  return out;
}

// --- Parsing SDMX-JSON ------------------------------------------------------
// Fallback JSON si l'API venait à changer de format.
interface SdmxJson {
  dataSets?: {
    series?: Record<
      string,
      { observations?: Record<string, (number | null)[]> }
    >;
    observations?: Record<string, (number | null)[]>;
  }[];
  structure?: {
    dimensions?: {
      observation?: { id?: string; values?: { id?: string; name?: string }[] }[];
    };
  };
}

function parseSdmxJson(json: SdmxJson): Map<string, number> {
  const out = new Map<string, number>();
  const dataSet = json.dataSets?.[0];
  const timeDim = json.structure?.dimensions?.observation?.find(
    (d) => d?.id === "TIME_PERIOD"
  ) ?? json.structure?.dimensions?.observation?.[0];
  const periods = timeDim?.values ?? [];

  const collect = (obs: Record<string, (number | null)[]> | undefined) => {
    if (!obs) return;
    for (const [idx, arr] of Object.entries(obs)) {
      const period = periods[Number(idx)]?.id ?? periods[Number(idx)]?.name;
      const value = Array.isArray(arr) ? arr[0] : null;
      if (period && typeof value === "number" && Number.isFinite(value)) {
        out.set(period, value);
      }
    }
  };

  collect(dataSet?.observations);
  for (const s of Object.values(dataSet?.series ?? {})) collect(s.observations);

  return out;
}

// --- Fetch BCE MIR (Monetary Interest Rates) --------------------------------
// Série MIR/M.FR.B.A2C.F.R.A.2250.EUR.N :
//   Taux annuel moyen des crédits nouveaux à l'habitat aux ménages, >5 ans
//   Source : BCE Statistical Data Warehouse (data-api.ecb.europa.eu)
const ECB_DATA_API = "https://data-api.ecb.europa.eu/service/data";

async function fetchEcbMir(
  key: string,
  startPeriod: number,
  endPeriod: number
): Promise<Map<number, number>> {
  const url =
    `${ECB_DATA_API}/${key}?format=jsondata` +
    `&startPeriod=${startPeriod}-01&endPeriod=${endPeriod}-12`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BCE HTTP ${res.status}: ${url}`);
  const json = (await res.json()) as SdmxJson;
  const monthly = parseSdmxJson(json);
  if (monthly.size === 0) throw new Error("aucune observation BCE parsée");
  return toAnnualMean(monthly);
}

async function fetchInseeSeries(idbank: string): Promise<Map<string, number>> {
  const url = `${INSEE_BDM_BASE}/${idbank}?startPeriod=${YEAR_MIN}&endPeriod=${YEAR_MAX}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (INSEE_API_KEY) headers["Authorization"] = `Bearer ${INSEE_API_KEY}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  const text = await res.text();
  const isXml =
    (res.headers.get("content-type") ?? "").includes("xml") ||
    text.trimStart().startsWith("<?xml");
  const monthly = isXml
    ? parseSdmxXml(text)
    : parseSdmxJson(JSON.parse(text) as SdmxJson);
  if (monthly.size === 0) throw new Error(`aucune observation parsée (${idbank})`);
  return monthly;
}

// --- Agrégation annuelle ----------------------------------------------------
/** Moyenne annuelle des observations (mensuelles ou trimestrielles). */
function toAnnualMean(periodValues: Map<string, number>): Map<number, number> {
  const buckets = new Map<number, number[]>();
  for (const [period, value] of periodValues) {
    const year = Number(period.slice(0, 4));
    if (year < YEAR_MIN || year > YEAR_MAX) continue;
    (buckets.get(year) ?? buckets.set(year, []).get(year)!).push(value);
  }
  const out = new Map<number, number>();
  for (const [year, vals] of buckets) {
    out.set(year, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return out;
}

/** Construit le tableau aligné sur YEAR_MIN..YEAR_MAX (null si manquant). */
function toYearArray(
  annual: Map<number, number>,
  spec: SeriesSpec
): (number | null)[] {
  // Rebase éventuel : an 2000 = 100.
  let factor = 1;
  if (spec.rebaseTo2000) {
    const base = annual.get(YEAR_MIN);
    if (!base) throw new Error(`rebase impossible : valeur ${YEAR_MIN} absente`);
    factor = 100 / base;
  }
  const round = spec.round ?? 2;
  const arr: (number | null)[] = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
    const v = annual.get(y);
    arr.push(v === undefined ? null : Number((v * factor).toFixed(round)));
  }
  // Comble les trous de fin (ex. année courante incomplète) par report.
  for (let i = 1; i < arr.length; i++) if (arr[i] === null) arr[i] = arr[i - 1];
  return arr;
}

// --- Programme principal ----------------------------------------------------
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const target = resolve(process.cwd(), "data/economic-series.json");
  const data = JSON.parse(readFileSync(target, "utf8"));

  console.log(
    `Ingestion INSEE BDM → economic-series.json${dryRun ? " (dry-run)" : ""}`
  );
  if (!INSEE_API_KEY) {
    console.log("  (INSEE_API_KEY non définie — tentative en accès anonyme)");
  }

  const realized: string[] = [];
  for (const spec of REGISTRY) {
    if (!spec.idbank) {
      // Cas spécial : tauxCreditImmo branché sur l'API BCE MIR
      if (spec.key === "tauxCreditImmo") {
        try {
          const annual = await fetchEcbMir(
            "MIR/M.FR.B.A2C.F.R.A.2250.EUR.N",
            YEAR_MIN,
            YEAR_MAX
          );
          const arr = toYearArray(annual, spec);
          data[spec.key] = arr;
          realized.push(spec.key);
          console.log(
            `✓ ${spec.key} : ${annual.size} années réelles (BCE MIR) ` +
              `— 2024=${arr[YEAR_MAX - YEAR_MIN - 2]}%`
          );
        } catch (e) {
          console.warn(
            `⚠ ${spec.key} : échec BCE (${(e as Error).message}) — valeurs calibrées conservées`
          );
        }
        continue;
      }
      console.log(`• ${spec.key} : source non-INSEE, conservé calibré (${spec.source})`);
      continue;
    }
    try {
      const monthly = await fetchInseeSeries(spec.idbank);
      const annual = toAnnualMean(monthly);
      const arr = toYearArray(annual, spec);
      data[spec.key] = arr;
      realized.push(spec.key);
      console.log(
        `✓ ${spec.key} : ${annual.size} années réelles ` +
          `(${spec.source}) — ex. ${YEAR_MAX}=${arr[arr.length - 1]}`
      );
    } catch (e) {
      console.warn(
        `⚠ ${spec.key} : échec (${(e as Error).message}) — valeurs calibrées conservées`
      );
    }
  }

  // Met à jour la métadonnée pour refléter ce qui est désormais réel.
  data.meta = data.meta ?? {};
  data.meta.seriesReelles = realized;
  data.meta.derniereIngestionInsee = realized.length
    ? new Date().toISOString().slice(0, 10)
    : (data.meta.derniereIngestionInsee ?? null);
  if (realized.length) {
    data.meta.description =
      "Séries statistiques pour FranceSim. Certaines sont désormais RÉELLES " +
      `(INSEE BDM) : ${realized.join(", ")}. Les autres restent calibrées en ` +
      "attendant le branchement de leurs sources (Banque de France, DGEC, " +
      "observatoires des loyers). Paramètres LÉGAUX : voir legal-parameters.json.";
  }

  if (dryRun) {
    console.log("\n(dry-run) Aucun fichier écrit.");
    return;
  }
  if (realized.length === 0) {
    console.log("\nAucune série réelle obtenue (réseau bloqué ?) — fichier inchangé.");
    return;
  }
  writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n✓ Écrit ${target} — séries réelles : ${realized.join(", ")}`);
}

main().catch((e) => {
  console.error("Échec de l'ingestion INSEE :", e.message);
  process.exit(1);
});
