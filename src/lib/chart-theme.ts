/**
 * Shared chart theme used across
 * Dashboard, ExpenseAnalytics and Statements. Visual only — never
 * changes aggregation or financial logic.
 */
export const CHART_CATEGORICAL = [
  "hsl(168 72% 43%)",
  "hsl(194 76% 55%)",
  "hsl(265 68% 68%)",
  "hsl(38 90% 58%)",
  "hsl(5 76% 61%)",
  "hsl(151 62% 48%)",
  "hsl(215 78% 64%)",
  "hsl(291 58% 67%)",
  "hsl(24 86% 60%)",
  "hsl(183 67% 48%)",
] as const;

export const chartColor = (index: number): string =>
  CHART_CATEGORICAL[index % CHART_CATEGORICAL.length];

export const CHART_SEMANTIC = {
  income: "hsl(158 70% 45%)",
  expense: "hsl(5 76% 61%)",
  trend: "hsl(168 72% 43%)",
  previous: "hsl(214 12% 55%)",
} as const;

export const CHART_GRID = "hsl(214 18% 21%)";

export const CHART_TICK = { fontSize: 11, fill: "hsl(214 12% 62%)" } as const;

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(216 28% 9%)",
  border: "1px solid hsl(214 18% 25%)",
  borderRadius: 8,
  color: "#f1f5f9",
} as const;
