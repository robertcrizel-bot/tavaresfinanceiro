/**
 * Shared chart theme: soft, dark-mode-friendly colors used across
 * Dashboard, ExpenseAnalytics and Statements. Visual only — never
 * changes aggregation or financial logic.
 */
export const CHART_CATEGORICAL = [
  "hsl(172 66% 45%)",
  "hsl(217 80% 62%)",
  "hsl(262 68% 68%)",
  "hsl(36 92% 58%)",
  "hsl(340 70% 62%)",
  "hsl(150 60% 45%)",
  "hsl(200 78% 55%)",
  "hsl(288 62% 66%)",
  "hsl(24 86% 60%)",
  "hsl(190 72% 48%)",
] as const;

export const chartColor = (index: number): string =>
  CHART_CATEGORICAL[index % CHART_CATEGORICAL.length];

export const CHART_SEMANTIC = {
  income: "hsl(160 84% 42%)",
  expense: "hsl(0 72% 58%)",
  trend: "hsl(168 70% 45%)",
  previous: "hsl(215 16% 55%)",
} as const;

export const CHART_GRID = "hsl(224 14% 20%)";

export const CHART_TICK = { fontSize: 11, fill: "hsl(215 20% 66%)" } as const;

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(224 18% 13%)",
  border: "1px solid hsl(224 14% 22%)",
  borderRadius: 8,
  color: "#f1f5f9",
} as const;
