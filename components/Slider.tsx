"use client";

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  baseline,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: (v: number) => string;
  baseline?: number;
  onChange: (v: number) => void;
}) {
  const modifie =
    baseline !== undefined && Math.abs(baseline - value) > step / 2;
  return (
    <div className="py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
        <span className="text-republique/80">{label}</span>
        <span
          className={`tabular-nums font-medium ${
            modifie ? "text-or" : "text-republique/60"
          }`}
        >
          {display(value)}
          {modifie && baseline !== undefined && (
            <span className="ml-1 text-xs text-republique/40 line-through">
              {display(baseline)}
            </span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
