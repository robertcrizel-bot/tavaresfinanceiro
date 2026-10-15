import type { CSSProperties } from "react";

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

const colorKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
// Transactions use category names as identity, including historical categories.
const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  ["alimentacao", "transporte", "moradia", "lazer", "saude", "educacao", "fatura cartao", "salario", "freelance", "outros"]
    .map((key, index) => [key, CHART_CATEGORICAL[index]]),
);
const PAYMENT_COLORS: Record<string, string> = {
  pix: CHART_CATEGORICAL[0],
  "cartao de credito": CHART_CATEGORICAL[7], credito: CHART_CATEGORICAL[7],
  "cartao de debito": CHART_CATEGORICAL[2], debito: CHART_CATEGORICAL[2],
  dinheiro: CHART_CATEGORICAL[5], transferencia: CHART_CATEGORICAL[1],
  boleto: CHART_CATEGORICAL[3], outro: CHART_CATEGORICAL[9],
};
export const REGISTERED_COLORS: Record<string, string> = {
  purple: "#a855f7", orange: "#f97316", blue: "#3b82f6",
  green: "#22c55e", red: "#ef4444", pink: "#ec4899",
};
/** Stable fallback independent of filtering, ordering and list length. */
export const chartColor = (id: string): string => {
  let hash = 2166136261;
  for (const char of colorKey(id)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return CHART_CATEGORICAL[(hash >>> 0) % CHART_CATEGORICAL.length];
};
export const categoryColor = (name: string): string => CATEGORY_COLORS[colorKey(name)] ?? chartColor(`category:${name}`);
export const paymentColor = (method: string): string => PAYMENT_COLORS[colorKey(method)] ?? chartColor(`payment:${method}`);
export const entityColor = (id: string, registeredColor?: string | null): string => {
  const color = registeredColor?.trim();
  if (color && REGISTERED_COLORS[color]) return REGISTERED_COLORS[color];
  if (color && /^(#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i.test(color)) return color;
  return chartColor(`entity:${id}`);
};

export const CHART_SEMANTIC = {
  income: "hsl(var(--income))",
  expense: "hsl(var(--expense))",
  trend: "hsl(169 66% 47%)",
  previous: "hsl(214 12% 58%)",
} as const;

export const CHART_ACCENTS = {
  categories: CHART_CATEGORICAL[7],
  payments: CHART_CATEGORICAL[1],
  accounts: CHART_CATEGORICAL[2],
  time: CHART_CATEGORICAL[1],
  budget: CHART_CATEGORICAL[3],
} as const;

/** A shared accent for subtle surfaces, icons and chips; labels keep theme foreground contrast. */
export const colorAccent = (color: string): CSSProperties =>
  ({ "--data-color": color }) as CSSProperties;

export const CHART_GRID = "hsl(var(--border))";

export const CHART_TICK = { fontSize: 12, fill: "hsl(var(--muted-foreground))" } as const;

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
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  color: "hsl(var(--popover-foreground))",
} as const;
