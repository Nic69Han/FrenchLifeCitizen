"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { SimulationResult } from "@/lib/engine/types";
import { euro } from "@/lib/format";

const METRICS: {
  key: keyof SimulationResult;
  label: string;
  fmt: (v: number) => string;
}[] = [
  { key: "pouvoirAchat", label: "Pouvoir d'achat", fmt: (v) => euro(v) },
  { key: "resteAVivre", label: "Reste à vivre", fmt: (v) => euro(v) },
  { key: "tauxEffortLogement", label: "Effort logement", fmt: (v) => `${v} %` },
  { key: "pensionRetraite", label: "Pension retraite", fmt: (v) => euro(v) },
  { key: "scorePrecarite", label: "Précarité", fmt: (v) => `${v}/100` },
];

export function TimelineChart({
  baseline,
  scenario,
  year,
  metric,
  onMetric,
  etSiActif,
}: {
  baseline: SimulationResult[];
  scenario: SimulationResult[];
  year: number;
  metric: keyof SimulationResult;
  onMetric: (m: keyof SimulationResult) => void;
  etSiActif: boolean;
}) {
  const data = baseline.map((b, i) => ({
    year: b.year,
    reel: b[metric],
    scenario: scenario[i][metric],
  }));
  const fmt =
    METRICS.find((m) => m.key === metric)?.fmt ?? ((v: number) => `${v}`);

  return (
    <div className="rounded-xl glass p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs uppercase tracking-wide text-republique/50">
          Évolution&nbsp;:
        </span>
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => onMetric(m.key)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              m.key === metric
                ? "bg-or text-marine-900 font-semibold"
                : "border border-white/15 text-republique/70 hover:border-or/50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="year"
            stroke="rgba(248,246,240,0.4)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            interval={3}
          />
          <YAxis
            stroke="rgba(248,246,240,0.4)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={48}
            tickFormatter={(v) => fmt(v).replace(" €", "€")}
          />
          <Tooltip
            contentStyle={{
              background: "#0F2038",
              border: "1px solid rgba(201,168,76,0.3)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#C9A84C" }}
            formatter={(v: number, name: string) => [
              fmt(v),
              name === "reel" ? "France réelle" : "Votre scénario",
            ]}
          />
          <ReferenceLine x={year} stroke="rgba(201,168,76,0.5)" strokeDasharray="4 3" />
          {etSiActif && (
            <Line
              type="monotone"
              dataKey="reel"
              stroke="rgba(248,246,240,0.35)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="scenario"
            stroke="#C9A84C"
            strokeWidth={2.5}
            dot={false}
            animationDuration={400}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
