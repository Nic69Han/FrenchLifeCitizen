"use client";

import { useSim } from "@/lib/store";
import { Slider } from "./Slider";
import { euro, pct } from "@/lib/format";
import type { StateParams } from "@/lib/engine/types";

interface SliderDef {
  key: keyof StateParams;
  label: string;
  min: number;
  max: number;
  step: number;
  display: (v: number) => string;
  groupe: string;
}

const SLIDERS: SliderDef[] = [
  // Fiscalité
  { key: "tauxMarginalIR", label: "Taux marginal IR (tranche haute)", min: 0, max: 0.75, step: 0.01, display: (v) => pct(v * 100, 0), groupe: "Fiscalité" },
  { key: "tvaNormale", label: "TVA normale (hors alim.)", min: 0.05, max: 0.25, step: 0.005, display: (v) => pct(v * 100, 1), groupe: "Fiscalité" },
  { key: "tvaReduite", label: "TVA alimentation & médicaments", min: 0, max: 0.10, step: 0.005, display: (v) => pct(v * 100, 1), groupe: "Fiscalité" },
  { key: "tauxPFU", label: "Flat tax revenus du capital (PFU)", min: 0, max: 0.50, step: 0.01, display: (v) => pct(v * 100, 0), groupe: "Fiscalité" },
  // Social & Travail
  { key: "smicBrutMensuel", label: "SMIC brut mensuel", min: 1000, max: 2500, step: 10, display: (v) => euro(v), groupe: "Social & Travail" },
  { key: "tauxCotisationsSalariales", label: "Cotisations salariales", min: 0, max: 0.4, step: 0.005, display: (v) => pct(v * 100, 1), groupe: "Social & Travail" },
  { key: "tauxCotisationsPatronales", label: "Cotisations patronales", min: 0, max: 0.60, step: 0.01, display: (v) => pct(v * 100, 0), groupe: "Social & Travail" },
  { key: "exonerationHeuresSup", label: "Exonération IR heures sup", min: 0, max: 1, step: 0.1, display: (v) => `${Math.round(v * 100)} %`, groupe: "Social & Travail" },
  { key: "primeActiviteRevalorisation", label: "Prime d'activité (niveau)", min: 0, max: 2, step: 0.05, display: (v) => `${Math.round(v * 100)} %`, groupe: "Social & Travail" },
  { key: "allocFamilialesParEnfant", label: "Allocations familiales / enfant", min: 0, max: 400, step: 5, display: (v) => euro(v), groupe: "Social & Travail" },
  { key: "remboursementTransportEmployeur", label: "Remboursement transport employeur", min: 0, max: 1, step: 0.05, display: (v) => pct(v * 100, 0), groupe: "Social & Travail" },
  { key: "chequeEnergieBase", label: "Chèque énergie (montant annuel)", min: 0, max: 800, step: 10, display: (v) => `${v} €/an`, groupe: "Social & Travail" },
  { key: "rsaSocle", label: "RSA socle", min: 0, max: 1200, step: 10, display: (v) => euro(v), groupe: "Social & Travail" },
  // Retraites
  { key: "ageLegalRetraite", label: "Âge légal de départ", min: 60, max: 70, step: 0.25, display: (v) => `${v.toFixed(2).replace(".00", "")} ans`, groupe: "Retraites" },
  { key: "trimestresRequis", label: "Trimestres requis", min: 150, max: 190, step: 1, display: (v) => `${v} trim.`, groupe: "Retraites" },
  // Logement & Santé
  { key: "aplMultiplicateur", label: "Niveau des APL", min: 0, max: 2, step: 0.05, display: (v) => `${Math.round(v * 100)} %`, groupe: "Logement & Santé" },
  { key: "plafonnementLoyersMultiplicateur", label: "Encadrement des loyers privés", min: 0.5, max: 1.5, step: 0.05, display: (v) => `${Math.round(v * 100)} % marché`, groupe: "Logement & Santé" },
  { key: "fraisScolairesMunicipaux", label: "Frais scolaires (cantine + périscolaire)", min: 0, max: 250, step: 5, display: (v) => `${v} €/enf./mois`, groupe: "Logement & Santé" },
  { key: "taxeFonciereTauxM2", label: "Taxe foncière (taux moyen)", min: 0, max: 25, step: 0.5, display: (v) => `${v.toFixed(1)} €/m²/an`, groupe: "Logement & Santé" },
  { key: "tauxRemboursementSante", label: "Remboursement Sécu (actes courants)", min: 0, max: 1, step: 0.01, display: (v) => pct(v * 100, 0), groupe: "Logement & Santé" },
  // Énergie
  { key: "taxeCarbone", label: "Taxe carbone", min: 0, max: 300, step: 5, display: (v) => `${v} €/t`, groupe: "Énergie" },
  { key: "ticpe", label: "TICPE additionnelle carburant", min: 0, max: 1, step: 0.02, display: (v) => `+${v.toFixed(2).replace(".", ",")} €/L`, groupe: "Énergie" },
];

const GROUPES = ["Fiscalité", "Social & Travail", "Retraites", "Logement & Santé", "Énergie"];

export function StatePanel() {
  const { state, baseline, setStateParam, resetState, etSiActif } = useSim();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">
          🎛️ Leviers de l&apos;État
        </h3>
        {etSiActif && (
          <button
            onClick={resetState}
            className="rounded-full border border-action/50 px-3 py-1 text-xs text-action-light transition hover:bg-action/20"
          >
            Réinitialiser
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-republique/50">
        Modifiez un curseur pour basculer en mode «&nbsp;Et si&nbsp;?&nbsp;» :
        les indicateurs se comparent alors à la France réelle.
      </p>

      <div className="-mr-2 flex-1 overflow-y-auto pr-2">
        {GROUPES.map((groupe) => (
          <div key={groupe} className="mb-4">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-or/80">
              {groupe}
            </div>
            <div className="divide-y divide-white/5">
              {SLIDERS.filter((s) => s.groupe === groupe).map((s) => (
                <Slider
                  key={s.key}
                  label={s.label}
                  value={state[s.key]}
                  baseline={baseline[s.key]}
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  display={s.display}
                  onChange={(v) => setStateParam(s.key, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
