import { categoryColor, paymentColor, entityColor, colorAccent } from "@/lib/chart-theme";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useFinance } from "@/contexts/FinanceContext";
import { useCategories } from "@/contexts/CategoryContext";
import { useAccounts } from "@/contexts/AccountContext";
import { Transaction, TransactionType } from "@/lib/types";
import { TransactionForm } from "@/components/TransactionForm";
import { TransactionDetail } from "@/components/TransactionDetail";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Eye, Pencil, Trash2, Search, Download, ArrowUp, ArrowDown, ArrowUpDown, ScanLine, Paperclip } from "lucide-react";
import { Link } from "react-router-dom";
import { isAdjustmentTransaction, isBillPaymentTransaction, isFinancialNeutralTransaction, isSystemInvoiceTransaction } from "@/lib/transaction-classification";
import { getInvoiceRecordTitle, getInvoiceRecordTypeLabel, shouldHideSettledInvoiceObligation } from "@/lib/invoice-record-presentation";
import { cn } from "@/lib/utils";
import { exportFinanceExcel } from "@/lib/finance-excel-report";

type SortKey = "date" | "title" | "category" | "type" | "paymentMethod" | "source" | "amount";
type SortDir = "asc" | "desc";

interface RecordsSummary {
  income: number;
  expense: number;
  neutral: number;
  count: number;
  balance: number;
}

const roundCents2 = (value: number) => Math.round(value * 100) / 100;

/** Sums the currently filtered records; neutrals are counted but never added. */
export function summarizeFilteredRecords(records: Transaction[]): RecordsSummary {
  let income = 0;
  let expense = 0;
  let neutral = 0;
  for (const record of records) {
    if (isFinancialNeutralTransaction(record)) {
      neutral += 1;
      continue;
    }
    if (record.type === "income") income += record.amount;
    else expense += record.amount;
  }
  income = roundCents2(income);
  expense = roundCents2(expense);
  return {
    income,
    expense,
    neutral,
    count: records.length,
    balance: roundCents2(income - expense),
  };
}

function RecordsFilteredSummary({
  summary,
  className,
}: {
  summary: RecordsSummary;
  className?: string;
}) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const hasIncome = summary.income > 0;
  const hasExpense = summary.expense > 0;
  const mixed = hasIncome && hasExpense;

  return (
    <div
      data-testid="records-filtered-summary"
      role="status"
      aria-label="Resumo dos registros filtrados"
      className={cn("border-t border-border bg-secondary/30 px-4 py-3", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="space-y-1">
          {mixed ? (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">
                  Total de entradas:{" "}
                  <strong className="tabular-nums text-income">{fmt(summary.income)}</strong>
                </span>
                <span className="text-muted-foreground">
                  Total de saídas:{" "}
                  <strong className="tabular-nums text-expense">{fmt(summary.expense)}</strong>
                </span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                Saldo do recorte:{" "}
                <span className={`tabular-nums ${summary.balance >= 0 ? "text-income" : "text-expense"}`}>
                  {fmt(summary.balance)}
                </span>
              </p>
            </>
          ) : hasExpense ? (
            <p className="text-sm font-semibold text-foreground">
              Total de despesas filtradas:{" "}
              <strong className="tabular-nums text-expense">{fmt(summary.expense)}</strong>
            </p>
          ) : hasIncome ? (
            <p className="text-sm font-semibold text-foreground">
              Total de entradas filtradas:{" "}
              <strong className="tabular-nums text-income">{fmt(summary.income)}</strong>
            </p>
          ) : (
            <p className="text-sm font-semibold text-foreground">
              Total filtrado:{" "}
              <strong className="tabular-nums">{fmt(0)}</strong>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Quantidade de registros: {summary.count}
            {summary.neutral > 0 &&
              ` · ${summary.neutral} movimentação(ões) neutra(s) exibida(s), sem somar em entradas/saídas`}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Soma dos registros filtrados — não é o saldo da conta bancária.
        </p>
      </div>
    </div>
  );
}

export default function Records() {
  const { transactions, creditCardInvoices, addTransaction, updateTransaction, deleteTransaction } = useFinance();
  const { allCategoryNames } = useCategories();
  const { accounts, creditCards } = useAccounts();
  const sourceColor = (t: Transaction) => {
    const item = t.accountId ? accounts.find(a => a.id === t.accountId) : creditCards.find(c => c.id === t.creditCardId);
    return entityColor(item?.id ?? t.accountId ?? t.creditCardId ?? "other", item?.color);
  };

  const sourceMap = useMemo(() => {
    const m: Record<string, string> = {};
    accounts.forEach((a) => (m[`a:${a.id}`] = a.name));
    creditCards.forEach((c) => (m[`c:${c.id}`] = `${c.name} (Cartão)`));
    return m;
  }, [accounts, creditCards]);

  const getSourceKey = (t: Transaction) =>
    t.accountId ? `a:${t.accountId}` : t.creditCardId ? `c:${t.creditCardId}` : "";
  const getSourceName = (t: Transaction) => sourceMap[getSourceKey(t)] || "—";

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>();
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "amount" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const today = new Date().toISOString().split("T")[0];
  const isBillPayment = (t: Transaction) => isBillPaymentTransaction(t);
  const isAdjustment = (t: Transaction) => isAdjustmentTransaction(t);
  const isNeutral = (t: Transaction) => isFinancialNeutralTransaction(t);
  const isForecast = (t: Transaction) => t.type === "expense" && t.date > today;
  const getDisplayTitle = (t: Transaction) => getInvoiceRecordTitle(t, creditCardInvoices, creditCards);
  const getTypeLabel = (t: Transaction) => getInvoiceRecordTypeLabel(t) || (isAdjustment(t)
    ? "Ajuste"
    : isBillPayment(t)
      ? "Pagamento de Fatura"
      : t.type === "income"
        ? "Entrada"
        : isForecast(t)
          ? "Saída - Previsão"
          : "Saída");
  const getSignedAmount = (t: Transaction) => t.type === "income" ? t.amount : -t.amount;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = transactions.filter((t) => {
      if (shouldHideSettledInvoiceObligation(t, transactions, creditCardInvoices)) return false;
      const isNeutral = isFinancialNeutralTransaction(t);
      if (typeFilter !== "all" && (isNeutral || t.type !== typeFilter)) return false;
      if (catFilter !== "all" && t.category !== catFilter) return false;
      if (sourceFilter !== "all" && getSourceKey(t) !== sourceFilter) return false;
      if (q) {
        const dateStr = new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR");
        const typeLabel = isNeutral
          ? getTypeLabel(t)
          : t.type === "income" ? "entrada" : "saída saida";
        const amountStr = t.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
        const haystack = [
          getDisplayTitle(t),
          t.title,
          t.category,
          t.description || "",
          t.paymentMethod || "",
          getSourceName(t),
          dateStr,
          typeLabel,
          amountStr,
          String(t.amount),
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "title": cmp = getDisplayTitle(a).localeCompare(getDisplayTitle(b)); break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "type": cmp = getTypeLabel(a).localeCompare(getTypeLabel(b)); break;
        case "paymentMethod": cmp = (a.paymentMethod || "").localeCompare(b.paymentMethod || ""); break;
        case "source": cmp = getSourceName(a).localeCompare(getSourceName(b)); break;
        case "amount": cmp = a.amount - b.amount; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [transactions, creditCardInvoices, creditCards, search, typeFilter, catFilter, sourceFilter, sortKey, sortDir, sourceMap]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const recordsSummary = useMemo(() => summarizeFilteredRecords(filtered), [filtered]);

  const exportToXlsx = useCallback(async () => {
    const rows = filtered.map((t) => ({
      "Data": new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR"),
      "Título": getDisplayTitle(t),
      "Categoria": t.category,
      "Tipo": getTypeLabel(t),
      "Pagamento": t.paymentMethod || "—",
      "Conta/Cartão": getSourceName(t),
      "Valor (R$)": getSignedAmount(t),
      "Descrição": t.description || "",
    }));
    const activeFilters = [
      search.trim() && `Busca: ${search.trim()}`,
      typeFilter !== "all" && `Tipo: ${typeFilter === "income" ? "Entradas" : "Saídas"}`,
      catFilter !== "all" && `Categoria: ${catFilter}`,
      sourceFilter !== "all" && `Conta/cartão: ${sourceMap[sourceFilter] || "Selecionada"}`,
    ].filter((filter): filter is string => typeof filter === "string" && filter.length > 0);

    await exportFinanceExcel({
      worksheetName: "Registros",
      fileName: `FinanceControl_Registros_${today}.xlsx`,
      title: "Meus registros",
      subtitle: `${filtered.length} registros selecionados     |     Exportado em ${new Date().toLocaleDateString("pt-BR")}`,
      filterDescription: activeFilters.join(" · ") || "Sem filtros adicionais",
      metrics: [
        { label: "Entradas", value: fmt(recordsSummary.income) },
        { label: "Saídas", value: fmt(recordsSummary.expense) },
        { label: "Saldo do recorte", value: fmt(recordsSummary.balance) },
        { label: "Registros", value: String(recordsSummary.count) },
      ],
      columns: ["Data", "Título", "Categoria", "Tipo", "Pagamento", "Conta/Cartão", "Valor (R$)", "Descrição"],
      columnWidths: [16, 38, 24, 22, 22, 29, 18, 66],
      amountColumn: "Valor (R$)",
      descriptionColumn: "Descrição",
      rows,
    });
  }, [filtered, today, sourceMap, recordsSummary, search, typeFilter, catFilter, sourceFilter, creditCardInvoices, creditCards]);
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); setEditing(undefined); setFormOpen(true); }
    if (e.key === "/") { e.preventDefault(); document.getElementById("search-records")?.focus(); }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const SortableHead = ({ col, children }: { col: SortKey; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => toggleSort(col)}
    >
      <span className="flex items-center">
        {children}
        <SortIcon col={col} />
      </span>
    </TableHead>
  );

  return (
    <div className="data-subtle mx-auto max-w-[1500px] space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div><p className="eyebrow">Histórico completo</p><h1 className="mt-1 text-2xl font-bold tracking-[-0.035em] text-foreground sm:text-3xl">Meus Registros</h1></div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={exportToXlsx}
            disabled={filtered.length === 0}
            className="gap-2 flex-1 sm:flex-none justify-center"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>Exportar</span>
          </Button>
          <Button variant="outline" asChild className="gap-2 flex-1 sm:flex-none justify-center">
            <Link to="/receipt">
              <ScanLine className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Comprovante</span>
              <span className="hidden sm:inline">Ler comprovante</span>
            </Link>
          </Button>
          <Button
            onClick={() => { setEditing(undefined); setFormOpen(true); }}
            className="gap-2 flex-1 sm:flex-none justify-center"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">Novo</span>
            <span className="hidden sm:inline">Novo Registro</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="workspace-panel flex flex-col gap-2 p-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input id="search-records" placeholder="Buscar em todas as colunas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | TransactionType)}>
            <SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="income">Entrada</SelectItem>
              <SelectItem value="expense">Saída</SelectItem>
            </SelectContent>
          </Select>
          <Select value={catFilter} onValueChange={(v) => setCatFilter(v)}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {allCategoryNames.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v)}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Conta/Cartão" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={`a:${a.id}`}>{a.name}</SelectItem>
              ))}
              {creditCards.map((c) => (
                <SelectItem key={c.id} value={`c:${c.id}`}>{c.name} (Cartão)</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table or Empty State */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum registro encontrado"
          description="Adicione seu primeiro registro financeiro para começar a acompanhar suas finanças."
          onAction={() => { setEditing(undefined); setFormOpen(true); }}
          actionLabel="Adicionar Registro"
        />
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="flex flex-col gap-2 md:hidden">
            {filtered.map((t) => (
              <div key={t.id} className="glass-card data-surface animate-fade-in space-y-2 rounded-xl p-3" style={colorAccent(categoryColor(t.category))}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="font-medium text-foreground truncate">{getDisplayTitle(t)}</p>
                      {t.hasAttachment && (
                        <Paperclip className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Possui anexo" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold whitespace-nowrap ${isNeutral(t) ? "text-muted-foreground" : t.type === "income" ? "text-income" : "text-expense"}`}>
                    {isNeutral(t) ? fmt(t.amount) : `${t.type === "income" ? "+" : "-"}${fmt(t.amount)}`}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className="data-chip text-xs" style={colorAccent(categoryColor(t.category))}>{t.category}</Badge>
                    <Badge variant={isNeutral(t) ? "secondary" : t.type === "income" ? "default" : "destructive"} className={`neutral-tag text-xs ${isNeutral(t) ? "text-muted-foreground" : isForecast(t) ? "text-warning" : t.type === "income" ? "text-income" : "text-expense"}`}>
                      {getTypeLabel(t)}
                    </Badge>
                    {t.paymentMethod && (
                      <Badge variant="outline" className="data-chip text-xs" style={colorAccent(paymentColor(t.paymentMethod))}>{t.paymentMethod}</Badge>
                    )}
                    {getSourceKey(t) && (
                      <Badge variant="outline" className="data-chip text-xs" style={colorAccent(sourceColor(t))}>{getSourceName(t)}</Badge>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewing(t)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {!isSystemInvoiceTransaction(t) && <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(t); setFormOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(t.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>}
                  </div>
                </div>
                {t.description && (
                  <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground">
                    <p className="break-words line-clamp-3">{t.description}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Mobile dynamic total — after the last card */}
          <div className="glass-card overflow-hidden rounded-xl md:hidden">
            <RecordsFilteredSummary summary={recordsSummary} className="border-t-0" />
          </div>

          {/* Desktop table */}
          <div className="glass-card rounded-xl overflow-hidden animate-fade-in hidden md:block">
            <Table>
              <TableHeader className="bg-secondary/35">
                <TableRow className="border-border hover:bg-transparent">
                  <SortableHead col="date">Data</SortableHead>
                  <SortableHead col="title">Título</SortableHead>
                  <SortableHead col="category">Categoria</SortableHead>
                  <SortableHead col="type">Tipo</SortableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors text-right" onClick={() => toggleSort("amount")}>
                    <span className="flex items-center justify-end">Valor<SortIcon col="amount" /></span>
                  </TableHead>
                  <SortableHead col="paymentMethod">Pagamento</SortableHead>
                  <SortableHead col="source">Conta/Cartão</SortableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} className="border-border transition-colors odd:bg-secondary/10 hover:bg-accent/40">
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>{getDisplayTitle(t)}</span>
                        {t.hasAttachment && (
                          <Paperclip className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Possui anexo" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="data-chip text-xs" style={colorAccent(categoryColor(t.category))}>{t.category}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={isNeutral(t) ? "secondary" : t.type === "income" ? "default" : "destructive"} className={`neutral-tag text-xs ${isNeutral(t) ? "text-muted-foreground" : isForecast(t) ? "text-warning" : t.type === "income" ? "text-income" : "text-expense"}`}>
                        {getTypeLabel(t)}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${isNeutral(t) ? "text-muted-foreground" : t.type === "income" ? "text-income" : "text-expense"}`}>
                      {isNeutral(t) ? fmt(t.amount) : `${t.type === "income" ? "+" : "-"}${fmt(t.amount)}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {t.paymentMethod ? <Badge variant="outline" className="data-chip text-xs" style={colorAccent(paymentColor(t.paymentMethod))}>{t.paymentMethod}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {getSourceKey(t) ? <Badge variant="outline" className="data-chip text-xs" style={colorAccent(sourceColor(t))}>{getSourceName(t)}</Badge> : getSourceName(t)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[240px]">
                      <span className="block truncate" title={t.description || ""}>
                        {t.description || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewing(t)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!isSystemInvoiceTransaction(t) && <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(t); setFormOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* Desktop dynamic total — visual footer of the table */}
            <RecordsFilteredSummary summary={recordsSummary} />
          </div>
        </>
      )}

      {/* Modals */}
      <TransactionForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(undefined); }}
        onSubmit={async (data, options) => {
          if (editing) {
            return updateTransaction({ ...editing, ...data, id: editing.id }, options?.attachments ? { attachments: options.attachments } : undefined);
          } else {
            return addTransaction(data, options);
          }
        }}
        initial={editing}
      />

      <TransactionDetail transaction={viewing} open={!!viewing} onClose={() => setViewing(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleting) deleteTransaction(deleting); setDeleting(null); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
