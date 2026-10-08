import { describe, expect, it } from "vitest";
import {
  alignPreviousValues,
  buildBudgetView,
  buildEvolutionSeries,
  buildInsights,
  computeCategoryChanges,
  computeDailyAverage,
  computeVariation,
  countMonthsInRange,
  daysInclusive,
  effectiveAnalyticsRange,
  evolutionGranularity,
  filterByCategory,
  filterExpensesInRange,
  isAnalyticsExpense,
  parseLocalDate,
  previousAnalyticsRange,
  resolveAnalyticsRange,
  roundCents,
  sumExpenses,
  summarizeCategories,
  toLocalDateString,
  totalByCategory,
} from "@/lib/expense-analytics";
import type { InsightInput } from "@/lib/expense-analytics";
import type { Transaction } from "@/lib/types";
import type { UserCategory } from "@/contexts/CategoryContext";

const expense = (
  id: string,
  date: string,
  amount: number,
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id,
  title: `Compra ${id}`,
  amount,
  type: "expense",
  category: "Alimentação",
  date,
  isPaid: true,
  ...overrides,
});

const today = new Date(2026, 9, 15); // 15/10/2026

describe("resolveAnalyticsRange", () => {
  const anchor = new Date(2026, 8, 14); // 14/09/2026

  it("defaults the month period to the current calendar month", () => {
    expect(resolveAnalyticsRange("month", anchor)).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });

  it("covers 3 and 6 month windows anchored at the current month", () => {
    expect(resolveAnalyticsRange("3m", anchor)).toEqual({
      start: "2026-07-01",
      end: "2026-09-30",
    });
    expect(resolveAnalyticsRange("6m", anchor)).toEqual({
      start: "2026-04-01",
      end: "2026-09-30",
    });
  });

  it("covers the whole calendar year of the anchor", () => {
    expect(resolveAnalyticsRange("year", anchor)).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });

  it("handles leap years with local dates", () => {
    expect(resolveAnalyticsRange("month", new Date(2028, 1, 14))).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });

  it("accepts a valid custom range", () => {
    expect(
      resolveAnalyticsRange("custom", anchor, {
        from: new Date(2026, 0, 10),
        to: new Date(2026, 0, 20),
      }),
    ).toEqual({ start: "2026-01-10", end: "2026-01-20" });
  });

  it("treats a custom range with only a start as a single day", () => {
    expect(
      resolveAnalyticsRange("custom", anchor, { from: new Date(2026, 2, 5) }),
    ).toEqual({ start: "2026-03-05", end: "2026-03-05" });
  });

  it("returns null for invalid custom ranges instead of NaN windows", () => {
    expect(resolveAnalyticsRange("custom", anchor, {})).toBeNull();
    expect(
      resolveAnalyticsRange("custom", anchor, {
        from: new Date(2026, 0, 20),
        to: new Date(2026, 0, 10),
      }),
    ).toBeNull();
  });
});

describe("effectiveAnalyticsRange", () => {
  it("caps the end at today so future days are never analyzed", () => {
    expect(
      effectiveAnalyticsRange({ start: "2026-10-01", end: "2026-10-31" }, today),
    ).toEqual({ start: "2026-10-01", end: "2026-10-15" });
  });

  it("keeps past ranges untouched", () => {
    expect(
      effectiveAnalyticsRange({ start: "2026-08-01", end: "2026-08-31" }, today),
    ).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });
});

describe("previousAnalyticsRange", () => {
  it("compares a half-elapsed month with the same number of days", () => {
    expect(
      previousAnalyticsRange({ start: "2026-10-01", end: "2026-10-31" }, "month", today),
    ).toEqual({ start: "2026-09-01", end: "2026-09-15" });
  });

  it("shifts a full month by one calendar month", () => {
    expect(
      previousAnalyticsRange({ start: "2026-08-01", end: "2026-08-31" }, "month", today),
    ).toEqual({ start: "2026-07-01", end: "2026-07-31" });
  });

  it("never spills past the shifted window when months differ in length", () => {
    expect(
      previousAnalyticsRange({ start: "2026-05-01", end: "2026-07-31" }, "3m", today),
    ).toEqual({ start: "2026-02-01", end: "2026-04-30" });
  });

  it("places a custom range immediately before the current one", () => {
    expect(
      previousAnalyticsRange({ start: "2026-10-01", end: "2026-10-10" }, "custom", today),
    ).toEqual({ start: "2026-09-21", end: "2026-09-30" });
  });

  it("returns a degenerate window for ranges entirely in the future", () => {
    expect(
      previousAnalyticsRange({ start: "2027-01-01", end: "2027-01-31" }, "month", today),
    ).toEqual({ start: "2027-01-01", end: "2027-01-01" });
  });
});

describe("date helpers", () => {
  it("counts inclusive days", () => {
    expect(daysInclusive("2026-10-01", "2026-10-15")).toBe(15);
    expect(daysInclusive("2026-10-01", "2026-10-01")).toBe(1);
    expect(daysInclusive("2026-10-15", "2026-10-01")).toBe(0);
  });

  it("round-trips local dates without UTC shifts", () => {
    const date = new Date(2026, 0, 5);
    expect(toLocalDateString(date)).toBe("2026-01-05");
    expect(parseLocalDate("2026-01-05").getDate()).toBe(5);
    expect(parseLocalDate("2026-01-05").getMonth()).toBe(0);
  });

  it("rounds to cents and neutralizes non-finite values", () => {
    expect(roundCents(12.344)).toBe(12.34);
    expect(roundCents(12.346)).toBe(12.35);
    expect(roundCents(Infinity)).toBe(0);
    expect(roundCents(NaN)).toBe(0);
  });
});

describe("isAnalyticsExpense — anti-duplication rules", () => {
  const base: Pick<
    Transaction,
    "type" | "title" | "category" | "description" | "accountId" | "creditCardId"
  > = {
    type: "expense",
    title: "Mercado",
    category: "Alimentação",
    description: "",
    accountId: undefined,
    creditCardId: undefined,
  };

  it("accepts real expenses", () => {
    expect(isAnalyticsExpense(base)).toBe(true);
  });

  it("rejects income", () => {
    expect(isAnalyticsExpense({ ...base, type: "income" })).toBe(false);
  });

  it("rejects card bill payments (account + card ids)", () => {
    expect(
      isAnalyticsExpense({ ...base, accountId: "acc", creditCardId: "card" }),
    ).toBe(false);
  });

  it("rejects bill payments by title or category", () => {
    expect(isAnalyticsExpense({ ...base, title: "Pagamento de fatura do cartão" })).toBe(false);
    expect(isAnalyticsExpense({ ...base, title: "Pagar fatura" })).toBe(false);
    expect(
      isAnalyticsExpense({
        ...base,
        category: "Pagamento Fatura" as unknown as Transaction["category"],
      }),
    ).toBe(false);
  });

  it("rejects manual adjustments", () => {
    expect(isAnalyticsExpense({ ...base, title: "Ajuste de saldo" })).toBe(false);
    expect(
      isAnalyticsExpense({
        ...base,
        category: "Ajuste" as unknown as Transaction["category"],
      }),
    ).toBe(false);
    expect(isAnalyticsExpense({ ...base, description: "ajuste manual de teste" })).toBe(false);
  });
});

describe("filterExpensesInRange / sumExpenses", () => {
  const range = { start: "2026-10-01", end: "2026-10-31" };

  const transactions: Transaction[] = [
    expense("real", "2026-10-05", 100),
    expense("income", "2026-10-06", 500, { type: "income" }),
    expense("ids", "2026-10-07", 300, { accountId: "acc", creditCardId: "card" }),
    expense("title", "2026-10-08", 400, { title: "Pagamento de fatura" }),
    expense("adjustment", "2026-10-09", 50, { title: "Ajuste de saldo" }),
    expense("before", "2026-09-30", 999),
    expense("after", "2026-11-01", 888),
  ];

  it("counts only real expenses inside the window", () => {
    const filtered = filterExpensesInRange(transactions, range);
    expect(filtered.map((t) => t.id)).toEqual(["real"]);
    expect(sumExpenses(filtered)).toBe(100);
  });

  it("returns nothing without a range", () => {
    expect(filterExpensesInRange(transactions, null)).toEqual([]);
    expect(sumExpenses(filterExpensesInRange(transactions, null))).toBe(0);
  });

  it("keeps the range boundary dates", () => {
    const bounded = filterExpensesInRange(
      [expense("in-start", "2026-10-01", 10), expense("in-end", "2026-10-31", 20)],
      range,
    );
    expect(sumExpenses(bounded)).toBe(30);
  });
});

describe("filterByCategory / totals / ranking", () => {
  const transactions = [
    expense("a", "2026-10-01", 500),
    expense("b", "2026-10-02", 200),
    expense("c", "2026-10-03", 100, { category: "Transporte" }),
  ];

  it("filters by category and passes everything through when null", () => {
    expect(filterByCategory(transactions, null)).toHaveLength(3);
    expect(filterByCategory(transactions, "Transporte").map((t) => t.id)).toEqual(["c"]);
  });

  it("summarizes and ranks categories by total", () => {
    const summary = summarizeCategories(transactions);
    expect(summary).toEqual([
      { category: "Alimentação", total: 700, percentage: 87.5 },
      { category: "Transporte", total: 100, percentage: 12.5 },
    ]);
    expect(sumExpenses(transactions)).toBe(800);
    expect(totalByCategory(transactions)).toEqual({ Alimentação: 700, Transporte: 100 });
  });

  it("does not divide by zero when there are no expenses", () => {
    expect(summarizeCategories([])).toEqual([]);
    expect(sumExpenses([])).toBe(0);
  });
});

describe("computeDailyAverage", () => {
  it("divides the total by the days in the period", () => {
    expect(computeDailyAverage(300, 10)).toBe(30);
  });

  it("never divides by zero", () => {
    expect(computeDailyAverage(300, 0)).toBe(0);
    expect(computeDailyAverage(300, -5)).toBe(0);
    expect(computeDailyAverage(NaN, 10)).toBe(0);
  });
});

describe("computeVariation", () => {
  it("computes percentage variation in both directions", () => {
    const up = computeVariation(112.4, 100);
    expect(up?.delta).toBeCloseTo(12.4, 5);
    expect(up?.pct).toBeCloseTo(12.4, 5);
    expect(up?.direction).toBe("up");

    const down = computeVariation(91.3, 100);
    expect(down?.delta).toBeCloseTo(-8.7, 5);
    expect(down?.pct).toBeCloseTo(-8.7, 5);
    expect(down?.direction).toBe("down");

    expect(computeVariation(100, 100)?.direction).toBe("flat");
  });

  it("has no percentage when the previous window is empty", () => {
    const fresh = computeVariation(100, 0);
    expect(fresh?.pct).toBeNull();
    expect(fresh?.delta).toBe(100);
    expect(fresh?.direction).toBe("up");

    const empty = computeVariation(0, 0);
    expect(empty?.pct).toBeNull();
    expect(empty?.delta).toBe(0);
    expect(empty?.direction).toBe("flat");
  });

  it("returns null without a previous window", () => {
    expect(computeVariation(100, null)).toBeNull();
  });
});

describe("evolution series", () => {
  const monthRange = { start: "2026-10-01", end: "2026-10-31" };

  it("uses daily granularity up to 31 days and monthly beyond", () => {
    expect(evolutionGranularity(monthRange, today)).toBe("day");
    expect(evolutionGranularity({ start: "2026-10-01", end: "2026-10-31" }, new Date(2026, 10, 20))).toBe("day");
    expect(evolutionGranularity({ start: "2026-05-01", end: "2026-10-31" }, today)).toBe("month");
    expect(evolutionGranularity(null, today)).toBe("day");
  });

  it("zero-fills daily buckets and never draws days beyond today", () => {
    const transactions = [
      expense("x", "2026-10-05", 50),
      expense("future", "2026-10-20", 70),
    ];
    const points = buildEvolutionSeries(
      filterExpensesInRange(transactions, monthRange),
      monthRange,
      today,
    );

    expect(points).toHaveLength(15); // 01/10 .. 15/10
    expect(points[0]).toEqual({ key: "2026-10-01", label: "01/10", value: 0 });
    expect(points[4]).toEqual({ key: "2026-10-05", label: "05/10", value: 50 });
    expect(points.some((point) => point.key === "2026-10-20")).toBe(false);
  });

  it("groups long windows by month", () => {
    const range = { start: "2026-05-01", end: "2026-10-31" };
    const points = buildEvolutionSeries([expense("z", "2026-06-10", 120)], range, today);
    expect(points.map((point) => point.label)).toEqual([
      "05/26",
      "06/26",
      "07/26",
      "08/26",
      "09/26",
      "10/26",
    ]);
    expect(points[1].value).toBe(120);
  });

  it("returns an empty series for invalid ranges", () => {
    expect(buildEvolutionSeries([], null, today)).toEqual([]);
  });
});

describe("alignPreviousValues", () => {
  const monthRange = { start: "2026-10-01", end: "2026-10-31" };
  const current = buildEvolutionSeries(
    [expense("x", "2026-10-05", 50)],
    monthRange,
    today,
  );

  it("aligns an equivalent previous window", () => {
    const previous = alignPreviousValues(
      current,
      [expense("p", "2026-09-05", 80)],
      { start: "2026-09-01", end: "2026-09-15" },
      today,
    );
    expect(previous).toHaveLength(15);
    expect(previous?.[4]).toBe(80);
  });

  it("hides the comparison when the previous window has no data", () => {
    expect(
      alignPreviousValues(current, [], { start: "2026-09-01", end: "2026-09-15" }, today),
    ).toBeNull();
  });

  it("hides the comparison when the buckets do not align", () => {
    expect(
      alignPreviousValues(
        current,
        [expense("p", "2026-09-05", 80)],
        { start: "2026-09-01", end: "2026-09-05" },
        today,
      ),
    ).toBeNull();
  });

  it("hides the comparison when the current series is empty", () => {
    expect(
      alignPreviousValues([], [expense("p", "2026-09-05", 80)], { start: "2026-09-01", end: "2026-09-15" }, today),
    ).toBeNull();
  });
});

describe("computeCategoryChanges", () => {
  it("ranks categories by absolute variation", () => {
    const changes = computeCategoryChanges(
      { Alimentação: 980, Transporte: 410 },
      { Alimentação: 720, Transporte: 600 },
    );
    expect(changes).toHaveLength(2);
    expect(changes[0].category).toBe("Alimentação");
    expect(changes[0].delta).toBe(260);
    expect(changes[0].pct).toBeCloseTo(36.111, 3);
    expect(changes[0].direction).toBe("up");
    expect(changes[1].category).toBe("Transporte");
    expect(changes[1].delta).toBe(-190);
    expect(changes[1].pct).toBeCloseTo((-190 / 600) * 100, 5);
    expect(changes[1].direction).toBe("down");
  });

  it("returns nothing without a previous baseline", () => {
    expect(computeCategoryChanges({}, {})).toEqual([]);
    expect(computeCategoryChanges({ Lazer: 100 }, {})).toEqual([]);
    expect(computeCategoryChanges({ Lazer: 100 }, { Lazer: 0 })).toEqual([]);
  });

  it("marks categories without previous spend as new", () => {
    const changes = computeCategoryChanges({ Novo: 50, Antigo: 100 }, { Novo: 0, Antigo: 100 });
    expect(changes[0].category).toBe("Novo");
    expect(changes[0].pct).toBeNull();
    expect(changes[0].direction).toBe("up");
    expect(changes[1].category).toBe("Antigo");
    expect(changes[1].direction).toBe("flat");
  });
});

describe("countMonthsInRange", () => {
  it("counts the months covered by the effective range", () => {
    expect(countMonthsInRange({ start: "2026-10-01", end: "2026-10-31" }, today)).toBe(1);
    expect(countMonthsInRange({ start: "2026-08-01", end: "2026-10-31" }, today)).toBe(3);
    expect(countMonthsInRange({ start: "2026-01-15", end: "2026-03-05" }, today)).toBe(3);
    expect(countMonthsInRange({ start: "2026-01-01", end: "2026-12-31" }, today)).toBe(10);
    expect(countMonthsInRange(null, today)).toBe(0);
  });
});

describe("buildBudgetView", () => {
  const categories: UserCategory[] = [
    { id: "c1", name: "Alimentação", type: "expense", monthlyBudget: 1000 },
    { id: "c2", name: "Transporte", type: "expense", monthlyBudget: 500 },
    { id: "c3", name: "Lazer", type: "expense", monthlyBudget: null },
  ];
  const spent = { Alimentação: 820, Transporte: 610 };

  it("reuses the existing monthly budgets and ranks by usage", () => {
    const view = buildBudgetView(categories, spent, 1);
    expect(view).not.toBeNull();
    expect(view!.rows.map((row) => row.category)).toEqual(["Transporte", "Alimentação"]);
    expect(view!.rows).toHaveLength(2); // Lazer has no budget

    const transport = view!.rows[0];
    expect(transport.budget).toBe(500);
    expect(transport.percentage).toBe(122);
    expect(transport.exceeded).toBe(110);
    expect(transport.available).toBe(0);

    const food = view!.rows[1];
    expect(food.budget).toBe(1000);
    expect(food.percentage).toBe(82);
    expect(food.available).toBe(180);
    expect(food.exceeded).toBe(0);

    expect(view!.totalBudget).toBe(1500);
    expect(view!.totalSpent).toBe(1430);
    expect(view!.usage.percentage).toBeCloseTo(95.333, 3);
    expect(view!.months).toBe(1);
  });

  it("multiplies monthly budgets by the number of months in the period", () => {
    const view = buildBudgetView(categories, spent, 3)!;
    expect(view.months).toBe(3);
    const food = view.rows.find((row) => row.category === "Alimentação");
    expect(food?.budget).toBe(3000);
    expect(food?.percentage).toBeCloseTo(27.333, 3);
  });

  it("treats zero months as one month", () => {
    const view = buildBudgetView(categories, spent, 0)!;
    expect(view.months).toBe(1);
    expect(view.totalBudget).toBe(1500);
  });

  it("returns null when no category has a budget", () => {
    expect(buildBudgetView([{ id: "c", name: "Lazer", type: "expense", monthlyBudget: null }], spent, 1)).toBeNull();
    expect(buildBudgetView([], spent, 1)).toBeNull();
  });
});

describe("buildInsights", () => {
  const formatMoney = (value: number) => `R$ ${value.toFixed(2)}`;
  const formatPercent = (value: number) => `${value}%`;

  const budget = {
    rows: [
      {
        category: "Alimentação",
        spent: 864,
        budget: 1000,
        percentage: 86.4,
        available: 136,
        exceeded: 0,
      },
      {
        category: "Transporte",
        spent: 120,
        budget: 500,
        percentage: 24,
        available: 380,
        exceeded: 0,
      },
    ],
    totalBudget: 1500,
    totalSpent: 984,
    usage: { percentage: 65.6, available: 516, exceeded: 0 },
    months: 1,
  };

  const fullInput: InsightInput = {
    totalExpenses: 800,
    categories: [{ category: "Alimentação", total: 700, percentage: 87.5 }],
    variation: { delta: 100, pct: 14.3, direction: "up" },
    changes: [
      {
        category: "Transporte",
        current: 410,
        previous: 220,
        delta: 190,
        pct: 86.4,
        direction: "up",
      },
    ],
    budget,
    formatMoney,
    formatPercent,
  };

  it("produces at most 4 deterministic insights", () => {
    const insights = buildInsights(fullInput);
    expect(insights).toHaveLength(4);
    expect(insights[0]).toBe(
      "Alimentação foi sua maior categoria, representando 88% das despesas.",
    );
    expect(insights[1]).toBe(
      "Seus gastos aumentaram 14.3% em relação ao período anterior.",
    );
    expect(insights[2]).toBe(
      "Transporte aumentou R$ 190.00 em relação ao período anterior.",
    );
    expect(insights[3]).toBe(
      "Você já utilizou 86% do orçamento de Alimentação.",
    );
  });

  it("reports an exceeded budget with spent and planned amounts", () => {
    const insights = buildInsights({
      ...fullInput,
      variation: null,
      changes: [],
      budget: {
        ...budget,
        rows: [{ ...budget.rows[0], spent: 1050, percentage: 105, exceeded: 50, available: 0 }],
      },
    });
    expect(insights).toEqual([
      "Alimentação foi sua maior categoria, representando 88% das despesas.",
      "Você estourou o orçamento de Alimentação: R$ 1050.00 de R$ 1000.00 (105%).",
    ]);
  });

  it("falls back to absolute values when there is no percentage base", () => {
    const insights = buildInsights({
      ...fullInput,
      changes: [],
      budget: null,
      variation: { delta: 3, pct: null, direction: "up" },
    });
    expect(insights[1]).toBe(
      "Seus gastos aumentaram R$ 3.00 em relação ao período anterior.",
    );
  });

  it("returns nothing when there is no data to highlight", () => {
    expect(
      buildInsights({
        totalExpenses: 0,
        categories: [],
        variation: null,
        changes: [],
        budget: null,
        formatMoney,
        formatPercent,
      }),
    ).toEqual([]);
  });

  it("skips flat variations", () => {
    const insights = buildInsights({
      ...fullInput,
      changes: [],
      budget: null,
      variation: { delta: 0, pct: 0, direction: "flat" },
    });
    expect(insights).toEqual([
      "Alimentação foi sua maior categoria, representando 88% das despesas.",
    ]);
  });
});
