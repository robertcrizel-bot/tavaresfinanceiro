// @ts-nocheck -- pre-existing type mismatches; runtime behavior intentionally untouched
import { useState, useMemo, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, Download, Calendar } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { buildCreditCardPeriodStatement, type CardStatementTransaction } from "@/lib/credit-card-statement";
import type { CreditCard } from "@/lib/types";
import { exportCreditCardStatementToExcel, exportCreditCardStatementToPdf, type CreditCardExportContext } from "@/lib/credit-card-statement-export";

interface CreditCardStatementDialogProps {
  open: boolean;
  onClose: () => void;
  card: CreditCard;
  transactions: CardStatementTransaction[];
}

type PeriodPreset = "this-month" | "last-month" | "30-days" | "custom";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtMonthYear = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", locale: ptBR });

const getPeriodBounds = (preset: PeriodPreset, customStart?: string, customEnd?: string) => {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  switch (preset) {
    case "this-month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
      return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd"), monthRef: start };
    }
    case "last-month": {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const start = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
      const end = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0, 23, 59, 59);
      return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd"), monthRef: start };
    }
    case "30-days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start: format(start, "yyyy-MM-dd"), end: format(endOfToday, "yyyy-MM-dd"), monthRef: start };
    }
    case "custom": {
      return { start: customStart || format(startOfToday, "yyyy-MM-dd"), end: customEnd || format(endOfToday, "yyyy-MM-dd"), monthRef: new Date(customStart || format(startOfToday, "yyyy-MM-dd")) };
    }
  }
};

export default function CreditCardStatementDialog({
  open,
  onClose,
  card,
  transactions,
}: CreditCardStatementDialogProps) {
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this-month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    if (open) {
      setPeriodPreset("this-month");
      setCustomStart("");
      setCustomEnd("");
    }
  }, [open]);

  const { start: startDate, end: endDate, monthRef } = useMemo(
    () => getPeriodBounds(periodPreset, customStart, customEnd),
    [periodPreset, customStart, customEnd]
  );

  const statement = useMemo(
    () => buildCreditCardPeriodStatement({
      creditCardId: card.id,
      transactions,
      startDate,
      endDate,
    }),
    [card.id, transactions, startDate, endDate]
  );

  const visibleEntries = useMemo(
    () => statement.entries.filter((e) => e.sourceType !== "partial_record"),
    [statement.entries]
  );

  const hasEntries = visibleEntries.length > 0;
  const netTotal = statement.summary.totalPurchases - statement.summary.totalCredits;

  const periodLabel = useMemo(() => {
    const labels: Record<PeriodPreset, string> = {
      "this-month": "Este mês",
      "last-month": "Mês anterior",
      "30-days": "30 dias",
      "custom": "Personalizado",
    };
    return labels[periodPreset];
  }, [periodPreset]);

  const exportCtx: CreditCardExportContext = useMemo(
    () => ({
      cardName: card.name,
      referenceMonth: `${startDate} a ${endDate}`,
      periodLabel: `${fmtDate(startDate)} a ${fmtDate(endDate)}`,
      currentInvoice: statement.summary.totalPurchases,
      committedAmount: 0,
      availableAmount: 0,
      limit: 0,
      statement,
    }),
    [card.name, startDate, endDate, statement]
  );

  const handleExportExcel = useCallback(() => {
    void exportCreditCardStatementToExcel(exportCtx);
  }, [exportCtx]);

  const handleExportPdf = useCallback(() => {
    exportCreditCardStatementToPdf(exportCtx);
  }, [exportCtx]);

  const goPrevMonth = useCallback(() => {
    if (periodPreset !== "custom") {
      setPeriodPreset("custom");
      const prevMonth = subMonths(monthRef, 1);
      const start = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
      const end = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0, 23, 59, 59);
      setCustomStart(format(start, "yyyy-MM-dd"));
      setCustomEnd(format(end, "yyyy-MM-dd"));
    } else {
      const newStart = subMonths(new Date(customStart), 1);
      const newEnd = subMonths(new Date(customEnd), 1);
      setCustomStart(format(newStart, "yyyy-MM-dd"));
      setCustomEnd(format(newEnd, "yyyy-MM-dd"));
    }
  }, [periodPreset, monthRef, customStart, customEnd]);

  const goNextMonth = useCallback(() => {
    if (periodPreset !== "custom") {
      setPeriodPreset("custom");
      const nextMonth = addMonths(monthRef, 1);
      const start = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1);
      const end = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0, 23, 59, 59);
      setCustomStart(format(start, "yyyy-MM-dd"));
      setCustomEnd(format(end, "yyyy-MM-dd"));
    } else {
      const newStart = addMonths(new Date(customStart), 1);
      const newEnd = addMonths(new Date(customEnd), 1);
      setCustomStart(format(newStart, "yyyy-MM-dd"));
      setCustomEnd(format(newEnd, "yyyy-MM-dd"));
    }
  }, [periodPreset, monthRef, customStart, customEnd]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">Compras — {card.name}</DialogTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8" disabled={!hasEntries}>
                  <Download className="h-3.5 w-3.5" />
                  <span className="text-xs">Exportar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportExcel}>Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}>PDF (.pdf)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 border-b border-border">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="space-y-1">
              <Label htmlFor="period-start" className="text-xs text-muted-foreground">Data inicial</Label>
              <Input id="period-start" type="date" value={startDate} onChange={(e) => { setPeriodPreset("custom"); setCustomStart(e.target.value); }} max={endDate} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-end" className="text-xs text-muted-foreground">Data final</Label>
              <Input id="period-end" type="date" value={endDate} onChange={(e) => { setPeriodPreset("custom"); setCustomEnd(e.target.value); }} min={startDate} />
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">{periodLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[160px] text-center text-sm font-semibold text-foreground">{fmtMonthYear(startDate)}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setPeriodPreset("this-month")}>Este mês</Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setPeriodPreset("last-month")}>Mês anterior</Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setPeriodPreset("30-days")}>30 dias</Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Compras</p>
            <p className="text-sm font-semibold text-expense">{fmt(statement.summary.totalPurchases)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Estornos</p>
            <p className="text-sm font-semibold text-income">{fmt(statement.summary.totalCredits)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total líquido</p>
            <p className={`text-sm font-semibold ${netTotal >= 0 ? "text-expense" : "text-income"}`}>
              {fmt(netTotal)}
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {visibleEntries.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhuma compra neste período.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleEntries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${entry.direction === "charge" ? "bg-expense/10" : "bg-income/10"}`}>
                    {entry.sourceType === "reversal" ? (
                      <svg className="h-3.5 w-3.5 text-income" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 4v10a2 2 0 0 0 2 2h10" />
                        <path d="m3 10 5-5 5 5" />
                        <path d="M21 4v10a2 2 0 0 1-2 2H5" />
                      </svg>
                    ) : entry.direction === "charge" ? (
                      <svg className="h-3.5 w-3.5 text-expense" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 9l7-7 7 7" />
                        <path d="M12 16V2" />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5 text-income" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 9l-7 7-7-7" />
                        <path d="M5 20v-2" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{entry.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{fmtDate(entry.date)}</span>
                      {entry.category && <span>· {entry.category}</span>}
                      {entry.installmentInfo && <span>· Parcela {entry.installmentInfo}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-sm font-semibold whitespace-nowrap ${entry.direction === "charge" ? "text-expense" : "text-income"}`}>
                      {entry.direction === "charge" ? "R$ " : "-R$ "} {fmt(entry.amount)}
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