import { useEffect, useState } from "react";
import { Transaction } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isAdjustmentTransaction, isBillPaymentTransaction, isFinancialNeutralTransaction } from "@/lib/transaction-classification";
import { supabase } from "@/integrations/supabase/client";
import { useFinance } from "@/contexts/FinanceContext";
import { useAccounts } from "@/contexts/AccountContext";
import { toast } from "@/hooks/use-toast";
import { FileIcon, ImageIcon, Download, Eye, Trash2 } from "lucide-react";

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

const formatTaxId = (value: string) => {
  if (/^(cnpj|cpf)\b/i.test(value.trim())) return value.trim();
  const digits = value.replace(/\D/g, "");
  if (digits.length === 14) {
    return `CNPJ ${digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}`;
  }
  if (digits.length === 11) {
    return `CPF ${digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")}`;
  }
  return value;
};

const isAdditionalReceiptLine = (line: string) =>
  /\b(?:pagamento|cart[aã]o|cr[eé]dito|d[eé]bito|pix|dinheiro|boleto|transfer[eê]ncia|bandeira|final|visa|mastercard|elo|amex|hipercard|parcelad[oa]|[àa] vista|troco|desconto|acr[eé]scimo|tributos?|diverg[eê]ncia)\b/i.test(line);

const isReceiptIdLine = (line: string) => /^id do comprovante:/i.test(line);

const splitReceiptDescription = (description?: string) => {
  const lines = (description ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const itemsHeadingIndex = lines.findIndex((line) => /^itens(?: da compra)?:$/i.test(line));

  if (itemsHeadingIndex < 0) {
    return { hasItemsHeading: false, itemLines: [] as string[], additionalLines: lines.filter((line) => !isReceiptIdLine(line)) };
  }

  const itemLines: string[] = [];
  const additionalLines = lines.slice(0, itemsHeadingIndex).filter((line) => !isReceiptIdLine(line));
  let readingAdditionalInfo = false;

  for (const line of lines.slice(itemsHeadingIndex + 1)) {
    if (isReceiptIdLine(line)) continue;
    if (/^informa(?:ç|c)[oõ]es adicionais:$/i.test(line)) {
      readingAdditionalInfo = true;
      continue;
    }
    if (readingAdditionalInfo || isAdditionalReceiptLine(line)) {
      readingAdditionalInfo = true;
      additionalLines.push(line);
    } else {
      itemLines.push(line);
    }
  }

  return { hasItemsHeading: true, itemLines, additionalLines };
};

export function TransactionDetail({ transaction, open, onClose }: TransactionDetailProps) {
  const { refetch } = useFinance();
  const { accounts, creditCards } = useAccounts();
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!transaction || !open) {
      setAttachments([]);
      setPreviewUrls({});
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("transaction_attachments")
        .select("id, file_path, file_name, mime_type, size")
        .eq("transaction_id", transaction.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (error) {
        toast({ title: "Erro ao carregar anexos", description: error.message, variant: "destructive" });
        setAttachments([]);
        setLoading(false);
        return;
      }

      const rows = data || [];
      setAttachments(rows);
      const imageRows = rows.filter((attachment) => attachment.mime_type?.startsWith("image/"));
      const signedPreviews = await Promise.all(
        imageRows.map(async (attachment) => {
          const { data: signed } = await supabase.storage
            .from("transaction-attachments")
            .createSignedUrl(attachment.file_path, 60 * 10);
          return [attachment.id, signed?.signedUrl] as const;
        }),
      );

      if (!cancelled) {
        setPreviewUrls(Object.fromEntries(signedPreviews.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))));
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [transaction, open]);

  if (!transaction) return null;

  const fmt = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const isBillPayment = isBillPaymentTransaction(transaction);
  const isAdjustment = isAdjustmentTransaction(transaction);
  const isNeutral = isFinancialNeutralTransaction(transaction);
  const account = accounts.find((item) => item.id === transaction.accountId);
  const creditCard = creditCards.find((item) => item.id === transaction.creditCardId);
  const receipt = transaction.receiptDetails;
  const separatedDescription = splitReceiptDescription(transaction.description);
  const hasCardDetails = Boolean(receipt?.cardBrand || receipt?.cardLastFour);
  const shouldSeparateDescription = separatedDescription.hasItemsHeading || hasCardDetails;
  const hasSeparatedDescription = separatedDescription.itemLines.length > 0 || separatedDescription.additionalLines.length > 0 || hasCardDetails;
  const hasReceiptDetails = Boolean(
    receipt?.merchantName || receipt?.taxId || receipt?.fiscalDocumentNumber || transaction.receiptRef,
  );

  const createFileUrl = async (attachment: AttachmentRow, download = false) => {
    const { data, error } = await supabase.storage
      .from("transaction-attachments")
      .createSignedUrl(
        attachment.file_path,
        60 * 10,
        download ? { download: attachment.file_name } : undefined,
      );
    if (error || !data) {
      toast({ title: "Erro ao abrir anexo", description: error?.message, variant: "destructive" });
      return null;
    }
    return data.signedUrl;
  };

  const openFile = async (attachment: AttachmentRow) => {
    const url = await createFileUrl(attachment);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const downloadFile = async (attachment: AttachmentRow) => {
    const url = await createFileUrl(attachment, true);
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const removeAttachment = async (attachment: AttachmentRow) => {
    const { error: storageError } = await supabase.storage.from("transaction-attachments").remove([attachment.file_path]);
    if (storageError) {
      toast({ title: "Erro ao excluir arquivo", description: storageError.message, variant: "destructive" });
      return;
    }
    const { error: databaseError } = await supabase.from("transaction_attachments").delete().eq("id", attachment.id);
    if (databaseError) {
      toast({ title: "Erro ao excluir anexo", description: databaseError.message, variant: "destructive" });
      return;
    }
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    setPreviewUrls((current) => {
      const next = { ...current };
      delete next[attachment.id];
      return next;
    });
    refetch();
    toast({ title: "Anexo removido" });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Registro</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1 rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:gap-4">
              <h3 className="min-w-0 break-words text-lg font-semibold text-foreground">{transaction.title}</h3>
              <Badge className="shrink-0" variant={isNeutral ? "secondary" : transaction.type === "income" ? "default" : "destructive"}>
                {isAdjustment ? "Ajuste" : isBillPayment ? "Pagamento de Fatura" : transaction.type === "income" ? "Entrada" : "Saída"}
              </Badge>
            </div>
            <p className={`text-2xl font-bold ${isNeutral ? "text-muted-foreground" : transaction.type === "income" ? "text-income" : "text-expense"}`}>
              {isNeutral ? fmt(transaction.amount) : `${transaction.type === "income" ? "+" : "-"}${fmt(transaction.amount)}`}
            </p>
          </div>

          <section className="space-y-3 text-sm">
            <h4 className="font-semibold text-foreground">Informações do registro</h4>
            <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Categoria</dt>
                <dd className="break-words font-medium text-foreground">{transaction.category}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Data</dt>
                <dd className="break-words font-medium text-foreground">{new Date(transaction.date + "T12:00:00").toLocaleDateString("pt-BR")}</dd>
              </div>
              {transaction.paymentMethod && (
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Pagamento</dt>
                  <dd className="break-words font-medium text-foreground">{transaction.paymentMethod}</dd>
                </div>
              )}
              {creditCard && (
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Cartão</dt>
                  <dd className="break-words font-medium text-foreground">{creditCard.name}</dd>
                </div>
              )}
              {account && (
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Conta</dt>
                  <dd className="break-words font-medium text-foreground">{account.name}</dd>
                </div>
              )}
            </dl>
          </section>

          {(transaction.description || hasCardDetails) && (
            <section className="space-y-2 text-sm">
              <h4 className="font-semibold text-foreground">Descrição</h4>
              {shouldSeparateDescription && hasSeparatedDescription ? (
                <div className="space-y-3">
                  {separatedDescription.itemLines.length > 0 && (
                    <div className="rounded-lg border border-border p-4">
                      <h5 className="font-medium text-foreground">Itens da compra</h5>
                      <ul className="mt-2 space-y-1.5">
                        {separatedDescription.itemLines.map((line, index) => (
                          <li key={`${line}-${index}`} className="break-words text-foreground">{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(separatedDescription.additionalLines.length > 0 || hasCardDetails) && (
                    <div className="rounded-lg border border-border p-4">
                      <h5 className="font-medium text-foreground">Informações adicionais</h5>
                      <div className="mt-2 space-y-2">
                        {separatedDescription.additionalLines.map((line, index) => (
                          <p key={`${line}-${index}`} className="whitespace-pre-wrap break-words text-foreground">{line}</p>
                        ))}
                        {hasCardDetails && (
                          <dl>
                            <dt className="text-muted-foreground">Cartão</dt>
                            <dd className="break-words font-medium text-foreground">
                              {[receipt?.cardBrand, receipt?.cardLastFour ? `•••• ${receipt.cardLastFour.replace(/\D/g, "").slice(-4) || receipt.cardLastFour}` : null]
                                .filter(Boolean)
                                .join(" ")}
                            </dd>
                          </dl>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words rounded-lg border border-border p-4 text-foreground">{transaction.description}</p>
              )}
            </section>
          )}

          {hasReceiptDetails && (
            <section className="space-y-3 text-sm">
              <h4 className="font-semibold text-foreground">Dados do comprovante</h4>
              <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-border p-4 sm:grid-cols-2">
                {receipt?.merchantName && (
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Estabelecimento</dt>
                    <dd className="break-words font-medium text-foreground">{receipt.merchantName}</dd>
                  </div>
                )}
                {receipt?.taxId && (
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Documento</dt>
                    <dd className="break-words font-medium text-foreground">{formatTaxId(receipt.taxId)}</dd>
                  </div>
                )}
                {receipt?.fiscalDocumentNumber && (
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Documento fiscal</dt>
                    <dd className="break-words font-medium text-foreground">NFC-e nº {receipt.fiscalDocumentNumber}</dd>
                  </div>
                )}
                {!receipt?.fiscalDocumentNumber && transaction.receiptRef && (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-muted-foreground">Identificador</dt>
                    <dd className="break-all font-medium text-foreground">{transaction.receiptRef}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Comprovante</h4>
            {loading ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum comprovante anexado.</p>
            ) : (
              <ul className="space-y-2">
                {attachments.map((attachment) => {
                  const isImage = attachment.mime_type?.startsWith("image/");
                  const previewUrl = previewUrls[attachment.id];
                  return (
                    <li key={attachment.id} className="overflow-hidden rounded-md border border-border bg-muted/30">
                      {isImage && previewUrl && (
                        <button
                          type="button"
                          className="block w-full border-b border-border bg-background"
                          onClick={() => openFile(attachment)}
                          aria-label={`Visualizar ${attachment.file_name}`}
                        >
                          <img
                            src={previewUrl}
                            alt={`Miniatura de ${attachment.file_name}`}
                            className="h-48 w-full object-contain sm:h-52"
                          />
                        </button>
                      )}
                      <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                        <span className="flex min-w-0 items-center gap-2">
                          {isImage ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <FileIcon className="h-3.5 w-3.5 shrink-0" />}
                          <span className="truncate">{attachment.file_name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openFile(attachment)} title="Ver imagem">
                            <Eye className="h-3.5 w-3.5" />
                            <span className="sr-only">Ver imagem</span>
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadFile(attachment)} title="Baixar">
                            <Download className="h-3.5 w-3.5" />
                            <span className="sr-only">Baixar</span>
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeAttachment(attachment)} title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="sr-only">Excluir</span>
                          </Button>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
