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
import { Plus, Eye, Pencil, Trash2, Search, Download, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import * as XLSX from "xlsx";

type SortKey = "date" | "title" | "category" | "type" | "paymentMethod" | "amount";
type SortDir = "asc" | "desc";

export default function Records() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useFinance();
  const { allCategoryNames } = useCategories();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [catFilter, setCatFilter] = useState<string>("all");

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

  const filtered = useMemo(() => {
    const list = transactions.filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (catFilter !== "all" && t.category !== catFilter) return false;
      return true;
    });

    return list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "type": cmp = a.type.localeCompare(b.type); break;
        case "paymentMethod": cmp = (a.paymentMethod || "").localeCompare(b.paymentMethod || ""); break;
        case "amount": cmp = a.amount - b.amount; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [transactions, search, typeFilter, catFilter, sortKey, sortDir]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const today = new Date().toISOString().split("T")[0];
  const isForecast = (t: Transaction) => t.type === "expense" && t.date > today;

  const exportToXlsx = useCallback(() => {
    const data = filtered.map((t) => ({
      "Data": new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR"),
      "Título": t.title,
      "Categoria": t.category,
      "Tipo": t.type === "income" ? "Entrada" : (t.date > today ? "Saída - Previsão" : "Saída"),
      "Pagamento": t.paymentMethod || "—",
      "Valor (R$)": t.type === "income" ? t.amount : -t.amount,
      "Descrição": t.description || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 15 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registros");
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    ws["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
    XLSX.writeFile(wb, `registros_${new Date().toISOString().split("T")[0]}.xlsx`);
  }, [filtered]);

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
    <div className="space-y-4 sm:space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Meus Registros</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={exportToXlsx} disabled={filtered.length === 0} className="gap-2 flex-1 sm:flex-none">
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button onClick={() => { setEditing(undefined); setFormOpen(true); }} className="gap-2 flex-1 sm:flex-none">
            <Plus className="h-4 w-4" /> Novo Registro
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input id="search-records" placeholder="Buscar por título..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-3">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="income">Entrada</SelectItem>
              <SelectItem value="expense">Saída</SelectItem>
            </SelectContent>
          </Select>
          <Select value={catFilter} onValueChange={(v) => setCatFilter(v)}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {allCategoryNames.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
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
          <div className="flex flex-col gap-3 md:hidden">
            {filtered.map((t) => (
              <div key={t.id} className="glass-card rounded-xl p-4 animate-fade-in space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold whitespace-nowrap ${t.type === "income" ? "text-income" : "text-expense"}`}>
                    {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{t.category}</Badge>
                    <Badge variant={t.type === "income" ? "default" : "destructive"} className={`text-xs ${isForecast(t) ? "bg-amber-500/80 hover:bg-amber-500" : ""}`}>
                      {t.type === "income" ? "Entrada" : isForecast(t) ? "Saída - Previsão" : "Saída"}
                    </Badge>
                    {t.paymentMethod && (
                      <Badge variant="secondary" className="text-xs">{t.paymentMethod}</Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewing(t)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(t); setFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(t.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="glass-card rounded-xl overflow-hidden animate-fade-in hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <SortableHead col="date">Data</SortableHead>
                  <SortableHead col="title">Título</SortableHead>
                  <SortableHead col="category">Categoria</SortableHead>
                  <SortableHead col="type">Tipo</SortableHead>
                  <SortableHead col="paymentMethod">Pagamento</SortableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors text-right" onClick={() => toggleSort("amount")}>
                    <span className="flex items-center justify-end">Valor<SortIcon col="amount" /></span>
                  </TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} className="border-border transition-colors">
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{t.title}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{t.category}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={t.type === "income" ? "default" : "destructive"} className={`text-xs ${isForecast(t) ? "bg-amber-500/80 hover:bg-amber-500" : ""}`}>
                        {t.type === "income" ? "Entrada" : isForecast(t) ? "Saída - Previsão" : "Saída"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {t.paymentMethod || "—"}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${t.type === "income" ? "text-income" : "text-expense"}`}>
                      {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setViewing(t)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setFormOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(t.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Modals */}
      <TransactionForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(undefined); }}
        onSubmit={(data) => {
          if (editing) {
            updateTransaction({ ...data, id: editing.id });
          } else {
            addTransaction(data);
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
