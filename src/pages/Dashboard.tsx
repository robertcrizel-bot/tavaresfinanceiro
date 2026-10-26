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
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
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

  const holdings = accounts.length + creditCards.length;

  return (
    <div className="premium-dashboard mx-auto max-w-[1440px] space-y-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Visão financeira</p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-[-0.035em] text-foreground sm:text-3xl">
            Seu dinheiro, com clareza.
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Acompanhe o que entrou, o que saiu e onde agir agora.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="h-10 gap-2 rounded-lg bg-card">
            <Link to="/receipt">
              <ScanLine className="h-4 w-4" />
              <span className="hidden sm:inline">Ler comprovante</span>
              <span className="sm:hidden">Comprovante</span>
            </Link>
          </Button>
          <Button onClick={() => setFormOpen(true)} className="h-10 gap-2 rounded-lg">
            <Plus className="h-4 w-4" />
            <span>Novo registro</span>
          </Button>
        </div>
      </header>

      <div className="workspace-panel flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-2 sm:p-2.5">
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

      <section aria-label="Indicadores do período" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="dashboard-card premium-balance relative col-span-2 flex flex-col justify-center gap-3 overflow-hidden rounded-xl p-5 text-white lg:p-6">
          <div aria-hidden="true" className="premium-balance-glow absolute inset-0 pointer-events-none" />
          <div className="relative flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-white/75">
              Saldo do Período
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
              <Wallet className="h-4 w-4 text-primary" />
            </span>
          </div>
          <p
            className={cn(
              "relative font-display font-bold leading-none tracking-[-0.04em] tabular-nums break-words text-[clamp(2rem,2.6vw,2.625rem)]",
              balance < 0 ? "text-red-300" : "text-white",
            )}
          >
            {fmt(balance)}
          </p>
          <p className="relative text-[13px] leading-snug text-white/75">
            Entradas {fmt(totalIncome)} · Saídas {fmt(totalExpense)}
          </p>
        </article>

        <article className={cn(KPI_CARD, "col-span-1")}>
          <div className="flex items-center justify-between gap-2">
            <span className={KPI_LABEL}>Total de Entradas</span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-income" />
          </div>
          <p className={cn(KPI_VALUE, "text-income")}>{fmt(totalIncome)}</p>
          <p className={KPI_NOTE}>{incomeCount} lançamento{incomeCount === 1 ? "" : "s"}</p>
        </article>

        <article className={cn(KPI_CARD, "col-span-1")}>
          <div className="flex items-center justify-between gap-2">
            <span className={KPI_LABEL}>Total de Saídas</span>
            <ArrowDownRight className="h-4 w-4 shrink-0 text-expense" />
          </div>
          <p className={cn(KPI_VALUE, "text-expense")}>{fmt(totalExpense)}</p>
          <p className={KPI_NOTE}>{expenseCount} lançamento{expenseCount === 1 ? "" : "s"}</p>
        </article>

        <article className={cn(KPI_CARD, "col-span-1")}>
          <div className="flex items-center justify-between gap-2">
            <span className={KPI_LABEL}>Gasto Médio Diário</span>
            <CalendarDays className="h-4 w-4 shrink-0 text-info" />
          </div>
          <p className={KPI_VALUE}>{fmt(avgDaily)}</p>
          <p className={KPI_NOTE}>Média de {days} dia{days === 1 ? "" : "s"} no período</p>
        </article>

        <article className={cn(KPI_CARD, "col-span-1")}>
          <div className="flex items-center justify-between gap-2">
            <span className={KPI_LABEL}>Maior Categoria</span>
            <Tag className="h-4 w-4 shrink-0 text-warning" />
          </div>
          <p className={cn(KPI_VALUE_BASE, "truncate text-[clamp(1.25rem,1.6vw,1.75rem)]")} title={topCategory.cat}>
            {topCategory.cat}
          </p>
          <p className={cn(KPI_NOTE, "truncate")}>
            {fmt(topCategory.val)} · {topCategoryShare}% do total
          </p>
        </article>

        <article className="dashboard-card premium-summary col-span-2 grid grid-cols-3 items-center divide-x divide-border/80 px-2 py-3 sm:px-4 lg:py-5" aria-label="Resumo do período">
          <div className="flex min-w-0 items-center justify-center gap-1 px-1">
            <span className="whitespace-nowrap text-[11px] sm:text-xs font-medium text-muted-foreground">Lançamentos</span>
            <strong className="shrink-0 text-[14px] font-bold tabular-nums text-foreground sm:text-base">{filtered.length}</strong>
          </div>
          <div className="flex min-w-0 items-center justify-center gap-1 px-1">
            <span className="whitespace-nowrap text-[11px] sm:text-xs font-medium text-muted-foreground"><span className="sm:hidden">Dias</span><span className="hidden sm:inline">Dias no período</span></span>
            <strong className="shrink-0 text-[14px] font-bold tabular-nums text-foreground sm:text-base">{days}</strong>
          </div>
          <div className="flex min-w-0 items-center justify-center gap-1 px-1">
            <span className="whitespace-nowrap text-[11px] sm:text-xs font-medium text-muted-foreground"><span className="sm:hidden">Contas/cartões</span><span className="hidden sm:inline">Contas & cartões</span></span>
            <strong className="shrink-0 text-[14px] font-bold tabular-nums text-foreground sm:text-base">{holdings}</strong>
          </div>
        </article>
      </section>

      {holdings > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Patrimônio</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight">Contas & cartões</h2>
            </div>
            <Link to="/accounts" className="shrink-0 text-[13px] font-bold text-primary hover:underline">
              Ver todos
            </Link>
          </div>
          <ScrollCarousel>
            {accounts.map((acc) => {
              const accountBalance = accountBalances[acc.id] ?? 0;
              return (
                <article
                  key={acc.id}
                  data-carousel-item
                  className="workspace-panel premium-account h-[134px] w-[240px] shrink-0 snap-start p-4 lg:h-[144px] lg:w-[268px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Landmark className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      {acc.type === "checking" ? "Corrente" : "Poupança"}
                    </span>
                  </div>
                  <p className="mt-3 truncate text-[13px] font-semibold text-foreground">
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
                  className="workspace-panel h-[134px] w-[240px] shrink-0 snap-start bg-[linear-gradient(155deg,hsl(14_32%_15%),hsl(215_26%_12%))] p-4 lg:h-[144px] lg:w-[268px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-expense/15 text-expense">
                      <CreditCard className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Cartão de crédito
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-2">
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
        <ChartCard title="Ritmo de gastos">
          <ResponsiveContainer width="100%" height={250}>
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
            <h2 className="mt-1 text-xl font-bold tracking-tight">Sinais do período</h2>
          </div>
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
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
