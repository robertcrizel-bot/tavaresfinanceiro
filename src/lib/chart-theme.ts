/**
 * Shared chart theme used across
 * Dashboard, ExpenseAnalytics and Statements. Visual only — never
 * changes aggregation or financial logic.
 */
export const CHART_CATEGORICAL = [
  "hsl(169 66% 47%)",
  "hsl(192 68% 52%)",
  "hsl(218 62% 64%)",
  "hsl(34 74% 55%)",
  "hsl(14 62% 58%)",
  "hsl(155 56% 46%)",
  "hsl(206 68% 60%)",
  "hsl(266 52% 66%)",
  "hsl(22 72% 56%)",
  "hsl(180 52% 48%)",
] as const;

export const chartColor = (index: number): string =>
  CHART_CATEGORICAL[index % CHART_CATEGORICAL.length];

export const CHART_SEMANTIC = {
  income: "hsl(155 56% 46%)",
  expense: "hsl(14 62% 58%)",
  trend: "hsl(169 66% 47%)",
  previous: "hsl(214 12% 58%)",
} as const;

export const CHART_GRID = "hsl(214 18% 21%)";

export const CHART_TICK = { fontSize: 12, fill: "hsl(214 12% 62%)" } as const;

/**
 * Compact BRL notation for monetary chart axes, so a value never shows as a
 * bare number ("600") but always as money ("R$ 600", "R$ 1,5 mil").
 * Presentation only — never used for aggregation or financial logic.
 */
export const chartMoneyTick = (value: number): string => {
  if (!Number.isFinite(value)) return "";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const thousands = Math.round((abs / 1000) * 10) / 10;
    return `${sign}R$ ${thousands.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return `${sign}R$ ${Math.round(abs).toLocaleString("pt-BR")}`;
};

/** Room needed for the widest tick label produced by `chartMoneyTick`. */
export const CHART_MONEY_AXIS_WIDTH = 68;

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(216 28% 9%)",
  border: "1px solid hsl(214 18% 25%)",
  borderRadius: 8,
  color: "#f1f5f9",
} as const;
