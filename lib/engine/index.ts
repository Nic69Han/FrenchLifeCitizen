// ---------------------------------------------------------------------------
// Moteur de simulation FranceSim — calcul des indicateurs citoyens.
//
// Principe (cf. plan §5) : à partir du profil citoyen et des curseurs d'État,
// on calcule pour chaque année une chaîne causale simplifiée aboutissant aux
// 5 indicateurs clés du MVP. Chaque indicateur expose la formule employée.
// ---------------------------------------------------------------------------

import {
  YEARS,
  ipc,
  prixCarburant,
  loyerM2,
  aplBase,
  smicBrut,
  defaultStateParams,
} from "./data";
import { impotMensuel } from "./tax";
import { cspProfile } from "./csp";
import type {
  CitizenProfile,
  StateParams,
  Indicator,
  SimulationResult,
  FullSimulation,
} from "./types";

const SEUIL_PAUVRETE_2026 = 1216; // €/mois (60 % du revenu médian, ordre INSEE)

/**
 * Salaire brut mensuel pour l'année donnée, piloté par le SMIC.
 *
 * Le salaire saisi dans le profil est exprimé en niveau 2026. On le convertit
 * en « multiple de SMIC » (m = salaire2026 / SMIC2026). Le salaire d'une année
 * est alors interpolé entre deux ancrages :
 *  - une part indexée sur le SMIC (forte pour les bas salaires) ;
 *  - une part indexée sur les prix (IPC), qui domine pour les hauts salaires.
 *
 * Conséquences voulues :
 *  - bouger le curseur SMIC déplace fortement Mohamed/Fatima (proches du SMIC)
 *    et très peu un cadre ;
 *  - sur la timeline 2000–2026, chaque profil suit une trajectoire propre
 *    (les bas salaires collent à l'histoire du SMIC, les hauts à l'inflation).
 */
function salaireBrutMensuel(
  profile: CitizenProfile,
  state: StateParams,
  year: number
): number {
  const smic2026 = defaultStateParams(2026).smicBrutMensuel;
  const salaire2026 = profile.salaireBrutAnnuel / 12;
  const multipleSmic = salaire2026 / smic2026;

  // Poids du SMIC dans la formation du salaire : ~1 au niveau du SMIC,
  // décroissant linéairement vers un plancher de 0.1 à partir de 3× SMIC.
  // (Le poids tombe plus vite que 1/multiple, pour que la sensibilité absolue
  //  au SMIC soit nettement plus forte chez les bas salaires que chez un cadre.)
  const poidsSmic = Math.max(0.1, Math.min(1, 1 - 0.45 * (multipleSmic - 1)));

  // Le salaire 2026 est réparti entre une composante indexée SMIC et une
  // composante indexée prix, puis on applique l'évolution de chaque indice.
  const partSmic =
    salaire2026 * poidsSmic * (state.smicBrutMensuel / smic2026);
  const partPrix = salaire2026 * (1 - poidsSmic) * (ipc(year) / ipc(2026));

  // Effet de carrière : le profil décrit la situation en 2026 (à son âge
  // actuel). Les années passées, la personne était plus jeune et plus bas sur
  // sa courbe de carrière — pente d'autant plus marquée que la CSP est
  // "ascendante" (forte pour un cadre, quasi plate pour un ouvrier).
  const pente = cspProfile(profile.csp).penteCarriere;
  const facteurCarriere = Math.pow(1 + pente, year - 2026);

  return (partSmic + partPrix) * facteurCarriere;
}

/** Coût mensuel du transport selon le mode et la distance. */
function coutTransport(
  profile: CitizenProfile,
  year: number,
  state: StateParams
): number {
  const { transport, distanceTravailKm } = profile;
  const joursTravailles = 20;
  const kmMensuels = distanceTravailKm * 2 * joursTravailles;

  switch (transport) {
    case "voitureEssence":
    case "voitureDiesel": {
      const conso = transport === "voitureDiesel" ? 6 : 7; // L/100km
      // Taxe carbone : ~0,0024 €/L par €/tonne CO2 ; + TICPE additionnelle.
      const prixL =
        prixCarburant(year) + state.taxeCarbone * 0.0024 + state.ticpe;
      const carburant = (kmMensuels / 100) * conso * prixL;
      const assuranceEntretien = 110; // forfait mensuel
      return carburant + assuranceEntretien;
    }
    case "voitureElectrique": {
      const conso = 18; // kWh/100km
      const prixKwh = 0.22 * (ipc(year) / ipc(2026));
      const elec = (kmMensuels / 100) * conso * prixKwh;
      return elec + 90;
    }
    case "transportCommun":
      return 55 * (ipc(year) / ipc(2026));
    case "velo":
      return 15;
    case "teletravail":
    default:
      return 0;
  }
}

/** Énergie du logement (chauffage + électricité courante). */
function coutEnergie(profile: CitizenProfile, year: number): number {
  const base = profile.surfaceM2 * 1.5; // €/m²/mois ordre de grandeur 2026
  const facteurChauffage: Record<string, number> = {
    fioul: 1.3,
    gaz: 1.1,
    electrique: 1.2,
    bois: 0.8,
    pompeChaleur: 0.7,
  };
  const f = facteurChauffage[profile.chauffage] ?? 1;
  return base * f * (ipc(year) / ipc(2026));
}

/** APL estimées selon le profil (locataire / HLM, revenus, enfants). */
function aidesLogement(
  profile: CitizenProfile,
  revenuNetMensuel: number,
  year: number,
  state: StateParams
): number {
  const eligible = ["locatairePrive", "hlm"].includes(profile.logement);
  if (!eligible) return 0;
  // Dégressivité : APL pleines sous ~1,3 SMIC, nulles au-delà de ~2,2 SMIC.
  const plafondBas = state.smicBrutMensuel * 1.3;
  const plafondHaut = state.smicBrutMensuel * 2.2;
  let taux = 1;
  if (revenuNetMensuel > plafondHaut) taux = 0;
  else if (revenuNetMensuel > plafondBas)
    taux = 1 - (revenuNetMensuel - plafondBas) / (plafondHaut - plafondBas);
  const bonusEnfants = 1 + 0.12 * profile.nbEnfants;
  return aplBase(year) * state.aplMultiplicateur * taux * bonusEnfants;
}

/** Reste à charge santé mensuel selon l'état de santé et le remboursement. */
function resteAChargeSante(
  profile: CitizenProfile,
  state: StateParams
): number {
  const depenseBrute =
    profile.sante === "ald" ? 320 : profile.sante === "handicap" ? 260 : 90;
  // ALD : prise en charge à ~100 % de la part Sécu.
  const tauxRemb =
    profile.sante === "ald"
      ? Math.min(1, state.tauxRemboursementSante + 0.25)
      : state.tauxRemboursementSante;
  return depenseBrute * (1 - tauxRemb);
}

function pensionRetraite(
  profile: CitizenProfile,
  state: StateParams,
  year: number
): number {
  const salaireMensuel = salaireBrutMensuel(profile, state, year);
  const trimestresCotises = Math.min(
    state.trimestresRequis,
    profile.anciennete * 4
  );
  const tauxLiquidation =
    0.5 * (trimestresCotises / state.trimestresRequis);
  // Salaire annuel moyen approché par le salaire courant, pondéré par le taux
  // de remplacement propre à la CSP (régime fonctionnaire favorable,
  // indépendants moins couverts…).
  const sam = salaireMensuel * cspProfile(profile.csp).remplacementRetraite;
  const pension = sam * tauxLiquidation;
  const minimumRetraite = state.smicBrutMensuel * 0.85 * 0.5;
  return Math.max(pension, minimumRetraite);
}

/** Calcule tous les agrégats pour une année donnée. */
function computeYear(
  profile: CitizenProfile,
  state: StateParams,
  year: number
): {
  result: SimulationResult;
  details: {
    revenuBrutMensuel: number;
    cotisations: number;
    ir: number;
    aides: number;
    depensesContraintes: number;
  };
} {
  const revenuBrutMensuel =
    profile.contrat === "sansEmploi"
      ? state.rsaSocle
      : profile.contrat === "retraite"
      ? pensionRetraite(profile, state, year)
      : salaireBrutMensuel(profile, state, year);

  // Les indépendants ont un taux de cotisations effectif plus faible sur leur
  // rémunération que les salariés (assiette et régime différents) ~ -30 %.
  const partIndep = cspProfile(profile.csp).partIndependant;
  const tauxCotisEffectif =
    state.tauxCotisationsSalariales * (1 - 0.3 * partIndep);
  const cotisations =
    profile.contrat === "sansEmploi" || profile.contrat === "retraite"
      ? 0
      : revenuBrutMensuel * tauxCotisEffectif;
  const revenuNetAvantImpot = revenuBrutMensuel - cotisations;

  const ir =
    profile.contrat === "sansEmploi"
      ? 0
      : impotMensuel(profile, revenuNetAvantImpot * 12, year, state);

  const aplx = aidesLogement(profile, revenuNetAvantImpot, year, state);
  const alloc =
    profile.nbEnfants >= 2
      ? state.allocFamilialesParEnfant * profile.nbEnfants
      : 0;
  const rsa =
    profile.contrat === "sansEmploi" ? state.rsaSocle : 0;
  const aides = aplx + alloc + rsa;

  // Loyer : on respecte la saisie utilisateur si fournie, sinon estimation.
  const loyer =
    profile.loyerOuMensualite > 0
      ? profile.loyerOuMensualite * (ipc(year) / ipc(2026))
      : ["locatairePrive", "hlm"].includes(profile.logement)
      ? loyerM2(year) * profile.surfaceM2 * (profile.logement === "hlm" ? 0.6 : 1)
      : 0;

  const transport = coutTransport(profile, year, state);
  const energie = coutEnergie(profile, year);
  const alimentation =
    profile.budgetAlimentaireMensuel * (ipc(year) / ipc(2026));
  const santeRAC = resteAChargeSante(profile, state);
  const abonnements = profile.abonnementsMensuels;

  const depensesContraintes =
    loyer + transport + energie + alimentation + santeRAC + abonnements;

  // `aides` inclut déjà les allocations familiales, le RSA et les APL.
  const pouvoirAchat =
    revenuNetAvantImpot - ir + aides - depensesContraintes;

  const tauxEffortLogement =
    revenuNetAvantImpot > 0 ? (loyer / revenuNetAvantImpot) * 100 : 0;

  const resteAVivre = pouvoirAchat - profile.loisirsMensuels;

  const pension = pensionRetraite(profile, state, year);

  // Score précarité 0–100 (plus haut = plus précaire).
  let score = 0;
  if (tauxEffortLogement > 33) score += 30;
  else if (tauxEffortLogement > 25) score += 15;
  if (resteAVivre < SEUIL_PAUVRETE_2026 * (ipc(year) / ipc(2026)))
    score += 35;
  if (profile.sante === "ald" || profile.sante === "handicap") score += 15;

  // Composante "emploi" pondérée par le risque propre à la CSP : un statut
  // précaire pèse plus lourd pour un ouvrier que pour un fonctionnaire.
  const risque = cspProfile(profile.csp).risqueEmploi;
  let scoreEmploi = 0;
  if (profile.contrat === "sansEmploi") scoreEmploi += 20;
  else if (["interim", "cdd"].includes(profile.contrat)) scoreEmploi += 8;
  // Risque de fond lié à la CSP, même en emploi stable.
  scoreEmploi += Math.max(0, (risque - 1) * 10);
  score += scoreEmploi * risque;

  // Vulnérabilité liée à l'âge : entrée dans la vie active et fin de carrière
  // (seniors plus difficilement réemployables) sont plus exposées.
  if (profile.contrat !== "retraite") {
    if (profile.age < 25) score += 6;
    else if (profile.age >= 55) score += 5;
  }

  const scorePrecarite = Math.round(Math.min(100, Math.max(0, score)));

  return {
    result: {
      year,
      pouvoirAchat: Math.round(pouvoirAchat),
      tauxEffortLogement: Math.round(tauxEffortLogement * 10) / 10,
      resteAVivre: Math.round(resteAVivre),
      pensionRetraite: Math.round(pension),
      scorePrecarite,
    },
    details: {
      revenuBrutMensuel,
      cotisations,
      ir,
      aides,
      depensesContraintes,
    },
  };
}

/**
 * Curseurs « par défaut » (taxe carbone, TICPE) où la valeur réelle peut être
 * nulle certaines années : on y applique l'écart utilisateur de façon additive
 * plutôt que multiplicative.
 */
const PARAMS_ADDITIFS: (keyof StateParams)[] = ["taxeCarbone", "ticpe"];

/**
 * Paramètres effectifs pour `targetYear`, en propageant les choix de
 * l'utilisateur (faits pour `selectedYear`) sur toute la timeline.
 *
 * Pour chaque curseur, on mesure l'écart entre la valeur choisie et la valeur
 * réelle de l'année sélectionnée, puis on applique le même écart — en ratio
 * (niveaux) ou en absolu (params additifs) — à la valeur réelle de l'année
 * cible. Ainsi le rejeu « France réelle » garde l'histoire de chaque année,
 * tandis qu'un « Et si ? » se superpose de façon cohérente dans le temps.
 */
function effectiveParams(
  userState: StateParams,
  selectedYear: number,
  targetYear: number
): StateParams {
  const baseSel = defaultStateParams(selectedYear);
  const baseTarget = defaultStateParams(targetYear);
  const out = { ...baseTarget };

  (Object.keys(baseTarget) as (keyof StateParams)[]).forEach((k) => {
    const chosen = userState[k];
    const refSel = baseSel[k];
    if (PARAMS_ADDITIFS.includes(k)) {
      out[k] = Math.max(0, baseTarget[k] + (chosen - refSel));
    } else if (refSel !== 0) {
      out[k] = baseTarget[k] * (chosen / refSel);
    } else {
      out[k] = chosen;
    }
  });
  return out;
}

/** Point d'entrée : simule toute la timeline + détaille l'année sélectionnée. */
export function simulate(
  profile: CitizenProfile,
  state: StateParams,
  selectedYear: number
): FullSimulation {
  const timeline: SimulationResult[] = YEARS.map(
    (y) =>
      computeYear(profile, effectiveParams(state, selectedYear, y), y).result
  );

  const { result, details } = computeYear(profile, state, selectedYear);

  const current: Indicator[] = [
    {
      key: "pouvoirAchat",
      label: "Pouvoir d'achat net disponible",
      value: result.pouvoirAchat,
      unit: "€/mois",
      goodDirection: "up",
      formula:
        `Revenu net (${Math.round(details.revenuBrutMensuel)} − ${Math.round(
          details.cotisations
        )} cotis.) ` +
        `− IR (${Math.round(details.ir)}) + aides (${Math.round(
          details.aides
        )}) − dépenses contraintes (${Math.round(details.depensesContraintes)}).`,
    },
    {
      key: "tauxEffortLogement",
      label: "Taux d'effort logement",
      value: result.tauxEffortLogement,
      unit: "%",
      goodDirection: "down",
      formula:
        "Loyer ou mensualité de crédit ÷ revenu net mensuel × 100. " +
        "Au-delà de 33 %, le logement pèse fortement sur le budget.",
    },
    {
      key: "resteAVivre",
      label: "Reste à vivre",
      value: result.resteAVivre,
      unit: "€/mois",
      goodDirection: "up",
      formula:
        "Pouvoir d'achat net − budget loisirs/culture. Ce qui reste réellement " +
        "disponible une fois toutes les charges payées.",
    },
    {
      key: "pensionRetraite",
      label: "Pension de retraite estimée",
      value: result.pensionRetraite,
      unit: "€/mois",
      goodDirection: "up",
      formula:
        "Salaire annuel moyen × taux de liquidation (50 % × trimestres cotisés ÷ " +
        "trimestres requis), plancher = minimum garanti.",
    },
    {
      key: "scorePrecarite",
      label: "Score de précarité",
      value: result.scorePrecarite,
      unit: "/100",
      goodDirection: "down",
      formula:
        "Composite : taux d'effort logement élevé, reste à vivre sous le seuil " +
        "de pauvreté, ALD/handicap, situation d'emploi. 0 = confortable, 100 = très précaire.",
    },
  ];

  return { current, timeline };
}

export * from "./types";
export {
  YEARS,
  YEAR_MIN,
  YEAR_MAX,
  SOURCES,
  defaultStateParams,
} from "./data";
