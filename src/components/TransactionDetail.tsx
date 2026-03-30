import { Transaction } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface TransactionDetailProps {
  transaction: Transaction | null;
  open: boolean;
  onClose: () => void;
}

export function TransactionDetail({ transaction, open, onClose }: TransactionDetailProps) {
  if (!transaction) return null;

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Detalhes do Registro</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">{transaction.title}</h3>
            <Badge variant={transaction.type === "income" ? "default" : "destructive"}>
              {transaction.type === "income" ? "Entrada" : "Saída"}
            </Badge>
          </div>
          <p className={`text-2xl font-bold ${transaction.type === "income" ? "text-income" : "text-expense"}`}>
            {transaction.type === "income" ? "+" : "-"}{fmt(transaction.amount)}
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Categoria</span>
              <p className="text-foreground">{transaction.category}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Data</span>
              <p className="text-foreground">
                {new Date(transaction.date + "T12:00:00").toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
          {transaction.description && (
            <div className="text-sm">
              <span className="text-muted-foreground">Descrição</span>
              <p className="text-foreground">{transaction.description}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
