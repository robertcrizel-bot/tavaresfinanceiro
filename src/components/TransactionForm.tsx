import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Transaction, TransactionType, Category, PaymentMethod, PAYMENT_METHODS } from "@/lib/types";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { useFinance } from "@/contexts/FinanceContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Camera, X, FileIcon, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { compressImageFile } from "@/lib/image-compression";
import { toast } from "@/hooks/use-toast";
import { calculateCurrentMonthCategorySpending, calculateCategoryBudgetUsage } from "@/lib/financial-calculations";

const ACCOUNT_PAYMENT_METHODS = new Set<PaymentMethod>(["Cartão de Débito", "Pix", "Transferência", "Boleto"]);

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Transaction, "id">, options?: { installments?: number; attachments?: File[] }) => void;
  initial?: Transaction;
  /** Pre-filled values for a brand new record (e.g. read from a receipt). */
  prefill?: Partial<Omit<Transaction, "id">>;
  /** Files already selected for a brand new record (e.g. the receipt itself). */
  prefillAttachments?: File[];
  /** Fields with low confidence from OCR — show a discreet "Confira este campo" hint. */
  lowConfidence?: string[];
  title?: string;
  submitLabel?: string;
}

export function TransactionForm({ open, onClose, onSubmit, initial, prefill, prefillAttachments, lowConfidence, title: dialogTitle, submitLabel }: TransactionFormProps) {
  const { accounts, creditCards } = useAccounts();
  const { getCategoriesByType, categories: allCategories } = useCategories();
  const { transactions } = useFinance();
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
      setTitle(prefill?.title ?? "");
      setAmount(prefill?.amount != null ? String(prefill.amount) : "");
      setType(prefill?.type ?? "expense");
      setCategory(prefill?.category ?? "Outros");
      setDate(prefill?.date ?? new Date().toISOString().split("T")[0]);
      setDescription(prefill?.description ?? "");
      setPaymentMethod(prefill?.paymentMethod ?? "");
      setAccountId(prefill?.accountId ?? "");
      setCreditCardId(prefill?.creditCardId ?? "");
      setInstallments("1");
    }
    setAttachments(!initial && prefillAttachments ? [...prefillAttachments] : []);
  }, [initial, open, prefill, prefillAttachments]);

  const categories = getCategoriesByType(type);

  const budgetInfo = useMemo(() => {
    if (type !== "expense") return null;
    const selectedCategory = allCategories.find((c) => c.name === category);
    if (!selectedCategory || selectedCategory.monthlyBudget == null) return null;

    const spendingMonth = new Date(date + "T00:00:00");
    const monthlySpending = calculateCurrentMonthCategorySpending(transactions, spendingMonth);
    const rawSpent = monthlySpending[category] || 0;

    const currentAmount = parseFloat(amount) || 0;
    const isEditing = Boolean(initial);
    const sameMonth = isEditing && initial!.date.slice(0, 7) === date.slice(0, 7);
    const sameCategory = isEditing && initial!.type === "expense" && initial!.category === category;
    const subtractCurrent = isEditing && sameMonth && sameCategory;
    const spentWithoutCurrent = subtractCurrent ? rawSpent - initial!.amount : rawSpent;
    const projectedSpent = spentWithoutCurrent + currentAmount;

    const budget = selectedCategory.monthlyBudget!;
    const usage = calculateCategoryBudgetUsage(projectedSpent, budget);

    return {
      budget,
      spent: spentWithoutCurrent,
      currentAmount,
      projectedSpent,
      usage,
    };
  }, [type, category, date, amount, initial, transactions, allCategories]);

  const isLowConfidence = (field: string) =>
    Boolean(lowConfidence?.some((f) => f === field || f.startsWith(field + "[")));

  const LowConfidenceHint = ({ field }: { field: string }) =>
    isLowConfidence(field) ? (
      <span className="text-xs text-yellow-600 dark:text-yellow-400 ml-1">Confira este campo</span>
    ) : null;

  const stopCamera = useCallback(() => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraOpen(false);
  }, [cameraStream]);

  useEffect(() => {
    if (!open) stopCamera();
  }, [open, stopCamera]);

  useEffect(() => {
    if (!cameraStream || !videoRef.current) return;
    videoRef.current.srcObject = cameraStream;
    void videoRef.current.play().catch(() => undefined);
  }, [cameraStream]);

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({ title: "Câmera indisponível", description: "Use a opção Arquivo para anexar a imagem.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 } },
        audio: false,
      });
      setCameraStream(stream);
      setCameraOpen(true);
    } catch {
      toast({ title: "Não foi possível abrir a câmera", description: "Verifique a permissão da câmera no navegador.", variant: "destructive" });
    }
  };

  const captureCameraPhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const maxDimension = 1024;
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return;
    const file = new File([blob], `foto-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    setAttachments((prev) => [...prev, file]);
    stopCamera();
  };

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

  const handlePaymentMethodChange = (value: string) => {
    const nextPaymentMethod = value === "none" ? "" : value as PaymentMethod;
    setPaymentMethod(nextPaymentMethod);
    if (nextPaymentMethod === "Cartão de Crédito") {
      setAccountId("");
      return;
    }

    setCreditCardId("");
    setInstallments("1");
    if (!nextPaymentMethod || !ACCOUNT_PAYMENT_METHODS.has(nextPaymentMethod)) setAccountId("");
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
        receiptRef: initial?.receiptRef ?? prefill?.receiptRef,
        receiptDetails: initial?.receiptDetails ?? prefill?.receiptDetails,
      },
      Object.keys(opts).length > 0 ? opts : undefined,
    );
    onClose();
  };

  const showAccount = Boolean(paymentMethod && ACCOUNT_PAYMENT_METHODS.has(paymentMethod));
  const showCreditCard = paymentMethod === "Cartão de Crédito";
  const showInstallments = showCreditCard && !initial && type === "expense";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto p-4 sm:max-w-md sm:gap-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{dialogTitle ?? (initial ? "Editar Registro" : "Novo Registro")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-1.5 sm:space-y-2">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 min-[360px]:gap-x-3 sm:grid-cols-8 sm:gap-x-4 sm:gap-y-2">
            <div className="order-1 min-w-0 space-y-1 sm:col-span-3 sm:space-y-1.5">
              <Label>Data <span className="text-destructive" aria-hidden="true">*</span> <LowConfidenceHint field="date" /></Label>
              <Input className="h-9 sm:h-10" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="order-3 col-span-2 min-w-0 space-y-1 sm:order-2 sm:col-span-5 sm:space-y-1.5">
              <Label>Título <span className="text-destructive" aria-hidden="true">*</span> <LowConfidenceHint field="counterparty" /></Label>
              <Input className="h-9 sm:h-10" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ex: Supermercado" />
            </div>
            <div className="order-2 min-w-0 space-y-1 sm:order-3 sm:col-span-4 sm:space-y-1.5">
              <Label>Valor (R$) <span className="text-destructive" aria-hidden="true">*</span> <LowConfidenceHint field="amount" /></Label>
              <Input className="h-9 sm:h-10" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0,00" />
            </div>
            <div className="order-4 col-span-2 min-w-0 space-y-1 min-[360px]:col-span-1 sm:col-span-4 sm:space-y-1.5">
              <Label>Tipo <span className="text-destructive" aria-hidden="true">*</span> <LowConfidenceHint field="type" /></Label>
              <Select value={type} onValueChange={(v: TransactionType) => { setType(v); setCategory("Outros"); }}>
                <SelectTrigger className="h-9 sm:h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Saída</SelectItem>
                  <SelectItem value="income">Entrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="order-5 col-span-2 min-w-0 space-y-1 min-[360px]:col-span-1 sm:col-span-4 sm:space-y-1.5">
              <Label>Categoria <span className="text-destructive" aria-hidden="true">*</span></Label>
              <Select value={category} onValueChange={(v: Category) => setCategory(v)}>
                <SelectTrigger className="h-9 sm:h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="order-6 col-span-2 min-w-0 space-y-1 sm:col-span-4 sm:space-y-1.5">
              <Label>Forma de Pagamento <LowConfidenceHint field="payment_method" /></Label>
              <Select value={paymentMethod || "none"} onValueChange={handlePaymentMethodChange}>
                <SelectTrigger className="h-9 sm:h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {showAccount && (
            <div className="space-y-1 sm:space-y-1.5">
              <Label>Conta</Label>
              <Select value={accountId || "none"} onValueChange={(v) => { setAccountId(v === "none" ? "" : v); if (v !== "none") setCreditCardId(""); }}>
                <SelectTrigger className="h-9 sm:h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.bank})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {showCreditCard && (
            <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[360px]:grid-cols-2 sm:gap-x-4 sm:gap-y-2">
              <div className="min-w-0 space-y-1 sm:space-y-1.5">
                <Label>Cartão de Crédito</Label>
                <Select value={creditCardId || "none"} onValueChange={(v) => { setCreditCardId(v === "none" ? "" : v); if (v !== "none") setAccountId(""); }}>
                  <SelectTrigger className="h-9 sm:h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {creditCards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} ({c.bank})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showInstallments && (
                <div className="min-w-0 space-y-1 sm:space-y-1.5">
                  <Label>Parcelar em</Label>
                  <Select value={installments} onValueChange={setInstallments} disabled={!creditCardId || creditCardId === "none"}>
                    <SelectTrigger className="h-9 sm:h-10"><SelectValue /></SelectTrigger>
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
            </div>
          )}
          {budgetInfo && (
            <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-2 text-xs sm:space-y-1.5 sm:p-3">
              <p className="text-muted-foreground text-[11px]">Orçamento utilizado após este lançamento</p>
              <div>
                <span className="font-semibold text-sm">
                  {budgetInfo.projectedSpent.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
                <span className="text-muted-foreground"> de {budgetInfo.budget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>
              <div className="relative">
                <Progress
                  value={Math.min(budgetInfo.usage.percentage, 100)}
                  className={`h-6 ${budgetInfo.usage.exceeded > 0 ? "[&>div]:bg-destructive" : ""}`}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white pointer-events-none select-none">
                  {Math.round(budgetInfo.usage.percentage)}%
                </span>
              </div>
              <p className={budgetInfo.usage.exceeded > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
                {budgetInfo.usage.exceeded > 0
                  ? `${budgetInfo.usage.exceeded.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} acima do orçamento`
                  : `${budgetInfo.usage.available.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} disponíveis`}
              </p>
            </div>
          )}
          <div className="space-y-1 sm:space-y-1.5">
            <Label>Descrição</Label>
            <Textarea className="min-h-[140px] sm:min-h-[120px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes..." rows={2} />
          </div>
          <div className="space-y-1 sm:space-y-1.5">
            <Label>Anexos</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4 mr-2" /> Arquivo
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={openCamera}>
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
            </div>
            {cameraOpen && (
              <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
                <video ref={videoRef} playsInline muted autoPlay className="aspect-video w-full rounded-md bg-background object-cover" />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={stopCamera}>Cancelar</Button>
                  <Button type="button" size="sm" onClick={captureCameraPhoto}>
                    <Circle className="h-4 w-4 mr-2 fill-current" /> Capturar
                  </Button>
                </div>
              </div>
            )}
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
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{submitLabel ?? (initial ? "Salvar" : "Adicionar")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
