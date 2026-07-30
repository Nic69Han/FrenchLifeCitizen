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
  tauxCreditImmo,
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
  const poidsSmic = Math.max(0.1, Math.min(1, 1 - 0.45 * (multipleSmic - 1)));

  const partSmic =
    salaire2026 * poidsSmic * (state.smicBrutMensuel / smic2026);
  const partPrix = salaire2026 * (1 - poidsSmic) * (ipc(year) / ipc(2026));

  const pente = cspProfile(profile.csp).penteCarriere;
  const facteurCarriere = Math.pow(1 + pente, year - 2026);

  // Temps partiel : tauxActivite réduit le salaire brut proportionnellement.
  const tauxAct = profile.tauxActivite ?? 1;
  return (partSmic + partPrix) * facteurCarriere * tauxAct;
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
  // Remboursement employeur uniquement pour les actifs salariés
  const aActif = !["sansEmploi", "retraite"].includes(profile.contrat);

  switch (transport) {
    case "voitureEssence":
    case "voitureDiesel": {
      const conso = transport === "voitureDiesel" ? 6 : 7; // L/100km
      const prixL =
        prixCarburant(year) + state.taxeCarbone * 0.0024 + state.ticpe;
      const carburant = (kmMensuels / 100) * conso * prixL;
      const assuranceEntretien = 110;
      return carburant + assuranceEntretien;
    }
    case "voitureElectrique": {
      const conso = 18; // kWh/100km
      const prixKwh = 0.22 * (ipc(year) / ipc(2026));
      const elec = (kmMensuels / 100) * conso * prixKwh;
      return elec + 90;
    }
    case "transportCommun": {
      // Brut ~80 €/mois (abonnement TC moyen France), 50 % remboursé par employeur
      // (obligation légale depuis 1982, curseur piloté par remboursementTransportEmployeur)
      const gross = 80 * (ipc(year) / ipc(2026));
      const remb = aActif ? state.remboursementTransportEmployeur : 0;
      return Math.max(0, gross * (1 - remb));
    }
    case "velo":
      // FMD (forfait mobilités durables) jusqu'à 35 €/mois si actif
      return Math.max(0, 15 - (aActif ? 15 * state.remboursementTransportEmployeur : 0));
    case "teletravail":
    default:
      return 0;
  }
}

/** Énergie du logement (chauffage + électricité courante). */
function coutEnergie(
  profile: CitizenProfile,
  year: number,
  state: StateParams
): number {
  const base = profile.surfaceM2 * 1.5; // €/m²/mois ordre de grandeur 2026
  const facteurChauffage: Record<string, number> = {
    fioul: 1.3,
    gaz: 1.1,
    electrique: 1.2,
    bois: 0.8,
    pompeChaleur: 0.7,
  };
  const f = facteurChauffage[profile.chauffage] ?? 1;
  // Bouclier tarifaire : quand = 0, les prix d'énergie augmentent de ~50 %
  // (ordres de grandeur crise 2021-2022 sans plafonnement gouvernemental)
  const facteurBouclier = 1 + (1 - state.bouclierTarifaireEnergie) * 0.5;
  return base * f * (ipc(year) / ipc(2026)) * facteurBouclier;
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
 * Parent isolé : majoration d'isolement ~+80 €/mois (arrêté CNAF).
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
  const isParentIsole = (profile.parentIsole ?? false) && profile.nbEnfants > 0;
  const coeffCompo = 1 + (enCouple ? 0.5 : 0) + profile.nbEnfants * 0.15;
  const maxPA = base * coeffCompo * state.primeActiviteRevalorisation;
  const seuil = smicNet * (2.0 + 0.5 * (coeffCompo - 1));

  if (revenuNetAvantImpot <= state.rsaSocle) return 0;
  if (revenuNetAvantImpot >= seuil) return 0;

  let paMontant: number;
  if (revenuNetAvantImpot <= smicNet) {
    paMontant = Math.max(0, maxPA * (revenuNetAvantImpot - state.rsaSocle) /
      Math.max(1, smicNet - state.rsaSocle));
  } else {
    paMontant = Math.max(0, maxPA * (seuil - revenuNetAvantImpot) /
      Math.max(1, seuil - smicNet));
  }

  // Majoration isolement parent isolé : ~80 €/mois de bonus PA (CNAF)
  const majorationIsole =
    isParentIsole && !enCouple && paMontant > 0
      ? 80 * state.primeActiviteRevalorisation
      : 0;

  return paMontant + majorationIsole;
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

/**
 * Chèque énergie (créé 2018) — aide nationale means-tested pour payer les factures
 * d'énergie. Montant dégressif : plein sous le RSA, nul à partir de 2× SMIC net.
 */
function chequeEnergie(
  profile: CitizenProfile,
  revenuNetAvantImpot: number,
  state: StateParams
): number {
  if (state.chequeEnergieBase <= 0) return 0;
  const plafond = state.smicBrutMensuel * 2;
  if (revenuNetAvantImpot >= plafond) return 0;
  const facteur = revenuNetAvantImpot <= state.rsaSocle
    ? 1
    : 1 - (revenuNetAvantImpot - state.rsaSocle) / Math.max(1, plafond - state.rsaSocle);
  return Math.max(0, (state.chequeEnergieBase * facteur) / 12);
}

/**
 * Frais scolaires (cantine + périscolaire) pour les enfants d'âge scolaire.
 * Estimés à partir du nb d'enfants et de l'âge du parent. Les jeunes enfants
 * (en garde) sont déjà comptabilisés séparément dans coutGardeEnfants.
 */
function fraisScolaires(
  profile: CitizenProfile,
  year: number,
  state: StateParams
): number {
  if (profile.nbEnfants === 0) return 0;
  if (profile.age < 25 || profile.age >= 55) return 0;
  // Estimation enfants en garde (0–3 ans) — cohérent avec coutGardeEnfants
  const nbGardeEstime = Math.max(0,
    Math.min(profile.nbEnfants, Math.round((42 - profile.age) / 5)));
  const nbScolaires = Math.max(0, profile.nbEnfants - nbGardeEstime);
  if (nbScolaires === 0) return 0;
  return nbScolaires * state.fraisScolairesMunicipaux * (ipc(year) / ipc(2026));
}

/**
 * Allocation Personnalisée d'Autonomie (APA) et coût de la dépendance.
 * Basée sur le niveau GIR (Grille d'Invalidité et de Ressources).
 * L'APA est means-tested : ticket modérateur de 0 % (bas revenus) à 90 % (hauts revenus).
 */
function calculDependance(
  profile: CitizenProfile,
  revenuNetAvantImpot: number,
  year: number,
  state: StateParams
): { aide: number; cout: number } {
  const niveau = profile.niveauDependance ?? 0;
  if (niveau === 0 || profile.age < 60) return { aide: 0, cout: 0 };

  // Coût mensuel du plan d'aide selon le niveau GIR (aide à domicile ou EHPAD)
  const coutsBruts: Record<number, number> = {
    1: 700,   // GIR 4 — aide légère (~3h/jour aide ménagère)
    2: 1400,  // GIR 3 — aide modérée (~4h/jour, actes essentiels)
    3: 2800,  // GIR 1-2 — lourde (EHPAD ou aide intensive, >6h/jour)
  };
  const cout = (coutsBruts[niveau] ?? 0) * (ipc(year) / ipc(2026));

  // Ticket modérateur APA : dégressif selon revenu (0 % → 90 %)
  const plafondHaut = state.smicBrutMensuel * 3;
  const ticketPct = revenuNetAvantImpot >= plafondHaut
    ? 0.9
    : Math.max(0, 0.9 * (revenuNetAvantImpot - state.rsaSocle) /
        Math.max(1, plafondHaut - state.rsaSocle));
  const aide = cout * state.tauxCouvertureAPA * (1 - ticketPct);
  return { aide, cout };
}

/**
 * Perte mensuelle de revenu liée aux arrêts maladie.
 * Pendant la carence (3 j légaux), aucune indemnité ; ensuite CPAM verse tauxIJ.
 * On suppose 1 arrêt si ≤10 jours/an, 2 arrêts sinon (chaque arrêt déclenche la carence).
 */
function coutArretMaladie(
  profile: CitizenProfile,
  revenuBrutMensuel: number,
  state: StateParams
): number {
  const jours = profile.joursMaladieAnnee ?? 0;
  if (jours <= 0 || ["sansEmploi", "retraite"].includes(profile.contrat)) return 0;
  const nbArrets = jours > 10 ? 2 : 1;
  const joursCarence = Math.min(jours, nbArrets * state.delaiCarenceMaladie);
  const joursCouvertsSS = Math.max(0, jours - joursCarence);
  const salaireJournalier = revenuBrutMensuel / 30;
  const perteCarence = joursCarence * salaireJournalier;
  const perteIJ = joursCouvertsSS * salaireJournalier * (1 - state.tauxIndemnitesMaladie);
  return (perteCarence + perteIJ) / 12;
}

/**
 * MaPrimeRénov (2020+) — aide nationale à la rénovation énergétique pour propriétaires
 * occupants. Means-tested : montant plein sous 2× SMIC net, nul au-delà de 5× SMIC.
 * Source : ANAH / décret n°2020-26.
 */
function aideMaPrimeRenov(
  profile: CitizenProfile,
  revenuNetAvantImpot: number,
  state: StateParams,
  year: number
): number {
  if (state.maPrimeRenovBase <= 0) return 0;
  if (!["proprietaireSansCredit", "proprietaireAvecCredit"].includes(profile.logement)) return 0;
  const smicNet = state.smicBrutMensuel * (1 - state.tauxCotisationsSalariales);
  if (revenuNetAvantImpot > smicNet * 5) return 0;
  const facteur = revenuNetAvantImpot <= smicNet * 2
    ? 1
    : 1 - (revenuNetAvantImpot - smicNet * 2) / (smicNet * 3);
  // Aide annuelle → mensuel, indexée sur l'IPC
  return Math.round(state.maPrimeRenovBase * Math.max(0, facteur) * (ipc(year) / ipc(2026)) / 12);
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
  const pensionBase = sam * tauxLiquidation;
  // Majoration CNAV +10 % pour les parents de 3 enfants ou plus (droit légal)
  const bonusFamille = profile.nbEnfants >= 3 ? 1.10 : 1;
  const pension = pensionBase * bonusFamille;
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
    hsSup: number;
    netCapital: number;
  };
} {
  // --- Revenu d'activité ---
  // Pour les sans-emploi, le revenu d'activité est 0 ; les allocations
  // (ARE ou RSA) sont comptées uniquement dans les aides pour éviter le
  // double-comptage. Le salaire brut intègre déjà le tauxActivite.
  const baseSalaire =
    profile.contrat === "sansEmploi"
      ? 0
      : profile.contrat === "retraite"
      ? pensionRetraite(profile, state, year)
      : salaireBrutMensuel(profile, state, year);

  // Heures supplémentaires (CDI/CDD/intérim, cap 7 500 €/an exonérable).
  // Majoration légale : 25 % pour les 8 premières h/sem, 50 % au-delà.
  // Depuis 2019 (Macron), exonération IR totale ; supprimée 2012-2018.
  const hsSup = (() => {
    const n = profile.heuresSup ?? 0;
    if (n <= 0 || !["cdi", "cdd", "interim"].includes(profile.contrat)) {
      return { brut: 0, exonere: 0 };
    }
    const tauxHoraire = baseSalaire / (151.67 * (profile.tauxActivite ?? 1));
    const majoration = n <= 8 ? 1.25 : 1.50;
    const brutHS = Math.min(n * tauxHoraire * majoration, 625); // 7 500 €/an ÷ 12
    return { brut: brutHS, exonere: brutHS * state.exonerationHeuresSup };
  })();

  const revenuBrutMensuel = baseSalaire + hsSup.brut;

  // Les indépendants ont un taux de cotisations effectif plus faible (~−30 %).
  const partIndep = cspProfile(profile.csp).partIndependant;
  const tauxCotisEffectif =
    state.tauxCotisationsSalariales * (1 - 0.3 * partIndep);
  const cotisations =
    profile.contrat === "sansEmploi" || profile.contrat === "retraite"
      ? 0
      : revenuBrutMensuel * tauxCotisEffectif;
  const revenuNetAvantImpot = revenuBrutMensuel - cotisations;

  // Base imposable IR = revenu net − fraction exonérée nette HS − versements PER
  const exonereIRNet = hsSup.exonere * (1 - tauxCotisEffectif);
  const deductionPER = Math.min(
    (profile.epargneRetraiteMensuelle ?? 0) * 12,
    revenuBrutMensuel * 12 * state.plafondEpargneRetraitePER
  );
  const baseIRAnnuel = Math.max(0, (revenuNetAvantImpot - exonereIRNet) * 12 - deductionPER);
  const ir =
    profile.contrat === "sansEmploi"
      ? 0
      : impotMensuel(profile, baseIRAnnuel, year, state);

  // --- Revenus du capital ---
  // PFU 30 % (12,8 % IR + 17,2 % prélèv. soc.) depuis 2018. Curseur tauxPFU.
  const revCapital = profile.capitalFinancierMensuel ?? 0;
  const netCapital = revCapital > 0 ? Math.round(revCapital * (1 - state.tauxPFU)) : 0;

  // --- Aides sociales ---
  const aplx = aidesLogement(profile, revenuNetAvantImpot, year, state);
  const alloc =
    profile.nbEnfants >= 2
      ? state.allocFamilialesParEnfant * profile.nbEnfants
      : 0;

  // AAH (Allocation Adulte Handicapé) pour les personnes en situation de handicap
  const aah = profile.sante === "handicap" && profile.contrat === "sansEmploi"
    ? Math.max(0, state.rsaSocle * 1.5 - revenuNetAvantImpot) // AAH ~ 1,5× RSA, dégressif
    : 0;

  // ARE (allocation retour emploi) ou RSA selon ancienneté et situation.
  // Parent isolé : RSA majoré +25 % (allocation de soutien familial incluse).
  const isParentIsole = (profile.parentIsole ?? false) && profile.nbEnfants > 0;
  const chomageAide = (() => {
    if (profile.contrat !== "sansEmploi") return 0;
    const rsaMajore = state.rsaSocle * (isParentIsole ? 1.25 : 1);
    const moisAnciennete = profile.anciennete * 12;
    if (moisAnciennete >= 4) {
      // Droits ARE épuisés si mois de chômage déjà consommés ≥ durée maximale
      const moisChomage = profile.ancienneteSansEmploi ?? 0;
      if (moisChomage >= state.dureeMaxAre) return rsaMajore; // bascule RSA
      const areMonthly = (profile.salaireBrutAnnuel / 12) * 0.57;
      return Math.max(areMonthly, rsaMajore);
    }
    return rsaMajore;
  })();

  // Prime d'activité pour les travailleurs à revenus modestes
  const pa = primeActivite(profile, revenuNetAvantImpot, year, state);

  // Chèque énergie (2018+, means-tested)
  const chequeEn = chequeEnergie(profile, revenuNetAvantImpot, state);

  // Avantages salariés (tickets resto, chèques vacances, CESU) — exonérés charges/IR
  const avantages = profile.contrat !== "sansEmploi" && profile.contrat !== "retraite"
    ? (profile.avantagesSalaries ?? 0) * (ipc(year) / ipc(2026))
    : 0;

  // APA (Allocation Personnalisée d'Autonomie) pour les seniors dépendants
  const dependance = calculDependance(profile, revenuNetAvantImpot, year, state);

  // MaPrimeRénov (2020+) pour propriétaires occupants, means-tested
  const maPrime = aideMaPrimeRenov(profile, revenuNetAvantImpot, state, year);

  // Bonus voiture électrique — amorti sur 5 ans (60 mois), actif si le profil utilise un VE
  const bonusElec = profile.transport === "voitureElectrique"
    ? Math.round(state.bonusVehiculeElectrique / 60 * (ipc(year) / ipc(2026)))
    : 0;

  const aides = aplx + alloc + chomageAide + pa + aah + chequeEn + avantages
    + dependance.aide + maPrime + bonusElec;

  // --- Dépenses contraintes ---
  const loyer =
    profile.loyerOuMensualite > 0
      ? profile.loyerOuMensualite * (ipc(year) / ipc(2026))
      : profile.logement === "hlm"
      ? loyerM2(year) * profile.surfaceM2 * 0.6  // HLM déjà administré
      : profile.logement === "locatairePrive"
      ? loyerM2(year) * profile.surfaceM2 * state.plafonnementLoyersMultiplicateur
      : 0;

  const transport = coutTransport(profile, year, state);

  const tvaNormRef = tvaNormHist(year) || 0.20;
  const facteurTVANorm = (1 + state.tvaNormale) / (1 + tvaNormRef);
  const facteurTVARed  = (1 + state.tvaReduite) / 1.055;

  const energie = coutEnergie(profile, year, state) * facteurTVARed;
  const alimentation =
    profile.budgetAlimentaireMensuel * (ipc(year) / ipc(2026)) * facteurTVARed;
  const santeRAC = resteAChargeSante(profile, state);
  const abonnements = profile.abonnementsMensuels * facteurTVANorm;

  const mutuelle = coutMutuelle(profile, revenuNetAvantImpot, year, state);
  const tf = taxeFonciere(profile, state);
  const garde = coutGardeEnfants(profile, revenuNetAvantImpot, year, state);
  const scolaire = fraisScolaires(profile, year, state);

  // Perte de revenu liée aux arrêts maladie (carence + fraction non remboursée)
  const perteMaladie = coutArretMaladie(profile, revenuBrutMensuel, state);

  // Épargne retraite PER : dépense mensuelle réelle (déduite aussi du revenu imposable)
  const perMensuel = profile.contrat !== "sansEmploi" && profile.contrat !== "retraite"
    ? (profile.epargneRetraiteMensuelle ?? 0)
    : 0;

  const depensesContraintes =
    loyer + transport + energie + alimentation + santeRAC
    + abonnements + mutuelle + tf + garde + scolaire + dependance.cout
    + perteMaladie + perMensuel;

  const pouvoirAchat =
    revenuNetAvantImpot - ir + aides + netCapital - depensesContraintes;

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
  if (isParentIsole) score += 5; // vulnérabilité supplémentaire parent isolé

  const risque = cspProfile(profile.csp).risqueEmploi;
  let scoreEmploi = 0;
  if (profile.contrat === "sansEmploi") scoreEmploi += 20;
  else if (["interim", "cdd"].includes(profile.contrat)) scoreEmploi += 8;
  scoreEmploi += Math.max(0, (risque - 1) * 10);
  score += scoreEmploi * risque;

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

  // Capacité d'épargne : montant disponible après toutes dépenses et loisirs
  const capaciteEpargne = Math.max(0, Math.round(resteAVivre));

  // Coût total du travail pour l'employeur (brut salarié × (1 + patronales))
  // Hors allègements Fillon — le curseur tauxCotisationsPatronales les pilote.
  const coutTravailEmployeur =
    profile.contrat === "sansEmploi" || profile.contrat === "retraite"
      ? 0
      : Math.round(revenuBrutMensuel * (1 + state.tauxCotisationsPatronales));

  // Capacité d'emprunt immobilier (règle 35 % endettement, durée 20 ans, apport 10 %)
  // Mensualité max = revenu net × 35 %, moins éventuelles charges de crédit existantes
  const mensualiteMax = Math.max(0, revenuNetAvantImpot + netCapital) * 0.35;
  const mensualiteCredit = profile.logement === "proprietaireAvecCredit"
    ? (profile.loyerOuMensualite > 0
        ? profile.loyerOuMensualite * (ipc(year) / ipc(2026)) : 0)
    : 0;
  const mensualiteDisponible = Math.max(0, mensualiteMax - mensualiteCredit);
  const tauxMensuel = state.tauxCreditImmobilier / 12;
  const dureeM = 240; // 20 ans standard
  const capital = tauxMensuel > 0
    ? mensualiteDisponible * (1 - Math.pow(1 + tauxMensuel, -dureeM)) / tauxMensuel
    : mensualiteDisponible * dureeM;
  const capaciteEmpruntImmo = Math.round(capital / 0.90); // apport 10 % inclus

  // Score de protection sociale 0–100 (100 = très protégé face aux chocs de revenu).
  // Distinct du score précarité (situation actuelle) : mesure la robustesse prospective.
  let protection = 60; // base : salarié CDI plein temps
  // ARE / chômage
  if (profile.contrat === "sansEmploi") {
    const moisChomage = profile.ancienneteSansEmploi ?? 0;
    const pctEpuise = Math.min(1, moisChomage / Math.max(1, state.dureeMaxAre));
    protection -= Math.round(30 * pctEpuise); // −30 pts quand droits épuisés
  } else if (["cdd", "interim"].includes(profile.contrat)) {
    protection -= 10; // contrat précaire
  }
  // Maladie : chaque jour de carence soustrait 3 pts ; taux IJ élevé compense
  protection -= Math.round(state.delaiCarenceMaladie * 3);
  protection += Math.round((state.tauxIndemnitesMaladie - 0.5) * 30);
  // Retraite : épargne PER et âge
  if (perMensuel > 0) protection += 8;
  if (profile.contrat === "retraite") protection += 5; // déjà liquidée → stable
  // Dépendance et santé
  if ((profile.niveauDependance ?? 0) > 0) protection -= 10;
  if (profile.sante !== "bonne") protection -= 5;
  // MaPrimeRénov et bonus VE = levier de résilience énergétique
  if (maPrime > 0) protection += 3;
  const indicateurProtection = Math.round(Math.min(100, Math.max(0, protection)));

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
      capaciteEpargne,
      coutTravailEmployeur,
      capaciteEmpruntImmo,
      indicateurProtection,
    },
    details: {
      revenuBrutMensuel,
      cotisations,
      ir,
      aides,
      depensesContraintes,
      pa,
      co2,
      hsSup: hsSup.brut,
      netCapital,
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
    ? ` dont PA +${Math.round(details.pa)} €` : "";
  const hsStr = details.hsSup > 0
    ? ` +HS ${Math.round(details.hsSup)} €` : "";
  const capStr = details.netCapital > 0
    ? ` +capital ${details.netCapital} €` : "";
  const current: Indicator[] = [
    {
      key: "pouvoirAchat",
      label: "Pouvoir d'achat net disponible",
      value: result.pouvoirAchat,
      unit: "€/mois",
      goodDirection: "up",
      formula:
        `Revenu net (${Math.round(details.revenuBrutMensuel)}${hsStr} − ${Math.round(
          details.cotisations
        )} cotis.) ` +
        `− IR (${Math.round(details.ir)}) + aides (${Math.round(details.aides)}${paStr})` +
        `${capStr} − charges (${Math.round(details.depensesContraintes)} : loyer, ` +
        `transport, énergie, alimentation, santé, mutuelle, taxe foncière, garde).`,
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
        "de pauvreté, ALD/handicap, situation d'emploi, parent isolé. 0 = confortable, 100 = très précaire.",
    },
    {
      key: "tauxImpositionEffectif",
      label: "Pression fiscale directe",
      value: result.tauxImpositionEffectif,
      unit: "%",
      goodDirection: "down",
      formula:
        "(Cotisations salariales + impôt sur le revenu) ÷ revenu brut × 100. " +
        "Mesure la part du revenu prélevée directement. Heures sup exonérées réduisent la base IR.",
    },
    {
      key: "empreinteCarbone",
      label: "Empreinte carbone",
      value: result.empreinteCarbone,
      unit: "kgCO₂/mois",
      goodDirection: "down",
      formula:
        "Transport (mode, distance) + chauffage (énergie, surface) + alimentation " +
        "(budget × facteur ADEME). Liée à la taxe carbone et à la TICPE.",
    },
    {
      key: "capaciteEpargne",
      label: "Capacité d'épargne",
      value: result.capaciteEpargne,
      unit: "€/mois",
      goodDirection: "up",
      formula:
        "max(0, reste à vivre). Montant potentiellement disponible pour l'épargne " +
        "une fois loisirs déduits. Nul si le budget est déficitaire.",
    },
    {
      key: "coutTravailEmployeur",
      label: "Coût travail total employeur",
      value: result.coutTravailEmployeur,
      unit: "€/mois",
      goodDirection: "neutral",
      formula:
        `Brut salarié × (1 + cotisations patronales). Hors allègements Fillon ` +
        `(qui réduisent quasi à zéro les patronales au niveau du SMIC). ` +
        `Curseur tauxCotisationsPatronales = ${Math.round(state.tauxCotisationsPatronales * 100)} %.`,
    },
    {
      key: "capaciteEmpruntImmo",
      label: "Budget immobilier accessible",
      value: result.capaciteEmpruntImmo,
      unit: "€",
      goodDirection: "up",
      formula:
        `Mensualité max (35 % revenu net) sur 20 ans au taux ${(state.tauxCreditImmobilier * 100).toFixed(1)} %. ` +
        `Capital empruntable ÷ 0,90 (apport 10 %). Montre l'impact des taux d'intérêt sur ` +
        `l'accès à la propriété.`,
    },
    {
      key: "indicateurProtection",
      label: "Protection sociale",
      value: result.indicateurProtection,
      unit: "/100",
      goodDirection: "up",
      formula:
        `Score de robustesse face aux chocs de revenu (maladie, chômage, dépendance). ` +
        `Base : contrat stable = 60/100. Carence maladie (${state.delaiCarenceMaladie} j) et ` +
        `durée ARE (${state.dureeMaxAre} mois) pilotent l'essentiel. PER et MaPrimeRénov bonifient.`,
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
