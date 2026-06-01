"use client";

import { useMemo } from "react";
import { computeMacroImpact, type MacroImpact } from "@/lib/engine/macro";
import type { StateParams } from "@/lib/engine/types";

interface Props {
  state: StateParams;
  year: number;
  etSiActif: boolean;
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals).replace(".", ",");
}

function fmtMd(md: number): string {
  const abs = Math.abs(md);
  if (abs >= 1000) return `${fmt(md / 1000, 1)} 000 Md€`;
  return `${fmt(md, 0)} Md€`;
}

function SoldeBar({ value }: { value: number }) {
  // value en % PIB, centré sur 0, range -12 à +5
  const clamp = Math.min(5, Math.max(-12, value));
  const pct = ((clamp + 12) / 17) * 100;
  const color = value >= -3 ? "#2E8B57" : value >= -6 ? "#C9A84C" : "#C0392B";
  return (
    <div className="relative mt-1 h-3 w-full overflow-hidden rounded-full bg-white/10">
      {/* Ligne zéro à −3 % PIB (critère Maastricht) */}
      <div
        className="absolute top-0 h-full w-px bg-or/60"
        style={{ left: `${((9) / 17) * 100}%` }}
        title="−3 % PIB (Maastricht)"
      />
      <div
        className="absolute top-0 h-full w-px bg-white/30"
        style={{ left: `${(12 / 17) * 100}%` }}
        title="Équilibre"
      />
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function DeltaRow({ label, deltaPp, deltaMd }: { label: string; deltaPp: number; deltaMd: number }) {
  const sign = deltaPp >= 0 ? "+" : "";
  const color = deltaPp >= 0 ? "text-green-400" : "text-red-400";
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
      <span className="truncate text-republique/70">{label}</span>
      <div className="flex shrink-0 items-center gap-3">
        <span className={`font-mono tabular-nums ${color}`}>
          {sign}{fmt(deltaMd, 1)} Md€
        </span>
        <span className={`w-16 text-right font-mono tabular-nums ${color}`}>
          {sign}{fmt(deltaPp, 2)} pp PIB
        </span>
      </div>
    </div>
  );
}

export function MacroPanel({ state, year, etSiActif }: Props) {
  const impact: MacroImpact = useMemo(
    () => computeMacroImpact(state, year),
    [state, year]
  );

  const { soldePibRef, soldePibProjecte, soldeRefMd, soldeProjecteMd,
    dettePibProjectee, detteProjecteeMd, pibRef, details, deltaTotalPp } = impact;

  const maastrichtRef = soldePibRef >= -3;
  const maastrichtProj = soldePibProjecte >= -3;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-sm font-bold uppercase tracking-widest text-republique/50">
        Finances publiques
      </h2>

      {/* Solde APU */}
      <div className="rounded-xl glass p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-republique/60">Solde APU</span>
          <span className="text-xs text-republique/40">% PIB</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-republique/50 mb-0.5">Réel {year}</p>
            <p className={`font-display text-xl font-bold ${maastrichtRef ? "text-green-400" : "text-red-400"}`}>
              {fmt(soldePibRef)} %
            </p>
            <p className="text-xs text-republique/40">{fmtMd(soldeRefMd)}</p>
          </div>
          {etSiActif && (
            <div className="border-l border-white/10 pl-2">
              <p className="text-xs text-republique/50 mb-0.5">Scénario</p>
              <p className={`font-display text-xl font-bold ${maastrichtProj ? "text-green-400" : "text-red-400"}`}>
                {deltaTotalPp >= 0 ? "+" : ""}{fmt(deltaTotalPp)} pp
              </p>
              <p className="text-xs text-republique/40">{fmtMd(soldeProjecteMd)}</p>
            </div>
          )}
        </div>

        <SoldeBar value={etSiActif ? soldePibProjecte : soldePibRef} />

        <div className="flex justify-between text-xs text-republique/30">
          <span>−12 %</span>
          <span className="text-or/60">−3 % (Maastricht)</span>
          <span>équilibre</span>
        </div>
      </div>

      {/* Dette */}
      <div className="rounded-xl glass p-3 space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-republique/60">Dette Maastricht</span>
          <span className="text-xs text-republique/40">% PIB</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-display text-xl font-bold">
            {fmt(etSiActif ? dettePibProjectee : impact.dettePibProjectee)} %
          </span>
          {etSiActif && (
            <span className="text-xs text-republique/50">
              ≈ {fmtMd(detteProjecteeMd)}
            </span>
          )}
          {!etSiActif && (
            <span className="text-xs text-republique/50">
              ≈ {fmtMd((impact.dettePibProjectee / 100) * pibRef)}
            </span>
          )}
        </div>
        <div className="text-xs text-republique/30">
          Seuil Maastricht : 60 % PIB
        </div>
      </div>

      {/* PIB de référence */}
      <div className="text-xs text-republique/40 text-right">
        PIB {year} : {fmtMd(pibRef)} — Source Eurostat
      </div>

      {/* Détail des leviers */}
      {etSiActif && details.length > 0 && (
        <div className="rounded-xl glass p-3 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-republique/50 mb-2">
            Effet estimé par levier
          </p>
          {[...details]
            .sort((a, b) => Math.abs(b.deltaSoldePp) - Math.abs(a.deltaSoldePp))
            .map((d) => (
              <DeltaRow
                key={d.label}
                label={d.label}
                deltaPp={d.deltaSoldePp}
                deltaMd={d.deltaMd}
              />
            ))}
          <div className="mt-2 border-t border-white/10 pt-2 flex items-center justify-between text-xs font-bold">
            <span>Total</span>
            <div className="flex gap-3">
              <span className={deltaTotalPp >= 0 ? "text-green-400" : "text-red-400"}>
                {deltaTotalPp >= 0 ? "+" : ""}{fmt((deltaTotalPp / 100) * pibRef, 1)} Md€
              </span>
              <span className={`w-16 text-right ${deltaTotalPp >= 0 ? "text-green-400" : "text-red-400"}`}>
                {deltaTotalPp >= 0 ? "+" : ""}{fmt(deltaTotalPp, 2)} pp PIB
              </span>
            </div>
          </div>
        </div>
      )}

      {etSiActif && details.length === 0 && (
        <p className="text-xs text-republique/40 text-center">
          Aucun levier activé — curseurs identiques à la France réelle.
        </p>
      )}

      <p className="text-xs text-republique/25 leading-relaxed">
        Estimations macro basées sur élasticités calibrées (CPO, OCDE). Données
        Eurostat officielles — Administrations publiques (S13), critères Maastricht.
      </p>
    </div>
  );
}
