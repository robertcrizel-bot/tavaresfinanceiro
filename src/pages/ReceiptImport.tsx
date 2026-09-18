import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Loader2, Paperclip, ScanLine, AlertTriangle, Copy, Check, TestTube2 } from "lucide-react";
import { TransactionForm } from "@/components/TransactionForm";
import { useFinance } from "@/contexts/FinanceContext";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { toast } from "@/hooks/use-toast";
import { takeSharedReceipt } from "@/lib/shared-receipt";
import { parseReceipt, matchByName, matchCategory, ParsedReceipt } from "@/lib/receipt";
import { formatReceiptDescription } from "@/lib/receipt-description";
import { extractReceiptText } from "@/lib/receipt-ocr";
import { parseReceiptText, LocalParsedReceipt } from "@/lib/receipt-parser";
import { supabase } from "@/integrations/supabase/client";
import { Transaction, PaymentMethod, PAYMENT_METHODS, Category } from "@/lib/types";

const LOW_CONFIDENCE_TITLE_FIELDS = ["counterparty", "merchant_name", "merchant_name_extracted"];

export default function ReceiptImport() {
  const navigate = useNavigate();
  const { addTransaction } = useFinance();
  const { accounts, creditCards } = useAccounts();
  const { allCategoryNames } = useCategories();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Partial<Omit<Transaction, "id">> | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptRef, setReceiptRef] = useState<string | null>(null);
  const [lowConfidence, setLowConfidence] = useState<string[]>([]);
  const [duplicate, setDuplicate] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<{ text: string; confidence: number; durationMs: number; preprocessDurationMs?: number; preprocessApplied?: boolean; cropInfo?: { applied: boolean; originalWidth: number; croppedWidth: number; sideRemovalPct: number; confidence: number }; psm4Text?: string; psm4Confidence?: number; psm4Error?: string; psm3Lines?: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[]; psm4Lines?: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[]; psm3CropText?: string; psm3CropConfidence?: number; psm3CropLines?: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[]; psm3CropError?: string; psm3CropRectangle?: { left: number; top: number; width: number; height: number } } | null>(null);
  const [ocrProgress, setOcrProgress] = useState("");
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrCopied, setOcrCopied] = useState(false);
  const [ocrParsed, setOcrParsed] = useState<LocalParsedReceipt | null>(null);
  const [ocrRawExpanded, setOcrRawExpanded] = useState(false);
  const [ocrPreprocessPreview, setOcrPreprocessPreview] = useState<string | null>(null);
  const [ocrPreprocessExpanded, setOcrPreprocessExpanded] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const sharedChecked = useRef(false);

  const buildPrefill = useCallback(
    (parsed: ParsedReceipt): Partial<Omit<Transaction, "id">> => {
      const account = matchByName(accounts, parsed.institution);
      const card = matchByName(creditCards, parsed.institution);
      const isCard = parsed.payment_method === "Cartão de Crédito";
      const method = PAYMENT_METHODS.includes(parsed.payment_method as PaymentMethod)
        ? (parsed.payment_method as PaymentMethod)
        : undefined;
      return {
        title: parsed.title || parsed.counterparty || "Comprovante",
        amount: parsed.amount ?? undefined,
        type: parsed.type === "income" ? "income" : "expense",
        category: (matchCategory(allCategoryNames, parsed.category_hint) as Category) ?? ("Outros" as Category),
        date: parsed.date ?? new Date().toISOString().split("T")[0],
        description: formatReceiptDescription(parsed),
        paymentMethod: method,
        accountId: isCard ? undefined : account?.id,
        creditCardId: isCard ? card?.id : undefined,
        receiptDetails: {
          merchantName: parsed.merchant_name?.trim() || undefined,
          taxId: parsed.tax_id?.trim() || undefined,
          fiscalDocumentNumber: parsed.fiscal_document_number?.trim() || undefined,
          cardBrand: parsed.card_brand?.trim() || undefined,
          cardLastFour: parsed.card_last_four?.trim() || undefined,
        },
      };
    },
    [accounts, creditCards, allCategoryNames],
  );

  const buildLocalPrefill = useCallback(
    (parsed: LocalParsedReceipt): Partial<Omit<Transaction, "id">> => {
      const account = matchByName(accounts, parsed.institution);
      const card = matchByName(creditCards, parsed.institution);
      const isCard = parsed.payment_method === "Cartão de Crédito";
      const hasConfidentCounterparty = parsed.counterparty
        && !parsed.low_confidence_fields.some((f) => LOW_CONFIDENCE_TITLE_FIELDS.includes(f));
      const title = hasConfidentCounterparty ? parsed.counterparty! : "";
      const method = parsed.payment_method && PAYMENT_METHODS.includes(parsed.payment_method as PaymentMethod)
        ? (parsed.payment_method as PaymentMethod)
        : undefined;
      return {
        title,
        amount: parsed.amount ?? undefined,
        type: parsed.type === "income" ? "income" : "expense",
        category: (matchCategory(allCategoryNames, parsed.category_hint) as Category) ?? ("Outros" as Category),
        date: parsed.date ?? new Date().toISOString().split("T")[0],
        description: formatReceiptDescription(parsed),
        paymentMethod: method,
        accountId: isCard ? undefined : account?.id,
        creditCardId: isCard ? card?.id : undefined,
        receiptDetails: {
          merchantName: parsed.merchant_name?.trim() || undefined,
          taxId: parsed.tax_id?.trim() || undefined,
          fiscalDocumentNumber: parsed.fiscal_document_number?.trim() || undefined,
          cardBrand: parsed.card_brand?.trim() || undefined,
          cardLastFour: parsed.card_last_four?.trim() || undefined,
        },
      };
    },
    [accounts, creditCards, allCategoryNames],
  );

  const processFile = useCallback(
    async (file: File) => {
      setPendingFile(file);
      setLoading(true);
      setError(null);
      setDuplicate(false);
      try {
        const parsed = await parseReceipt(file, {
          categories: allCategoryNames,
          accounts: [...accounts.map((a) => `${a.name} (${a.bank})`), ...creditCards.map((c) => `${c.name} (${c.bank})`)],
        });
        if (!parsed.is_receipt) {
          setError("Essa imagem não parece ser um comprovante. Tente outra foto mais nítida.");
          return;
        }
        if (parsed.receipt_id) {
          const { data: existing } = await supabase
            .from("transactions")
            .select("id")
            .eq("receipt_ref", parsed.receipt_id)
            .limit(1);
          if (existing && existing.length > 0) setDuplicate(true);
        }
        setReceiptFile(file);
        setReceiptRef(parsed.receipt_id ?? null);
        setLowConfidence(parsed.low_confidence_fields || []);
        setPrefill(buildPrefill(parsed));
        setFormOpen(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível ler o comprovante.");
      } finally {
        setLoading(false);
      }
    },
    [accounts, creditCards, allCategoryNames, buildPrefill],
  );

  const releaseCamera = useCallback(() => {
    cameraRequestRef.current++;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const closeCamera = useCallback(() => {
    releaseCamera();
    setCameraStream(null);
    setCameraStarting(false);
    setCameraReady(false);
    setCameraOpen(false);
  }, [releaseCamera]);

  const runOcrTest = useCallback(async () => {
    const file = pendingFile;
    if (!file) return;
    setOcrLoading(true);
    setOcrResult(null);
    setOcrParsed(null);
    setOcrPreprocessPreview(null);
    setOcrPreprocessExpanded(false);
    setOcrProgress("Carregando modelo de OCR...");
    setOcrOpen(true);
    setOcrCopied(false);
    setOcrRawExpanded(false);
    try {
      const result = await extractReceiptText(file, (status, progress) => {
        const pct = Math.round(progress * 100);
        setOcrProgress(`${status} (${pct}%)`);
      });
      setOcrResult(result);
      if (result.preprocessedImageDataUrl) {
        setOcrPreprocessPreview(result.preprocessedImageDataUrl);
      }
      if (result.text && result.text.trim().length >= 10) {
        const parsed = parseReceiptText(result.text);
        setOcrParsed(parsed);
      }
    } catch (e) {
      setOcrResult({
        text: `Erro: ${e instanceof Error ? e.message : "Falha ao executar OCR local."}`,
        confidence: 0,
        durationMs: 0,
        preprocessDurationMs: 0,
        preprocessApplied: false,
        preprocessedImageDataUrl: null,
      });
    } finally {
      setOcrLoading(false);
      setOcrProgress("");
    }
  }, [pendingFile]);

  useEffect(() => () => releaseCamera(), [releaseCamera]);

  useEffect(() => {
    const video = videoRef.current;
    if (!cameraStream || !video) return;
    video.srcObject = cameraStream;
    void video.play().catch(() => {
      if (cameraStreamRef.current !== cameraStream) return;
      closeCamera();
      setError("Não foi possível iniciar a câmera. Use Escolher arquivo para enviar a foto.");
    });
    return () => {
      if (video.srcObject === cameraStream) video.srcObject = null;
    };
  }, [cameraStream, closeCamera]);

  const openCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("A câmera não está disponível neste navegador. Use Escolher arquivo para enviar a foto.");
      return;
    }

    const requestId = ++cameraRequestRef.current;
    setCameraOpen(true);
    setCameraStarting(true);
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraStarting(false);
    } catch (cameraError) {
      if (cameraRequestRef.current !== requestId) return;
      closeCamera();
      const permissionDenied = (cameraError as { name?: string })?.name === "NotAllowedError";
      setError(permissionDenied
        ? "A permissão da câmera foi negada. Autorize o acesso ou use Escolher arquivo."
        : "Não foi possível abrir a câmera. Use Escolher arquivo para enviar a foto.");
    }
  };

  const captureCameraPhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("A câmera ainda não está pronta. Aguarde um instante e tente novamente.");
      return;
    }

    const maxDimension = 1920;
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    try {
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      closeCamera();

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("capture failed");
      const file = new File([blob], `comprovante-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      setPendingFile(file);
    } catch {
      closeCamera();
      setError("Não foi possível fotografar o comprovante. Tente novamente ou use Escolher arquivo.");
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  useEffect(() => {
    if (sharedChecked.current) return;
    sharedChecked.current = true;
    takeSharedReceipt().then((file) => {
      if (file) void processFile(file);
    });
  }, [processFile]);

  const applyOcrData = useCallback(() => {
    if (!ocrParsed || !ocrParsed.is_receipt || !pendingFile) return;
    setOcrOpen(false);
    setReceiptFile(pendingFile);
    setReceiptRef(ocrParsed.receipt_id ?? null);
    setLowConfidence(ocrParsed.low_confidence_fields || []);
    setPrefill(buildLocalPrefill(ocrParsed));
    setFormOpen(true);
  }, [ocrParsed, pendingFile, buildLocalPrefill]);

  const ocrCanUse = Boolean(ocrParsed?.is_receipt && ocrParsed?.amount != null && !ocrLoading);

  const fieldLabels: Record<string, string> = {
    amount: "valor",
    date: "data",
    type: "entrada/saída",
    counterparty: "nome",
    title: "título",
    payment_method: "forma de pagamento",
    institution: "banco",
    merchant_name: "razão social",
    tax_id: "CNPJ/CPF",
    fiscal_document_number: "número do documento",
    card_brand: "bandeira do cartão",
    card_last_four: "final do cartão",
    purchased_items: "itens comprados",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Ler comprovante</h1>
        <p className="text-muted-foreground mt-1">
          Envie a foto ou o PDF do comprovante e o app preenche o registro para você conferir.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Lendo o comprovante...</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4" /> Escolher arquivo
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => void openCamera()}>
                <Camera className="h-4 w-4" /> Tirar foto
              </Button>
              {pendingFile && (
                <>
                  <Button
                    className="gap-2"
                    disabled={loading}
                    onClick={() => void processFile(pendingFile)}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                    Ler com IA
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={ocrLoading}
                    onClick={() => void runOcrTest()}
                  >
                    {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
                    Testar OCR local
                  </Button>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setPendingFile(f);
              }}
            />
            <p className="text-xs text-muted-foreground flex items-start gap-2">
              <ScanLine className="h-4 w-4 shrink-0 mt-0.5" />
              Funciona com comprovantes de Pix, boletos pagos, compras no cartão e cupons fiscais. Nada é salvo sem a sua
              confirmação.
            </p>
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {duplicate && !loading && (
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
            Esse comprovante já parece ter sido lançado antes. Confira antes de salvar de novo.
          </div>
        )}

        {lowConfidence.length > 0 && !loading && (
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
            Confira com atenção:{" "}
            {[...new Set(lowConfidence.map((f) => fieldLabels[f.replace(/\[\d+\].*$/, "")] ?? fieldLabels[f] ?? f))].join(", ")}.
          </div>
        )}
      </Card>

      <Dialog open={cameraOpen} onOpenChange={(open) => !open && closeCamera()}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fotografar comprovante</DialogTitle>
            <DialogDescription>Enquadre todo o comprovante e mantenha o texto bem iluminado.</DialogDescription>
          </DialogHeader>
          <div className="relative aspect-video overflow-hidden rounded-md bg-black">
            {(cameraStarting || !cameraReady) && (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm text-white">
                <Loader2 className="h-5 w-5 animate-spin" /> Preparando câmera...
              </div>
            )}
            <video
              ref={videoRef}
              data-testid="receipt-camera-video"
              playsInline
              muted
              autoPlay
              onCanPlay={() => setCameraReady(true)}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeCamera}>Cancelar</Button>
            <Button type="button" onClick={() => void captureCameraPhoto()} disabled={cameraStarting || !cameraReady}>
              <Camera className="mr-2 h-4 w-4" /> Fotografar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ocrOpen} onOpenChange={(open) => {
        setOcrOpen(open);
        if (!open) {
          setOcrPreprocessPreview(null);
        }
      }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Resultado do OCR Local</DialogTitle>
            <DialogDescription>Dados extraídos localmente pelo Tesseract.js (por+eng).</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            {ocrLoading && (
              <div className="flex flex-col items-center gap-2 py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{ocrProgress || "Processando..."}</p>
              </div>
            )}
            {ocrResult && ocrParsed && ocrParsed.is_receipt && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-primary border-b pb-1">
                  Resultado da leitura local
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="font-medium text-muted-foreground">Tipo:</div>
                  <div>
                    {ocrParsed.type === "expense" ? "Despesa" : ocrParsed.type === "income" ? "Receita" : "Não identificado"}
                  </div>

                  {ocrParsed.amount != null && (
                    <>
                      <div className="font-medium text-muted-foreground">Valor:</div>
                      <div className="font-semibold">
                        R$ {ocrParsed.amount.toFixed(2).replace(".", ",")}
                      </div>
                    </>
                  )}

                  {ocrParsed.date && (
                    <>
                      <div className="font-medium text-muted-foreground">Data:</div>
                      <div>{ocrParsed.date.split("-").reverse().join("/")}</div>
                    </>
                  )}

                  {ocrParsed.time && (
                    <>
                      <div className="font-medium text-muted-foreground">Horário:</div>
                      <div>{ocrParsed.time}</div>
                    </>
                  )}

                  {ocrParsed.counterparty && (
                    <>
                      <div className="font-medium text-muted-foreground">
                        {ocrParsed.type === "expense" ? "Estabelecimento:" : "Favorecido:"}
                      </div>
                      <div>{ocrParsed.counterparty}</div>
                    </>
                  )}

                  {ocrParsed.payment_method && (
                    <>
                      <div className="font-medium text-muted-foreground">Forma de pagamento:</div>
                      <div>{ocrParsed.payment_method}</div>
                    </>
                  )}

                  {ocrParsed.institution && (
                    <>
                      <div className="font-medium text-muted-foreground">Instituição:</div>
                      <div>{ocrParsed.institution}</div>
                    </>
                  )}

                  {ocrParsed.tax_id && (
                    <>
                      <div className="font-medium text-muted-foreground">CNPJ/CPF:</div>
                      <div className="font-mono text-xs">{ocrParsed.tax_id}</div>
                    </>
                  )}

                  {ocrParsed.receipt_id && (
                    <>
                      <div className="font-medium text-muted-foreground">ID/Identificador:</div>
                      <div className="font-mono text-xs">{ocrParsed.receipt_id}</div>
                    </>
                  )}

                  {ocrParsed.fiscal_document_number && (
                    <>
                      <div className="font-medium text-muted-foreground">Nº Cupom/Doc Fiscal:</div>
                      <div className="font-mono text-xs">{ocrParsed.fiscal_document_number}</div>
                    </>
                  )}

                  {ocrParsed.merchant_name && ocrParsed.merchant_name !== ocrParsed.counterparty && (
                    <>
                      <div className="font-medium text-muted-foreground">Razão Social:</div>
                      <div>{ocrParsed.merchant_name}</div>
                    </>
                  )}

                  {ocrParsed.category_hint && (
                    <>
                      <div className="font-medium text-muted-foreground">Categoria sugerida:</div>
                      <div>{ocrParsed.category_hint}</div>
                    </>
                  )}
                </div>

                {ocrParsed.purchased_items && ocrParsed.purchased_items.length > 0 && (
                  <div className="mt-2">
                    <div className="font-medium text-muted-foreground text-sm mb-1">Itens:</div>
                    <ul className="list-disc list-inside text-sm space-y-0.5 text-muted-foreground">
                      {ocrParsed.purchased_items.map((item, idx) => (
                        <li key={idx}>
                          {item.name}
                          {item.quantity != null && item.quantity > 1 ? ` (${item.quantity}x)` : ""}
                          {item.total != null ? ` — R$ ${item.total.toFixed(2).replace(".", ",")}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ocrParsed.low_confidence_fields.length > 0 && (
                  <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-700 dark:text-yellow-400">
                    <strong>Campos com baixa confiança:</strong>{" "}
                    {ocrParsed.low_confidence_fields
                      .filter((f) => !f.includes("purchased_items"))
                      .map((f) => fieldLabels[f] ?? f)
                      .join(", ")}
                  </div>
                )}
              </div>
            )}

            {ocrResult && ocrParsed && !ocrParsed.is_receipt && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
                O texto reconhecido não parece ser um comprovante. Confira o texto bruto abaixo.
              </div>
            )}

            {ocrResult && (
              <>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Confiança OCR: <strong>{Math.round(ocrResult.confidence)}%</strong></span>
                  <span>Tempo OCR: <strong>{(ocrResult.durationMs / 1000).toFixed(1)}s</strong></span>
                  {ocrResult.preprocessApplied != null && (
                    <span>
                      Pré-processamento:{" "}
                      <strong>{ocrResult.preprocessApplied ? "aplicado" : "não aplicado"}</strong>
                      {ocrResult.preprocessDurationMs != null && ocrResult.preprocessDurationMs > 0 && (
                        <> ({(ocrResult.preprocessDurationMs / 1000).toFixed(1)}s)</>
                      )}
                    </span>
                  )}
                  {ocrResult.cropInfo && (
                    <span>
                      Crop:{" "}
                      <strong>{ocrResult.cropInfo.applied ? "aplicado" : "não aplicado"}</strong>
                      {ocrResult.cropInfo.applied && (
                        <>
                          {" "}({ocrResult.cropInfo.originalWidth}→{ocrResult.cropInfo.croppedWidth}px,
                          {" "}-{ocrResult.cropInfo.sideRemovalPct}%,
                          conf {Math.round(ocrResult.cropInfo.confidence * 100)}%)
                        </>
                      )}
                    </span>
                  )}
                </div>

                {ocrPreprocessPreview && (
                  <div className="rounded-md border">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50"
                      onClick={() => setOcrPreprocessExpanded(!ocrPreprocessExpanded)}
                    >
                      Ver imagem processada
                      <span className="text-xs">{ocrPreprocessExpanded ? "▲" : "▼"}</span>
                    </button>
                    {ocrPreprocessExpanded && (
                      <div className="border-t bg-muted p-3">
                        <img
                          src={ocrPreprocessPreview}
                          alt="Imagem processada para OCR"
                          className="max-h-80 mx-auto rounded"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-md border">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50"
                    onClick={() => setOcrRawExpanded(!ocrRawExpanded)}
                  >
                    Texto OCR bruto
                    <span className="text-xs">{ocrRawExpanded ? "▲" : "▼"}</span>
                  </button>
                  {ocrRawExpanded && (
                    <pre className="whitespace-pre-wrap break-words border-t bg-muted p-3 text-xs font-mono max-h-60 overflow-auto">
                      {ocrResult.text}
                    </pre>
                  )}
                </div>

                {(ocrResult.psm4Text || ocrResult.psm4Error) && (
                  <div className="rounded-md border border-dashed border-blue-400/50">
                    <details>
                      <summary className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/5 cursor-pointer">
                        Comparação PSM 3 vs PSM 4 (diagnóstico)
                        <span className="text-xs">▼</span>
                      </summary>
                      <div className="border-t p-3 space-y-3">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            Leitura A — PSM 3 AUTO (oficial) — confiança {Math.round(ocrResult.confidence)}%
                          </div>
                          <pre className="whitespace-pre-wrap break-words bg-muted p-2 text-xs font-mono max-h-40 overflow-auto rounded">
                            {ocrResult.text}
                          </pre>
                        </div>
                        {ocrResult.psm4Text && (
                          <div>
                            <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                              Leitura B — PSM 4 SINGLE_COLUMN (diagnóstico) — confiança {ocrResult.psm4Confidence != null ? Math.round(ocrResult.psm4Confidence) : "?"}%
                            </div>
                            <pre className="whitespace-pre-wrap break-words bg-blue-500/5 p-2 text-xs font-mono max-h-40 overflow-auto rounded border border-blue-400/20">
                              {ocrResult.psm4Text}
                            </pre>
                          </div>
                        )}
                        {ocrResult.psm4Error && (
                          <div className="rounded bg-red-500/10 border border-red-400/30 p-2">
                            <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                              Erro na leitura PSM 4:
                            </div>
                            <pre className="whitespace-pre-wrap break-words text-xs font-mono text-red-700 dark:text-red-300">
                              {ocrResult.psm4Error}
                            </pre>
                          </div>
                        )}

                        {ocrResult.psm3Lines && ocrResult.psm3Lines.length > 0 && (
                          <div className="rounded-md border">
                            <details>
                              <summary className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 cursor-pointer">
                                Confiança por palavra
                                <span className="text-xs">▼</span>
                              </summary>
                              <div className="border-t p-3 space-y-4">
                                {(() => {
                                  const isProductLine = (line: { text: string; words: { text: string }[] }) => {
                                    const t = line.text;
                                    const hasLetters = /[a-zA-ZÀ-ÿ]/.test(t);
                                    const hasNumbers = /\d/.test(t);
                                    const multiWord = line.words.length >= 2;
                                    const notJustValue = !/^\d+[.,]\d{2}$/.test(t.trim());
                                    const notJustCnpj = /^\d[\d./-]{9,}$/.test(t.trim());
                                    return hasLetters && hasNumbers && multiWord && notJustValue && !notJustCnpj;
                                  };
                                  const psm3Product = ocrResult.psm3Lines!.filter(isProductLine);
                                  const psm4Product = ocrResult.psm4Lines?.filter(isProductLine);
                                  return (
                                    <>
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-2">
                                          PSM 3 — linhas de produto ({psm3Product.length})
                                        </div>
                                        <div className="space-y-2">
                                          {psm3Product.map((line, i) => (
                                            <div key={i} className="bg-muted rounded p-2">
                                              <div className="text-xs font-mono mb-1">
                                                {line.text} <span className="text-muted-foreground">[linha {Math.round(line.confidence)}%]</span>
                                              </div>
                                              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                                {line.words.map((w, j) => (
                                                  <span key={j} className="text-xs font-mono">
                                                    {w.text} <span className={w.confidence >= 70 ? "text-green-600" : w.confidence >= 40 ? "text-yellow-600" : "text-red-600"}>[{Math.round(w.confidence)}%]</span>
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      {psm4Product && psm4Product.length > 0 && (
                                        <div>
                                          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">
                                            PSM 4 — linhas de produto ({psm4Product.length})
                                          </div>
                                          <div className="space-y-2">
                                            {psm4Product.map((line, i) => (
                                              <div key={i} className="bg-blue-500/5 rounded p-2 border border-blue-400/10">
                                                <div className="text-xs font-mono mb-1">
                                                  {line.text} <span className="text-muted-foreground">[linha {Math.round(line.confidence)}%]</span>
                                                </div>
                                                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                                  {line.words.map((w, j) => (
                                                    <span key={j} className="text-xs font-mono">
                                                      {w.text} <span className={w.confidence >= 70 ? "text-green-600" : w.confidence >= 40 ? "text-yellow-600" : "text-red-600"}>[{Math.round(w.confidence)}%]</span>
                                                    </span>
                                                  ))}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </details>
                          </div>
                        )}

                        {(ocrResult.psm3CropText || ocrResult.psm3CropError || ocrResult.psm3CropRectangle) && (
                          <div className="rounded-md border border-dashed border-green-400/50">
                            <details>
                              <summary className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-500/5 cursor-pointer">
                                Leitura C — PSM 3 somente região dos itens (diagnóstico)
                                <span className="text-xs">▼</span>
                              </summary>
                              <div className="border-t p-3 space-y-3">
                                {ocrResult.psm3CropRectangle && (
                                  <div className="text-xs text-muted-foreground">
                                    Rectangle: top={ocrResult.psm3CropRectangle.top} height={ocrResult.psm3CropRectangle.height} (largura completa)
                                  </div>
                                )}
                                {ocrResult.psm3CropText && (
                                  <div>
                                    <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                                      Texto bruto — confiança {ocrResult.psm3CropConfidence != null ? Math.round(ocrResult.psm3CropConfidence) : "?"}%
                                    </div>
                                    <pre className="whitespace-pre-wrap break-words bg-green-500/5 p-2 text-xs font-mono max-h-40 overflow-auto rounded border border-green-400/20">
                                      {ocrResult.psm3CropText}
                                    </pre>
                                  </div>
                                )}
                                {ocrResult.psm3CropError && (
                                  <div className="rounded bg-red-500/10 border border-red-400/30 p-2">
                                    <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                                      Erro na leitura com rectangle:
                                    </div>
                                    <pre className="whitespace-pre-wrap break-words text-xs font-mono text-red-700 dark:text-red-300">
                                      {ocrResult.psm3CropError}
                                    </pre>
                                  </div>
                                )}
                                {ocrResult.psm3CropLines && ocrResult.psm3CropLines.length > 0 && (
                                  <div className="rounded-md border">
                                    <details>
                                      <summary className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 cursor-pointer">
                                        Confiança por palavra — região dos itens
                                        <span className="text-xs">▼</span>
                                      </summary>
                                      <div className="border-t p-3 space-y-4">
                                        {(() => {
                                          const isProductLine = (line: { text: string; words: { text: string }[] }) => {
                                            const t = line.text;
                                            const hasLetters = /[a-zA-ZÀ-ÿ]/.test(t);
                                            const hasNumbers = /\d/.test(t);
                                            const multiWord = line.words.length >= 2;
                                            const notJustValue = !/^\d+[.,]\d{2}$/.test(t.trim());
                                            const notJustCnpj = /^\d[\d./-]{9,}$/.test(t.trim());
                                            return hasLetters && hasNumbers && multiWord && notJustValue && !notJustCnpj;
                                          };
                                          const cropProduct = ocrResult.psm3CropLines!.filter(isProductLine);
                                          return (
                                            <div>
                                              <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">
                                                PSM 3 rectangle — linhas de produto ({cropProduct.length})
                                              </div>
                                              <div className="space-y-2">
                                                {cropProduct.map((line, i) => (
                                                  <div key={i} className="bg-green-500/5 rounded p-2 border border-green-400/10">
                                                    <div className="text-xs font-mono mb-1">
                                                      {line.text} <span className="text-muted-foreground">[linha {Math.round(line.confidence)}%]</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                                      {line.words.map((w, j) => (
                                                        <span key={j} className="text-xs font-mono">
                                                          {w.text} <span className={w.confidence >= 70 ? "text-green-600" : w.confidence >= 40 ? "text-yellow-600" : "text-red-600"}>[{Math.round(w.confidence)}%]</span>
                                                        </span>
                                                      ))}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </details>
                                  </div>
                                )}
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            {ocrResult && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  void navigator.clipboard.writeText(ocrResult.text);
                  setOcrCopied(true);
                  setTimeout(() => setOcrCopied(false), 2000);
                }}
              >
                {ocrCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {ocrCopied ? "Copiado" : "Copiar texto"}
              </Button>
            )}
            {ocrCanUse && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => applyOcrData()}
              >
                Usar estes dados
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setOcrOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {prefill && (
        <TransactionForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          prefill={prefill}
          prefillAttachments={receiptFile ? [receiptFile] : undefined}
          lowConfidence={lowConfidence}
          title="Confira o registro"
          submitLabel="Salvar registro"
          onSubmit={(data, options) => {
            addTransaction(data, { ...options, receiptRef: receiptRef ?? undefined });
            toast({ title: "Registro criado a partir do comprovante" });
            navigate("/records");
          }}
        />
      )}
    </div>
  );
}
