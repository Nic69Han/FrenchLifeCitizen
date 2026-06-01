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
  trimestresCiblesGeneration,
  ageLegalGeneration,
  primeActiviteBase,
  tvaNormale as tvaNormHist,
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

/**
 * Prime d'activité — calibrée CNAF (~200 €/mois au SMIC pour un célibataire
 * sans enfants en 2026). Profil en triangle : monte de RSA au SMIC, redescend
 * jusqu'au seuil de sortie (~2× SMIC). Non versée aux retraités/chômeurs.
 */
function primeActivite(
  profile: CitizenProfile,
  revenuNetAvantImpot: number,
  year: number,
  state: StateParams
): number {
  if (["retraite", "sansEmploi"].includes(profile.contrat)) return 0;
  const base = primeActiviteBase(year);
  if (base <= 0) return 0; // avant 2016

  const smicNet = state.smicBrutMensuel * (1 - state.tauxCotisationsSalariales);
  const enCouple = ["marie", "couple"].includes(profile.situationFamiliale);
  const coeffCompo = 1 + (enCouple ? 0.5 : 0) + profile.nbEnfants * 0.15;
  const maxPA = base * coeffCompo * state.primeActiviteRevalorisation;
  // Seuil de sortie : ~2× SMIC pour célibataire, majoré pour familles
  const seuil = smicNet * (2.0 + 0.5 * (coeffCompo - 1));

  if (revenuNetAvantImpot <= state.rsaSocle) return 0;
  if (revenuNetAvantImpot >= seuil) return 0;

  if (revenuNetAvantImpot <= smicNet) {
    // Phase montante : RSA → SMIC
    return Math.max(0, maxPA * (revenuNetAvantImpot - state.rsaSocle) /
      Math.max(1, smicNet - state.rsaSocle));
  }
  // Phase descendante : SMIC → seuil
  return Math.max(0, maxPA * (seuil - revenuNetAvantImpot) /
    Math.max(1, seuil - smicNet));
}

/**
 * Coût mensuel de la mutuelle complémentaire.
 * CSS (Complémentaire Santé Solidaire) gratuite sous ~55 % du SMIC.
 * Les salariés bénéficient de la prise en charge patronale à 50 %.
 * Les retraités financent leur mutuelle en totalité.
 */
function coutMutuelle(
  profile: CitizenProfile,
  revenuNetAvantImpot: number,
  year: number,
  state: StateParams
): number {
  const seuilCSS = state.smicBrutMensuel * 0.55;
  if (revenuNetAvantImpot <= seuilCSS) return 0; // CSS gratuite
  if (profile.sante === "ald") return 12 * (ipc(year) / ipc(2026)); // ALD allégée
  const base = profile.contrat === "retraite" ? 120 : 45; // part salarié ou retraité
  return base * (ipc(year) / ipc(2026));
}

/**
 * Taxe foncière mensuelle pour les propriétaires.
 * Taux national moyen calibré ~12 €/m²/an (taux communaux 2026).
 */
function taxeFonciere(profile: CitizenProfile, state: StateParams): number {
  if (!["proprietaireSansCredit", "proprietaireAvecCredit"].includes(profile.logement)) return 0;
  return (profile.surfaceM2 * state.taxeFonciereTauxM2) / 12;
}

/**
 * Coût net de garde d'enfants (crèche / assistante maternelle − CMG).
 * Nombre d'enfants en garde estimé selon l'âge du parent (< 6 ans).
 * CMG dégressif : 85 % pour revenus modestes → 25 % pour hauts revenus.
 */
function coutGardeEnfants(
  profile: CitizenProfile,
  revenuNetAvantImpot: number,
  year: number,
  state: StateParams
): number {
  if (["retraite", "sansEmploi"].includes(profile.contrat)) return 0;
  if (profile.nbEnfants === 0) return 0;

  // Approximation : enfants en bas âge si le parent a moins de 42 ans
  const nbGarde = Math.max(0,
    Math.min(profile.nbEnfants, Math.round((42 - profile.age) / 5)));
  if (nbGarde <= 0) return 0;

  const coutBrut = 900 * (ipc(year) / ipc(2026)); // ~900 €/mois/enfant en 2026
  const smicNet = state.smicBrutMensuel * (1 - state.tauxCotisationsSalariales);

  // CMG : prise en charge dégressive de 85 % (bas revenus) à 25 % (hauts revenus)
  const tauxPEC =
    revenuNetAvantImpot < smicNet * 1.3 ? 0.85
    : revenuNetAvantImpot < smicNet * 2.5
      ? 0.85 - 0.35 * (revenuNetAvantImpot - smicNet * 1.3) / (smicNet * 1.2)
    : revenuNetAvantImpot < smicNet * 5
      ? 0.50 - 0.25 * (revenuNetAvantImpot - smicNet * 2.5) / (smicNet * 2.5)
    : 0.25;

  return nbGarde * coutBrut * (1 - tauxPEC);
}

/**
 * Empreinte carbone mensuelle en kgCO₂eq.
 * Sources : ADEME (alimentation), HBEFA (transport routier), SDES (énergie).
 */
function empreinteCarbone(profile: CitizenProfile): number {
  // Transport
  const kmMensuels = profile.distanceTravailKm * 2 * 20;
  const co2KmParMode: Record<string, number> = {
    voitureEssence: 0.193,
    voitureDiesel: 0.171,
    voitureElectrique: 0.056, // mix électrique français bas-carbone
    transportCommun: 0.006,
    velo: 0,
    teletravail: 0,
  };
  const kgTransport = kmMensuels * (co2KmParMode[profile.transport] ?? 0.19);

  // Chauffage (kgCO₂/m²/mois, base 150 kWh/m²/an de consommation moyenne)
  const co2M2ParChauffage: Record<string, number> = {
    gaz: 2.53,        // 0.202 kgCO₂/kWh × 150/12
    fioul: 4.05,      // 0.324 kgCO₂/kWh × 150/12
    electrique: 0.65, // 0.052 kgCO₂/kWh × 150/12 (nucléaire FR)
    bois: 0.38,       // quasi-neutre (biogénique), résiduel comb.
    pompeChaleur: 0.22, // COP ~3 → 50 kWh/m²/an × 0.052/12
  };
  const kgChauffage = (co2M2ParChauffage[profile.chauffage] ?? 2.0) * profile.surfaceM2;

  // Alimentation : ~200 kgCO₂eq/mois pour régime moyen (ADEME), proportionnel au budget
  const kgAlimentation = 200 * (profile.budgetAlimentaireMensuel / 350);

  return Math.round(kgTransport + kgChauffage + kgAlimentation);
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

  // Durée d'assurance requise : valeur RÉELLE de la génération du profil (CNAV,
  // par année de naissance), sauf si l'utilisateur a modifié le curseur d'État
  // (mode "Et si ?") — auquel cas on suit son choix. On détecte la modification
  // en comparant le curseur à la valeur par défaut de l'année simulée.
  const birthYear = year - profile.age;
  const trimestresGeneration = trimestresCiblesGeneration(birthYear);
  const defautAnnee = defaultStateParams(year).trimestresRequis;
  const trimestresRequis =
    state.trimestresRequis === defautAnnee
      ? trimestresGeneration
      : state.trimestresRequis;

  const trimestresCotises = Math.min(trimestresRequis, profile.anciennete * 4);
  const tauxLiquidation = 0.5 * (trimestresCotises / trimestresRequis);
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
    pa: number;
    co2: number;
  };
} {
  // --- Revenu d'activité ---
  // Pour les sans-emploi, le revenu d'activité est 0 ; les allocations
  // (ARE ou RSA) sont comptées uniquement dans les aides pour éviter le
  // double-comptage.
  const revenuBrutMensuel =
    profile.contrat === "sansEmploi"
      ? 0
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

  // --- Aides sociales ---
  const aplx = aidesLogement(profile, revenuNetAvantImpot, year, state);
  const alloc =
    profile.nbEnfants >= 2
      ? state.allocFamilialesParEnfant * profile.nbEnfants
      : 0;

  // ARE (allocation retour emploi) ou RSA selon ancienneté et situation
  const chomageAide = (() => {
    if (profile.contrat !== "sansEmploi") return 0;
    const moisAnciennete = profile.anciennete * 12;
    if (moisAnciennete >= 4) {
      // ARE : ~57 % du salaire brut journalier de référence
      const areMonthly = (profile.salaireBrutAnnuel / 12) * 0.57;
      return Math.max(areMonthly, state.rsaSocle);
    }
    return state.rsaSocle;
  })();

  // Prime d'activité pour les travailleurs à revenus modestes
  const pa = primeActivite(profile, revenuNetAvantImpot, year, state);

  const aides = aplx + alloc + chomageAide + pa;

  // --- Dépenses contraintes ---
  // Loyer : on respecte la saisie utilisateur si fournie, sinon estimation.
  const loyer =
    profile.loyerOuMensualite > 0
      ? profile.loyerOuMensualite * (ipc(year) / ipc(2026))
      : ["locatairePrive", "hlm"].includes(profile.logement)
      ? loyerM2(year) * profile.surfaceM2 * (profile.logement === "hlm" ? 0.6 : 1)
      : 0;

  const transport = coutTransport(profile, year, state);

  // TVA : correction des prix de consommation selon les taux en vigueur.
  // TVA normale s'applique aux abonnements/loisirs ; TVA réduite (5.5 %) à
  // l'alimentation et à l'énergie résidentielle (gaz, électricité).
  const tvaNormRef = tvaNormHist(year) || 0.20;
  const facteurTVANorm = (1 + state.tvaNormale) / (1 + tvaNormRef);
  const facteurTVARed  = (1 + state.tvaReduite) / 1.055;

  const energie = coutEnergie(profile, year) * facteurTVARed;
  const alimentation =
    profile.budgetAlimentaireMensuel * (ipc(year) / ipc(2026)) * facteurTVARed;
  const santeRAC = resteAChargeSante(profile, state);
  const abonnements = profile.abonnementsMensuels * facteurTVANorm;

  const mutuelle = coutMutuelle(profile, revenuNetAvantImpot, year, state);
  const tf = taxeFonciere(profile, state);
  const garde = coutGardeEnfants(profile, revenuNetAvantImpot, year, state);

  const depensesContraintes =
    loyer + transport + energie + alimentation + santeRAC
    + abonnements + mutuelle + tf + garde;

  // `aides` inclut APL, allocations familiales, ARE/RSA et prime d'activité.
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
  scoreEmploi += Math.max(0, (risque - 1) * 10);
  score += scoreEmploi * risque;

  // Vulnérabilité liée à l'âge : entrée dans la vie active et fin de carrière.
  if (profile.contrat !== "retraite") {
    if (profile.age < 25) score += 6;
    else if (profile.age >= 55) score += 5;
  }

  const scorePrecarite = Math.round(Math.min(100, Math.max(0, score)));

  // Taux d'imposition effectif (pression fiscale directe)
  const tauxImpositionEffectif =
    revenuBrutMensuel > 0
      ? Math.round((cotisations + ir) / revenuBrutMensuel * 1000) / 10
      : 0;

  const co2 = empreinteCarbone(profile);

  return {
    result: {
      year,
      pouvoirAchat: Math.round(pouvoirAchat),
      tauxEffortLogement: Math.round(tauxEffortLogement * 10) / 10,
      resteAVivre: Math.round(resteAVivre),
      pensionRetraite: Math.round(pension),
      scorePrecarite,
      tauxImpositionEffectif,
      empreinteCarbone: co2,
    },
    details: {
      revenuBrutMensuel,
      cotisations,
      ir,
      aides,
      depensesContraintes,
      pa,
      co2,
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

  const paStr = details.pa > 0
    ? ` dont prime d'activité +${Math.round(details.pa)} €` : "";
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
        `− IR (${Math.round(details.ir)}) + aides (${Math.round(details.aides)}${paStr}) ` +
        `− charges (${Math.round(details.depensesContraintes)} : loyer, transport, énergie, ` +
        `alimentation, santé, mutuelle, taxe foncière, garde).`,
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
    {
      key: "tauxImpositionEffectif",
      label: "Pression fiscale directe",
      value: result.tauxImpositionEffectif,
      unit: "%",
      goodDirection: "down",
      formula:
        "(Cotisations salariales + impôt sur le revenu) ÷ revenu brut × 100. " +
        "Mesure la part du revenu prélevée directement par les prélèvements obligatoires.",
    },
    {
      key: "empreinteCarbone",
      label: "Empreinte carbone",
      value: result.empreinteCarbone,
      unit: "kgCO₂/mois",
      goodDirection: "down",
      formula:
        "Transport (mode, distance) + chauffage (énergie, surface) + alimentation " +
        "(budget × facteur ADEME). Indirectement liée à la taxe carbone et à la TICPE.",
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
