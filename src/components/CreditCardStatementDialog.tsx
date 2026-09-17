import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownLeft, RotateCcw, Download } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { buildCreditCardStatement, type CardStatementTransaction } from "@/lib/credit-card-statement";
import { getCardCommittedAmount, getCardCurrentInvoiceAmount } from "@/lib/credit-card-billing";
import { exportCreditCardStatementToExcel, exportCreditCardStatementToPdf, type CreditCardExportContext } from "@/lib/credit-card-statement-export";

interface CreditCardStatementDialogProps {
  open: boolean;
  onClose: () => void;
  card: { id: string; name: string; limit: number; closingDay: number; dueDay: number };
  transactions: CardStatementTransaction[];
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CreditCardStatementDialog({
  open,
  onClose,
  card,
  transactions,
}: CreditCardStatementDialogProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const referenceMonth = format(currentMonth, "yyyy-MM");

  const statement = useMemo(
    () =>
      buildCreditCardStatement({
        creditCardId: card.id,
        transactions,
        referenceMonth,
      }),
    [card.id, transactions, referenceMonth]
  );

  const visibleEntries = useMemo(
    () => statement.entries.filter((e) => e.sourceType !== "partial_record"),
    [statement.entries]
  );

  const hasEntries = visibleEntries.length > 0;

  const used = getCardCommittedAmount(transactions, card.id);
  const currentInvoice = getCardCurrentInvoiceAmount(transactions, card.id);
  const available = card.limit - used;
  const pct = card.limit > 0 ? Math.min((used / card.limit) * 100, 100) : 0;

  const exportCtx: CreditCardExportContext = useMemo(
    () => ({
      cardName: card.name,
      referenceMonth,
      currentInvoice,
      committedAmount: used,
      availableAmount: available,
      limit: card.limit,
      statement,
    }),
    [card.name, referenceMonth, currentInvoice, used, available, card.limit, statement]
  );

  const handleExportExcel = useCallback(() => {
    void exportCreditCardStatementToExcel(exportCtx);
  }, [exportCtx]);

  const handleExportPdf = useCallback(() => {
    exportCreditCardStatementToPdf(exportCtx);
  }, [exportCtx]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">
              Extrato — {card.name}
            </DialogTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8" disabled={!hasEntries}>
                  <Download className="h-3.5 w-3.5" />
                  <span className="text-xs">Exportar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportExcel}>
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}>
                  PDF (.pdf)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogHeader>

        {/* ── SITUAÇÃO ATUAL ── */}
        <div className="px-6 py-4 border-b border-border bg-muted/20">
          <p className="text-xs text-muted-foreground mb-3">Situação atual</p>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Fatura atual</p>
              <p className="text-sm font-semibold text-foreground">{fmt(currentInvoice)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Comprometido</p>
              <p className="text-sm font-semibold text-expense">{fmt(used)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Disponível</p>
              <p className="text-sm font-semibold text-income">{fmt(available)}</p>
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-expense transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Limite: {fmt(card.limit)}</span>
          </div>
        </div>

        {/* ── NAVEGAÇÃO MENSAL ── */}
        <div className="flex items-center justify-center gap-2 px-6 py-3 border-b border-border">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground capitalize min-w-[140px] text-center">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* ── RESUMO DO PERÍODO ── */}
        <div className="px-6 py-4 border-b border-border">
          <p className="text-xs text-muted-foreground mb-3">
            Movimentações de {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Compras</p>
              <p className="text-sm font-semibold text-expense">{fmt(statement.summary.totalPurchases)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Pagamentos</p>
              <p className="text-sm font-semibold text-income">{fmt(statement.summary.totalPayments)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Estornos</p>
              <p className="text-sm font-semibold text-income">{fmt(statement.summary.totalCredits)}</p>
            </div>
          </div>
        </div>

        {/* ── LISTA ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {visibleEntries.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>Nenhuma movimentação neste período.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleEntries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${entry.direction === "charge" ? "bg-expense/10" : "bg-income/10"}`}>
                    {entry.sourceType === "reversal" ? (
                      <RotateCcw className="h-3.5 w-3.5 text-income" />
                    ) : entry.direction === "charge" ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-expense" />
                    ) : (
                      <ArrowDownLeft className="h-3.5 w-3.5 text-income" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{entry.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(entry.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                      {entry.category && <span>· {entry.category}</span>}
                      {entry.installmentInfo && <span>· Parcela {entry.installmentInfo}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-sm font-semibold whitespace-nowrap ${entry.direction === "charge" ? "text-expense" : "text-income"}`}>
                      {entry.direction === "charge" ? "+" : "-"} {fmt(entry.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
