import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
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
import * as XLSX from "xlsx";
import { Download, Eye, Hash, ListFilter, Search, TrendingDown, TrendingUp, Wallet, X } from "lucide-react";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { useFinance } from "@/contexts/FinanceContext";
import { ChartCard } from "@/components/ChartCard";
import { KpiCard } from "@/components/KpiCard";
import { TransactionDetail } from "@/components/TransactionDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseLocalDate, toLocalDateString } from "@/lib/expense-analytics";
import {
  STATEMENT_ALL,
  buildDailySeries,
  buildStatementExportRows,
  filterStatementTransactions,
  hasCashOrigin,
  originFromKey,
  originKey,
  originLabel,
  signedAmount,
  statementExportFilename,
  statementTypeLabel,
  summarizeAccount,
  summarizeByCategory,
  summarizeByOrigin,
  summarizeByPaymentMethod,
  summarizeCard,
  topMovements,
  type StatementFilters,
} from "@/lib/statements";
import type { Transaction } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/types";

const DONUT_COLORS = [
  "hsl(160 84% 39%)", "hsl(160 62% 34%)", "hsl(168 50% 42%)", "hsl(150 42% 46%)",
  "hsl(195 55% 46%)", "hsl(215 45% 52%)", "hsl(180 35% 45%)", "hsl(140 35% 40%)",
  "hsl(170 28% 52%)", "hsl(200 30% 44%)",
];
const colorForIndex = (index: number) => DONUT_COLORS[index % DONUT_COLORS.length];

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const formatDateBR = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");

const tooltipStyle = {
  backgroundColor: "hsl(224 18% 13%)",
  border: "1px solid hsl(224 14% 22%)",
  borderRadius: 8,
  color: "#f1f5f9",
};
const axisTick = { fontSize: 10, fill: "hsl(215 15% 52%)" };

type PeriodShortcut = "today" | "7d" | "month" | "prevMonth" | "30d" | "90d" | "year";

function monthBounds(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toLocalDateString(start), end: toLocalDateString(end) };
}

export default function Statements() {
  const { transactions, creditCardInvoices } = useFinance();
  const { accounts, creditCards } = useAccounts();
  const { allCategoryNames } = useCategories();

  const today = useMemo(() => toLocalDateString(new Date()), []);
  const defaultMonth = useMemo(() => monthBounds(new Date()), []);

  const [origin, setOrigin] = useState(STATEMENT_ALL);
  const [start, setStart] = useState(defaultMonth.start);
  const [end, setEnd] = useState(defaultMonth.end);
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [category, setCategory] = useState(STATEMENT_ALL);
  const [paymentMethod, setPaymentMethod] = useState(STATEMENT_ALL);
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sort, setSort] = useState<"date-desc" | "date-asc" | "amount-desc" | "amount-asc">("date-desc");
  const [viewing, setViewing] = useState<Transaction | null>(null);

  const applyShortcut = useCallback((shortcut: PeriodShortcut) => {
    const now = new Date();
    if (shortcut === "today") {
      const iso = toLocalDateString(now);
      setStart(iso);
      setEnd(iso);
      return;
    }
    if (shortcut === "month") {
      const bounds = monthBounds(now);
      setStart(bounds.start);
      setEnd(bounds.end);
      return;
    }
    if (shortcut === "prevMonth") {
      const bounds = monthBounds(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      setStart(bounds.start);
      setEnd(bounds.end);
      return;
    }
    if (shortcut === "year") {
      setStart(`${now.getFullYear()}-01-01`);
      setEnd(`${now.getFullYear()}-12-31`);
      return;
    }
    const days = shortcut === "7d" ? 7 : shortcut === "30d" ? 30 : 90;
    const from = new Date(now);
    from.setDate(from.getDate() - (days - 1));
    setStart(toLocalDateString(from));
    setEnd(toLocalDateString(now));
  }, []);

  const periodValid = start <= end;
  const parsedOrigin = originFromKey(origin);
  const isCardMode = parsedOrigin.kind === "card";

  const filters: StatementFilters = useMemo(() => ({
    origin: parsedOrigin,
    start,
    end,
    type: typeFilter,
    category,
    paymentMethod,
    search,
    minAmount: minAmount === "" ? null : Number(minAmount),
    maxAmount: maxAmount === "" ? null : Number(maxAmount),
    sort,
  }), [parsedOrigin, start, end, typeFilter, category, paymentMethod, search, minAmount, maxAmount, sort]);

  const rows = useMemo(
    () => (periodValid ? filterStatementTransactions(transactions, filters) : []),
    [transactions, filters, periodValid],
  );
  const accountSummary = useMemo(() => summarizeAccount(rows), [rows]);
  const cardSummary = useMemo(() => summarizeCard(rows), [rows]);
  const categories = useMemo(() => summarizeByCategory(rows), [rows]);
  const daily = useMemo(() => (periodValid ? buildDailySeries(rows, start, end) : []), [rows, start, end, periodValid]);
  const top = useMemo(() => topMovements(rows), [rows]);
  const byOrigin = useMemo(() => summarizeByOrigin(rows, accounts, creditCards), [rows, accounts, creditCards]);
  const byPayment = useMemo(() => summarizeByPaymentMethod(rows), [rows]);
  const showCash = useMemo(() => hasCashOrigin(transactions), [transactions]);

  const exportContext = useMemo(
    () => ({ accounts, creditCards, invoices: creditCardInvoices }),
    [accounts, creditCards, creditCardInvoices],
  );

  const exportToXlsx = useCallback(() => {
    const data = buildStatementExportRows(rows, exportContext);
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extrato");
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    ws["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
    XLSX.writeFile(wb, statementExportFilename(start, end));
  }, [rows, exportContext, start, end]);

  const clearSecondary = useCallback(() => {
    setTypeFilter("all");
    setCategory(STATEMENT_ALL);
    setPaymentMethod(STATEMENT_ALL);
    setSearch("");
    setMinAmount("");
    setMaxAmount("");
  }, []);

  const originOptions = useMemo(() => [
    { key: STATEMENT_ALL, label: "Todas" },
    ...accounts.map((account) => ({ key: originKey({ kind: "account" as const, accountId: account.id }), label: account.name })),
    ...(showCash ? [{ key: "cash", label: "Dinheiro" }] : []),
    ...creditCards.map((card) => ({ key: originKey({ kind: "card" as const, cardId: card.id }), label: `${card.name} (Cartão)` })),
  ], [accounts, creditCards, showCash]);

  const originName = originOptions.find((option) => option.key === origin)?.label ?? "Todas";

  const renderTypeBadge = (transaction: Transaction) => {
    if (transaction.financialKind === "card_invoice_payment") return <Badge variant="secondary">Pagamento de Fatura</Badge>;
    return transaction.type === "income"
      ? <Badge variant="default">Entrada</Badge>
      : <Badge variant="destructive">Saída</Badge>;
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl pb-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">Extratos</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Movimentações reais por origem, período e categoria.
          </p>
        </div>
        <Button variant="outline" onClick={exportToXlsx} disabled={rows.length === 0} className="gap-2">
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Exportar</span>
        </Button>
      </div>

      <div className="dashboard-card p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Origem</span>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                {originOptions.map((option) => (
                  <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Data inicial</span>
            <Input type="date" value={start} max={today} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Data final</span>
            <Input type="date" value={end} max={today} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["today", "Hoje"],
            ["7d", "7 dias"],
            ["month", "Este mês"],
            ["prevMonth", "Mês anterior"],
            ["30d", "30 dias"],
            ["90d", "90 dias"],
            ["year", "Este ano"],
          ] as [PeriodShortcut, string][]).map(([key, label]) => (
            <Button key={key} type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => applyShortcut(key)}>
              {label}
            </Button>
          ))}
        </div>
        {!periodValid && (
          <p className="text-sm text-destructive">Período inválido: a data inicial é posterior à data final.</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Tipo</span>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as "all" | "income" | "expense")}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="income">Entradas</SelectItem>
                <SelectItem value="expense">Saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Categoria</span>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={STATEMENT_ALL}>Todas</SelectItem>
                {allCategoryNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Pagamento</span>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue placeholder="Pagamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={STATEMENT_ALL}>Todas</SelectItem>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>{method}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Ordenar</span>
            <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
              <SelectTrigger><SelectValue placeholder="Ordenar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Data recente</SelectItem>
                <SelectItem value="date-asc">Data antiga</SelectItem>
                <SelectItem value="amount-desc">Maior valor</SelectItem>
                <SelectItem value="amount-asc">Menor valor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar título, descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-3">
            <Input type="number" min="0" placeholder="Valor mín." value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
            <Input type="number" min="0" placeholder="Valor máx." value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            {origin !== STATEMENT_ALL && (
              <Button variant="secondary" size="sm" className="h-7 text-xs gap-1" aria-label="Remover filtro de origem" onClick={() => setOrigin(STATEMENT_ALL)}>
                {originName} <X className="h-3 w-3" />
              </Button>
            )}
            {category !== STATEMENT_ALL && (
              <Button variant="secondary" size="sm" className="h-7 text-xs gap-1" aria-label="Remover filtro de categoria" onClick={() => setCategory(STATEMENT_ALL)}>
                {category} <X className="h-3 w-3" />
              </Button>
            )}
            {(typeFilter !== "all" || paymentMethod !== STATEMENT_ALL || search.trim() !== "") && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSecondary}>
                Limpar filtros
              </Button>
            )}
          </div>
        </div>
      </div>

      {isCardMode ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard title="Compras" value={money(cardSummary.purchases)} icon={TrendingDown} color="red" />
          <KpiCard title="Estornos / Créditos" value={money(cardSummary.refunds)} icon={TrendingUp} color="green" />
          <KpiCard title="Total líquido" value={money(cardSummary.net)} icon={Wallet} color="balance" negativeValue={cardSummary.net < 0} />
          <KpiCard title="Qtd. compras" value={String(cardSummary.count)} icon={Hash} color="neutral" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard title="Entradas" value={money(accountSummary.income)} icon={TrendingUp} color="green" />
          <KpiCard title="Saídas" value={money(accountSummary.expense)} icon={TrendingDown} color="red" />
          <KpiCard title="Saldo do período" value={money(accountSummary.balance)} icon={Wallet} color="balance" negativeValue={accountSummary.balance < 0} />
          <KpiCard title="Movimentações" value={String(accountSummary.count)} icon={Hash} color="neutral" />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma movimentação encontrada para os filtros selecionados.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <ChartCard title="Por categoria">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem saídas no período.</p>
              ) : (
                <>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={220}>
                      <RechartsPieChart>
                        <Pie
                          data={categories}
                          dataKey="total"
                          nameKey="category"
                          innerRadius={55}
                          outerRadius={88}
                          paddingAngle={2}
                          stroke="hsl(224 18% 11%)"
                          strokeWidth={2}
                        >
                          {categories.map((slice, index) => (
                            <Cell
                              key={slice.category}
                              fill={colorForIndex(index)}
                              fillOpacity={!category || category === STATEMENT_ALL || category === slice.category ? 1 : 0.25}
                              onClick={() => setCategory((current) => (current === slice.category ? STATEMENT_ALL : slice.category))}
                              className="cursor-pointer"
                            />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [money(Number(value)), name]} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 divide-y divide-border/60" data-testid="category-legend">
                    {categories.slice(0, 6).map((slice, index) => (
                      <button
                        key={slice.category}
                        type="button"
                        onClick={() => setCategory((current) => (current === slice.category ? STATEMENT_ALL : slice.category))}
                        className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:bg-accent/40"
                      >
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForIndex(index) }} />
                        <span className="flex-1 truncate">{slice.category}</span>
                        <span className="text-muted-foreground text-xs">{percent(slice.share)}</span>
                        <span className="font-medium">{money(slice.total)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>

            <ChartCard title="Evolução no tempo">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 14% 18%)" />
                  <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={axisTick} width={48} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "#f8fafc", fontWeight: 600, marginBottom: 4 }}
                    formatter={(value: number, name: string) => [money(Number(value)), name]}
                  />
                  <Line
                    type="monotone"
                    dataKey="income"
                    name={isCardMode ? "Estornos" : "Entradas"}
                    stroke="hsl(160 84% 39%)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="expense"
                    name={isCardMode ? "Compras" : "Saídas"}
                    stroke="hsl(0 72% 51%)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Maiores movimentações">
              <div className="divide-y divide-border/60" data-testid="top-movements">
                {top.slice(0, 8).map((transaction) => {
                  const signed = signedAmount(transaction);
                  return (
                    <button
                      key={transaction.id}
                      type="button"
                      onClick={() => setViewing(transaction)}
                      className="flex w-full items-center gap-3 py-2 text-left hover:bg-accent/40"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-medium">{transaction.title}</span>
                        <span className="block text-xs text-muted-foreground">{formatDateBR(transaction.date)}</span>
                      </span>
                      <span className={`text-sm font-semibold ${signed >= 0 ? "text-income" : "text-expense"}`}>
                        {signed >= 0 ? `+ ${money(signed)}` : `- ${money(Math.abs(signed))}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </ChartCard>

            <ChartCard title={parsedOrigin.kind === "all" ? "Distribuição por origem" : "Formas de pagamento"}>
              {parsedOrigin.kind === "all" ? (
                byOrigin.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem movimentações no período.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={byOrigin} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 14% 18%)" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="label" tick={{ ...axisTick, fontSize: 11 }} width={120} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [money(Number(value)), "Movimentado"]} />
                        <Bar dataKey="volume" radius={[0, 6, 6, 0]}>
                          {byOrigin.map((slice, index) => (
                            <Cell
                              key={slice.key}
                              fill={colorForIndex(index)}
                              onClick={() => {
                                if (slice.key === "cash" || slice.key.startsWith("a:") || slice.key.startsWith("c:")) {
                                  setOrigin(slice.key === "cash" ? "cash" : slice.key);
                                }
                              }}
                              className="cursor-pointer"
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {byOrigin.map((slice) => (
                        <Button
                          key={slice.key}
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={slice.key === "other"}
                          onClick={() => setOrigin(slice.key === "cash" ? "cash" : slice.key)}
                        >
                          {slice.label} · {money(slice.volume)}
                        </Button>
                      ))}
                    </div>
                  </>
                )
              ) : byPayment.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem movimentações no período.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byPayment} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 14% 18%)" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="method" tick={{ ...axisTick, fontSize: 11 }} width={120} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [money(Number(value)), "Movimentado"]} />
                      <Bar dataKey="volume" radius={[0, 6, 6, 0]}>
                        {byPayment.map((slice, index) => (
                          <Cell
                            key={slice.method}
                            fill={colorForIndex(index)}
                            onClick={() => setPaymentMethod(slice.method === "Não informada" ? paymentMethod : slice.method)}
                            className="cursor-pointer"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-2 divide-y divide-border/60" data-testid="payment-legend">
                    {byPayment.map((slice, index) => (
                      <button
                        key={slice.method}
                        type="button"
                        onClick={() => setPaymentMethod((current) => (current === slice.method ? STATEMENT_ALL : slice.method))}
                        className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:bg-accent/40"
                      >
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForIndex(index) }} />
                        <span className="flex-1 truncate">{slice.method}</span>
                        <span className="font-medium">{money(slice.volume)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>
          </div>

          <div className="dashboard-card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Movimentações · {rows.length}
              </h3>
              <span className="text-xs text-muted-foreground">Mais recentes primeiro</span>
            </div>

            <div className="flex flex-col gap-3 md:hidden" data-testid="statement-cards">
              {rows.map((transaction) => {
                const signed = signedAmount(transaction);
                const { label } = originLabel(transaction, accounts, creditCards);
                return (
                  <button
                    key={transaction.id}
                    type="button"
                    onClick={() => setViewing(transaction)}
                    className="glass-card rounded-xl p-4 text-left space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{formatDateBR(transaction.date)}</span>
                      <span className={`text-sm font-bold ${signed >= 0 ? "text-income" : "text-expense"}`}>
                        {signed >= 0 ? `+ ${money(signed)}` : `- ${money(Math.abs(signed))}`}
                      </span>
                    </div>
                    <p className="truncate text-sm font-semibold">{transaction.title}</p>
                    <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline">{transaction.category}</Badge>
                      <span>{label}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto" data-testid="statement-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((transaction) => {
                    const signed = signedAmount(transaction);
                    const { label } = originLabel(transaction, accounts, creditCards);
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap">{formatDateBR(transaction.date)}</TableCell>
                        <TableCell>
                          <button type="button" onClick={() => setViewing(transaction)} className="font-medium hover:underline text-left">
                            {transaction.title}
                          </button>
                        </TableCell>
                        <TableCell><Badge variant="outline">{transaction.category}</Badge></TableCell>
                        <TableCell className="whitespace-nowrap">{label}</TableCell>
                        <TableCell>{renderTypeBadge(transaction)}</TableCell>
                        <TableCell className="whitespace-nowrap">{transaction.paymentMethod ?? "—"}</TableCell>
                        <TableCell className={`text-right font-semibold whitespace-nowrap ${signed >= 0 ? "text-income" : "text-expense"}`}>
                          {signed >= 0 ? `+ ${money(signed)}` : `- ${money(Math.abs(signed))}`}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setViewing(transaction)} aria-label="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      <TransactionDetail transaction={viewing} open={!!viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
