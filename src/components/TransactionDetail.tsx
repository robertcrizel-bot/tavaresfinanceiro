import { useEffect, useState } from "react";
import { Transaction } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isAdjustmentTransaction, isBillPaymentTransaction, isFinancialNeutralTransaction } from "@/lib/transaction-classification";
import { supabase } from "@/integrations/supabase/client";
import { useFinance } from "@/contexts/FinanceContext";
import { toast } from "@/hooks/use-toast";
import { FileIcon, ImageIcon, Download, Trash2 } from "lucide-react";

interface TransactionDetailProps {
  transaction: Transaction | null;
  open: boolean;
  onClose: () => void;
}

interface AttachmentRow {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size: number | null;
}

export function TransactionDetail({ transaction, open, onClose }: TransactionDetailProps) {
  const { refetch } = useFinance();
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!transaction || !open) { setAttachments([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("transaction_attachments")
        .select("id, file_path, file_name, mime_type, size")
        .eq("transaction_id", transaction.id)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        if (error) toast({ title: "Erro ao carregar anexos", description: error.message, variant: "destructive" });
        setAttachments(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [transaction, open]);

  if (!transaction) return null;

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const isBillPayment = isBillPaymentTransaction(transaction);
  const isAdjustment = isAdjustmentTransaction(transaction);
  const isNeutral = isFinancialNeutralTransaction(transaction);

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("transaction-attachments")
      .createSignedUrl(path, 60 * 10);
    if (error || !data) {
      toast({ title: "Erro ao abrir anexo", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const removeAttachment = async (att: AttachmentRow) => {
    const { error: stErr } = await supabase.storage.from("transaction-attachments").remove([att.file_path]);
    if (stErr) {
      toast({ title: "Erro ao excluir arquivo", description: stErr.message, variant: "destructive" });
      return;
    }
    const { error: dbErr } = await supabase.from("transaction_attachments").delete().eq("id", att.id);
    if (dbErr) {
      toast({ title: "Erro ao excluir anexo", description: dbErr.message, variant: "destructive" });
      return;
    }
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    refetch();
    toast({ title: "Anexo removido" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Registro</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">{transaction.title}</h3>
            <Badge variant={isNeutral ? "secondary" : transaction.type === "income" ? "default" : "destructive"}>
              {isAdjustment ? "Ajuste" : isBillPayment ? "Pagamento de Fatura" : transaction.type === "income" ? "Entrada" : "Saída"}
            </Badge>
          </div>
          <p className={`text-2xl font-bold ${isNeutral ? "text-muted-foreground" : transaction.type === "income" ? "text-income" : "text-expense"}`}>
            {isNeutral ? fmt(transaction.amount) : `${transaction.type === "income" ? "+" : "-"}${fmt(transaction.amount)}`}
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
            {transaction.paymentMethod && (
              <div>
                <span className="text-muted-foreground">Forma de Pagamento</span>
                <p className="text-foreground">{transaction.paymentMethod}</p>
              </div>
            )}
          </div>
          {transaction.description && (
            <div className="text-sm">
              <span className="text-muted-foreground">Descrição</span>
              <p className="text-foreground">{transaction.description}</p>
            </div>
          )}
          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">Anexos</span>
            {loading ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum anexo.</p>
            ) : (
              <ul className="space-y-1">
                {attachments.map((a) => {
                  const isImage = a.mime_type?.startsWith("image/");
                  return (
                    <li key={a.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
                      <span className="flex items-center gap-2 truncate">
                        {isImage ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <FileIcon className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate">{a.file_name}</span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => openFile(a.file_path)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeAttachment(a)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
