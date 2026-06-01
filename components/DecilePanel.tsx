"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { simulateDeciles } from "@/lib/engine/deciles";
import type { StateParams } from "@/lib/engine/types";

interface Props {
  baseline: StateParams;
  scenario: StateParams;
  year: number;
  etSiActif: boolean;
}

type MetricKey = "pouvoirAchat" | "scorePrecarite" | "resteAVivre";

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: "pouvoirAchat", label: "Pouvoir d'achat", unit: "€/mois" },
  { key: "resteAVivre", label: "Reste à vivre", unit: "€/mois" },
  { key: "scorePrecarite", label: "Précarité", unit: "/100" },
];

function fmtTooltip(n: number, unit: string): string {
  if (unit === "/100") return `${Math.round(n)}/100`;
  return `${n >= 0 ? "+" : ""}${Math.round(n).toLocaleString("fr-FR")} ${unit}`;
}

export function DecilePanel({ baseline, scenario, year, etSiActif }: Props) {
  const [metric, setMetric] = useState<MetricKey>("pouvoirAchat");

  const points = useMemo(
    () => simulateDeciles(baseline, scenario, year),
    [baseline, scenario, year]
  );

  const currentMetric = METRICS.find((m) => m.key === metric)!;

  const chartData = points.map((p) => {
    const bVal = p.baseline.find((i) => i.key === metric)?.value ?? 0;
    const sVal = p.scenario.find((i) => i.key === metric)?.value ?? 0;
    return {
      decile: p.decile,
      net: p.salaireNetMensuel,
      baseline: Math.round(bVal),
      scenario: Math.round(sVal),
      delta: Math.round(sVal - bVal),
    };
  });

  const deltaMax = Math.max(...chartData.map((d) => Math.abs(d.delta)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display text-lg font-semibold">
          Impact par décile
        </h2>
        <div className="flex gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-full px-2 py-0.5 text-xs transition ${
                metric === m.key
                  ? "bg-action text-white"
                  : "text-republique/50 hover:text-republique/80"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-republique/50">
        Célibataire salarié 35 ans, locataire. D1 ≈ SMIC — D9 ≈ cadre senior.
      </p>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="decile"
              tick={{ fill: "rgba(240,230,210,0.5)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgba(240,230,210,0.5)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={45}
              tickFormatter={(v: number) =>
                Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
            />
            <Tooltip
              contentStyle={{
                background: "rgba(10,20,50,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [
                fmtTooltip(value, currentMetric.unit),
                name === "baseline" ? "France réelle" : "Scénario",
              ]}
              labelFormatter={(label: string) => {
                const d = chartData.find((p) => p.decile === label);
                return `${label} — ≈${d?.net?.toLocaleString("fr-FR")} €/mois net`;
              }}
            />
            {etSiActif && (
              <Legend
                wrapperStyle={{ fontSize: 11, color: "rgba(240,230,210,0.5)" }}
                formatter={(value: string) =>
                  value === "baseline" ? "France réelle" : "Scénario"
                }
              />
            )}
            <Bar dataKey="baseline" fill="#4A6FA5" radius={[3, 3, 0, 0]} maxBarSize={32}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.decile}
                  fill={
                    metric === "scorePrecarite"
                      ? entry.baseline > 60
                        ? "#C0392B"
                        : entry.baseline > 30
                        ? "#C9A84C"
                        : "#2E8B57"
                      : "#4A6FA5"
                  }
                />
              ))}
            </Bar>
            {etSiActif && (
              <Bar dataKey="scenario" fill="#C9A84C" radius={[3, 3, 0, 0]} maxBarSize={32} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {etSiActif && deltaMax > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-republique/50">
            Δ scénario vs réel — {currentMetric.unit}
          </p>
          <div className="grid grid-cols-9 gap-1">
            {chartData.map((d) => {
              const pct = deltaMax > 0 ? Math.abs(d.delta) / deltaMax : 0;
              const isPos = metric === "scorePrecarite" ? d.delta <= 0 : d.delta >= 0;
              const color = isPos ? "#2E8B57" : "#C0392B";
              const height = Math.max(4, Math.round(pct * 36));
              const label =
                Math.abs(d.delta) >= 1000
                  ? `${d.delta > 0 ? "+" : ""}${(d.delta / 1000).toFixed(1)}k`
                  : `${d.delta > 0 ? "+" : ""}${d.delta}`;
              return (
                <div key={d.decile} className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] font-mono tabular-nums leading-tight" style={{ color }}>
                    {label}
                  </span>
                  <div
                    className="w-full rounded-sm"
                    style={{ height, background: color, opacity: 0.8 }}
                  />
                  <span className="text-[9px] text-republique/40">{d.decile}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
