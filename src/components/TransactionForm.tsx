import { useState, useEffect, useRef, useCallback } from "react";
import { Transaction, TransactionType, Category, PaymentMethod, PAYMENT_METHODS } from "@/lib/types";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Camera, X, FileIcon, Circle } from "lucide-react";
import { compressImageFile } from "@/lib/image-compression";
import { toast } from "@/hooks/use-toast";

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Transaction, "id">, options?: { installments?: number; attachments?: File[] }) => void;
  initial?: Transaction;
}

export function TransactionForm({ open, onClose, onSubmit, initial }: TransactionFormProps) {
  const { accounts, creditCards } = useAccounts();
  const { getCategoriesByType } = useCategories();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [category, setCategory] = useState<Category>("Outros");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [accountId, setAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [installments, setInstallments] = useState<string>("1");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setAmount(String(initial.amount));
      setType(initial.type);
      setCategory(initial.category);
      setDate(initial.date);
      setDescription(initial.description || "");
      setPaymentMethod(initial.paymentMethod || "");
      setAccountId(initial.accountId || "");
      setCreditCardId(initial.creditCardId || "");
      setInstallments("1");
    } else {
      setTitle(""); setAmount(""); setType("expense"); setCategory("Outros");
      setDate(new Date().toISOString().split("T")[0]); setDescription("");
      setPaymentMethod(""); setAccountId(""); setCreditCardId(""); setInstallments("1");
    }
    setAttachments([]);
  }, [initial, open]);

  const categories = getCategoriesByType(type);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files);
    const MAX_SIZE = 15 * 1024 * 1024; // 15MB hard cap after compression
    const processed: File[] = [];
    for (const f of list) {
      try {
        const out = await compressImageFile(f);
        if (out.size > MAX_SIZE) {
          toast({ title: "Arquivo muito grande", description: `${f.name} excede 15MB e foi ignorado.`, variant: "destructive" });
          continue;
        }
        processed.push(out);
      } catch {
        toast({ title: "Erro ao processar arquivo", description: f.name, variant: "destructive" });
      }
    }
    if (processed.length > 0) setAttachments((prev) => [...prev, ...processed]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const installmentsNum = parseInt(installments) || 1;
    const isInstallment = !initial && type === "expense" && creditCardId && creditCardId !== "none" && installmentsNum > 1;
    const opts: { installments?: number; attachments?: File[] } = {};
    if (isInstallment) opts.installments = installmentsNum;
    if (attachments.length > 0) opts.attachments = attachments;
    onSubmit(
      {
        title,
        amount: parseFloat(amount),
        type,
        category,
        date,
        description: description || undefined,
        paymentMethod: paymentMethod ? paymentMethod as PaymentMethod : undefined,
        accountId: accountId && accountId !== "none" ? accountId : undefined,
        creditCardId: creditCardId && creditCardId !== "none" ? creditCardId : undefined,
      },
      Object.keys(opts).length > 0 ? opts : undefined,
    );
    onClose();
  };

  const showInstallments = !initial && type === "expense" && creditCardId && creditCardId !== "none";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar Registro" : "Novo Registro"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ex: Supermercado" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v: TransactionType) => { setType(v); setCategory("Outros"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Saída</SelectItem>
                  <SelectItem value="income">Entrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v: Category) => setCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Conta <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Select value={accountId || "none"} onValueChange={(v) => { setAccountId(v === "none" ? "" : v); if (v !== "none") setCreditCardId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.bank})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cartão de Crédito <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Select value={creditCardId || "none"} onValueChange={(v) => { setCreditCardId(v === "none" ? "" : v); if (v !== "none") setAccountId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {creditCards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.bank})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {showInstallments && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <Label>Parcelar em</Label>
              <Select value={installments} onValueChange={setInstallments}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n === 1 ? "À vista" : `${n}x de ${(parseFloat(amount || "0") / n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {parseInt(installments) > 1 && (
                <p className="text-xs text-muted-foreground">
                  Será criada uma transação por mês na fatura do cartão, começando na data informada.
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Forma de Pagamento <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Select value={paymentMethod || "none"} onValueChange={(v) => setPaymentMethod(v === "none" ? "" : v as PaymentMethod)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Descrição <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Anexos <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4 mr-2" /> Arquivo
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
                <Camera className="h-4 w-4 mr-2" /> Câmera
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
              />
            </div>
            {attachments.length > 0 && (
              <ul className="space-y-1 mt-2">
                {attachments.map((f, i) => (
                  <li key={i} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
                    <span className="flex items-center gap-2 truncate">
                      <FileIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-muted-foreground shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                    </span>
                    <button type="button" onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {initial && (
              <p className="text-xs text-muted-foreground">Os anexos selecionados serão adicionados a este registro.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{initial ? "Salvar" : "Adicionar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
