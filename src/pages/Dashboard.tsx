import { useMemo, useState } from "react";
import { useFinance } from "@/contexts/FinanceContext";
import { useAccounts } from "@/contexts/AccountContext";
import { useTransfers } from "@/contexts/TransferContext";
import { Transaction } from "@/lib/types";
import { ChartCard } from "@/components/ChartCard";
import { InsightCard } from "@/components/InsightCard";
import { ScrollCarousel } from "@/components/ScrollCarousel";
import { TransactionForm } from "@/components/TransactionForm";
import { DashboardPeriodFilter, type Period } from "@/components/DashboardPeriodFilter";
import { Button } from "@/components/ui/button";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  ChevronRight,
  ReceiptText,
  Landmark,
  Plus,
  ScanLine,
  Tag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { isFinancialNeutralTransaction } from "@/lib/transaction-classification";
import {
  CHART_GRID,
  CHART_SEMANTIC,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  categoryColor,
  chartMoneyTick,
} from "@/lib/chart-theme";
import { calculateAccountBalances, calculateFinancialTotals } from "@/lib/financial-calculations";
import { getCardCommittedAmount } from "@/lib/credit-card-billing";
import { cn } from "@/lib/utils";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DateRange } from "react-day-picker";

const KPI_LABEL = "text-[13px] font-semibold text-muted-foreground";
const KPI_VALUE_BASE =
  "break-words font-display font-bold leading-none tracking-tight tabular-nums";
const KPI_VALUE = `${KPI_VALUE_BASE} text-[clamp(1.5rem,1.9vw,2rem)]`;
const KPI_NOTE = "text-[12px] leading-tight text-muted-foreground";
const KPI_CARD =
  "dashboard-card premium-kpi flex min-h-[116px] flex-col justify-center gap-2 p-4 lg:min-h-[132px] lg:p-5";


/** Mini charts use real transactions in the selected period; no sample values. */
function MiniBars({ values, tone = "mint" }: { values: number[]; tone?: "mint" | "coral" | "blue" }) {
  // Income mini-bars are always ornamental, never data-driven; a sparse
  // month should look as polished as a busy month. The actual total stays real.
  // Other mini-bars (expenses and daily average) still plot real-day amounts.
  const decorative = tone === "mint";
  const decorativeHeights = [32, 57, 43, 78, 50, 65, 39, 86];
  if (!decorative && values.length < 2) return null;
  const max = Math.max(1, ...values);
  const heights = decorative
    ? decorativeHeights
    : values.map((value) => Math.max(8, Math.round(value / max * 100)));
  return (
    <div aria-hidden="true" className={"premium-mini-bars premium-mini-bars--" + tone + (decorative ? " premium-mini-bars--decorative" : "")}>
      {heights.map((height, index) => (
        <span key={index} style={{ height: height + "%" }} />
      ))}
    </div>
  );
}


function BalanceTrend({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(1, Math.max(...values) - min);
  const points = values.map((value, i) => [
    Math.round(i / (values.length - 1) * 260),
    Math.round(87 - (value - min) / span * 67),
  ] as const);
  const polyline = points.map(([x, y]) => String(x) + "," + String(y)).join(" ");
  const polygon = "0,100 " + polyline + " 260,100";
  return (
    <svg aria-hidden="true" className="premium-balance-trend" viewBox="0 0 260 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="finance-balance-trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(169 66% 47%)" stopOpacity=".24" />
          <stop offset="100%" stopColor="hsl(169 66% 47%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={polygon} fill="url(#finance-balance-trend-fill)" />
      <polyline points={polyline} fill="none" stroke="hsl(169 66% 47%)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Dashboard() {
  const { transactions, creditCardInvoices, addTransaction } = useFinance();
  const { accounts, creditCards } = useAccounts();
  const { transfers } = useTransfers();
  const [formOpen, setFormOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const filtered = useMemo(() => {
    if (period === "all") return transactions;
    if (period === "month") {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const toLocalDateStr = (date: Date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const firstDay = toLocalDateStr(monthStart);
      const lastDay = toLocalDateStr(monthEnd);
      return transactions.filter((t) => t.date >= firstDay && t.date <= lastDay);
    }
    if (period === "custom") {
      if (!dateRange?.from) return transactions;
      const fromStr = dateRange.from.toISOString().split("T")[0];
      const toStr = dateRange.to ? dateRange.to.toISOString().split("T")[0] : fromStr;
      return transactions.filter((t) => t.date >= fromStr && t.date <= toStr);
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(period));
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    return transactions.filter((t) => t.date >= cutoffStr && t.date <= today);
  }, [transactions, period, dateRange]);

  // Bill payments and manual adjustments do not change income/expense metrics.
  const isNeutral = (t: Transaction) => isFinancialNeutralTransaction(t);
  const { income: totalIncome, expense: totalExpense } = calculateFinancialTotals(filtered);
  const balance = totalIncome - totalExpense;

  const days = useMemo(() => {
    if (period === "month") {
      // The current-month card counts days already elapsed, not future days.
      // Use the same divisor for the daily average so both indicators agree.
      return new Date().getDate();
    }
    if (period === "all") return 30;
    if (period === "custom" && dateRange?.from) {
      const to = dateRange.to || dateRange.from;
      return Math.max(1, Math.round((to.getTime() - dateRange.from.getTime()) / 86400000) + 1);
    }
    return Number(period);
  }, [period, dateRange]);
  const avgDaily = totalExpense / days;

  const incomeCount = useMemo(
    () => filtered.filter((t) => t.type === "income" && !isNeutral(t)).length,
    [filtered],
  );
  const expenseCount = useMemo(
    () => filtered.filter((t) => t.type === "expense" && !isNeutral(t)).length,
    [filtered],
  );

  // Largest genuine individual entries/exits in the selected window.
  // Ignore neutral transactions (card-settlement/accounting operations).
  // On equal amounts, use the most recent transaction, then a stable ID.
  const largestMovement = (kind: "income" | "expense"): Transaction | null => {
    const candidates = filtered.filter(t => t.type === kind && !isNeutral(t) && t.amount > 0);
    return candidates.sort((a, b) =>
      b.amount - a.amount || b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
    )[0] ?? null;
  };
  const largestIncome = largestMovement("income");
  const largestExpense = largestMovement("expense");
  const movementName = (transaction: Transaction | null, kind: "income" | "expense") =>
    transaction?.title?.trim() || transaction?.description?.trim().split("\n")[0] ||
    (kind === "income" ? "Nenhuma entrada no período" : "Nenhuma saída no período");

  const topCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter((t) => t.type === "expense" && !isNeutral(t)).forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    let top = { cat: "—", val: 0 };
    Object.entries(map).forEach(([cat, val]) => {
      if (val > top.val) top = { cat, val };
    });
    return top;
  }, [filtered]);

  const topCategoryShare = totalExpense > 0 ? Math.round((topCategory.val / totalExpense) * 100) : 0;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const accountBalances = calculateAccountBalances(accounts, transactions, transfers);

  const getCardUsed = (ccId: string) => getCardCommittedAmount(transactions, ccId, creditCardInvoices);

  // Line chart data
  const lineData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter((t) => t.type === "expense" && !isNeutral(t)).forEach((t) => {
      map[t.date] = (map[t.date] || 0) + t.amount;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({
        date: new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        total,
      }));
  }, [filtered]);

  // Bar chart data
  const barData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter((t) => t.type === "expense" && !isNeutral(t)).forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([category, total]) => ({ category, total, fill: categoryColor(category) }));
  }, [filtered]);

  // Insights
  const insights = useMemo(() => {
    const list: string[] = [];
    if (topCategory.cat !== "—") {
      list.push(`${topCategory.cat} representa ${topCategoryShare}% dos seus gastos no período.`);
    }
    list.push(`Seu gasto médio diário é de ${fmt(avgDaily)}.`);
    if (totalIncome > totalExpense) {
      list.push(`Você está economizando ${fmt(totalIncome - totalExpense)} no período. Continue assim!`);
    } else if (totalExpense > totalIncome) {
      list.push(`Atenção: suas saídas excedem as entradas em ${fmt(totalExpense - totalIncome)}.`);
    }
    return list;
  }, [topCategory, topCategoryShare, totalExpense, totalIncome, avgDaily]);


  // Visual-only trends: daily totals from actual non-neutral transactions.
  const dailyBreakdown = useMemo(() => {
    const daysByDate = new Map<string, { income: number; expense: number }>();
    filtered.forEach((transaction) => {
      if (isFinancialNeutralTransaction(transaction)) return;
      if (transaction.type !== "income" && transaction.type !== "expense") return;
      const day = daysByDate.get(transaction.date) ?? { income: 0, expense: 0 };
      day[transaction.type] += transaction.amount;
      daysByDate.set(transaction.date, day);
    });
    return [...daysByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, totals]) => ({ date, ...totals }));
  }, [filtered]);

  const dailyIncomeBars = dailyBreakdown.filter(day => day.income > 0).slice(-8).map(day => day.income);
  const dailyExpenseBars = dailyBreakdown.filter(day => day.expense > 0).slice(-8).map(day => day.expense);
  const runningBalanceTrend = useMemo(() => {
    let running = 0;
    return dailyBreakdown.map(day => {
      running += day.income - day.expense;
      return running;
    }).slice(-15);
  }, [dailyBreakdown]);
  const dailySpendingBars = dailyExpenseBars;

  const holdings = accounts.length + creditCards.length;

  return (
    <div className="premium-dashboard mx-auto max-w-[1440px] space-y-4 sm:space-y-5">
      <header className="premium-dashboard-heading flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Visão financeira</p>
          <h1 className="premium-hero-title mt-1 font-display text-[26px] font-bold leading-tight tracking-[-0.035em] text-foreground sm:text-[32px]">
            Seu dinheiro, com <span className="premium-mint-text">clareza.</span>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Acompanhe o que entrou, o que saiu e onde agir agora.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="premium-action-outline h-11 gap-2 rounded-xl bg-card px-4">
            <Link to="/receipt">
              <ScanLine className="h-4 w-4" />
              <span className="hidden sm:inline">Ler comprovante</span>
              <span className="sm:hidden">Comprovante</span>
            </Link>
          </Button>
          <Button onClick={() => setFormOpen(true)} className="premium-action-primary h-11 gap-2 rounded-xl px-4">
            <Plus className="h-4 w-4" />
            <span>Novo registro</span>
          </Button>
        </div>
      </header>

      <div className="workspace-panel premium-filter-bar flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-2.5 sm:p-3">
        <DashboardPeriodFilter
          period={period}
          dateRange={dateRange}
          onPeriodChange={setPeriod}
          onDateRangeChange={setDateRange}
        />
        <p className="hidden text-[13px] tabular-nums text-muted-foreground md:block">
          {filtered.length} lançamento{filtered.length === 1 ? "" : "s"} no período
        </p>
      </div>

      <section aria-label="Indicadores do período" className="premium-stats-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="dashboard-card premium-balance relative col-span-2 flex min-w-0 flex-col justify-center overflow-hidden rounded-xl p-5 lg:p-6">
          <div aria-hidden="true" className="premium-balance-glow pointer-events-none absolute inset-0" />
          <BalanceTrend values={runningBalanceTrend} />
          <div className="relative flex items-center gap-3">
            <span className="premium-icon premium-icon--mint">
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="premium-balance-label text-[12px] font-bold uppercase tracking-[0.17em]">
              Saldo do Período
            </span>
          </div>
          <p className={cn(
            "relative z-[1] mt-3 font-display font-bold leading-none tracking-[-0.04em] tabular-nums break-words text-[clamp(2rem,3vw,2.75rem)]",
            balance < 0 ? "premium-balance-negative" : "premium-balance-positive",
          )}>
            {fmt(balance)}
          </p>
          <p className="premium-balance-footnote relative z-[1] mt-3 text-[12px] leading-snug sm:text-[13px]">
            Entradas {fmt(totalIncome)} · Saídas {fmt(totalExpense)}
          </p>
        </article>

        <article className={cn(KPI_CARD, "premium-kpi--income relative col-span-1 overflow-hidden")}>
          <div className="flex items-center justify-between gap-2">
            <span className="premium-icon premium-icon--mint"><ArrowUpRight className="h-5 w-5" aria-hidden="true" /></span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-income opacity-75" aria-hidden="true" />
          </div>
          <span className={KPI_LABEL}>Total de Entradas</span>
          <p className={cn(KPI_VALUE, "premium-kpi-value text-income")}>{fmt(totalIncome)}</p>
          <p className={KPI_NOTE}>{incomeCount} lançamento{incomeCount === 1 ? "" : "s"}</p>
          <MiniBars values={dailyIncomeBars} tone="mint" />
        </article>

        <article className={cn(KPI_CARD, "premium-kpi--expense relative col-span-1 overflow-hidden")}>
          <div className="flex items-center justify-between gap-2">
            <span className="premium-icon premium-icon--coral"><ArrowDownRight className="h-5 w-5" aria-hidden="true" /></span>
            <ArrowDownRight className="h-4 w-4 shrink-0 text-expense opacity-75" aria-hidden="true" />
          </div>
          <span className={KPI_LABEL}>Total de Saídas</span>
          <p className={cn(KPI_VALUE, "premium-kpi-value text-expense")}>{fmt(totalExpense)}</p>
          <p className={KPI_NOTE}>{expenseCount} lançamento{expenseCount === 1 ? "" : "s"}</p>
          <MiniBars values={dailyExpenseBars} tone="coral" />
        </article>

        <article className={cn(KPI_CARD, "premium-kpi--average relative col-span-1 overflow-hidden")}>
          <div className="flex items-center gap-2.5">
            <span className="premium-icon premium-icon--blue"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span>
            <span className={KPI_LABEL}>Gasto Médio Diário</span>
          </div>
          <p className={cn(KPI_VALUE, "premium-kpi-value")}>{fmt(avgDaily)}</p>
          <p className={KPI_NOTE}>Média de {days} dia{days === 1 ? "" : "s"} no período</p>
          <MiniBars values={dailySpendingBars} tone="blue" />
        </article>

        <article className={cn(KPI_CARD, "premium-kpi--category relative col-span-1 overflow-hidden")}>
          <div className="flex items-center gap-2.5">
            <span className="premium-icon premium-icon--amber"><Tag className="h-5 w-5" aria-hidden="true" /></span>
            <span className={KPI_LABEL}>Maior Categoria</span>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className={cn(KPI_VALUE_BASE, "truncate text-[clamp(1.2rem,1.7vw,1.75rem)]")} title={topCategory.cat}>
                {topCategory.cat}
              </p>
              <p className={cn(KPI_NOTE, "mt-2 truncate")}>
                {fmt(topCategory.val)} · {topCategoryShare}% do total
              </p>
            </div>
            {topCategory.val > 0 && (
              <div className="premium-category-ring relative hidden shrink-0 sm:flex" aria-hidden="true">
                <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="var(--premium-ring-track)" strokeWidth="6" />
                  <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(42 94% 62%)" strokeWidth="6" strokeLinecap="round"
                    pathLength="100" strokeDasharray={String(Math.max(0, Math.min(100, topCategoryShare))) + " 100"} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">{topCategoryShare}%</span>
              </div>
            )}
          </div>
        </article>

        <article className="dashboard-card premium-summary col-span-2 grid grid-cols-3 items-stretch divide-x divide-border/80 p-3 sm:px-4 sm:py-5" aria-label="Resumo do período">
          <div className="flex min-w-0 flex-col items-center justify-center gap-1.5 px-1 text-center">
            <span className="premium-icon premium-icon--neutral"><CalendarDays className="h-4 w-4" aria-hidden="true" /></span>
            <span className="text-[12px] font-medium leading-tight text-muted-foreground sm:text-[13px]"><span className="sm:hidden">Dias</span><span className="hidden sm:inline">Dias no período</span></span>
            <strong className="text-[22px] font-extrabold leading-tight tabular-nums text-foreground sm:text-[26px]">{days}</strong>
          </div>
          <div className="flex min-w-0 flex-col items-center justify-center gap-1.5 px-1.5 text-center">
            <span className="premium-icon premium-icon--mint"><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
            <span className="text-[12px] font-medium leading-tight text-muted-foreground sm:text-[13px]">Maior entrada</span>
            <strong className="min-w-0 max-w-full break-words text-[clamp(0.875rem,1.9vw,1.625rem)] font-extrabold leading-tight tabular-nums text-foreground">{fmt(largestIncome?.amount ?? 0)}</strong>
            <span className="max-w-full truncate text-[11px] leading-tight text-muted-foreground sm:text-xs" title={movementName(largestIncome, "income")}>{movementName(largestIncome, "income")}</span>
          </div>
          <div className="flex min-w-0 flex-col items-center justify-center gap-1.5 px-1.5 text-center">
            <span className="premium-icon premium-icon--coral"><ArrowDownRight className="h-4 w-4" aria-hidden="true" /></span>
            <span className="text-[12px] font-medium leading-tight text-muted-foreground sm:text-[13px]">Maior saída</span>
            <strong className="min-w-0 max-w-full break-words text-[clamp(0.875rem,1.9vw,1.625rem)] font-extrabold leading-tight tabular-nums text-foreground">{fmt(largestExpense?.amount ?? 0)}</strong>
            <span className="max-w-full truncate text-[11px] leading-tight text-muted-foreground sm:text-xs" title={movementName(largestExpense, "expense")}>{movementName(largestExpense, "expense")}</span>
          </div>
        </article>
      </section>

      {holdings > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Patrimônio</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-[22px]">Contas & cartões</h2>
            </div>
            <Link to="/accounts" className="premium-see-all flex shrink-0 items-center gap-1 text-[13px] font-bold text-primary hover:underline">
              Ver todos <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <ScrollCarousel>
            {accounts.map((acc) => {
              const accountBalance = accountBalances[acc.id] ?? 0;
              return (
                <article
                  key={acc.id}
                  data-carousel-item
                  className="workspace-panel premium-account flex h-[134px] w-[240px] shrink-0 snap-start flex-col justify-between p-4 lg:h-[144px] lg:w-[268px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="premium-icon premium-icon--mint">
                      <Landmark className="h-4 w-4" />
                    </span>
                    <span className="premium-account-badge text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {acc.type === "checking" ? "Corrente" : "Poupança"}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-[13px] font-semibold text-foreground">
                    {acc.name} <span className="font-normal text-muted-foreground">· {acc.bank}</span>
                  </p>
                  <p
                    className={cn(
                      "mt-1 font-display text-2xl font-bold tabular-nums tracking-tight",
                      accountBalance < 0 ? "text-expense" : "text-foreground",
                    )}
                  >
                    {fmt(accountBalance)}
                  </p>
                </article>
              );
            })}
            {creditCards.map((cc) => {
              const used = getCardUsed(cc.id);
              const available = cc.limit - used;
              const pct = cc.limit > 0 ? Math.min((used / cc.limit) * 100, 100) : 0;
              return (
                <article
                  key={cc.id}
                  data-carousel-item
                  className="workspace-panel premium-credit h-[134px] w-[240px] shrink-0 snap-start p-4 lg:h-[144px] lg:w-[268px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="premium-icon premium-icon--coral">
                      <CreditCard className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Cartão de crédito
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-[13px] font-semibold text-foreground">{cc.name}</p>
                    <p className="shrink-0 font-display text-lg font-bold tabular-nums tracking-tight">
                      {fmt(used)}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,hsl(14_62%_58%),hsl(30_70%_54%))]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between gap-2 text-[12px] tabular-nums text-muted-foreground">
                    <span className="truncate">Disponível {fmt(available)}</span>
                    <span className="shrink-0">Limite {fmt(cc.limit)}</span>
                  </div>
                </article>
              );
            })}
          </ScrollCarousel>
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_0.9fr]">
        <ChartCard title="Ritmo de gastos" className="flex h-full min-w-0 flex-col">
          <div className="min-h-[250px] flex-1" data-testid="expense-rhythm-chart-area">
          <ResponsiveContainer width="100%" height="100%" minHeight={250}>
            <LineChart data={lineData} margin={{ top: 12, right: 8, bottom: 6, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="date" tick={{ ...CHART_TICK, fontSize: 11 }} interval="preserveStartEnd" minTickGap={32} tickMargin={10} />
              <YAxis
                width={86}
                tick={{ ...CHART_TICK, fontSize: 11 }}
                tickFormatter={chartMoneyTick}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                cursor={{ stroke: "hsl(215 15% 52%)", strokeWidth: 1, strokeDasharray: "3 3" }}
                formatter={(value: number) => [fmt(value), "Total"]}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke={CHART_SEMANTIC.expense}
                strokeWidth={2.5}
                dot={{ r: 3, fill: CHART_SEMANTIC.expense, strokeWidth: 0 }}
                activeDot={{ r: 4, fill: CHART_SEMANTIC.expense, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Categorias que mais pesam">
          {barData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem despesas no período.</p>
          ) : (
            <div className="space-y-3" role="list" aria-label="Despesas por categoria, da maior para a menor">
              {barData.map((entry) => (
                <div key={entry.category} role="listitem" className="space-y-1.5">
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
                    <span className="min-w-0 break-words font-medium text-foreground">{entry.category}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">{fmt(entry.total)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted/70">
                    <div className="h-full rounded-full"
                      style={{ width: Math.max(0, Math.min(100, entry.total / (barData[0]?.total || 1) * 100)) + "%", backgroundColor: entry.fill }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <section className="workspace-panel overflow-hidden p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="eyebrow">Leitura rápida</p>
            <h2 className="mt-1 text-[22px] font-bold tracking-tight">Sinais do período</h2>
          </div>
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        <div className="dashboard-insights grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {insights.map((text, i) => (
            <InsightCard key={i} text={text} />
          ))}
        </div>
      </section>
      <TransactionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={(data, options) => addTransaction(data, options)}
      />
    </div>
  );
}
