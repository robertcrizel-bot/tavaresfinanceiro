import { calculateCategoryBudgetUsage } from "@/lib/financial-calculations";
import type { CategoryBudgetUsage } from "@/lib/financial-calculations";
import { isFinancialNeutralTransaction } from "@/lib/transaction-classification";
import type { Transaction } from "@/lib/types";
import type { UserCategory } from "@/contexts/CategoryContext";

export type AnalyticsPeriod = "month" | "3m" | "6m" | "year" | "custom";

export interface AnalyticsRange {
  start: string;
  end: string;
}

export interface CustomDateRange {
  from?: Date;
  to?: Date;
}

export interface CategorySummary {
  category: string;
  total: number;
  percentage: number;
}

export interface VariationSummary {
  delta: number;
  pct: number | null;
  direction: "up" | "down" | "flat";
}

export interface EvolutionPoint {
  key: string;
  label: string;
  value: number;
}

export interface CategoryChange {
  category: string;
  current: number;
  previous: number;
  delta: number;
  pct: number | null;
  direction: "up" | "down" | "flat";
}

export interface BudgetRow {
  category: string;
  spent: number;
  budget: number;
  percentage: number;
  available: number;
  exceeded: number;
}

export interface BudgetView {
  rows: BudgetRow[];
  totalBudget: number;
  totalSpent: number;
  usage: CategoryBudgetUsage;
  months: number;
}

const DAY_MS = 86400000;
const FLAT_DELTA_EPSILON = 0.005;

export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function toLocalDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

export function daysInclusive(start: string, end: string): number {
  const startTime = parseLocalDate(start).getTime();
  const endTime = parseLocalDate(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  if (endTime < startTime) return 0;
  return Math.round((endTime - startTime) / DAY_MS) + 1;
}

function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getFullYear();
  const targetMonth = date.getMonth() + months;
  const lastDay = new Date(year, targetMonth + 1, 0).getDate();
  return new Date(year, targetMonth, Math.min(date.getDate(), lastDay));
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Resolves the analytic range (local calendar dates, never UTC-shifted) for
 * the selected period. Returns null for an invalid custom range so the UI can
 * warn instead of rendering NaN or bogus windows.
 */
export function resolveAnalyticsRange(
  period: AnalyticsPeriod,
  anchor: Date,
  customRange?: CustomDateRange,
): AnalyticsRange | null {
  if (period === "custom") {
    if (!customRange?.from) return null;
    const start = toLocalDateString(customRange.from);
    const end = customRange.to ? toLocalDateString(customRange.to) : start;
    if (start > end) return null;
    return { start, end };
  }

  const start = monthStart(anchor);
  const end = monthEnd(anchor);

  if (period === "month") {
    return { start: toLocalDateString(start), end: toLocalDateString(end) };
  }
  if (period === "3m" || period === "6m") {
    const back = period === "3m" ? 2 : 5;
    return { start: toLocalDateString(addMonthsClamped(start, -back)), end: toLocalDateString(end) };
  }
  return {
    start: `${anchor.getFullYear()}-01-01`,
    end: `${anchor.getFullYear()}-12-31`,
  };
}

/** The part of the range that already happened (never beyond "today"). */
export function effectiveAnalyticsRange(range: AnalyticsRange, today: Date): AnalyticsRange {
  const todayStr = toLocalDateString(today);
  return {
    start: range.start,
    end: range.end < todayStr ? range.end : todayStr,
  };
}

/**
 * Equivalent previous window: the same number of already-elapsed days
 * immediately before the current range, so a half-elapsed month is compared
 * against the same number of days of the previous month.
 */
export function previousAnalyticsRange(
  range: AnalyticsRange,
  period: AnalyticsPeriod,
  today: Date,
): AnalyticsRange {
  const effective = effectiveAnalyticsRange(range, today);
  const days = daysInclusive(effective.start, effective.end);
  if (days <= 0) return { start: range.start, end: range.start };

  let previousStart: Date;
  let shiftedEnd: Date | null = null;
  if (period === "custom") {
    const length = Math.max(daysInclusive(range.start, range.end), 1);
    previousStart = parseLocalDate(range.start);
    previousStart.setDate(previousStart.getDate() - 1);
    previousStart.setDate(previousStart.getDate() - (length - 1));
  } else {
    const back = period === "month" ? 1 : period === "3m" ? 3 : period === "6m" ? 6 : 12;
    previousStart = addMonthsClamped(parseLocalDate(range.start), -back);
    shiftedEnd = addMonthsClamped(parseLocalDate(range.end), -back);
  }

  const previousEnd = new Date(previousStart.getTime());
  previousEnd.setDate(previousEnd.getDate() + days - 1);
  // Months have different lengths: never let the day-count spill past the
  // end of the shifted window (e.g. full May 1 - Jul 31 -> Feb 1 - Apr 30).
  if (shiftedEnd && shiftedEnd < previousEnd) previousEnd.setTime(shiftedEnd.getTime());
  return { start: toLocalDateString(previousStart), end: toLocalDateString(previousEnd) };
}

export function countMonthsInRange(range: AnalyticsRange | null, today: Date): number {
  if (!range) return 0;
  const effective = effectiveAnalyticsRange(range, today);
  const start = parseLocalDate(effective.start);
  const end = parseLocalDate(effective.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return (
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  );
}

/**
 * The single source of truth for "this transaction is a real expense":
 * income, bill payments and manual adjustments are excluded, exactly like the
 * Dashboard. Transfers live in their own table and never reach this list, so
 * internal movements and card bill payments are never double counted.
 */
export function isAnalyticsExpense(
  transaction: Pick<Transaction, "type" | "title" | "category" | "description" | "accountId" | "creditCardId" | "financialKind">,
): boolean {
  return transaction.type === "expense" && !isFinancialNeutralTransaction(transaction);
}

export function filterExpensesInRange(
  transactions: Transaction[],
  range: AnalyticsRange | null,
): Transaction[] {
  if (!range) return [];
  return transactions.filter(
    (transaction) =>
      isAnalyticsExpense(transaction) &&
      transaction.date >= range.start &&
      transaction.date <= range.end,
  );
}

export function filterByCategory<T extends { category: string }>(
  transactions: T[],
  category: string | null,
): T[] {
  if (!category) return transactions;
  return transactions.filter((transaction) => transaction.category === category);
}

export function sumExpenses(transactions: Transaction[]): number {
  return roundCents(transactions.reduce((total, transaction) => total + transaction.amount, 0));
}

export function totalByCategory(transactions: Transaction[]): Record<string, number> {
  return transactions.reduce<Record<string, number>>((acc, transaction) => {
    acc[transaction.category] = roundCents((acc[transaction.category] || 0) + transaction.amount);
    return acc;
  }, {});
}

export function summarizeCategories(transactions: Transaction[]): CategorySummary[] {
  const total = sumExpenses(transactions);
  return Object.entries(totalByCategory(transactions))
    .map(([category, categoryTotal]) => ({
      category,
      total: categoryTotal,
      percentage: total > 0 ? (categoryTotal / total) * 100 : 0,
    }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        a.category.localeCompare(b.category, "pt-BR"),
    );
}

export function computeDailyAverage(total: number, days: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(days) || days <= 0) return 0;
  return total / days;
}

/**
 * Variation against the equivalent previous window. pct is null when the
 * previous window has no expenses (division by zero has no meaning there).
 */
export function computeVariation(
  currentTotal: number,
  previousTotal: number | null,
): VariationSummary | null {
  if (previousTotal === null) return null;
  const delta = roundCents(currentTotal - previousTotal);
  const direction: VariationSummary["direction"] =
    delta > FLAT_DELTA_EPSILON ? "up" : delta < -FLAT_DELTA_EPSILON ? "down" : "flat";
  if (previousTotal <= 0) {
    return { delta, pct: null, direction };
  }
  return { delta, pct: (delta / previousTotal) * 100, direction };
}

export type EvolutionGranularity = "day" | "month";

export function evolutionGranularity(range: AnalyticsRange | null, today: Date): EvolutionGranularity {
  if (!range) return "day";
  const effective = effectiveAnalyticsRange(range, today);
  return daysInclusive(effective.start, effective.end) <= 31 ? "day" : "month";
}

/**
 * Zero-filled evolution series. Daily for short windows (one month), monthly
 * for longer ones, never hundreds of points. Days/months beyond today are not
 * drawn so a half-elapsed month does not trail off into empty space.
 */
export function buildEvolutionSeries(
  transactions: Transaction[],
  range: AnalyticsRange | null,
  today: Date,
): EvolutionPoint[] {
  if (!range) return [];
  const effective = effectiveAnalyticsRange(range, today);
  if (daysInclusive(effective.start, effective.end) <= 0) return [];

  const byKey: Record<string, number> = {};
  transactions.forEach((transaction) => {
    const key = granularityKey(transaction.date, evolutionGranularity(range, today));
    byKey[key] = roundCents((byKey[key] || 0) + transaction.amount);
  });

  const points: EvolutionPoint[] = [];
  const granularity = evolutionGranularity(range, today);

  if (granularity === "day") {
    const cursor = parseLocalDate(effective.start);
    const end = parseLocalDate(effective.end);
    while (cursor <= end) {
      const key = toLocalDateString(cursor);
      points.push({
        key,
        label: key.slice(8, 10) + "/" + key.slice(5, 7),
        value: byKey[key] || 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return points;
  }

  const cursor = parseLocalDate(effective.start);
  cursor.setDate(1);
  const end = parseLocalDate(effective.end);
  while (cursor <= end) {
    const key = monthKeyOf(toLocalDateString(cursor));
    points.push({
      key,
      label: `${String(cursor.getMonth() + 1).padStart(2, "0")}/${String(cursor.getFullYear()).slice(2)}`,
      value: byKey[key] || 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}

function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function granularityKey(dateStr: string, granularity: EvolutionGranularity): string {
  return granularity === "day" ? dateStr.slice(0, 10) : monthKeyOf(dateStr);
}

/**
 * Previous-period series aligned with the current one. Returns null when the
 * comparison would be misleading (no previous data or misaligned buckets).
 */
export function alignPreviousValues(
  current: EvolutionPoint[],
  previousTransactions: Transaction[],
  previousRange: AnalyticsRange | null,
  today: Date,
): number[] | null {
  if (!previousRange || current.length === 0) return null;
  const previous = buildEvolutionSeries(previousTransactions, previousRange, today);
  if (previous.length !== current.length) return null;
  if (previous.every((point) => point.value === 0)) return null;
  return previous.map((point) => point.value);
}

/**
 * Category-by-category comparison with the equivalent previous window.
 * Returns an empty list when there is no previous data to compare against.
 */
export function computeCategoryChanges(
  currentByCategory: Record<string, number>,
  previousByCategory: Record<string, number>,
): CategoryChange[] {
  const previousTotal = Object.values(previousByCategory).reduce((sum, value) => sum + value, 0);
  if (previousTotal <= 0) return [];

  const categories = new Set([
    ...Object.keys(currentByCategory),
    ...Object.keys(previousByCategory),
  ]);

  return [...categories]
    .map<CategoryChange>((category) => {
      const current = roundCents(currentByCategory[category] || 0);
      const previous = roundCents(previousByCategory[category] || 0);
      const delta = roundCents(current - previous);
      const direction: CategoryChange["direction"] =
        delta > FLAT_DELTA_EPSILON ? "up" : delta < -FLAT_DELTA_EPSILON ? "down" : "flat";
      return {
        category,
        current,
        previous,
        delta,
        pct: previous > 0 ? (delta / previous) * 100 : null,
        direction,
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.delta) - Math.abs(a.delta) ||
        b.delta - a.delta ||
        a.category.localeCompare(b.category, "pt-BR"),
    );
}

/**
 * Budgets are the existing per-category monthly budgets. For a multi-month
 * period the monthly budget is multiplied by the number of months in the
 * window; categories without a budget are ignored (there is no second budget
 * system here).
 */
export function buildBudgetView(
  categories: UserCategory[],
  spentByCategory: Record<string, number>,
  months: number,
): BudgetView | null {
  const budgeted = categories.filter(
    (category) => category.monthlyBudget != null && category.monthlyBudget > 0,
  );
  if (budgeted.length === 0) return null;

  const effectiveMonths = Math.max(months, 1);
  const rows = budgeted
    .map<BudgetRow>((category) => {
      const budget = roundCents((category.monthlyBudget || 0) * effectiveMonths);
      const spent = roundCents(spentByCategory[category.name] || 0);
      const usage = calculateCategoryBudgetUsage(spent, budget);
      return {
        category: category.name,
        spent,
        budget,
        percentage: usage.percentage,
        available: usage.available,
        exceeded: usage.exceeded,
      };
    })
    .sort((a, b) => b.percentage - a.percentage || b.budget - a.budget);

  const totalBudget = roundCents(rows.reduce((sum, row) => sum + row.budget, 0));
  const totalSpent = roundCents(rows.reduce((sum, row) => sum + row.spent, 0));

  return {
    rows,
    totalBudget,
    totalSpent,
    usage: calculateCategoryBudgetUsage(totalSpent, totalBudget),
    months: effectiveMonths,
  };
}

export interface InsightInput {
  totalExpenses: number;
  categories: CategorySummary[];
  variation: VariationSummary | null;
  changes: CategoryChange[];
  budget: BudgetView | null;
  formatMoney: (value: number) => string;
  formatPercent: (value: number) => string;
}

/**
 * Deterministic, local, free insights: at most 4, only when they carry real
 * information. No AI, no API, no cost.
 */
export function buildInsights(input: InsightInput): string[] {
  const { totalExpenses, categories, variation, changes, budget, formatMoney, formatPercent } =
    input;
  const insights: string[] = [];
  if (insights.length >= 4) return insights;

  const top = categories[0];
  if (totalExpenses > 0 && top) {
    insights.push(
      `${top.category} foi sua maior categoria, representando ${formatPercent(
        Math.round(top.percentage),
      )} das despesas.`,
    );
  }

  if (insights.length < 4 && variation && variation.direction !== "flat") {
    if (variation.pct !== null && Math.abs(variation.pct) >= 0.5) {
      const verb = variation.direction === "up" ? "aumentaram" : "diminuíram";
      insights.push(
        `Seus gastos ${verb} ${formatPercent(Math.abs(variation.pct))} em relação ao período anterior.`,
      );
    } else if (variation.delta !== 0) {
      const verb = variation.direction === "up" ? "aumentaram" : "caíram";
      insights.push(
        `Seus gastos ${verb} ${formatMoney(Math.abs(variation.delta))} em relação ao período anterior.`,
      );
    }
  }

  if (insights.length < 4) {
    const biggest = changes.find((change) => change.direction !== "flat");
    if (biggest) {
      const verb = biggest.direction === "up" ? "aumentou" : "caiu";
      insights.push(
        `${biggest.category} ${verb} ${formatMoney(Math.abs(biggest.delta))} em relação ao período anterior.`,
      );
    }
  }

  if (insights.length < 4 && budget) {
    const mostUsed = budget.rows[0];
    if (mostUsed && mostUsed.percentage >= 50) {
      if (mostUsed.exceeded > 0) {
        insights.push(
          `Você estourou o orçamento de ${mostUsed.category}: ${formatMoney(
            mostUsed.spent,
          )} de ${formatMoney(mostUsed.budget)} (${formatPercent(Math.round(mostUsed.percentage))}).`,
        );
      } else {
        insights.push(
          `Você já utilizou ${formatPercent(
            Math.round(mostUsed.percentage),
          )} do orçamento de ${mostUsed.category}.`,
        );
      }
    }
  }

  return insights.slice(0, 4);
}
