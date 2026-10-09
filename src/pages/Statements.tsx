import { useCallback, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, Download, Eye, FileSpreadsheet, FileText, Hash, ListFilter, Search, SlidersHorizontal, TrendingDown, TrendingUp, Wallet, X } from "lucide-react";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { useFinance } from "@/contexts/FinanceContext";
import { ChartCard } from "@/components/ChartCard";
import { TransactionDetail } from "@/components/TransactionDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import {
  CHART_GRID,
  CHART_MONEY_AXIS_WIDTH,
  CHART_SEMANTIC,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  chartColor,
  chartMoneyTick,
} from "@/lib/chart-theme";
import {
  exportStatementsToCsv,
  exportStatementsToExcel,
  exportStatementsToPdf,
  statementExportFileName,
  type StatementsExportPayload,
} from "@/lib/statements-export";

const colorForIndex = (index: number) => chartColor(index);

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const formatDateBR = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");

const tooltipStyle = CHART_TOOLTIP_STYLE;
const axisTick = CHART_TICK;

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
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const originOptions = useMemo(() => [
    { key: STATEMENT_ALL, label: "Todas" },
    ...accounts.map((account) => ({ key: originKey({ kind: "account" as const, accountId: account.id }), label: account.name })),
    ...(showCash ? [{ key: "cash", label: "Dinheiro" }] : []),
    ...creditCards.map((card) => ({ key: originKey({ kind: "card" as const, cardId: card.id }), label: `${card.name} (Cartão)` })),
  ], [accounts, creditCards, showCash]);

  const originName = originOptions.find((option) => option.key === origin)?.label ?? "Todas";

  const exportData: StatementsExportPayload = useMemo(() => {
    const summary = isCardMode
      ? [
        { label: "Compras", value: money(cardSummary.purchases) },
        { label: "Estornos / Créditos", value: money(cardSummary.refunds) },
        { label: "Total líquido", value: money(cardSummary.net) },
        { label: "Quantidade de compras", value: String(cardSummary.count) },
      ]
      : [
        { label: "Entradas", value: money(accountSummary.income) },
        { label: "Saídas", value: money(accountSummary.expense) },
        { label: "Saldo do período", value: money(accountSummary.balance) },
        { label: "Quantidade de movimentações", value: String(accountSummary.count) },
      ];
    const appliedFilters: string[] = [];
    if (typeFilter !== "all") appliedFilters.push(`Tipo: ${typeFilter === "income" ? "Entradas" : "Saídas"}`);
    if (category !== STATEMENT_ALL) appliedFilters.push(`Categoria: ${category}`);
    if (paymentMethod !== STATEMENT_ALL) appliedFilters.push(`Pagamento: ${paymentMethod}`);
    if (search.trim() !== "") appliedFilters.push(`Busca: ${search.trim()}`);
    if (minAmount !== "") appliedFilters.push(`Valor mín.: ${money(Number(minAmount))}`);
    if (maxAmount !== "") appliedFilters.push(`Valor máx.: ${money(Number(maxAmount))}`);
    return {
      originLabel: originName,
      start,
      end,
      appliedFilters,
      summary,
      categories: categories.map((slice) => ({ category: slice.category, total: slice.total, share: slice.share })),
      rows: buildStatementExportRows(rows, exportContext),
    };
  }, [isCardMode, cardSummary, accountSummary, typeFilter, category, paymentMethod, search, minAmount, maxAmount, originName, start, end, categories, rows, exportContext]);

  const handleExportExcel = useCallback(() => {
    void exportStatementsToExcel(exportData);
  }, [exportData]);
  const handleExportCsv = useCallback(() => {
    exportStatementsToCsv(exportData);
  }, [exportData]);
  const handleExportPdf = useCallback(() => {
    void exportStatementsToPdf(exportData);
  }, [exportData]);

  const clearSecondary = useCallback(() => {
    setTypeFilter("all");
    setCategory(STATEMENT_ALL);
    setPaymentMethod(STATEMENT_ALL);
    setSearch("");
    setMinAmount("");
    setMaxAmount("");
  }, []);

  const renderTypeBadge = (transaction: Transaction) => {
    if (transaction.financialKind === "card_invoice_payment") return <Badge variant="secondary">Pagamento de Fatura</Badge>;
    return transaction.type === "income"
      ? <Badge variant="default">Entrada</Badge>
      : <Badge variant="destructive">Saída</Badge>;
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 pb-4 sm:space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Histórico financeiro</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.035em] text-foreground sm:text-3xl">Extratos</h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground sm:text-sm">Investigue cada movimento e encontre padrões no seu dinheiro.</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={rows.length === 0} className="h-9 gap-2 rounded-lg bg-card">
              <Download className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportPdf}>
              <FileText className="h-4 w-4" /> Exportar PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportCsv}>
              <FileText className="h-4 w-4" /> Exportar CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button type="button" onClick={() => setFiltersOpen((open) => !open)} className="workspace-panel flex w-full items-center justify-between p-3 text-left xl:hidden">
        <span className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="h-4 w-4 text-primary" />Filtros e período</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
      </button>

      <div className="grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className={`${filtersOpen ? "block" : "hidden"} workspace-panel space-y-4 p-4 xl:sticky xl:top-20 xl:block`}>
        <div className="flex items-center justify-between border-b border-border/70 pb-3"><div><p className="eyebrow">Refinar</p><h2 className="mt-0.5 text-base font-bold">Consulta</h2></div><ListFilter className="h-4 w-4 text-primary" /></div>
        <div className="grid grid-cols-1 gap-3">
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
        <div className="flex flex-wrap gap-1">
          {([
            ["today", "Hoje"],
            ["7d", "7 dias"],
            ["month", "Este mês"],
            ["prevMonth", "Mês anterior"],
            ["30d", "30 dias"],
            ["90d", "90 dias"],
            ["year", "Este ano"],
          ] as [PeriodShortcut, string][]).map(([key, label]) => (
            <Button key={key} type="button" variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[10px]" onClick={() => applyShortcut(key)}>
              {label}
            </Button>
          ))}
        </div>
        {!periodValid && (
          <p className="text-sm text-destructive">Período inválido: a data inicial é posterior à data final.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
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

        <div className="grid grid-cols-1 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar título, descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-3">
            <Input type="number" min="0" placeholder="Valor mín." value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
            <Input type="number" min="0" placeholder="Valor máx." value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap border-t border-border/70 pt-3">
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
            {(typeFilter !== "all" || paymentMethod !== STATEMENT_ALL || search.trim() !== "" || minAmount !== "" || maxAmount !== "") && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSecondary}>
                Limpar filtros
              </Button>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">

      {isCardMode ? (
        <section className="workspace-panel grid overflow-hidden grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Compras", value: money(cardSummary.purchases), icon: TrendingDown, tone: "text-expense" },
            { label: "Estornos / Créditos", value: money(cardSummary.refunds), icon: TrendingUp, tone: "text-income" },
            { label: "Total líquido", value: money(cardSummary.net), icon: Wallet, tone: cardSummary.net < 0 ? "text-expense" : "text-foreground" },
            { label: "Qtd. compras", value: String(cardSummary.count), icon: Hash, tone: "text-foreground" },
          ].map((item) => <div key={item.label} className="border-b border-r border-border/70 p-3.5 last:border-r-0 lg:border-b-0"><div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{item.label}</span><item.icon className={`h-3.5 w-3.5 ${item.tone}`} /></div><p className={`mt-2 font-display text-lg font-bold tracking-tight ${item.tone}`}>{item.value}</p></div>)}
        </section>
      ) : (
        <section className="workspace-panel grid overflow-hidden grid-cols-2 lg:grid-cols-[1fr_1fr_1.25fr_0.75fr]">
          {[
            { label: "Entradas", value: money(accountSummary.income), icon: TrendingUp, tone: "text-income" },
            { label: "Saídas", value: money(accountSummary.expense), icon: TrendingDown, tone: "text-expense" },
            { label: "Saldo do período", value: money(accountSummary.balance), icon: Wallet, tone: accountSummary.balance < 0 ? "text-expense" : "text-primary", featured: true },
            { label: "Movimentações", value: String(accountSummary.count), icon: Hash, tone: "text-foreground" },
          ].map((item) => <div key={item.label} className={`${item.featured ? "bg-primary/[0.06]" : ""} border-b border-r border-border/70 p-3.5 last:border-r-0 lg:border-b-0`}><div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{item.label}</span><item.icon className={`h-3.5 w-3.5 ${item.tone}`} /></div><p className={`mt-2 font-display text-lg font-bold tracking-tight ${item.tone}`}>{item.value}</p></div>)}
        </section>
      )}

      {rows.length === 0 ? (
        <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma movimentação encontrada para os filtros selecionados.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Por categoria">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem saídas no período.</p>
              ) : (
                <>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={190}>
                      <RechartsPieChart>
                        <Pie
                          data={categories}
                          dataKey="total"
                          nameKey="category"
                          innerRadius={55}
                          outerRadius={88}
                          paddingAngle={2}
                            stroke="hsl(var(--card))"
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
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={daily} margin={{ left: 4, right: 12, top: 8 }}>
                  <defs>
                    <linearGradient id="statementIncomeFill" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="0%" stopColor={CHART_SEMANTIC.income} stopOpacity={0.35} />
                       <stop offset="100%" stopColor={CHART_SEMANTIC.income} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="statementExpenseFill" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="0%" stopColor={CHART_SEMANTIC.expense} stopOpacity={0.32} />
                       <stop offset="100%" stopColor={CHART_SEMANTIC.expense} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                   <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" minTickGap={28} tickMargin={8} />
                  <YAxis tick={axisTick} width={CHART_MONEY_AXIS_WIDTH} tickFormatter={chartMoneyTick} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "#f8fafc", fontWeight: 600, marginBottom: 4 }}
                    formatter={(value: number, name: string) => [money(Number(value)), name]}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    name={isCardMode ? "Estornos" : "Entradas"}
                     stroke={CHART_SEMANTIC.income}
                    strokeWidth={2.5}
                    fill="url(#statementIncomeFill)"
                    dot={false}
                     activeDot={{ r: 4, fill: CHART_SEMANTIC.income, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    name={isCardMode ? "Compras" : "Saídas"}
                     stroke={CHART_SEMANTIC.expense}
                    strokeWidth={2.5}
                    fill="url(#statementExpenseFill)"
                    dot={false}
                     activeDot={{ r: 4, fill: CHART_SEMANTIC.expense, strokeWidth: 0 }}
                  />
                </AreaChart>
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
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/50"
                    >
                      <span className={`h-8 w-1 shrink-0 rounded-full ${signed >= 0 ? "bg-income/70" : "bg-expense/70"}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-medium">{transaction.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {formatDateBR(transaction.date)}
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{transaction.category}</span>
                        </span>
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${signed >= 0 ? "text-income" : "text-expense"}`}>
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
                    <ResponsiveContainer width="100%" height={Math.max(200, byOrigin.length * 46)}>
                      <BarChart data={byOrigin} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }} barCategoryGap="28%">
                         <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="label" tick={{ ...axisTick, fontSize: 11 }} width={120} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [money(Number(value)), "Movimentado"]} cursor={{ fill: "hsl(224 14% 22% / 0.35)" }} />
                          <Bar dataKey="volume" radius={[4, 8, 8, 4]} background={{ fill: "hsl(215 18% 15%)", radius: 8 } as never}>
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
                    <ResponsiveContainer width="100%" height={Math.max(200, byPayment.length * 46)}>
                      <BarChart data={byPayment} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }} barCategoryGap="28%">
                         <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="method" tick={{ ...axisTick, fontSize: 11 }} width={120} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [money(Number(value)), "Movimentado"]} cursor={{ fill: "hsl(224 14% 22% / 0.35)" }} />
                          <Bar dataKey="volume" radius={[4, 8, 8, 4]} background={{ fill: "hsl(215 18% 15%)", radius: 8 } as never}>
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

          <section className="workspace-panel overflow-hidden p-3.5 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Movimentações · {rows.length}
              </h3>
              <span className="text-xs text-muted-foreground">{sort === "date-desc" ? "Mais recentes primeiro" : sort === "date-asc" ? "Mais antigas primeiro" : sort === "amount-desc" ? "Maiores valores primeiro" : "Menores valores primeiro"}</span>
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
                    className="rounded-xl border border-border/80 bg-secondary/20 p-3 text-left transition-transform active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{formatDateBR(transaction.date)}</span>
                      <span className={`text-sm font-bold ${signed >= 0 ? "text-income" : "text-expense"}`}>
                        {signed >= 0 ? `+ ${money(signed)}` : `- ${money(Math.abs(signed))}`}
                      </span>
                    </div>
                    <p className="truncate text-sm font-semibold">{transaction.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline" className="border-primary/30 bg-primary/[0.06]">{transaction.category}</Badge>
                      <span>{label}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60" data-testid="statement-table">
              <Table className="[&_thead]:bg-muted/50">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide">Data</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Descrição</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Categoria</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Origem</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Tipo</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Pagamento</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Valor</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((transaction) => {
                    const signed = signedAmount(transaction);
                    const { label } = originLabel(transaction, accounts, creditCards);
                    return (
                      <TableRow key={transaction.id} className="transition-colors hover:bg-accent/40">
                        <TableCell className="whitespace-nowrap tabular-nums">{formatDateBR(transaction.date)}</TableCell>
                        <TableCell>
                          <button type="button" onClick={() => setViewing(transaction)} className="font-medium hover:underline text-left">
                            {transaction.title}
                          </button>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="border-primary/30 bg-primary/[0.06] font-medium">{transaction.category}</Badge></TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="secondary" className="font-normal">{label}</Badge>
                        </TableCell>
                        <TableCell>{renderTypeBadge(transaction)}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{transaction.paymentMethod ?? "—"}</TableCell>
                        <TableCell className={`text-right font-bold tabular-nums whitespace-nowrap ${signed >= 0 ? "text-income" : "text-expense"}`}>
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
          </section>
        </>
      )}
      </div>
      </div>

      <TransactionDetail transaction={viewing} open={!!viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
