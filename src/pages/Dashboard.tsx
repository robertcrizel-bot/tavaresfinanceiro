import { useMemo, useState } from "react";
import { useFinance } from "@/contexts/FinanceContext";
import { useAccounts } from "@/contexts/AccountContext";
import { KpiCard } from "@/components/KpiCard";
import { ChartCard } from "@/components/ChartCard";
import { InsightCard } from "@/components/InsightCard";
import { TrendingUp, TrendingDown, CalendarDays, Tag, Landmark, CreditCard } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

type Period = "7" | "30" | "all";

const colorBorder: Record<string, string> = {
  purple: "border-l-purple-500",
  orange: "border-l-orange-500",
  blue: "border-l-blue-500",
  green: "border-l-green-500",
  red: "border-l-red-500",
  pink: "border-l-pink-500",
};
const colorBg: Record<string, string> = {
  purple: "bg-purple-500/5",
  orange: "bg-orange-500/5",
  blue: "bg-blue-500/5",
  green: "bg-green-500/5",
  red: "bg-red-500/5",
  pink: "bg-pink-500/5",
};
const colorIcon: Record<string, string> = {
  purple: "text-purple-400",
  orange: "text-orange-400",
  blue: "text-blue-400",
  green: "text-green-400",
  red: "text-red-400",
  pink: "text-pink-400",
};

export default function Dashboard() {
  const { transactions } = useFinance();
  const { accounts, creditCards } = useAccounts();
  const [period, setPeriod] = useState<Period>("30");

  const filtered = useMemo(() => {
    if (period === "all") return transactions;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(period));
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return transactions.filter((t) => t.date >= cutoffStr);
  }, [transactions, period]);

  const totalIncome = filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const days = period === "all" ? 30 : Number(period);
  const avgDaily = totalExpense / days;

  const topCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter((t) => t.type === "expense").forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    let top = { cat: "—", val: 0 };
    Object.entries(map).forEach(([cat, val]) => {
      if (val > top.val) top = { cat, val };
    });
    return top.cat;
  }, [filtered]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getAccountBalance = (accId: string, initialBalance: number) => {
    return transactions.reduce((bal, t) => {
      if (t.accountId !== accId) return bal;
      return t.type === "income" ? bal + t.amount : bal - t.amount;
    }, initialBalance);
  };

  const getCardUsed = (ccId: string) => {
    return transactions.reduce((total, t) => {
      if (t.creditCardId !== ccId) return total;
      return total + t.amount;
    }, 0);
  };

  // Line chart data
  const lineData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter((t) => t.type === "expense").forEach((t) => {
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
    filtered.filter((t) => t.type === "expense").forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([category, total]) => ({ category, total }));
  }, [filtered]);

  // Insights
  const insights = useMemo(() => {
    const list: string[] = [];
    if (topCategory !== "—") {
      const catTotal = filtered.filter((t) => t.type === "expense" && t.category === topCategory).reduce((s, t) => s + t.amount, 0);
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
    <div className="space-y-4 sm:space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
        <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="all">Total</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard title="Total de Entradas" value={fmt(totalIncome)} icon={TrendingUp} color="green" />
        <KpiCard title="Total de Saídas" value={fmt(totalExpense)} icon={TrendingDown} color="red" />
        <KpiCard title="Gasto Médio Diário" value={fmt(avgDaily)} icon={CalendarDays} color="amber" />
        <KpiCard title="Maior Categoria" value={topCategory} icon={Tag} color="blue" />
      </div>

      {/* Accounts & Cards */}
      {(accounts.length > 0 || creditCards.length > 0) && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Contas & Cartões</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {accounts.map((acc) => {
              const balance = getAccountBalance(acc.id, acc.initialBalance);
              return (
                <div key={acc.id} className={`glass-card rounded-xl p-4 border-l-4 animate-fade-in ${colorBorder[acc.color] || "border-l-primary"} ${colorBg[acc.color] || ""}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Landmark className={`h-4 w-4 ${colorIcon[acc.color] || "text-muted-foreground"}`} />
                    <span className="text-sm text-muted-foreground">{acc.name}</span>
                  </div>
                  <p className={`text-xl font-bold ${balance >= 0 ? "text-income" : "text-expense"}`}>{fmt(balance)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{acc.bank} · {acc.type === "checking" ? "Corrente" : "Poupança"}</p>
                </div>
              );
            })}
            {creditCards.map((cc) => {
              const used = getCardUsed(cc.id);
              const available = cc.limit - used;
              const pct = cc.limit > 0 ? Math.min((used / cc.limit) * 100, 100) : 0;
              return (
                <div key={cc.id} className={`glass-card rounded-xl p-4 border-l-4 animate-fade-in ${colorBorder[cc.color] || "border-l-primary"} ${colorBg[cc.color] || ""}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className={`h-4 w-4 ${colorIcon[cc.color] || "text-muted-foreground"}`} />
                    <span className="text-sm text-muted-foreground">{cc.name}</span>
                  </div>
                  <p className="text-xl font-bold text-expense">{fmt(used)}</p>
                  <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-expense transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Disponível: {fmt(available)}</span>
                    <span>Limite: {fmt(cc.limit)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <ChartCard title="Gastos por Dia">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 14% 18%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215 15% 52%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215 15% 52%)" }} width={45} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(224 18% 13%)", border: "1px solid hsl(224 14% 18%)", borderRadius: 8, color: "hsl(210 20% 92%)" }}
                formatter={(value: number) => [fmt(value), "Total"]}
              />
              <Line type="monotone" dataKey="total" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(160 84% 39%)" }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Despesas por Categoria">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 14% 18%)" />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: "hsl(215 15% 52%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215 15% 52%)" }} width={45} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(224 18% 13%)", border: "1px solid hsl(224 14% 18%)", borderRadius: 8, color: "hsl(210 20% 92%)" }}
                formatter={(value: number) => [fmt(value), "Total"]}
              />
              <Bar dataKey="total" fill="hsl(210 76% 52%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Insights */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Insights</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {insights.map((text, i) => (
            <InsightCard key={i} text={text} />
          ))}
        </div>
      </div>
    </div>
  );
}
