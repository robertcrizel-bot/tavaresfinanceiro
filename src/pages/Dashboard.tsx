import { useMemo, useState } from "react";
import { useFinance } from "@/contexts/FinanceContext";
import { useAccounts } from "@/contexts/AccountContext";
import { useTransfers } from "@/contexts/TransferContext";
import { Transaction } from "@/lib/types";
import { ChartCard } from "@/components/ChartCard";
import { InsightCard } from "@/components/InsightCard";
import { TransactionForm } from "@/components/TransactionForm";
import { DashboardPeriodFilter, type Period } from "@/components/DashboardPeriodFilter";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, CalendarDays, Tag, Landmark, CreditCard, Plus, Wallet, ScanLine, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Link } from "react-router-dom";
import { isFinancialNeutralTransaction } from "@/lib/transaction-classification";
import { CHART_GRID, CHART_TICK, CHART_TOOLTIP_STYLE, chartColor } from "@/lib/chart-theme";
import { calculateAccountBalances, calculateFinancialTotals } from "@/lib/financial-calculations";
import { getCardCommittedAmount } from "@/lib/credit-card-billing";
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { DateRange } from "react-day-picker";

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

  const topCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter((t) => t.type === "expense" && !isNeutral(t)).forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    let top = { cat: "—", val: 0 };
    Object.entries(map).forEach(([cat, val]) => {
      if (val > top.val) top = { cat, val };
    });
    return top.cat;
  }, [filtered]);

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
      .map(([category, total], i) => ({ category, total, fill: chartColor(i) }));
  }, [filtered]);

  // Insights
  const insights = useMemo(() => {
    const list: string[] = [];
    if (topCategory !== "—") {
      const catTotal = filtered.filter((t) => t.type === "expense" && !isNeutral(t) && t.category === topCategory).reduce((s, t) => s + t.amount, 0);
      const pct = totalExpense > 0 ? Math.round((catTotal / totalExpense) * 100) : 0;
      list.push(`${topCategory} representa ${pct}% dos seus gastos no período.`);
    }
    list.push(`Seu gasto médio diário é de ${fmt(avgDaily)}.`);
    if (totalIncome > totalExpense) {
      list.push(`Você está economizando ${fmt(totalIncome - totalExpense)} no período. Continue assim!`);
    } else if (totalExpense > totalIncome) {
      list.push(`Atenção: suas saídas excedem as entradas em ${fmt(totalExpense - totalIncome)}.`);
    }
    return list;
  }, [filtered, topCategory, totalExpense, totalIncome, avgDaily]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Visão financeira</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-[-0.035em] text-foreground sm:text-3xl">Seu dinheiro, com clareza.</h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground sm:text-sm">Acompanhe o que entrou, o que saiu e onde agir agora.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="h-9 flex-1 gap-2 rounded-lg bg-card sm:flex-none">
            <Link to="/receipt"><ScanLine className="h-4 w-4" /><span className="hidden sm:inline">Ler comprovante</span><span className="sm:hidden">Comprovante</span></Link>
          </Button>
          <Button onClick={() => setFormOpen(true)} className="h-9 flex-1 gap-2 rounded-lg sm:flex-none">
            <Plus className="h-4 w-4" /><span>Novo registro</span>
          </Button>
        </div>
      </header>

      <section className="workspace-panel overflow-hidden">
        <div className="border-b border-border/70 bg-secondary/20 p-2.5 sm:p-3">
          <DashboardPeriodFilter period={period} dateRange={dateRange} onPeriodChange={setPeriod} onDateRangeChange={setDateRange} />
        </div>
        <div className="grid lg:h-[210px] lg:grid-cols-[1.15fr_1fr]">
          <div className="dashboard-card relative h-[145px] overflow-hidden rounded-none border-0 bg-[linear-gradient(135deg,hsl(168_52%_18%),hsl(216_28%_10%))] p-4 text-white shadow-none lg:h-full lg:p-5">
            <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full border-[24px] border-primary/10" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-sidebar-foreground">Saldo do Período</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5"><Wallet className="h-4 w-4 text-primary" /></span>
              </div>
              <div>
                <p className={`font-display text-3xl font-bold tracking-[-0.045em] lg:text-4xl ${balance < 0 ? "text-red-300" : "text-white"}`}>{fmt(balance)}</p>
                <p className="mt-1 text-[10px] text-sidebar-foreground/70">Resultado líquido do período</p>
              </div>
              <div className="hidden grid-cols-2 gap-4 border-t border-white/10 pt-3 lg:grid">
                <div><span className="text-[9px] font-bold uppercase tracking-widest text-sidebar-foreground/55">Entradas</span><p className="mt-1 text-sm font-bold text-sidebar-primary">{fmt(totalIncome)}</p></div>
                <div><span className="text-[9px] font-bold uppercase tracking-widest text-sidebar-foreground/55">Saídas</span><p className="mt-1 text-sm font-bold text-red-300">{fmt(totalExpense)}</p></div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 bg-card">
            <div className="dashboard-card flex min-h-[96px] flex-col justify-center gap-2 rounded-none border-0 border-b border-r border-border/70 p-3.5 shadow-none lg:min-h-0 lg:p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-income/10 text-income"><ArrowUpRight className="h-4 w-4" /></span>
              <div><span className="text-xs font-semibold text-muted-foreground">Total de Entradas</span><p className="mt-0.5 font-display text-lg font-bold tracking-tight text-income lg:text-xl">{fmt(totalIncome)}</p></div>
            </div>
            <div className="dashboard-card flex min-h-[96px] flex-col justify-center gap-2 rounded-none border-0 border-b border-border/70 p-3.5 shadow-none lg:min-h-0 lg:p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-expense/10 text-expense"><ArrowDownRight className="h-4 w-4" /></span>
              <div><span className="text-xs font-semibold text-muted-foreground">Total de Saídas</span><p className="mt-0.5 font-display text-lg font-bold tracking-tight text-expense lg:text-xl">{fmt(totalExpense)}</p></div>
            </div>
            <div className="dashboard-card flex min-h-[96px] flex-col justify-center gap-2 rounded-none border-0 border-r border-border/70 p-3.5 shadow-none lg:min-h-0 lg:p-4">
              <CalendarDays className="h-5 w-5 text-primary" />
              <div><span className="text-xs font-semibold text-muted-foreground">Gasto Médio Diário</span><p className="mt-0.5 font-display text-lg font-bold tracking-tight lg:text-xl">{fmt(avgDaily)}</p></div>
            </div>
            <div className="dashboard-card flex min-h-[96px] flex-col justify-center gap-2 rounded-none border-0 p-3.5 shadow-none lg:min-h-0 lg:p-4">
              <Tag className="h-5 w-5 text-primary" />
              <div><span className="text-xs font-semibold text-muted-foreground">Maior Categoria</span><p className="mt-0.5 truncate font-display text-lg font-bold tracking-tight lg:text-xl">{topCategory}</p></div>
            </div>
          </div>
        </div>
      </section>

      {(accounts.length > 0 || creditCards.length > 0) && (
        <section>
          <div className="mb-3 flex items-end justify-between"><div><p className="eyebrow">Patrimônio</p><h2 className="mt-1 text-xl font-bold tracking-tight">Contas & cartões</h2></div><Link to="/accounts" className="text-xs font-bold text-primary hover:underline">Ver todos</Link></div>
          <div className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {accounts.map((acc) => {
              const accountBalance = accountBalances[acc.id];
              return <article key={acc.id} className="workspace-panel h-[132px] min-w-[225px] snap-start p-4 sm:h-[138px] sm:min-w-[245px]"><div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Landmark className="h-4 w-4" /></span><span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{acc.type === "checking" ? "Corrente" : "Poupança"}</span></div><p className="mt-3 truncate text-xs font-bold">{acc.name} <span className="font-normal text-muted-foreground">· {acc.bank}</span></p><p className={`mt-1 font-display text-xl font-bold tracking-tight ${accountBalance < 0 ? "text-expense" : "text-foreground"}`}>{fmt(accountBalance)}</p></article>;
            })}
            {creditCards.map((cc) => {
              const used = getCardUsed(cc.id); const available = cc.limit - used; const pct = cc.limit > 0 ? Math.min((used / cc.limit) * 100, 100) : 0;
              return <article key={cc.id} className="h-[132px] min-w-[225px] snap-start rounded-2xl border border-border/80 bg-secondary/60 p-4 sm:h-[138px] sm:min-w-[245px]"><div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-expense/10 text-expense"><CreditCard className="h-4 w-4" /></span><span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Crédito</span></div><div className="mt-2 flex items-baseline justify-between gap-2"><p className="truncate text-xs font-bold">{cc.name}</p><p className="font-display text-lg font-bold tracking-tight">{fmt(used)}</p></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/70"><div className="h-full rounded-full bg-expense" style={{ width: `${pct}%` }} /></div><div className="mt-1.5 flex justify-between text-[9px] text-muted-foreground"><span>Disp. {fmt(available)}</span><span>Lim. {fmt(cc.limit)}</span></div></article>;
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.9fr]">
        <ChartCard title="Ritmo de gastos">
          <ResponsiveContainer width="100%" height={195}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="date" tick={CHART_TICK} tickMargin={8} />
              <YAxis tick={CHART_TICK} width={52} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "#f8fafc", fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: "#f1f5f9" }}
                cursor={{ stroke: "hsl(215 15% 52%)", strokeWidth: 1, strokeDasharray: "3 3" }}
                formatter={(value: number) => [fmt(value), "Total"]}
              />
              <Line type="monotone" dataKey="total" stroke="hsl(5 76% 61%)" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(5 76% 61%)", strokeWidth: 0 }} activeDot={{ r: 4, fill: "hsl(5 76% 61%)", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Categorias que mais pesam">
          <ResponsiveContainer width="100%" height={195}>
            <BarChart data={barData} margin={{ left: 4, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="category" tick={CHART_TICK} tickMargin={8} interval={0} angle={-18} dy={8} height={52} />
              <YAxis tick={CHART_TICK} width={52} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "#f8fafc", fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: "#f1f5f9" }}
                cursor={{ fill: "hsl(224 14% 22% / 0.4)" }}
                formatter={(value: number) => [fmt(value), "Total"]}
              />
              <Bar dataKey="total" radius={[6, 6, 6, 6]} background={{ fill: "hsl(215 18% 15%)", radius: 6 } as never}>
                {barData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <section className="workspace-panel overflow-hidden p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between"><div><p className="eyebrow">Leitura rápida</p><h2 className="mt-1 text-lg font-bold">Sinais do período</h2></div><TrendingUp className="h-5 w-5 text-primary" /></div>
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
