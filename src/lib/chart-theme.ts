/**
 * Shared chart theme used across
 * Dashboard, ExpenseAnalytics and Statements. Visual only — never
 * changes aggregation or financial logic.
 */
export const CHART_CATEGORICAL = [
  "hsl(153 72% 27%)",
  "hsl(199 69% 38%)",
  "hsl(262 48% 52%)",
  "hsl(35 89% 48%)",
  "hsl(5 67% 50%)",
  "hsl(172 56% 32%)",
  "hsl(218 58% 50%)",
  "hsl(291 42% 48%)",
  "hsl(24 76% 48%)",
  "hsl(186 60% 38%)",
] as const;

export const chartColor = (index: number): string =>
  CHART_CATEGORICAL[index % CHART_CATEGORICAL.length];

export const CHART_SEMANTIC = {
  income: "hsl(153 72% 27%)",
  expense: "hsl(5 67% 50%)",
  trend: "hsl(153 72% 27%)",
  previous: "hsl(157 8% 55%)",
} as const;

export const CHART_GRID = "hsl(43 14% 82%)";

export const CHART_TICK = { fontSize: 11, fill: "hsl(157 8% 43%)" } as const;

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(158 35% 11%)",
  border: "1px solid hsl(157 24% 24%)",
  borderRadius: 8,
  color: "#f1f5f9",
} as const;
