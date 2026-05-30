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

const CSPS: { value: CitizenProfile["csp"]; label: string }[] = [
  { value: "ouvrier", label: "Ouvrier" },
  { value: "employe", label: "Employé" },
  { value: "profIntermediaire", label: "Profession intermédiaire" },
  { value: "cadre", label: "Cadre" },
  { value: "agriculteur", label: "Agriculteur" },
  { value: "artisanCommercant", label: "Artisan-commerçant" },
  { value: "independant", label: "Indépendant" },
  { value: "fonctionnaire", label: "Fonctionnaire" },
];

const SITUATIONS: {
  value: CitizenProfile["situationFamiliale"];
  label: string;
}[] = [
  { value: "celibataire", label: "Célibataire" },
  { value: "couple", label: "En couple" },
  { value: "marie", label: "Marié·e" },
  { value: "divorce", label: "Divorcé·e" },
  { value: "veuf", label: "Veuf·ve" },
];

const TRANSPORTS: { value: CitizenProfile["transport"]; label: string }[] = [
  { value: "voitureEssence", label: "Voiture essence" },
  { value: "voitureDiesel", label: "Voiture diesel" },
  { value: "voitureElectrique", label: "Voiture électrique" },
  { value: "transportCommun", label: "Transports en commun" },
  { value: "velo", label: "Vélo" },
  { value: "teletravail", label: "Télétravail total" },
];

const CHAUFFAGES: { value: CitizenProfile["chauffage"]; label: string }[] = [
  { value: "gaz", label: "Gaz" },
  { value: "electrique", label: "Électrique" },
  { value: "fioul", label: "Fioul" },
  { value: "pompeChaleur", label: "Pompe à chaleur" },
  { value: "bois", label: "Bois" },
];

/** Petit helper pour un <select> typé relié à une clé du profil. */
function Select<K extends keyof CitizenProfile>({
  field,
  value,
  options,
  onChange,
}: {
  field: K;
  value: CitizenProfile[K];
  options: { value: CitizenProfile[K]; label: string }[];
  onChange: (patch: Partial<CitizenProfile>) => void;
}) {
  return (
    <select
      value={value as unknown as string}
      onChange={(e) =>
        onChange({ [field]: e.target.value } as Partial<CitizenProfile>)
      }
      className="input"
    >
      {options.map((o) => (
        <option
          key={String(o.value)}
          value={o.value as unknown as string}
          className="bg-marine-800"
        >
          {o.label}
        </option>
      ))}
    </select>
  );
}

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
        <Section title="Identité & famille" />

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

        <Field label="Situation familiale">
          <Select
            field="situationFamiliale"
            value={profile.situationFamiliale}
            options={SITUATIONS}
            onChange={setProfile}
          />
        </Field>

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

        <Section title="Emploi & revenus" />

        <Field label="Catégorie socioprofessionnelle">
          <Select
            field="csp"
            value={profile.csp}
            options={CSPS}
            onChange={setProfile}
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Contrat">
            <Select
              field="contrat"
              value={profile.contrat}
              options={CONTRATS}
              onChange={setProfile}
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

        <Section title="Logement" />

        <Field label="Statut d'occupation">
          <Select
            field="logement"
            value={profile.logement}
            options={LOGEMENTS}
            onChange={setProfile}
          />
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
          <Field label={`Surface — ${profile.surfaceM2} m²`}>
            <input
              type="range"
              min={10}
              max={200}
              step={5}
              value={profile.surfaceM2}
              onChange={(e) => setProfile({ surfaceM2: +e.target.value })}
              className="w-full"
            />
          </Field>
          <Field label="Chauffage">
            <Select
              field="chauffage"
              value={profile.chauffage}
              options={CHAUFFAGES}
              onChange={setProfile}
            />
          </Field>
        </div>

        <Section title="Mobilité" />

        <Field label="Transport principal">
          <Select
            field="transport"
            value={profile.transport}
            options={TRANSPORTS}
            onChange={setProfile}
          />
        </Field>

        <Field label={`Distance domicile-travail — ${profile.distanceTravailKm} km`}>
          <input
            type="range"
            min={0}
            max={80}
            value={profile.distanceTravailKm}
            onChange={(e) => setProfile({ distanceTravailKm: +e.target.value })}
            className="w-full"
          />
        </Field>

        <Section title="Santé & budget" />

        <Field label="État de santé">
          <Select
            field="sante"
            value={profile.sante}
            options={[
              { value: "bonne", label: "Bonne santé" },
              { value: "ald", label: "ALD (longue durée)" },
              { value: "handicap", label: "Handicap reconnu" },
            ]}
            onChange={setProfile}
          />
        </Field>

        <Field label={`Budget alimentaire — ${euro(profile.budgetAlimentaireMensuel)}/mois`}>
          <input
            type="range"
            min={100}
            max={1500}
            step={10}
            value={profile.budgetAlimentaireMensuel}
            onChange={(e) =>
              setProfile({ budgetAlimentaireMensuel: +e.target.value })
            }
            className="w-full"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Abonnements — ${euro(profile.abonnementsMensuels)}`}>
            <input
              type="range"
              min={0}
              max={400}
              step={5}
              value={profile.abonnementsMensuels}
              onChange={(e) =>
                setProfile({ abonnementsMensuels: +e.target.value })
              }
              className="w-full"
            />
          </Field>
          <Field label={`Loisirs — ${euro(profile.loisirsMensuels)}`}>
            <input
              type="range"
              min={0}
              max={800}
              step={10}
              value={profile.loisirsMensuels}
              onChange={(e) => setProfile({ loisirsMensuels: +e.target.value })}
              className="w-full"
            />
          </Field>
        </div>
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

function Section({ title }: { title: string }) {
  return (
    <div className="pt-2 text-[11px] font-semibold uppercase tracking-widest text-or/80">
      {title}
    </div>
  );
}
