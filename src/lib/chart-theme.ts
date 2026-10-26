import type { CSSProperties } from "react";

/**
 * Shared chart theme used across
 * Dashboard, ExpenseAnalytics and Statements. Visual only — never
 * changes aggregation or financial logic.
 */
/** Soft but clearly differentiated categorical hues, shared throughout the app.
 * A category's name, not the chart position or filter order, determines its color.
 * Saturation is tuned so marks remain distinguishable against dark and light cards.
 */
export const CHART_CATEGORICAL = [
  "hsl(159 55% 56%)",  // 0 · mint / food
  "hsl(196 72% 65%)",  // 1 · sky / transport
  "hsl(222 67% 71%)",  // 2 · blue / housing
  "hsl(276 56% 72%)",  // 3 · lilac / leisure
  "hsl(13 74% 68%)",   // 4 · coral / health
  "hsl(108 50% 62%)",  // 5 · leaf / education
  "hsl(251 57% 75%)",  // 6 · periwinkle / invoices
  "hsl(178 51% 58%)",  // 7 · teal / income
  "hsl(29 77% 69%)",   // 8 · apricot / freelance
  "hsl(208 20% 72%)",  // 9 · muted slate / other
  "hsl(44 78% 66%)",   // 10 · golden / financing
  "hsl(310 56% 72%)",  // 11 · orchid / extras
  "hsl(345 69% 74%)",  // 12 · dusty pink / baby products
  "hsl(239 60% 76%)",  // 13 · soft indigo / internet
  "hsl(78 53% 65%)",   // 14 · lime / pets
] as const;

const colorKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

// Explicit assignments keep these familiar categories distinct and consistent
// across Dashboard, Análises, Extratos, Registros, Previsões and Categorias.
const CATEGORY_COLORS: Record<string, string> = {
  alimentacao: CHART_CATEGORICAL[0],
  transporte: CHART_CATEGORICAL[1],
  moradia: CHART_CATEGORICAL[2],
  lazer: CHART_CATEGORICAL[3],
  saude: CHART_CATEGORICAL[4],
  educacao: CHART_CATEGORICAL[5],
  "fatura cartao": CHART_CATEGORICAL[6],
  salario: CHART_CATEGORICAL[7],
  freelance: CHART_CATEGORICAL[8],
  outros: CHART_CATEGORICAL[9],
  financiamento: CHART_CATEGORICAL[10],
  superfluos: CHART_CATEGORICAL[11],
  "leite/fralda": CHART_CATEGORICAL[12],
  "internet/telefone": CHART_CATEGORICAL[13],
  bichos: CHART_CATEGORICAL[14],
};
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
