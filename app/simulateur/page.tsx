"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSim } from "@/lib/store";
import { simulate, YEAR_MIN, YEAR_MAX } from "@/lib/engine";
import type { SimulationResult } from "@/lib/engine/types";
import { ProfilePanel } from "@/components/ProfilePanel";
import { StatePanel } from "@/components/StatePanel";
import { IndicatorCard } from "@/components/IndicatorCard";
import { TimelineChart } from "@/components/TimelineChart";
import { MacroPanel } from "@/components/MacroPanel";
import { DecilePanel } from "@/components/DecilePanel";

export default function Simulateur() {
  const { profile, state, baseline, year, etSiActif, setYear } = useSim();
  const [metric, setMetric] = useState<keyof SimulationResult>("pouvoirAchat");

  const scenario = useMemo(
    () => simulate(profile, state, year),
    [profile, state, year]
  );
  const reel = useMemo(
    () => simulate(profile, baseline, year),
    [profile, baseline, year]
  );

  return (
    <main className="bg-republique min-h-screen">
      <div className="tricolore h-1 w-full" />

      {/* En-tête */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-marine-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-3">
          <Link href="/" className="font-display text-xl font-bold">
            France<span className="text-or">Sim</span>
          </Link>

          <div className="flex flex-1 items-center justify-center gap-3">
            <span className="text-xs uppercase tracking-widest text-republique/40">
              {year <= 2026 ? "Replay" : "Projection"}
            </span>
            <input
              type="range"
              min={YEAR_MIN}
              max={YEAR_MAX}
              value={year}
              onChange={(e) => setYear(+e.target.value)}
              className="w-full max-w-md"
              aria-label="Année de simulation"
            />
            <span className="font-display text-2xl font-bold tabular-nums text-or">
              {year}
            </span>
          </div>

          {etSiActif && (
            <span className="hidden shrink-0 rounded-full bg-action/20 px-3 py-1 text-xs text-action-light md:inline">
              Mode «&nbsp;Et si&nbsp;?&nbsp;» actif
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-5 lg:grid-cols-[300px_1fr_320px]">
        {/* Panneau gauche : profil */}
        <aside className="rounded-2xl glass p-4 lg:max-h-[calc(100vh-110px)] lg:sticky lg:top-[72px]">
          <ProfilePanel />
        </aside>

        {/* Centre : indicateurs + graphe */}
        <section className="space-y-4">
          <div>
            <h1 className="font-display text-2xl font-bold">
              La vie de {profile.nom} en {year}
            </h1>
            <p className="text-sm text-republique/60">
              {etSiActif
                ? "Comparaison entre votre scénario et la France réelle."
                : "Données de la France réelle. Touchez un levier à droite pour explorer une alternative."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {scenario.current.map((ind, i) => (
              <IndicatorCard
                key={ind.key}
                ind={ind}
                baselineValue={etSiActif ? reel.current[i].value : undefined}
                highlight={ind.key === "pouvoirAchat"}
              />
            ))}
            <div className="rounded-xl glass p-4">
              <span className="text-xs uppercase tracking-wide text-republique/60">
                Jauge de précarité
              </span>
              <PrecariteGauge value={scenario.current[4].value} />
            </div>
          </div>

          <TimelineChart
            baseline={reel.timeline}
            scenario={scenario.timeline}
            year={year}
            metric={metric}
            onMetric={setMetric}
            etSiActif={etSiActif}
          />

          <div className="rounded-2xl glass p-4">
            <DecilePanel
              baseline={baseline}
              scenario={state}
              year={year}
              etSiActif={etSiActif}
            />
          </div>
        </section>

        {/* Panneau droit : leviers d'État + finances publiques */}
        <aside className="space-y-4 lg:max-h-[calc(100vh-110px)] lg:sticky lg:top-[72px] lg:overflow-y-auto">
          <div className="rounded-2xl glass p-4">
            <StatePanel />
          </div>
          <div className="rounded-2xl glass p-4">
            <MacroPanel state={state} year={year} etSiActif={etSiActif} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function PrecariteGauge({ value }: { value: number }) {
  const couleur =
    value < 30 ? "#2E8B57" : value < 60 ? "#C9A84C" : "#C0392B";
  const label = value < 30 ? "Confortable" : value < 60 ? "Tension" : "Précaire";
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-3xl font-bold" style={{ color: couleur }}>
          {value}
          <span className="text-base text-republique/40">/100</span>
        </span>
        <span className="text-sm" style={{ color: couleur }}>
          {label}
        </span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, background: couleur }}
        />
      </div>
    </div>
  );
}
