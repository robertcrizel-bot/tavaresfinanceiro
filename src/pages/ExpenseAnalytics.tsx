import { useMemo, useState } from "react";
import { FinanceExportMenu } from "@/components/FinanceExportMenu";
import type { FinancialReport } from "@/lib/financial-data-export";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useFinance } from "@/contexts/FinanceContext";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { ChartCard } from "@/components/ChartCard";
import { InsightCard } from "@/components/InsightCard";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TransactionDetail } from "@/components/TransactionDetail";
import { calculateCategoryBudgetUsage } from "@/lib/financial-calculations";
import {
  CHART_GRID,
  CHART_MONEY_AXIS_WIDTH,
  CHART_SEMANTIC,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  categoryColor,
  paymentColor,
  colorAccent,
  CHART_ACCENTS,
  chartMoneyTick,
} from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, type Transaction } from "@/lib/types";
import {
  alignPreviousValues,
  applyAnalyticsScope,
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
  hasActiveAnalyticsScope,
  parseLocalDate,
  previousAnalyticsRange,
  resolveAnalyticsRange,
  roundCents,
  sumExpenses,
  summarizeCategories,
  summarizePaymentMethods,
  totalByCategory,
  type AnalyticsPeriod,
  type AnalyticsScopeFilters,
} from "@/lib/expense-analytics";
import {
  CalendarDays,
  CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Percent,
  PieChart,
  Search,
  SlidersHorizontal,
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
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

  const scopeFilters = useMemo<AnalyticsScopeFilters>(
    () => ({ search: searchText, originId: selectedOrigin, paymentMethod: selectedPayment }),
    [searchText, selectedOrigin, selectedPayment],
  );

  const periodExpenses = useMemo(
    () => filterExpensesInRange(transactions, effectiveRange),
    [transactions, effectiveRange],
  );

  // Establishment / origin / payment narrow the period; the same scope is
  // applied to the previous period so comparisons never compare apples to oranges.
  const scopedExpenses = useMemo(
    () => applyAnalyticsScope(periodExpenses, scopeFilters),
    [periodExpenses, scopeFilters],
  );

  const visibleExpenses = useMemo(
    () => filterByCategory(scopedExpenses, selectedCategory),
    [scopedExpenses, selectedCategory],
  );

  const previousRange = useMemo(
    () => (range ? previousAnalyticsRange(range, period, today) : null),
    [range, period, today],
  );

  const previousExpenses = useMemo(
    () => filterExpensesInRange(transactions, previousRange),
    [transactions, previousRange],
  );

  const previousScopedExpenses = useMemo(
    () => applyAnalyticsScope(previousExpenses, scopeFilters),
    [previousExpenses, scopeFilters],
  );

  const previousVisibleExpenses = useMemo(
    () => filterByCategory(previousScopedExpenses, selectedCategory),
    [previousScopedExpenses, selectedCategory],
  );

  const visibleSummary = useMemo(() => {
    const total = sumExpenses(visibleExpenses);
    return {
      total,
      categories: summarizeCategories(visibleExpenses),
      byCategory: totalByCategory(visibleExpenses),
    };
  }, [visibleExpenses]);

  const paymentBreakdown = useMemo(() => summarizePaymentMethods(visibleExpenses), [visibleExpenses]);

  const previousTotal = useMemo(
    () => sumExpenses(previousVisibleExpenses),
    [previousVisibleExpenses],
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
      visibleSummary.categories.map((entry) => ({
        category: entry.category,
        value: entry.total,
        percentage: entry.percentage,
      })),
    [visibleSummary.categories],
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

  const originLabel = useMemo(() => {
    if (!selectedOrigin) return null;
    if (selectedOrigin.startsWith("a:")) {
      return accounts.find((item) => item.id === selectedOrigin.slice(2))?.name ?? null;
    }
    return creditCards.find((item) => item.id === selectedOrigin.slice(2))?.name ?? null;
  }, [selectedOrigin, accounts, creditCards]);

  const subsetFiltersActive = hasActiveAnalyticsScope(scopeFilters);
  const hasAnyActiveFilter =
    subsetFiltersActive || selectedCategory !== null;

  const clearAllFilters = () => {
    setSelectedCategory(null);
    setSearchText("");
    setSelectedOrigin(null);
    setSelectedPayment(null);
  };

  const variationValue = (() => {
    if (!variation) return "—";
    const arrow = variation.direction === "up" ? "↑" : variation.direction === "down" ? "↓" : "→";
    if (variation.pct !== null) {
      return `${arrow} ${percent(Math.abs(roundCents(variation.pct)))}`;
    }
    if (variation.delta !== 0) return `${arrow} ${money(Math.abs(variation.delta))}`;
    return `${arrow} 0%`;
  })();


  // Exact filtered data used by on-screen charts: no extra transactions.
  const exportReport: FinancialReport = {
    worksheetName: "Analise",
    fileName: "FinanceControl_Analise_" + (effectiveRange?.start ?? "sem-periodo") + "_" + (effectiveRange?.end ?? "sem-periodo") + ".xlsx",
    title: "Análise de Despesas",
    subtitle: effectiveRange
      ? "Despesas de " + shortDate(effectiveRange.start) + " a " + shortDate(effectiveRange.end) + " · " + visibleExpenses.length + " registros"
      : "Sem período selecionado",
    filterDescription: [
      selectedCategory && "Categoria: " + selectedCategory,
      originLabel && "Conta/cartão: " + originLabel,
      selectedPayment && "Pagamento: " + selectedPayment,
      searchText.trim() && "Busca: " + searchText.trim(),
    ].filter((x): x is string => Boolean(x)).join(" · ") || "Sem filtros adicionais",
    metrics: [
      { label: "Gastos do período", value: money(visibleSummary.total) },
      { label: "Período anterior", value: money(previousTotal) },
      { label: "Variação", value: variationValue },
      { label: "Média diária", value: money(visibleDays > 0 ? visibleSummary.total / visibleDays : 0) },
    ],
    categories: visibleSummary.categories.map(c => ({ category: c.category, total: c.total, share: c.percentage })),
    columns: ["Data", "Estabelecimento", "Categoria", "Pagamento", "Conta/cartão", "Valor", "Descrição"],
    columnWidths: [16, 38, 24, 22, 30, 19, 59],
    amountColumn: "Valor",
    descriptionColumn: "Descrição",
    rows: sortedTransactions.map(t => ({
      Data: shortDate(t.date),
      Estabelecimento: t.title,
      Categoria: t.category,
      Pagamento: t.paymentMethod ?? "—",
      "Conta/cartão": accountLabel(t),
      Valor: t.amount,
      Descrição: t.description ?? "",
    })),
    graphs: [
      {
        kind: "category",
        title: "Gastos por Categoria",
        points: visibleSummary.categories.map(c => ({
          name: c.category, value: c.total, color: categoryColor(c.category),
        })),
      },
      {
        kind: "evolution",
        title: "Evolução das Despesas",
        points: evolutionPoints.map(point => ({ name: point.label, value: point.value })),
      },
    ],
  };

  const rankingMax = donutData[0]?.value ?? 0;
  const centerValue = selectedCategory
    ? donutData.find((entry) => entry.category === selectedCategory)?.value ?? 0
    : visibleSummary.total;

  // Shared panel: positioned next to highlights when results exist, or below empty states.
  const transactionsPanel = (
          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
          <ChartCard title="Transações do Período" color={CHART_ACCENTS.categories}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {sortedTransactions.length} transaç
                {sortedTransactions.length === 1 ? "ão" : "ões"}
                {selectedCategory ? ` em ${selectedCategory}` : ""}
                {searchText.trim() ? ` · “${searchText.trim()}”` : ""}
                {originLabel ? ` · ${originLabel}` : ""}
                {selectedPayment ? ` · ${selectedPayment}` : ""}
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
              <div className="-mx-5 max-h-96 divide-y divide-border/60 overflow-y-auto border-t border-border/60">
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
          </div>
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 pb-4">
      {/* Header + period */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Inteligência de gastos</p>
            <h1 className="sr-only">Análises de Despesas</h1>
            <h2 className="mt-1 text-2xl font-bold tracking-[-0.035em] text-foreground sm:text-3xl">Para onde seu dinheiro está indo?</h2>
            {range && (
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Análises de Despesas · {shortDate(range.start)} – {shortDate(range.end)}
              </p>
            )}
          </div>

          <FinanceExportMenu report={exportReport} />
          {!invalidCustom && period !== "custom" && range && (
            <div className="flex items-center gap-1 self-start rounded-2xl border border-border bg-card p-1 shadow-sm lg:self-auto">
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 rounded-xl border-0 p-0 shadow-none"
                aria-label="Período anterior"
                onClick={() => shiftAnchor(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[8.5rem] px-2 py-1 text-center text-xs font-bold text-foreground">
                {format(parseLocalDate(range.start), "dd/MM/yy")} –{" "}
                {format(parseLocalDate(range.end), "dd/MM/yy")}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 rounded-xl border-0 p-0 shadow-none"
                aria-label="Próximo período"
                disabled={!canGoNext}
                onClick={() => shiftAnchor(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {hasAnyActiveFilter && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Filtros ativos:</span>
            {selectedCategory && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                {selectedCategory}
                <button
                  type="button"
                  aria-label={`Remover filtro de categoria ${selectedCategory}`}
                  onClick={() => setSelectedCategory(null)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {searchText.trim() && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                “{searchText.trim()}”
                <button
                  type="button"
                  aria-label="Remover filtro de estabelecimento"
                  onClick={() => setSearchText("")}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {originLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                {originLabel}
                <button
                  type="button"
                  aria-label="Remover filtro de conta ou cartão"
                  onClick={() => setSelectedOrigin(null)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {selectedPayment && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                {selectedPayment}
                <button
                  type="button"
                  aria-label="Remover filtro de pagamento"
                  onClick={() => setSelectedPayment(null)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 gap-1 px-2 text-xs"
              onClick={clearAllFilters}
            >
              Limpar todos
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

      <button type="button" aria-expanded={filtersOpen} aria-controls="expense-filters" onClick={() => setFiltersOpen(open => !open)} className="workspace-panel flex w-full items-center justify-between p-3 text-left xl:hidden">
        <span className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="h-4 w-4" />Filtros e período</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
      </button>
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside id="expense-filters" aria-label="Filtros de despesas" className={`${filtersOpen ? "block" : "hidden"} workspace-panel min-w-0 space-y-4 p-4 xl:block`}>
          <h3 className="text-base font-bold text-foreground">Filtros</h3>
          <div className="space-y-2">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              {PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={period === option.value ? "default" : "outline"}
                  className="h-9 min-w-0 w-full rounded-xl px-2 text-xs shadow-none"
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
                  className="h-9 w-full gap-1.5 rounded-xl px-4 text-xs shadow-none"
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


        </div>
          {/* Filtros laterais: categoria, estabelecimento, conta/cartão e pagamento */}
          <div className="grid min-w-0 grid-cols-1 gap-3 [&>*]:min-w-0">
            <div className="space-y-1">
            <label htmlFor="expense-category" className="block text-xs font-medium text-muted-foreground">Categoria</label>
            <Select
              value={selectedCategory ?? "all"}
              onValueChange={(value) => setSelectedCategory(value === "all" ? null : value)}
            >
              <SelectTrigger id="expense-category" className="h-auto min-h-9 w-full gap-2 rounded-xl py-2 text-xs [&>span]:min-w-0 [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-left [&>svg]:shrink-0" aria-label="Filtrar por categoria">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] [&_[role=option]]:whitespace-normal [&_[role=option]]:break-words">
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.name} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="expense-establishment" className="block text-xs font-medium text-muted-foreground">Estabelecimento ou descrição</label>
              <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="expense-establishment"
                value={searchText}
                title={searchText || undefined}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Nome ou descrição..."
                aria-label="Pesquisar por estabelecimento ou descrição"
                className="h-9 w-full rounded-xl pl-9 text-xs"
              />
              </div>
            </div>

            <div className="space-y-1">
            <label htmlFor="expense-origin" className="block text-xs font-medium text-muted-foreground">Conta ou cartão</label>
            <Select
              value={selectedOrigin ?? "all"}
              onValueChange={(value) => setSelectedOrigin(value === "all" ? null : value)}
            >
              <SelectTrigger id="expense-origin" className="h-auto min-h-9 w-full gap-2 rounded-xl py-2 text-xs [&>span]:min-w-0 [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-left [&>svg]:shrink-0" aria-label="Filtrar por conta ou cartão">
                <SelectValue placeholder="Conta ou cartão" />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] [&_[role=option]]:whitespace-normal [&_[role=option]]:break-words">
                <SelectItem value="all">Todas as contas</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={`a:${account.id}`}>
                    {account.name}
                  </SelectItem>
                ))}
                {creditCards.map((card) => (
                  <SelectItem key={card.id} value={`c:${card.id}`}>
                    {card.name} (Cartão)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>

            <div className="space-y-1">
            <label htmlFor="expense-payment" className="block text-xs font-medium text-muted-foreground">Forma de pagamento</label>
            <Select
              value={selectedPayment ?? "all"}
              onValueChange={(value) => setSelectedPayment(value === "all" ? null : value)}
            >
              <SelectTrigger id="expense-payment" className="h-auto min-h-9 w-full gap-2 rounded-xl py-2 text-xs [&>span]:min-w-0 [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-left [&>svg]:shrink-0" aria-label="Filtrar por forma de pagamento">
                <SelectValue placeholder="Pagamento" />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] [&_[role=option]]:whitespace-normal [&_[role=option]]:break-words">
                <SelectItem value="all">Todas as formas</SelectItem>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>

            {hasAnyActiveFilter && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 gap-1 rounded-xl px-3 text-xs text-muted-foreground"
                onClick={clearAllFilters}
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            )}
          </div>
          <section aria-label="Gastos por forma de pagamento" className="mt-4 space-y-3 border-t border-border/70 pt-4">
            <div>
              <h3 className="text-sm font-semibold leading-snug text-foreground">Gastos por pagamento</h3>
              <p className="mt-1 text-xs text-muted-foreground">Valores do filtro atual</p>
            </div>
            {paymentBreakdown.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem despesas neste recorte.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {paymentBreakdown.map((entry) => (
                    <div key={entry.method} className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2 text-xs">
                        <span className="data-chip min-w-0 break-words rounded-md border px-2 py-0.5 font-medium" style={colorAccent(paymentColor(entry.method))}>{entry.method}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">{money(entry.total)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(0, Math.min(entry.percentage, 100))}%`, backgroundColor: paymentColor(entry.method) }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{entry.count} lançamento{entry.count === 1 ? "" : "s"}</span>
                        <span className="tabular-nums">{percent(entry.percentage)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs">
                  <span className="font-medium text-muted-foreground">Total</span>
                  <span className="font-bold tabular-nums text-foreground">{money(visibleSummary.total)}</span>
                </div>
              </>
            )}
          </section>
          {/* Ranking */}
          {!invalidCustom && visibleExpenses.length > 0 && (
              <div className="min-w-0 border-t border-border/70 pt-4 [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none [&_h3]:text-sm [&_h3]:font-semibold">
              <ChartCard title="Ranking de Gastos" color={CHART_ACCENTS.categories}>
                <ol className="space-y-2">
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
                            active && "data-surface ring-1 ring-border",
                          )}
                          style={colorAccent(categoryColor(entry.category))}
                        >
                          <div className="flex items-baseline gap-1.5 text-xs">
                            <span className="w-4 shrink-0 tabular-nums text-muted-foreground">
                              {index + 1}.
                            </span>
                            <span
                              className={cn(
                                "min-w-0 flex-1 break-words font-medium",
                                dimmed ? "text-muted-foreground" : "text-foreground",
                              )}
                            >
                              {entry.category}
                            </span>
                          </div>
                          <div className="ml-5 mt-0.5 flex items-baseline justify-between gap-2 text-xs">
                            <span className="shrink-0 tabular-nums text-foreground">
                              {money(entry.value)}
                            </span>
                            <span className="w-10 shrink-0 text-right tabular-nums text-xs text-muted-foreground">
                              {percent(Math.round(entry.percentage))}
                            </span>
                          </div>
                          <div className="ml-5 mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${rankingMax > 0 ? (entry.value / rankingMax) * 100 : 0}%`,
                                background: categoryColor(entry.category),
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
              </div>

          )}
        </aside>
        <div className="min-w-0 space-y-4">
      {!invalidCustom && (
        <>
          {/* KPIs */}
          <section aria-label="Indicadores do período" className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-5">
            <article className="dashboard-card expense-hero relative col-span-2 flex flex-col justify-center gap-2 overflow-hidden rounded-xl p-3.5">
              <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full border-[28px] border-expense/30" />
              <div className="relative flex items-center justify-between gap-3">
                <span className="expense-hero-muted text-[13px] font-bold uppercase tracking-[0.18em]">
                  Gasto Total
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <Wallet className="h-4 w-4" />
                </span>
              </div>
              <p className="relative break-words font-display font-bold leading-none tracking-[-0.04em] tabular-nums text-[clamp(2rem,2.6vw,2.625rem)]">
                {money(visibleSummary.total)}
              </p>
              <p className="expense-hero-muted relative text-[13px] leading-snug">
                {visibleExpenses.length} lançamento{visibleExpenses.length === 1 ? "" : "s"} no recorte
                atual
              </p>
            </article>

            <article className="dashboard-card data-surface [container-type:inline-size] flex min-h-[104px] flex-col justify-center gap-2 p-3.5 lg:min-h-[112px]" style={colorAccent(CHART_ACCENTS.time)}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-muted-foreground">Média por Dia</span>
                <CalendarDays className="h-4 w-4 shrink-0 text-info" />
              </div>
              <p className="whitespace-nowrap font-display font-bold leading-none tracking-tight tabular-nums text-[clamp(0.875rem,10cqi,1.75rem)]">
                {money(computeDailyAverage(visibleSummary.total, visibleDays))}
              </p>
              <p className="text-[12px] leading-tight text-muted-foreground">
                Média de {visibleDays} dia{visibleDays === 1 ? "" : "s"} no período
              </p>
            </article>

            <article className="dashboard-card data-surface [container-type:inline-size] flex min-h-[104px] flex-col justify-center gap-2 p-3.5 lg:min-h-[112px]" style={colorAccent(categoryColor(topCategory?.category ?? "Outros"))}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-muted-foreground">Maior Categoria</span>
                <Tag className="h-4 w-4 shrink-0 text-warning" />
              </div>
              <p className="break-normal font-display font-bold leading-none tracking-tight tabular-nums text-[clamp(1rem,10cqi,1.75rem)]">
                {topCategory ? topCategory.category : "—"}
              </p>
              <p className="truncate text-[12px] leading-tight tabular-nums text-muted-foreground">
                {topCategory
                  ? `${money(topCategory.total)} · ${percent(Math.round(topCategory.percentage))}`
                  : "Sem categorias no período"}
              </p>
            </article>

            <article className="dashboard-card [container-type:inline-size] col-span-2 flex min-h-[104px] flex-col justify-center gap-2 p-4 lg:col-span-1 lg:min-h-[112px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-muted-foreground">Variação</span>
                <Percent className="h-4 w-4 shrink-0 text-primary" />
              </div>
              <p
                className={cn(
                  "whitespace-nowrap font-display font-bold leading-none tracking-tight tabular-nums text-[clamp(0.875rem,10cqi,1.75rem)]",
                  variation?.direction === "up"
                    ? "text-expense"
                    : variation?.direction === "down"
                      ? "text-income"
                      : "text-foreground",
                )}
              >
                {variationValue}
              </p>
              <p className="text-[12px] leading-tight text-muted-foreground">
                {variation ? previousComparisonLabel : "Sem comparação"}
              </p>
            </article>
          </section>

          {periodExpenses.length === 0 ? (
            <div className="dashboard-card flex min-w-0 flex-col items-center justify-center px-6 py-12 text-center">
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
          ) : visibleExpenses.length === 0 ? (
            <div className="dashboard-card flex min-w-0 flex-col items-center justify-center px-6 py-12 text-center">
              <PieChart className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-base font-semibold text-foreground">Nenhum resultado para os filtros</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Há despesas no período, mas nenhuma corresponde aos filtros de categoria,
                estabelecimento, conta/cartão e forma de pagamento aplicados.
              </p>
              <Button size="sm" variant="outline" className="mt-4" onClick={clearAllFilters}>
                Limpar filtros
              </Button>
            </div>
          ) : (
            <>
              {/* Distribution + evolution */}
              <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Gastos por Categoria" color={CHART_ACCENTS.categories}>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={220}>
                      <RechartsPieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="category"
                          innerRadius={58}
                          outerRadius={92}
                          paddingAngle={2}
                          stroke="hsl(var(--card))"
                          strokeWidth={2}
                        >
                          {donutData.map((entry, index) => (
                            <Cell
                              key={entry.category}
                              fill={categoryColor(entry.category)}
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
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600, marginBottom: 4 }}
                          formatter={(value: number, name: string) => [
                            money(Number(value)),
                            name,
                          ]}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="max-w-[9rem] break-words text-[13px] text-muted-foreground">
                        {selectedCategory ?? "Total do período"}
                      </span>
                      <span className="text-2xl font-bold tabular-nums text-foreground">
                        {money(centerValue)}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-3 grid grid-cols-1 gap-1">
                    {donutData.map((entry, index) => (
                      <li key={entry.category}>
                        <button
                          type="button"
                          onClick={() => toggleCategory(entry.category)}
                          className={cn(
                            "grid w-full grid-cols-[0.625rem_minmax(9ch,1fr)_auto_2.5rem] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent/50",
                            selectedCategory === entry.category &&
                              "bg-primary/10 ring-1 ring-primary/40",
                          )}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: categoryColor(entry.category) }}
                          />
                          <span className="min-w-0 break-normal text-foreground" title={entry.category}>{entry.category}</span>
                          <span className="whitespace-nowrap tabular-nums text-muted-foreground">
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

                <ChartCard title="Evolução dos Gastos" color={CHART_ACCENTS.time} className="flex h-full flex-col">
                  {visibleExpenses.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Nenhuma transação nessa categoria no período.
                    </p>
                  ) : (
                    <>
                      {previousEvolution && (
                        <div className="mb-2 flex items-center gap-4 text-[12px] text-muted-foreground">
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
                      <div className="min-h-[220px] flex-1">
                      <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={CHART_TICK}
                            interval="preserveStartEnd"
                            minTickGap={16}
                            tickMargin={8}
                          />
                          <YAxis
                            tick={CHART_TICK}
                            width={CHART_MONEY_AXIS_WIDTH}
                            tickFormatter={chartMoneyTick}
                          />
                          <Tooltip
                            contentStyle={CHART_TOOLTIP_STYLE}
                            labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600, marginBottom: 4 }}
                            formatter={(value: number, name: string) => [
                              money(Number(value)),
                              name === "previous" ? "Período anterior" : "Período atual",
                            ]}
                          />
                          {previousEvolution && (
                            <Line
                              type="monotone"
                              dataKey="previous"
                              stroke={CHART_SEMANTIC.previous}
                              strokeWidth={1.5}
                              strokeDasharray="4 3"
                              dot={false}
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey="total"
                            stroke={CHART_SEMANTIC.trend}
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: CHART_SEMANTIC.trend, strokeWidth: 0 }}
                            activeDot={{ r: 4, fill: CHART_SEMANTIC.trend, strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                      </div>
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

              {/* Variações + Orçamento */}
              <section aria-label="Resumo detalhado do período" className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <ChartCard title="Onde meu dinheiro aumentou?" color={CHART_SEMANTIC.expense}>
                  {changes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Sem dados do período anterior para comparar variações.
                    </p>
                  ) : (
                    <div className="max-h-56 space-y-2 overflow-y-auto overscroll-contain pr-1">
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

                <div className="min-w-0 lg:col-start-2 lg:row-start-1">
                <ChartCard title="Orçamento × Realizado" color={CHART_ACCENTS.budget}>
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
                      <div className="grid grid-cols-2 gap-2">
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
                      <p className="mt-2 text-[12px] text-muted-foreground">
                          Orçamentos multiplicados pelos {budget.months} meses do período.
                        </p>
                      )}

                      {subsetFiltersActive && (
                        <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[12px] text-foreground">
                          Os valores de orçamento representam o total mensal de cada categoria;
                          o realizado exibido abaixo considera <strong>apenas os filtros
                          ativos</strong> (estabelecimento, conta/cartão e pagamento), portanto
                          é um subconjunto do gasto total da categoria.
                        </p>
                      )}

                      <div className="mt-3 max-h-48 space-y-3 overflow-y-auto overscroll-contain pr-1">
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
                                    "min-w-0 break-words text-sm font-medium transition-colors hover:text-primary",
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
                                  style={{ width: `${width}%`, backgroundColor: over ? CHART_SEMANTIC.expense : categoryColor(row.category) }}
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
                <div className="dashboard-card min-w-0 p-4 lg:col-start-1 lg:row-start-2">
                  <h2 className="relative mb-2 pl-3 text-base font-bold text-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary before:content-[''] sm:mb-3 sm:pl-0 sm:text-sm sm:font-medium sm:text-foreground sm:before:hidden">
                    Destaques do Período
                  </h2>
                  <div className="grid min-w-0 grid-cols-1 gap-2 [&>*]:min-w-0 [&>*]:break-words [&>div]:border-l-0 [&>div]:px-0">
                    {insights.map((text, index) => (
                      <InsightCard key={index} text={text} />
                    ))}
                  </div>
                </div>
              )}
                {transactionsPanel}
              </section>
            </>
          )}

          {(periodExpenses.length === 0 || visibleExpenses.length === 0) && transactionsPanel}
        </>
      )}

        </div>
      </div>

      <TransactionDetail
        transaction={detailTransaction}
        open={detailTransaction !== null}
        onClose={() => setDetailTransaction(null)}
      />
    </div>
  );
}
