"use client";

import { useSim } from "@/lib/store";
import { ARCHETYPES } from "@/lib/archetypes";
import { euro } from "@/lib/format";
import type { CitizenProfile } from "@/lib/engine/types";

const CONTRATS: { value: CitizenProfile["contrat"]; label: string }[] = [
  { value: "cdi", label: "CDI" },
  { value: "cdd", label: "CDD" },
  { value: "interim", label: "Intérim" },
  { value: "autoEntrepreneur", label: "Auto-entrepreneur" },
  { value: "independant", label: "Indépendant" },
  { value: "sansEmploi", label: "Sans emploi" },
  { value: "retraite", label: "Retraité·e" },
];

const LOGEMENTS: { value: CitizenProfile["logement"]; label: string }[] = [
  { value: "proprietaireSansCredit", label: "Propriétaire (sans crédit)" },
  { value: "proprietaireAvecCredit", label: "Propriétaire (avec crédit)" },
  { value: "locatairePrive", label: "Locataire privé" },
  { value: "hlm", label: "HLM" },
  { value: "hebergeFamille", label: "Hébergé en famille" },
];

export function ProfilePanel() {
  const { profile, loadProfile, setProfile } = useSim();

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-3 font-display text-lg font-semibold">👤 Profil citoyen</h3>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {ARCHETYPES.map((a) => (
          <button
            key={a.id}
            onClick={() => loadProfile(a.profile)}
            className={`rounded-lg border p-2 text-left text-xs transition ${
              profile.nom === a.profile.nom
                ? "border-or bg-or/15"
                : "border-white/10 hover:border-or/40"
            }`}
          >
            <div className="text-lg">{a.emoji}</div>
            <div className="font-semibold">{a.titre}</div>
          </button>
        ))}
      </div>

      <div className="-mr-2 flex-1 space-y-3 overflow-y-auto pr-2 text-sm">
        <Field label="Prénom">
          <input
            value={profile.nom}
            onChange={(e) => setProfile({ nom: e.target.value })}
            className="input"
          />
        </Field>

        <Field label={`Âge — ${profile.age} ans`}>
          <input
            type="range"
            min={18}
            max={90}
            value={profile.age}
            onChange={(e) => setProfile({ age: +e.target.value })}
            className="w-full"
          />
        </Field>

        <Field label={`Salaire brut annuel — ${euro(profile.salaireBrutAnnuel)}`}>
          <input
            type="range"
            min={0}
            max={150000}
            step={500}
            value={profile.salaireBrutAnnuel}
            onChange={(e) => setProfile({ salaireBrutAnnuel: +e.target.value })}
            className="w-full"
          />
        </Field>

        <Field label="Type de contrat">
          <select
            value={profile.contrat}
            onChange={(e) =>
              setProfile({ contrat: e.target.value as CitizenProfile["contrat"] })
            }
            className="input"
          >
            {CONTRATS.map((c) => (
              <option key={c.value} value={c.value} className="bg-marine-800">
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Logement">
          <select
            value={profile.logement}
            onChange={(e) =>
              setProfile({
                logement: e.target.value as CitizenProfile["logement"],
              })
            }
            className="input"
          >
            {LOGEMENTS.map((l) => (
              <option key={l.value} value={l.value} className="bg-marine-800">
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Loyer / mensualité — ${euro(profile.loyerOuMensualite)}/mois`}>
          <input
            type="range"
            min={0}
            max={2500}
            step={10}
            value={profile.loyerOuMensualite}
            onChange={(e) => setProfile({ loyerOuMensualite: +e.target.value })}
            className="w-full"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Enfants — ${profile.nbEnfants}`}>
            <input
              type="range"
              min={0}
              max={6}
              value={profile.nbEnfants}
              onChange={(e) => setProfile({ nbEnfants: +e.target.value })}
              className="w-full"
            />
          </Field>
          <Field label={`Ancienneté — ${profile.anciennete} ans`}>
            <input
              type="range"
              min={0}
              max={45}
              value={profile.anciennete}
              onChange={(e) => setProfile({ anciennete: +e.target.value })}
              className="w-full"
            />
          </Field>
        </div>

        <Field label="État de santé">
          <select
            value={profile.sante}
            onChange={(e) =>
              setProfile({ sante: e.target.value as CitizenProfile["sante"] })
            }
            className="input"
          >
            <option value="bonne" className="bg-marine-800">Bonne santé</option>
            <option value="ald" className="bg-marine-800">ALD (longue durée)</option>
            <option value="handicap" className="bg-marine-800">Handicap reconnu</option>
          </select>
        </Field>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(10, 22, 40, 0.6);
          padding: 6px 10px;
          color: #f8f6f0;
          font-size: 13px;
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgba(201, 168, 76, 0.6);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-republique/60">{label}</span>
      {children}
    </label>
  );
}
