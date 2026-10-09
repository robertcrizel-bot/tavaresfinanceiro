import { useMemo, useState } from "react";
import { useFinance } from "@/contexts/FinanceContext";
import { useAccounts } from "@/contexts/AccountContext";
import { useTransfers } from "@/contexts/TransferContext";
import { Transaction } from "@/lib/types";
import { KpiCard } from "@/components/KpiCard";
import { ChartCard } from "@/components/ChartCard";
import { InsightCard } from "@/components/InsightCard";
import { TransactionForm } from "@/components/TransactionForm";
import { DashboardPeriodFilter, type Period } from "@/components/DashboardPeriodFilter";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, CalendarDays, Tag, Landmark, CreditCard, Plus, Wallet, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { isFinancialNeutralTransaction } from "@/lib/transaction-classification";
import { chartColor } from "@/lib/chart-theme";
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
    <div className="max-w-7xl space-y-5 sm:space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <h1 className="whitespace-nowrap text-lg font-extrabold leading-none tracking-tight text-primary sm:text-2xl sm:font-bold sm:tracking-normal">Painel de Controle</h1>
        <div className="contents sm:flex sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <DashboardPeriodFilter
            period={period}
            dateRange={dateRange}
            onPeriodChange={setPeriod}
            onDateRangeChange={setDateRange}
          />
          <div className="order-3 col-span-2 flex w-full items-center gap-2 sm:order-none sm:w-auto">
            <Button variant="outline" asChild className="h-9 flex-1 justify-center gap-1.5 border-border/70 bg-card/40 sm:h-10 sm:flex-none sm:gap-2">
              <Link to="/receipt">
                <ScanLine className="h-4 w-4 shrink-0" />
                <span className="sm:hidden">Comprovante</span>
                <span className="hidden sm:inline">Ler comprovante</span>
              </Link>
            </Button>
            <Button onClick={() => setFormOpen(true)} className="h-9 flex-1 justify-center gap-1.5 sm:h-10 sm:flex-none sm:gap-2">
              <Plus className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Novo</span>
              <span className="hidden sm:inline">Novo Registro</span>
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <KpiCard title="Total de Entradas" value={fmt(totalIncome)} icon={TrendingUp} color="green" />
        <KpiCard title="Total de Saídas" value={fmt(totalExpense)} icon={TrendingDown} color="red" />
        <KpiCard title="Saldo do Período" value={fmt(balance)} icon={Wallet} color="balance" negativeValue={balance < 0} />
        <KpiCard title="Gasto Médio Diário" value={fmt(avgDaily)} icon={CalendarDays} color="neutral" />
        <div className="col-span-2 xl:col-span-1">
          <KpiCard title="Maior Categoria" value={topCategory} icon={Tag} color="category" />
        </div>
      </div>

      {/* Accounts & Cards */}
      {(accounts.length > 0 || creditCards.length > 0) && (
        <div>
          <h2 className="relative mb-3 pl-3 text-sm font-semibold tracking-tight text-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary before:content-['']">Contas & Cartões</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {accounts.map((acc) => {
              const balance = accountBalances[acc.id];
              return (
                <div
                  key={acc.id}
                  className="dashboard-card flex h-[142px] flex-col justify-between border-border/70 bg-card/90 p-3.5 shadow-sm shadow-black/10 sm:h-[150px] sm:p-4"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
                      <Landmark className="h-4 w-4 text-primary" />
                    </span>
                    <span className="truncate text-sm font-semibold text-foreground">{acc.name}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Saldo atual</p>
                    <p className={`break-words text-lg font-bold leading-tight tracking-tight sm:text-xl ${balance > 0 ? "text-income" : balance < 0 ? "text-expense" : "text-foreground"}`}>{fmt(balance)}</p>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground/80">{acc.bank} · {acc.type === "checking" ? "Corrente" : "Poupança"}</p>
                </div>
              );
            })}
            {creditCards.map((cc) => {
              const used = getCardUsed(cc.id);
              const available = cc.limit - used;
              const pct = cc.limit > 0 ? Math.min((used / cc.limit) * 100, 100) : 0;
              return (
                <div
                  key={cc.id}
                  className="dashboard-card flex h-[142px] flex-col justify-between border-border/70 bg-secondary/25 p-3.5 shadow-sm shadow-black/10 sm:h-[150px] sm:p-4"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-expense/10 ring-1 ring-inset ring-expense/20">
                      <CreditCard className="h-4 w-4 text-expense" />
                    </span>
                    <span className="truncate text-sm font-semibold text-foreground">{cc.name}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Utilizado</p>
                    <p className="break-words text-lg font-bold leading-tight tracking-tight text-expense sm:text-xl">{fmt(used)}</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-border/70">
                      <div className="h-full rounded-full bg-expense/80" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between gap-2 text-[10px] leading-none text-muted-foreground">
                      <span className="truncate">Disp. {fmt(available)}</span>
                      <span className="shrink-0">Lim. {fmt(cc.limit)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <ChartCard title="Gastos por Dia">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 14% 20%)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(215 20% 66%)" }} tickMargin={8} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215 20% 66%)" }} width={52} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(224 18% 13%)",
                  border: "1px solid hsl(224 14% 22%)",
                  borderRadius: 8,
                  color: "#f1f5f9",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                }}
                labelStyle={{ color: "#f8fafc", fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: "#f1f5f9" }}
                cursor={{ stroke: "hsl(215 15% 52%)", strokeWidth: 1, strokeDasharray: "3 3" }}
                formatter={(value: number) => [fmt(value), "Total"]}
              />
              <Line type="monotone" dataKey="total" stroke="hsl(0 72% 58%)" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(0 72% 58%)", strokeWidth: 0 }} activeDot={{ r: 4, fill: "hsl(0 72% 58%)", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Despesas por Categoria">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ left: 4, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 14% 20%)" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 11, fill: "hsl(215 20% 66%)" }} tickMargin={8} interval={0} angle={-18} dy={8} height={52} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215 20% 66%)" }} width={52} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(224 18% 13%)",
                  border: "1px solid hsl(224 14% 22%)",
                  borderRadius: 8,
                  color: "#f1f5f9",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                }}
                labelStyle={{ color: "#f8fafc", fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: "#f1f5f9" }}
                cursor={{ fill: "hsl(224 14% 22% / 0.4)" }}
                formatter={(value: number) => [fmt(value), "Total"]}
              />
              <Bar dataKey="total" radius={[6, 6, 6, 6]} background={{ fill: "hsl(224 14% 16%)", radius: 6 } as never}>
                {barData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Insights */}
      <div>
        <h2 className="relative mb-3 pl-3 text-sm font-semibold tracking-tight text-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary before:content-['']">Insights</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {insights.map((text, i) => (
            <InsightCard key={i} text={text} />
          ))}
        </div>
      </div>
      {/* Transaction Form */}
      <TransactionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={(data, options) => addTransaction(data, options)}
      />
    </div>
  );
}
