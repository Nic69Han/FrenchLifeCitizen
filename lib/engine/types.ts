// ---------------------------------------------------------------------------
// Types du moteur de simulation FranceSim
// ---------------------------------------------------------------------------

export type SituationFamiliale =
  | "celibataire"
  | "couple"
  | "marie"
  | "divorce"
  | "veuf";

export type CSP =
  | "ouvrier"
  | "employe"
  | "profIntermediaire"
  | "cadre"
  | "agriculteur"
  | "artisanCommercant"
  | "independant"
  | "fonctionnaire";

export type Contrat =
  | "cdi"
  | "cdd"
  | "interim"
  | "autoEntrepreneur"
  | "independant"
  | "sansEmploi"
  | "retraite";

export type Logement =
  | "proprietaireSansCredit"
  | "proprietaireAvecCredit"
  | "locatairePrive"
  | "hlm"
  | "hebergeFamille";

export type Transport =
  | "voitureEssence"
  | "voitureDiesel"
  | "voitureElectrique"
  | "transportCommun"
  | "velo"
  | "teletravail";

export type Chauffage = "gaz" | "electrique" | "fioul" | "pompeChaleur" | "bois";

export type Sante = "bonne" | "ald" | "handicap";

/** Les paramètres du citoyen (sous-ensemble MVP des 30 du plan). */
export interface CitizenProfile {
  nom: string;
  age: number;
  situationFamiliale: SituationFamiliale;
  nbEnfants: number;
  csp: CSP;
  salaireBrutAnnuel: number;
  contrat: Contrat;
  anciennete: number;
  logement: Logement;
  surfaceM2: number;
  chauffage: Chauffage;
  loyerOuMensualite: number;
  transport: Transport;
  distanceTravailKm: number;
  sante: Sante;
  budgetAlimentaireMensuel: number;
  abonnementsMensuels: number;
  loisirsMensuels: number;
  // Champs optionnels (rétrocompatibles — undefined = valeur par défaut)
  tauxActivite?: number;              // 0.1–1.0, défaut 1 (temps plein)
  parentIsole?: boolean;              // parent isolé : RSA majoré, PA bonifiée
  capitalFinancierMensuel?: number;   // €/mois dividendes, rentes, PEA… → PFU
  heuresSup?: number;                 // heures supplémentaires par mois
}

/** Les curseurs d'État (sous-ensemble MVP des 40 du plan). */
export interface StateParams {
  tauxCotisationsSalariales: number;  // 0–0.40
  tauxMarginalIR: number;             // tranche haute, 0–0.75
  tvaNormale: number;                 // 0.05–0.25
  tvaReduite: number;                 // TVA alimentation/médicaments (défaut 5.5 %)
  smicBrutMensuel: number;            // €
  allocFamilialesParEnfant: number;   // €/enfant/mois
  aplMultiplicateur: number;          // 0–2 (modulation des APL)
  primeActiviteRevalorisation: number; // 0 = supprimée, 1 = réelle, >1 = hausse
  ageLegalRetraite: number;           // 60–70
  trimestresRequis: number;
  taxeCarbone: number;                // €/tonne (impacte le carburant)
  ticpe: number;                      // €/litre additionnel
  rsaSocle: number;                   // €/mois
  tauxRemboursementSante: number;     // 0–1
  taxeFonciereTauxM2: number;         // €/m²/an (taxe foncière, défaut ~12)
  tauxCotisationsPatronales: number;  // ~0.42 (cotisations employeur, hors allègements)
  exonerationHeuresSup: number;       // 0–1 (fraction exonérée IR heures sup)
  tauxPFU: number;                    // flat tax revenus du capital (défaut 0.30)
}

/** Un indicateur calculé, avec sa valeur et l'explication de sa formule. */
export interface Indicator {
  key: string;
  label: string;
  value: number;
  unit: string;
  formula: string;
  /** Sens d'une hausse : "good" = mieux, "bad" = moins bien, "neutral". */
  goodDirection: "up" | "down" | "neutral";
}

export interface SimulationResult {
  year: number;
  pouvoirAchat: number;
  tauxEffortLogement: number;
  resteAVivre: number;
  pensionRetraite: number;
  scorePrecarite: number;
  tauxImpositionEffectif: number;
  empreinteCarbone: number;
  capaciteEpargne: number;
  coutTravailEmployeur: number;
}

export interface FullSimulation {
  /** Résultat pour l'année sélectionnée, avec formules détaillées. */
  current: Indicator[];
  /** Série temporelle pour les graphiques (toutes les années). */
  timeline: SimulationResult[];
}
