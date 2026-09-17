import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, Download } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { buildAccountStatement, type StatementTransaction, type StatementTransfer, type StatementAccount } from "@/lib/account-statement";
import { exportAccountStatementToExcel, exportAccountStatementToPdf, type ExportContext } from "@/lib/account-statement-export";

interface AccountStatementDialogProps {
  open: boolean;
  onClose: () => void;
  account: { id: string; name: string; initialBalance: number };
  currentBalance: number;
  transactions: StatementTransaction[];
  transfers: StatementTransfer[];
  accounts: StatementAccount[];
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AccountStatementDialog({
  open,
  onClose,
  account,
  currentBalance,
  transactions,
  transfers,
  accounts,
}: AccountStatementDialogProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const referenceMonth = format(currentMonth, "yyyy-MM");

  const statement = useMemo(
    () =>
      buildAccountStatement({
        accountId: account.id,
        transactions,
        transfers,
        accounts,
        referenceMonth,
      }),
    [account.id, transactions, transfers, accounts, referenceMonth]
  );

  const hasEntries = statement.entries.length > 0;

  const exportCtx: ExportContext = useMemo(
    () => ({ accountName: account.name, referenceMonth, currentBalance, statement }),
    [account.name, referenceMonth, currentBalance, statement]
  );

  const handleExportExcel = useCallback(() => {
    void exportAccountStatementToExcel(exportCtx);
  }, [exportCtx]);

  const handleExportPdf = useCallback(() => {
    exportAccountStatementToPdf(exportCtx);
  }, [exportCtx]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">
              Extrato — {account.name}
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

        <div className="px-6 py-4 border-b border-border bg-muted/20">
          <p className="text-xs text-muted-foreground mb-1">Saldo atual</p>
          <p className={`text-lg font-bold ${currentBalance >= 0 ? "text-income" : "text-expense"}`}>
            {fmt(currentBalance)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Entradas</p>
            <p className="text-sm font-semibold text-income">{fmt(statement.summary.totalIn)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Saídas</p>
            <p className="text-sm font-semibold text-expense">{fmt(statement.summary.totalOut)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Movimentação</p>
            <p className={`text-sm font-semibold ${statement.summary.netMovement >= 0 ? "text-income" : "text-expense"}`}>
              {fmt(statement.summary.netMovement)}
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {statement.entries.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>Nenhuma movimentação neste mês.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {statement.entries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${entry.direction === "in" ? "bg-income/10" : "bg-expense/10"}`}>
                    {entry.direction === "in" ? (
                      <ArrowDownLeft className="h-3.5 w-3.5 text-income" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5 text-expense" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{entry.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(entry.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                      {entry.category && <span>· {entry.category}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-sm font-semibold whitespace-nowrap ${entry.direction === "in" ? "text-income" : "text-expense"}`}>
                      {entry.direction === "in" ? "+" : "-"} {fmt(entry.amount)}
                    </span>
                    {entry.balanceAfter != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Saldo: {fmt(entry.balanceAfter)}
                      </p>
                    )}
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