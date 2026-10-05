import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Loader2, Paperclip, ScanLine, AlertTriangle } from "lucide-react";
import { TransactionForm } from "@/components/TransactionForm";
import { useFinance } from "@/contexts/FinanceContext";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { toast } from "@/hooks/use-toast";
import { takeSharedReceiptWithDiagnostics, type ShareDiagnostics } from "@/lib/shared-receipt";
import { parseReceipt, prepareReceiptForLocalOcr, matchByName, matchCategory, ParsedReceipt, type LocalOcrPreparationMetrics } from "@/lib/receipt";
import { formatReceiptDescription } from "@/lib/receipt-description";
import { disposePaddleRecognizer, paddleRecognize } from "@/lib/ocr-paddle-test/recognize";
import { buildPaddleReceiptResult } from "@/lib/ocr-paddle-test/receiptResult";
import { paddleToParsedReceipt } from "@/lib/ocr-paddle-test/paddleToParsedReceipt";
import { fastOcrRecognize } from "@/lib/fast-ocr";
import type { FastOcrBox } from "@/lib/fast-ocr-adapter";
import {
  summarizeFastOcrGroupedLines,
  summarizeFastOcrRawLines,
  type FastOcrGroupedLineDebug,
  type FastOcrRawRegionDebug,
} from "@/lib/fast-ocr-debug";
import { releaseDocumentOrientationSession } from "@/lib/receipt-image-orientation";
import { supabase } from "@/integrations/supabase/client";
import { Transaction, PaymentMethod, PAYMENT_METHODS, Category } from "@/lib/types";
import type { PaddleOcrResult } from "@/lib/ocr-paddle-test/types";

interface FreeOcrDiagnostics {
  originalDimensions: { width: number; height: number } | null;
  ocrInputDimensions: { width: number; height: number } | null;
  preparationMs: number;
  orientationMs: number;
  paddleInitializationMs: number | null;
  paddleInferenceMs: number;
  detectionMs: number | null;
  recognitionMs: number | null;
  parserMs: number;
  cleanupMs: number;
  totalMs: number;
}

function logFreeOcrMetrics(
  preparation: LocalOcrPreparationMetrics,
  ocr: PaddleOcrResult,
  parserMs: number,
  cleanupMs: number,
  totalMs: number,
): FreeOcrDiagnostics {
  const diagnostics: FreeOcrDiagnostics = {
    originalDimensions: preparation.originalDimensions,
    ocrInputDimensions: ocr.inputDimensions ?? preparation.outputDimensions,
    preparationMs: Math.round(preparation.preparationMs),
    orientationMs: Math.round(preparation.orientationMs),
    paddleInitializationMs: ocr.initializationMs ?? null,
    paddleInferenceMs: ocr.inferenceMs ?? ocr.timeMs,
    detectionMs: ocr.detectionMs ?? null,
    recognitionMs: ocr.recognitionMs ?? null,
    parserMs: Math.round(parserMs),
    cleanupMs: Math.round(cleanupMs),
    totalMs: Math.round(totalMs),
  };
  if (import.meta.env.MODE === "test") return diagnostics;
  const toMiB = (bytes: number | null) => bytes === null ? null : Math.round(bytes / 1024 / 1024 * 10) / 10;
  console.info("[receipt-import] free OCR metrics", {
    ...diagnostics,
    originalPixels: preparation.originalPixels,
    ocrInputPixels: preparation.outputPixels,
    largestRgbaSurfaceMiB: toMiB(preparation.largestRgbaSurfaceBytes),
    estimatedOrientationPeakRgbaMiB: toMiB(preparation.estimatedOrientationPeakRgbaBytes),
    inputFileMiB: toMiB(preparation.inputFileBytes),
    ocrFileMiB: toMiB(preparation.outputFileBytes),
    paddleRunsInWorker: true,
  });
  return diagnostics;
}

interface FastOcrDiagnostics {
  initializationMs: number;
  ocrMs: number;
  parserMs: number;
  totalMs: number;
  ocrInputDimensions: { width: number; height: number } | null;
  rawRegions: FastOcrRawRegionDebug[];
  groupedLines: FastOcrGroupedLineDebug[];
}

const formatSeconds = (ms: number | null) => ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`;
const formatDimensions = (dimensions: { width: number; height: number } | null) =>
  dimensions ? `${dimensions.width} × ${dimensions.height}` : "indisponível";
const formatBox = (box: FastOcrBox) =>
  `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`;

function buildFastOcrDiagnosticsText(diagnostics: FastOcrDiagnostics): string {
  const lines: string[] = [];
  lines.push("DIAGNÓSTICO OCR RÁPIDO");
  lines.push("");
  lines.push("MÉTRICAS");
  lines.push(`Inicialização: ${formatSeconds(diagnostics.initializationMs)}`);
  lines.push(`OCR: ${formatSeconds(diagnostics.ocrMs)}`);
  lines.push(`Parser: ${formatSeconds(diagnostics.parserMs)}`);
  lines.push(`TOTAL: ${formatSeconds(diagnostics.totalMs)}`);
  lines.push("");
  lines.push("IMAGEM");
  lines.push(`Imagem OCR: ${formatDimensions(diagnostics.ocrInputDimensions)}`);
  lines.push(`Regiões (V6 Tiny): ${diagnostics.rawRegions.length}`);
  lines.push(`Linhas agrupadas: ${diagnostics.groupedLines.length}`);
  lines.push("");
  lines.push("SAÍDA BRUTA DO V6 TINY");
  if (diagnostics.rawRegions.length === 0) lines.push("(nenhuma região retornada)");
  for (const region of diagnostics.rawRegions) {
    lines.push(`#${region.index} "${region.text}" | conf=${region.confidence} | box=${formatBox(region.box)}`);
  }
  lines.push("");
  lines.push("APÓS AGRUPAMENTO");
  if (diagnostics.groupedLines.length === 0) lines.push("(nenhuma linha agrupada)");
  for (const line of diagnostics.groupedLines) {
    lines.push(`#${line.index} ${line.text}`);
    lines.push(`  regiões: ${JSON.stringify(line.parts)}`);
  }
  return lines.join("\n");
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  const clipboardWrite =
    typeof navigator !== "undefined" && navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(text).then(() => true, () => false)
      : Promise.resolve(false);
  if (await clipboardWrite) return true;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

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
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [readStatus, setReadStatus] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [freeOcrDiagnostics, setFreeOcrDiagnostics] = useState<FreeOcrDiagnostics | null>(null);
  const [fastOcrDiagnostics, setFastOcrDiagnostics] = useState<FastOcrDiagnostics | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const sharedChecked = useRef(false);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const [shareDiag, setShareDiag] = useState<ShareDiagnostics | null>(null);

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
        description: formatReceiptDescription(parsed, true),
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
      const totalStart = performance.now();
      let shouldOpenForm = false;
      let completedRun: { preparation: LocalOcrPreparationMetrics; ocr: PaddleOcrResult; parserMs: number } | null = null;
      setPendingFile(file);
      setFreeOcrDiagnostics(null);
      setFastOcrDiagnostics(null);
      setLoading(true);
      setError(null);
      setDuplicate(false);
      setReadStatus("Carregando modelo PaddleOCR...");
      try {
        const prepared = await (async () => {
          const localImage = await prepareReceiptForLocalOcr(file);
          const ocr = await paddleRecognize(localImage.image, (status) => setReadStatus(status));
          if (ocr.error) {
            completedRun = { preparation: localImage.metrics, ocr, parserMs: 0 };
            throw new Error("Não foi possível ler o comprovante agora. Verifique a foto e tente novamente.");
          }
          const parserStart = performance.now();
          const parsed = paddleToParsedReceipt(buildPaddleReceiptResult(ocr.regions));
          const parserMs = performance.now() - parserStart;
          completedRun = { preparation: localImage.metrics, ocr, parserMs };
          return {
            isReceipt: parsed.is_receipt,
            receiptRef: parsed.receipt_id ?? null,
            lowConfidence: parsed.low_confidence_fields || [],
            prefill: parsed.is_receipt ? buildPrefill(parsed) : null,
          };
        })();

        if (!prepared.isReceipt || !prepared.prefill) {
          setError("Essa imagem não parece ser um comprovante. Tente outra foto mais nítida.");
          return;
        }
        if (prepared.receiptRef) {
          const { data: existing } = await supabase
            .from("transactions")
            .select("id")
            .eq("receipt_ref", prepared.receiptRef)
            .limit(1);
          if (existing && existing.length > 0) setDuplicate(true);
        }
        setReceiptFile(file);
        setReceiptRef(prepared.receiptRef);
        setLowConfidence(prepared.lowConfidence);
        setPrefill(prepared.prefill);
        shouldOpenForm = true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível ler o comprovante.");
      } finally {
        const cleanupStart = performance.now();
        try {
          await disposePaddleRecognizer();
        } catch (disposeError) {
          console.warn("[receipt-import] failed to dispose PaddleOCR", disposeError);
        }
        try {
          await releaseDocumentOrientationSession();
        } catch (releaseError) {
          console.warn("[receipt-import] failed to release document orientation session", releaseError);
        }
        const cleanupMs = performance.now() - cleanupStart;
        if (completedRun) {
          setFreeOcrDiagnostics(logFreeOcrMetrics(
            completedRun.preparation,
            completedRun.ocr,
            completedRun.parserMs,
            cleanupMs,
            performance.now() - totalStart,
          ));
        }
        setLoading(false);
        setReadStatus("");
      }
      if (shouldOpenForm) setFormOpen(true);
    },
    [accounts, creditCards, allCategoryNames, buildPrefill],
  );

  const processFileFast = useCallback(
    async (file: File) => {
      const totalStart = performance.now();
      let shouldOpenForm = false;
      let completedRun: {
        initializationMs: number;
        ocrMs: number;
        parserMs: number;
        ocrInputDimensions: { width: number; height: number } | null;
        rawRegions: FastOcrRawRegionDebug[];
        groupedLines: FastOcrGroupedLineDebug[];
      } | null = null;
      setPendingFile(file);
      setFreeOcrDiagnostics(null);
      setFastOcrDiagnostics(null);
      setCopyFeedback(null);
      setLoading(true);
      setError(null);
      setDuplicate(false);
      setReadStatus("Preparando imagem...");
      try {
        const localImage = await prepareReceiptForLocalOcr(file);
        setReadStatus("Carregando modelo de OCR rápido...");
        const ocr = await fastOcrRecognize(localImage.image, (status) => setReadStatus(status));
        const rawRegions = summarizeFastOcrRawLines(ocr.rawLines ?? []);
        const groupedLines = summarizeFastOcrGroupedLines(ocr.regions);
        const parserStart = performance.now();
        const parsed = paddleToParsedReceipt(buildPaddleReceiptResult(ocr.regions));
        const parserMs = performance.now() - parserStart;
        completedRun = {
          initializationMs: ocr.initializationMs,
          ocrMs: ocr.ocrMs,
          parserMs,
          ocrInputDimensions: localImage.metrics.outputDimensions,
          rawRegions,
          groupedLines,
        };

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
        shouldOpenForm = true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível ler o comprovante com o OCR rápido.");
      } finally {
        try {
          await releaseDocumentOrientationSession();
        } catch (releaseError) {
          console.warn("[receipt-import] failed to release document orientation session", releaseError);
        }
        if (completedRun) {
          setFastOcrDiagnostics({
            initializationMs: Math.round(completedRun.initializationMs),
            ocrMs: Math.round(completedRun.ocrMs),
            parserMs: Math.round(completedRun.parserMs),
            totalMs: Math.round(performance.now() - totalStart),
            ocrInputDimensions: completedRun.ocrInputDimensions,
            rawRegions: completedRun.rawRegions,
            groupedLines: completedRun.groupedLines,
          });
        }
        setLoading(false);
        setReadStatus("");
      }
      if (shouldOpenForm) setFormOpen(true);
    },
    [buildPrefill],
  );

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current !== null) window.clearTimeout(copyFeedbackTimerRef.current);
    };
  }, []);

  const copyFastOcrDiagnostics = useCallback(async () => {
    if (!fastOcrDiagnostics) return;
    const copied = await copyTextToClipboard(buildFastOcrDiagnosticsText(fastOcrDiagnostics));
    if (copyFeedbackTimerRef.current !== null) window.clearTimeout(copyFeedbackTimerRef.current);
    setCopyFeedback(copied ? "Diagnóstico copiado" : "Não foi possível copiar");
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackTimerRef.current = null;
    }, 2500);
  }, [fastOcrDiagnostics]);

  const processFileWithAi = useCallback(
    async (file: File) => {
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
        setError(e instanceof Error ? e.message : "Não foi possível ler o comprovante com IA.");
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
    const openedByShare = new URLSearchParams(window.location.search).has("shared");
    void takeSharedReceiptWithDiagnostics().then(({ file, diag }) => {
      if (openedByShare) setShareDiag(diag);
      if (file) {
        void processFile(file);
      }
    });
  }, [processFile]);

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

      {shareDiag && (
        <details className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground" open={!shareDiag.page.found}>
          <summary className="cursor-pointer font-medium text-foreground">
            Diagnóstico do compartilhamento: {shareDiag.page.found ? "foto recebida" : "foto não encontrada"}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify(shareDiag, null, 2)}</pre>
        </details>
      )}

      <Card className="p-6 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Lendo o comprovante...</p>
            {readStatus && <p className="text-xs text-muted-foreground">{readStatus}</p>}
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
            {pendingFile && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="truncate text-sm font-medium">{pendingFile.name}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="gap-2" disabled={loading} onClick={() => void processFile(pendingFile)}>
                    <ScanLine className="h-4 w-4" /> Ler gratuitamente
                  </Button>
                  <Button variant="outline" disabled={loading} onClick={() => setAiConfirmOpen(true)}>
                    ✨ Ler com IA
                  </Button>
                  <Button variant="outline" className="gap-2" disabled={loading} onClick={() => void processFileFast(pendingFile)}>
                    ⚡ Testar OCR rápido
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">A leitura gratuita usa o OCR local e tem custo R$ 0,00.</p>
              </div>
            )}
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

        {freeOcrDiagnostics && !loading && (
          <div data-testid="free-ocr-diagnostics" className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Diagnóstico OCR</h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-muted-foreground">
              <dt>Preparação:</dt><dd>{formatSeconds(freeOcrDiagnostics.preparationMs)}</dd>
              <dt>Orientação:</dt><dd>{formatSeconds(freeOcrDiagnostics.orientationMs)}</dd>
              <dt>Inicialização Paddle:</dt><dd>{formatSeconds(freeOcrDiagnostics.paddleInitializationMs)}</dd>
              <dt>Inferência total:</dt><dd>{formatSeconds(freeOcrDiagnostics.paddleInferenceMs)}</dd>
              <dt>Detecção (SDK):</dt><dd>{formatSeconds(freeOcrDiagnostics.detectionMs)}</dd>
              <dt>Reconhecimento (SDK):</dt><dd>{formatSeconds(freeOcrDiagnostics.recognitionMs)}</dd>
              <dt>Parser:</dt><dd>{formatSeconds(freeOcrDiagnostics.parserMs)}</dd>
              <dt>Liberação de recursos:</dt><dd>{formatSeconds(freeOcrDiagnostics.cleanupMs)}</dd>
              <dt className="font-semibold text-foreground">TOTAL:</dt>
              <dd className="font-semibold text-foreground">{formatSeconds(freeOcrDiagnostics.totalMs)}</dd>
              <dt>Imagem original:</dt><dd>{formatDimensions(freeOcrDiagnostics.originalDimensions)}</dd>
              <dt>Imagem OCR:</dt><dd>{formatDimensions(freeOcrDiagnostics.ocrInputDimensions)}</dd>
            </dl>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Detecção e reconhecimento são tempos internos do SDK e fazem parte da inferência.
            </p>
          </div>
        )}

        {fastOcrDiagnostics && !loading && (
          <div data-testid="fast-ocr-diagnostics" className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold text-foreground">DIAGNÓSTICO OCR RÁPIDO</h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-muted-foreground">
              <dt>Inicialização:</dt><dd>{formatSeconds(fastOcrDiagnostics.initializationMs)}</dd>
              <dt>OCR:</dt><dd>{formatSeconds(fastOcrDiagnostics.ocrMs)}</dd>
              <dt>Parser:</dt><dd>{formatSeconds(fastOcrDiagnostics.parserMs)}</dd>
              <dt className="font-semibold text-foreground">TOTAL:</dt>
              <dd className="font-semibold text-foreground">{formatSeconds(fastOcrDiagnostics.totalMs)}</dd>
              <dt>Imagem OCR:</dt><dd>{formatDimensions(fastOcrDiagnostics.ocrInputDimensions)}</dd>
            </dl>

            <div data-testid="fast-ocr-raw-output">
              <h4 className="mb-1 mt-3 text-sm font-semibold text-foreground">
                SAÍDA BRUTA DO V6 TINY
              </h4>
              <ol className="space-y-0.5 text-muted-foreground">
                {fastOcrDiagnostics.rawRegions.map((region) => (
                  <li key={region.index} className="whitespace-pre-wrap break-all">
                    #{region.index} "{region.text}" | conf={region.confidence} | box={formatBox(region.box)}
                  </li>
                ))}
                {fastOcrDiagnostics.rawRegions.length === 0 && (
                  <li className="text-muted-foreground">(nenhuma região retornada)</li>
                )}
              </ol>
            </div>

            <div data-testid="fast-ocr-grouped-lines">
              <h4 className="mb-1 mt-3 text-sm font-semibold text-foreground">
                APÓS AGRUPAMENTO
              </h4>
              <ol className="space-y-0.5 text-muted-foreground">
                {fastOcrDiagnostics.groupedLines.map((line) => (
                  <li key={line.index} className="whitespace-pre-wrap break-all">
                    #{line.index} {line.text}
                    {line.parts.length > 1 ? `\n  regiões: ${JSON.stringify(line.parts)}` : null}
                  </li>
                ))}
                {fastOcrDiagnostics.groupedLines.length === 0 && (
                  <li className="text-muted-foreground">(nenhuma linha agrupada)</li>
                )}
              </ol>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="fast-ocr-copy-button"
                onClick={() => void copyFastOcrDiagnostics()}
              >
                📋 Copiar diagnóstico
              </Button>
              {copyFeedback && (
                <span data-testid="fast-ocr-copy-feedback" className="text-muted-foreground">
                  {copyFeedback}
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      <Dialog open={aiConfirmOpen} onOpenChange={setAiConfirmOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Ler com IA</DialogTitle>
            <DialogDescription>
              Esta leitura utiliza a IA do Lovable e pode consumir seus créditos. Deseja continuar?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAiConfirmOpen(false)}>Cancelar</Button>
            <Button
              type="button"
              onClick={() => {
                setAiConfirmOpen(false);
                if (pendingFile) void processFileWithAi(pendingFile);
              }}
            >
              Continuar com IA
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
