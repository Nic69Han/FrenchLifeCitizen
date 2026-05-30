"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Indicator } from "@/lib/engine/types";
import { euro, pct } from "@/lib/format";

function display(ind: Indicator): string {
  if (ind.unit === "€/mois" || ind.unit === "€") return euro(ind.value);
  if (ind.unit === "%") return pct(ind.value);
  return `${ind.value}${ind.unit}`;
}

function deltaColor(ind: Indicator, delta: number): string {
  if (Math.abs(delta) < 0.01 || ind.goodDirection === "neutral")
    return "text-republique/50";
  const positifEstBon = ind.goodDirection === "up";
  const bon = positifEstBon ? delta > 0 : delta < 0;
  return bon ? "text-vert" : "text-action-light";
}

export function IndicatorCard({
  ind,
  baselineValue,
  highlight,
}: {
  ind: Indicator;
  baselineValue?: number;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const delta =
    baselineValue !== undefined ? ind.value - baselineValue : 0;
  const showDelta = baselineValue !== undefined && Math.abs(delta) >= 0.01;

  return (
    <motion.div
      layout
      className={`relative rounded-xl glass p-4 ${
        highlight ? "ring-1 ring-or/60 shadow-glow" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-republique/60">
          {ind.label}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Voir la formule de calcul"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-or/40 text-[10px] text-or transition hover:bg-or/20"
        >
          ?
        </button>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <motion.span
          key={ind.value}
          initial={{ opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-2xl font-bold tabular-nums md:text-3xl"
        >
          {display(ind)}
        </motion.span>
      </div>

      {showDelta && (
        <div className={`mt-1 text-sm font-medium ${deltaColor(ind, delta)}`}>
          {delta > 0 ? "▲ +" : "▼ "}
          {ind.unit === "%"
            ? pct(Math.abs(delta))
            : ind.unit.startsWith("€")
            ? euro(delta)
            : delta.toFixed(0)}
          <span className="ml-1 text-xs text-republique/40">vs réel</span>
        </div>
      )}

      {open && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-republique/70"
        >
          {ind.formula}
        </motion.p>
      )}
    </motion.div>
  );
}
