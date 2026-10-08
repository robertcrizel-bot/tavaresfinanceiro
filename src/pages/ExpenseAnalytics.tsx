import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useFinance } from "@/contexts/FinanceContext";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { KpiCard } from "@/components/KpiCard";
import { ChartCard } from "@/components/ChartCard";
import { InsightCard } from "@/components/InsightCard";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TransactionDetail } from "@/components/TransactionDetail";
import { calculateCategoryBudgetUsage } from "@/lib/financial-calculations";
import { chartColor } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/types";
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
  parseLocalDate,
  previousAnalyticsRange,
  resolveAnalyticsRange,
  roundCents,
  sumExpenses,
  summarizeCategories,
  totalByCategory,
  type AnalyticsPeriod,
} from "@/lib/expense-analytics";
import {
  CalendarDays,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Percent,
  PieChart,
  Tag,
  Wallet,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "month", label: "Mês" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "year", label: "Ano" },
];

const colorForIndex = (index: number) => chartColor(index);

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const percent = (value: number) =>
  `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const shortDate = (value: string) =>
  parseLocalDate(value).toLocaleDateString("pt-BR");

export default function ExpenseAnalytics() {
  const { transactions } = useFinance();
  const { accounts, creditCards } = useAccounts();
  const { categories } = useCategories();

  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [detailTransaction, setDetailTransaction] = useState<Transaction | null>(null);

  const today = useMemo(() => new Date(), []);

  const range = useMemo(
    () => resolveAnalyticsRange(period, anchor, customRange),
    [period, anchor, customRange],
  );

  // Everything in the period is capped at today: totals, average, evolution,
  // budget and the transaction list never include days that did not happen.
  const effectiveRange = useMemo(
    () => (range ? effectiveAnalyticsRange(range, today) : null),
    [range, today],
  );

  const periodExpenses = useMemo(
    () => filterExpensesInRange(transactions, effectiveRange),
    [transactions, effectiveRange],
  );

  const visibleExpenses = useMemo(
    () => filterByCategory(periodExpenses, selectedCategory),
    [periodExpenses, selectedCategory],
  );

  const previousRange = useMemo(
    () => (range ? previousAnalyticsRange(range, period, today) : null),
    [range, period, today],
  );

  const previousExpenses = useMemo(
    () => filterExpensesInRange(transactions, previousRange),
    [transactions, previousRange],
  );

  const periodSummary = useMemo(() => {
    const total = sumExpenses(periodExpenses);
    const days = effectiveRange
      ? daysInclusive(effectiveRange.start, effectiveRange.end)
      : 0;
    return {
      total,
      days,
      average: computeDailyAverage(total, days),
      categories: summarizeCategories(periodExpenses),
      byCategory: totalByCategory(periodExpenses),
    };
  }, [periodExpenses, effectiveRange]);

  const visibleSummary = useMemo(() => {
    const total = sumExpenses(visibleExpenses);
    return {
      total,
      categories: summarizeCategories(visibleExpenses),
      byCategory: totalByCategory(visibleExpenses),
    };
  }, [visibleExpenses]);

  const previousTotal = useMemo(
    () => (previousRange ? sumExpenses(previousExpenses) : 0),
    [previousExpenses, previousRange],
  );

  const variation = useMemo(
    () =>
      range && daysInclusive(previousRange?.start ?? "", previousRange?.end ?? "") > 0
        ? computeVariation(visibleSummary.total, previousRange ? previousTotal : null)
        : null,
    [range, previousRange, visibleSummary.total, previousTotal],
  );

  const visibleDays = useMemo(() => {
    if (!effectiveRange) return 0;
    return daysInclusive(effectiveRange.start, effectiveRange.end);
  }, [effectiveRange]);

  const evolutionPoints = useMemo(
    () => buildEvolutionSeries(visibleExpenses, range, today),
    [visibleExpenses, range, today],
  );

  const previousVisibleExpenses = useMemo(
    () => filterByCategory(previousExpenses, selectedCategory),
    [previousExpenses, selectedCategory],
  );

  const previousEvolution = useMemo(
    () => alignPreviousValues(evolutionPoints, previousVisibleExpenses, previousRange, today),
    [evolutionPoints, previousVisibleExpenses, previousRange, today],
  );

  const changes = useMemo(
    () =>
      computeCategoryChanges(
        visibleSummary.byCategory,
        totalByCategory(previousVisibleExpenses),
      ),
    [visibleSummary.byCategory, previousVisibleExpenses],
  );

  const monthsInRange = useMemo(() => countMonthsInRange(range, today), [range, today]);

  const budget = useMemo(
    () => buildBudgetView(categories, visibleSummary.byCategory, monthsInRange),
    [categories, visibleSummary.byCategory, monthsInRange],
  );

  const budgetRows = useMemo(
    () =>
      budget
        ? budget.rows.filter(
            (row) => !selectedCategory || row.category === selectedCategory,
          )
        : [],
    [budget, selectedCategory],
  );

  const budgetSummary = useMemo(() => {
    const totalBudget = roundCents(budgetRows.reduce((sum, row) => sum + row.budget, 0));
    const totalSpent = roundCents(budgetRows.reduce((sum, row) => sum + row.spent, 0));
    return {
      totalBudget,
      totalSpent,
      available: roundCents(totalBudget - totalSpent),
      usage: calculateCategoryBudgetUsage(totalSpent, totalBudget),
    };
  }, [budgetRows]);

  const insights = useMemo(
    () =>
      buildInsights({
        totalExpenses: visibleSummary.total,
        categories: visibleSummary.categories,
        variation,
        changes,
        budget,
        formatMoney: money,
        formatPercent: percent,
      }),
    [visibleSummary, variation, changes, budget],
  );

  const donutData = useMemo(
    () =>
      periodSummary.categories.map((entry) => ({
        category: entry.category,
        value: entry.total,
        percentage: entry.percentage,
      })),
    [periodSummary.categories],
  );

  const chartData = useMemo(
    () =>
      evolutionPoints.map((point, index) => ({
        label: point.label,
        total: point.value,
        previous: previousEvolution ? previousEvolution[index] : undefined,
      })),
    [evolutionPoints, previousEvolution],
  );

  const sortedTransactions = useMemo(() => {
    return [...visibleExpenses].sort(
      (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title),
    );
  }, [visibleExpenses]);

  const accountLabel = (transaction: Transaction) => {
    if (transaction.accountId) {
      const account = accounts.find((item) => item.id === transaction.accountId);
      if (account) return account.name;
    }
    if (transaction.creditCardId) {
      const card = creditCards.find((item) => item.id === transaction.creditCardId);
      if (card) return card.name;
    }
    return transaction.paymentMethod ?? "";
  };

  const invalidCustom = period === "custom" && range === null;
  const granularity = evolutionGranularity(range, today);
  const currentFullEnd = resolveAnalyticsRange(period, anchor, customRange)?.end ?? null;
  const nowEnd = resolveAnalyticsRange(period, new Date(), customRange)?.end ?? null;
  const canGoNext = currentFullEnd !== null && nowEnd !== null && currentFullEnd < nowEnd;
  const previousComparisonLabel = period === "month" ? "vs mês anterior" : "vs período anterior";

  const toggleCategory = (category: string) => {
    setSelectedCategory((current) => (current === category ? null : category));
  };

  const shiftAnchor = (direction: -1 | 1) => {
    const months =
      period === "month" ? 1 : period === "3m" ? 3 : period === "6m" ? 6 : 12;
    setAnchor((current) => {
      const year = current.getFullYear();
      const target = current.getMonth() + direction * months;
      const lastDay = new Date(year, target + 1, 0).getDate();
      return new Date(year, target, Math.min(current.getDate(), lastDay));
    });
  };

  const handlePeriodChange = (value: AnalyticsPeriod) => {
    setPeriod(value);
    setAnchor(new Date());
  };

  const topCategory = visibleSummary.categories[0] ?? null;

  const variationValue = (() => {
    if (!variation) return "—";
    const arrow = variation.direction === "up" ? "↑" : variation.direction === "down" ? "↓" : "→";
    if (variation.pct !== null) {
      return `${arrow} ${percent(Math.abs(roundCents(variation.pct)))}`;
    }
    if (variation.delta !== 0) return `${arrow} ${money(Math.abs(variation.delta))}`;
    return `${arrow} 0%`;
  })();

  const rankingMax = donutData[0]?.value ?? 0;
  const centerValue = selectedCategory
    ? donutData.find((entry) => entry.category === selectedCategory)?.value ?? 0
    : periodSummary.total;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl pb-4">
      {/* Header + period */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight text-primary sm:text-2xl sm:font-bold sm:tracking-normal">
              Análises de Despesas
            </h1>
            {range && (
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                {shortDate(range.start)} – {shortDate(range.end)}
              </p>
            )}
          </div>

          {!invalidCustom && period !== "custom" && range && (
            <div className="flex items-center gap-1 self-start sm:self-auto">
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                aria-label="Período anterior"
                onClick={() => shiftAnchor(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[7.5rem] rounded-md border border-input bg-muted/40 px-2 py-1 text-center text-xs font-medium text-foreground">
                {format(parseLocalDate(range.start), "dd/MM/yy")} –{" "}
                {format(parseLocalDate(range.end), "dd/MM/yy")}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                aria-label="Próximo período"
                disabled={!canGoNext}
                onClick={() => shiftAnchor(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="grid w-full grid-cols-2 gap-1 sm:w-auto sm:grid-cols-4">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={period === option.value ? "default" : "outline"}
                className="h-8 px-2 text-xs"
                onClick={() => handlePeriodChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={period === "custom" ? "default" : "outline"}
                className="h-8 gap-1.5 px-3 text-xs"
                onClick={() => {
                  if (period !== "custom") {
                    setPeriod("custom");
                    setAnchor(new Date());
                    if (!customRange?.from) {
                      setCustomRange({
                        from: new Date(today.getFullYear(), today.getMonth(), 1),
                        to: today,
                      });
                    }
                  }
                }}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                Personalizado
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={(value) => {
                  setCustomRange(value);
                  setPeriod("custom");
                  if (value?.from && value?.to) setCalendarOpen(false);
                }}
                numberOfMonths={1}
                locale={ptBR}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {selectedCategory && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Filtro ativo:</span>
            <span className="font-semibold text-primary">{selectedCategory}</span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 gap-1 px-2 text-xs"
              onClick={() => setSelectedCategory(null)}
            >
              <X className="h-3.5 w-3.5" />
              Limpar filtro
            </Button>
          </div>
        )}

        {invalidCustom && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-3 text-sm text-destructive">
            Intervalo personalizado inválido. Selecione a data inicial (e a final, quando
            quiser) para analisar o período.
          </div>
        )}
      </div>

      {!invalidCustom && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard title="Gasto Total" value={money(visibleSummary.total)} icon={Wallet} color="red" />
            <KpiCard
              title="Média por Dia"
              value={money(computeDailyAverage(visibleSummary.total, visibleDays))}
              icon={CalendarDays}
              color="neutral"
            />
            <KpiCard
              title="Maior Categoria"
              value={topCategory ? topCategory.category : "—"}
              icon={Tag}
              color="neutral"
              trend={
                topCategory
                  ? `${money(topCategory.total)} · ${percent(Math.round(topCategory.percentage))}`
                  : undefined
              }
              trendUp
            />
            <KpiCard
              title="Variação"
              value={variationValue}
              icon={Percent}
              color={
                !variation || variation.direction === "flat"
                  ? "neutral"
                  : variation.direction === "up"
                    ? "red"
                    : "green"
              }
              trend={variation ? previousComparisonLabel : "Sem base de comparação"}
              trendUp={variation ? variation.direction === "down" : true}
            />
          </div>

          {periodExpenses.length === 0 ? (
            <div className="dashboard-card flex flex-col items-center justify-center px-6 py-12 text-center">
              <PieChart className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-base font-semibold text-foreground">Sem despesas no período</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Nenhuma despesa registrada entre {shortDate(range!.start)} e{" "}
                {shortDate(range!.end)}
                {selectedCategory ? ` na categoria ${selectedCategory}` : ""}. Ajuste o período
                ou o filtro de categoria.
              </p>
              {selectedCategory && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => setSelectedCategory(null)}
                >
                  Limpar filtro
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Distribution + evolution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                <ChartCard title="Gastos por Categoria">
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={240}>
                      <RechartsPieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="category"
                          innerRadius={58}
                          outerRadius={92}
                          paddingAngle={2}
                          stroke="hsl(224 18% 11%)"
                          strokeWidth={2}
                        >
                          {donutData.map((entry, index) => (
                            <Cell
                              key={entry.category}
                              fill={colorForIndex(index)}
                              fillOpacity={
                                !selectedCategory || selectedCategory === entry.category
                                  ? 1
                                  : 0.25
                              }
                              onClick={() => toggleCategory(entry.category)}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(224 18% 13%)",
                            border: "1px solid hsl(224 14% 22%)",
                            borderRadius: 8,
                            color: "#f1f5f9",
                          }}
                          labelStyle={{ color: "#f8fafc", fontWeight: 600, marginBottom: 4 }}
                          formatter={(value: number, name: string) => [
                            money(Number(value)),
                            name,
                          ]}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="max-w-[8rem] truncate text-xs text-muted-foreground">
                        {selectedCategory ?? "Total do período"}
                      </span>
                      <span className="text-lg font-bold text-foreground">
                        {money(centerValue)}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {donutData.map((entry, index) => (
                      <li key={entry.category}>
                        <button
                          type="button"
                          onClick={() => toggleCategory(entry.category)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50",
                            selectedCategory === entry.category &&
                              "bg-primary/10 ring-1 ring-primary/40",
                          )}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: colorForIndex(index) }}
                          />
                          <span className="flex-1 truncate text-foreground">{entry.category}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {money(entry.value)}
                          </span>
                          <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                            {percent(Math.round(entry.percentage))}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </ChartCard>

                <ChartCard title="Evolução dos Gastos">
                  {visibleExpenses.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Nenhuma transação nessa categoria no período.
                    </p>
                  ) : (
                    <>
                      {previousEvolution && (
                        <div className="mb-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="h-0.5 w-4 rounded bg-primary" />
                            Período atual
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-0.5 w-4 rounded bg-muted-foreground/60" />
                            Período anterior
                          </span>
                        </div>
                      )}
                      <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 14% 20%)" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "hsl(215 20% 66%)" }}
                            interval="preserveStartEnd"
                            minTickGap={16}
                            tickMargin={8}
                          />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(215 20% 66%)" }} width={52} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(224 18% 13%)",
                              border: "1px solid hsl(224 14% 22%)",
                              borderRadius: 8,
                              color: "#f1f5f9",
                            }}
                            labelStyle={{ color: "#f8fafc", fontWeight: 600, marginBottom: 4 }}
                            formatter={(value: number, name: string) => [
                              money(Number(value)),
                              name === "previous" ? "Período anterior" : "Período atual",
                            ]}
                          />
                          {previousEvolution && (
                            <Line
                              type="monotone"
                              dataKey="previous"
                              stroke="hsl(215 15% 55%)"
                              strokeWidth={1.5}
                              strokeDasharray="4 3"
                              dot={false}
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey="total"
                            stroke="hsl(168 70% 45%)"
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 4, fill: "hsl(168 70% 45%)", strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {granularity === "day" ? "Evolução diária" : "Agrupado por mês"}
                        {previousEvolution
                          ? " · comparado ao período anterior equivalente"
                          : " · sem dados do período anterior para comparação"}
                      </p>
                    </>
                  )}
                </ChartCard>
              </div>

              {/* Ranking */}
              <ChartCard title="Ranking de Gastos">
                <ol className="space-y-2.5">
                  {donutData.map((entry, index) => {
                    const active = selectedCategory === entry.category;
                    const dimmed = selectedCategory !== null && !active;
                    return (
                      <li key={entry.category}>
                        <button
                          type="button"
                          onClick={() => toggleCategory(entry.category)}
                          className={cn(
                            "w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent/40",
                            active && "ring-1 ring-primary/50 bg-primary/10",
                          )}
                        >
                          <div className="flex items-baseline gap-2 text-sm">
                            <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
                              {index + 1}.
                            </span>
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate font-medium",
                                dimmed ? "text-muted-foreground" : "text-foreground",
                              )}
                            >
                              {entry.category}
                            </span>
                            <span className="shrink-0 tabular-nums text-foreground">
                              {money(entry.value)}
                            </span>
                            <span className="w-10 shrink-0 text-right tabular-nums text-xs text-muted-foreground">
                              {percent(Math.round(entry.percentage))}
                            </span>
                          </div>
                          <div className="ml-7 mt-1 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${rankingMax > 0 ? (entry.value / rankingMax) * 100 : 0}%`,
                                background: colorForIndex(index),
                                opacity: dimmed ? 0.4 : 1,
                              }}
                            />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </ChartCard>

              {/* Variações + Orçamento */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                <ChartCard title="Onde meu dinheiro aumentou?">
                  {changes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Sem dados do período anterior para comparar variações.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {changes.slice(0, 6).map((change) => (
                        <button
                          key={change.category}
                          type="button"
                          onClick={() => toggleCategory(change.category)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
                            selectedCategory === change.category &&
                              "border-primary/50 bg-primary/10",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {change.category}
                            </p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {money(change.previous)} → {money(change.current)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p
                              className={cn(
                                "text-sm font-bold tabular-nums",
                                change.direction === "up" && "text-expense",
                                change.direction === "down" && "text-income",
                                change.direction === "flat" && "text-muted-foreground",
                              )}
                            >
                              {change.direction === "up" ? "+" : change.direction === "down" ? "−" : ""}
                              {money(Math.abs(change.delta))}
                            </p>
                            <p
                              className={cn(
                                "text-xs tabular-nums",
                                change.direction === "up" && "text-expense",
                                change.direction === "down" && "text-income",
                                change.direction === "flat" && "text-muted-foreground",
                              )}
                            >
                              {change.direction === "flat"
                                ? "sem mudança relevante"
                                : change.pct !== null
                                  ? `${change.direction === "up" ? "+" : "−"}${percent(
                                      Math.abs(roundCents(change.pct)),
                                    )}`
                                  : "novo no período"}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </ChartCard>

                <ChartCard title="Orçamento × Realizado">
                  {!budget ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      <p>Nenhum orçamento configurado para este período.</p>
                      <Button asChild size="sm" variant="outline" className="mt-3">
                        <Link to="/categories">Definir orçamento</Link>
                      </Button>
                    </div>
                  ) : budgetRows.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      <p>
                        Sem orçamento para {selectedCategory} neste período.
                      </p>
                      <Button asChild size="sm" variant="outline" className="mt-3">
                        <Link to="/categories">Definir orçamento</Link>
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          { label: "Orçamento total", value: money(budgetSummary.totalBudget) },
                          { label: "Utilizado", value: money(budgetSummary.totalSpent) },
                          {
                            label: "Disponível",
                            value: money(budgetSummary.available),
                            danger: budgetSummary.available < 0,
                          },
                          {
                            label: "% utilizado",
                            value: percent(Math.round(budgetSummary.usage.percentage)),
                            danger: budgetSummary.usage.percentage >= 100,
                          },
                        ].map((stat) => (
                          <div
                            key={stat.label}
                            className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2"
                          >
                            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                            <p
                              className={cn(
                                "truncate text-sm font-bold tabular-nums",
                                stat.danger ? "text-expense" : "text-foreground",
                              )}
                            >
                              {stat.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      {budget.months > 1 && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Orçamentos multiplicados pelos {budget.months} meses do período.
                        </p>
                      )}

                      <div className="mt-4 space-y-3.5">
                        {budgetRows.map((row) => {
                          const width =
                            row.budget > 0
                              ? Math.min((row.spent / row.budget) * 100, 100)
                              : 0;
                          const over = row.exceeded > 0;
                          return (
                            <div key={row.category}>
                              <div className="flex items-baseline justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleCategory(row.category)}
                                  className={cn(
                                    "min-w-0 truncate text-sm font-medium transition-colors hover:text-primary",
                                    selectedCategory === row.category
                                      ? "text-primary"
                                      : "text-foreground",
                                  )}
                                >
                                  {row.category}
                                </button>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {money(row.spent)} / {money(row.budget)}
                                </span>
                              </div>
                              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    over ? "bg-expense" : "bg-primary",
                                  )}
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                              <div className="mt-1 flex items-center justify-between text-xs">
                                <span
                                  className={cn(
                                    "font-semibold tabular-nums",
                                    over ? "text-expense" : "text-muted-foreground",
                                  )}
                                >
                                  {percent(Math.round(row.percentage))}
                                </span>
                                {over ? (
                                  <span className="text-expense">
                                    Excedido em {money(row.exceeded)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    Disponível {money(row.available)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </ChartCard>
              </div>

              {/* Insights */}
              {insights.length > 0 && (
                <div>
                  <h2 className="relative mb-2 pl-3 text-base font-bold text-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary before:content-[''] sm:mb-3 sm:pl-0 sm:text-sm sm:font-medium sm:text-foreground sm:before:hidden">
                    Destaques do Período
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {insights.map((text, index) => (
                      <InsightCard key={index} text={text} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Transactions */}
          <ChartCard title="Transações do Período">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {sortedTransactions.length} transaç
                {sortedTransactions.length === 1 ? "ão" : "ões"}
                {selectedCategory ? ` em ${selectedCategory}` : ""}
              </span>
              <span className="tabular-nums">
                {money(sumExpenses(sortedTransactions))}
              </span>
            </div>
            {sortedTransactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma transação no período
                {selectedCategory ? ` para ${selectedCategory}` : ""}.
              </p>
            ) : (
              <div className="-mx-5 max-h-[30rem] divide-y divide-border/60 overflow-y-auto border-t border-border/60">
                {sortedTransactions.map((transaction) => (
                  <button
                    key={transaction.id}
                    type="button"
                    onClick={() => setDetailTransaction(transaction)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {transaction.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {shortDate(transaction.date)} · {transaction.category}
                        {accountLabel(transaction) ? ` · ${accountLabel(transaction)}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-expense">
                      − {money(transaction.amount)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ChartCard>
        </>
      )}

      <TransactionDetail
        transaction={detailTransaction}
        open={detailTransaction !== null}
        onClose={() => setDetailTransaction(null)}
      />
    </div>
  );
}
