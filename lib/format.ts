export const euro = (n: number, opts: { decimals?: number } = {}) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: opts.decimals ?? 0,
    minimumFractionDigits: opts.decimals ?? 0,
  }).format(n);

export const pct = (n: number, decimals = 1) =>
  `${n.toFixed(decimals).replace(".", ",")} %`;

export const num = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
