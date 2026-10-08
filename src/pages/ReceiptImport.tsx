import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { isShareWorkerOutdated, takeSharedReceiptWithDiagnostics, type ShareDiagnostics } from "@/lib/shared-receipt";
import { parseReceipt, prepareReceiptForLocalOcr, matchByName, matchCategory, ParsedReceipt, type LocalOcrPreparationMetrics } from "@/lib/receipt";
import { formatReceiptDescription } from "@/lib/receipt-description";
import { buildPaddleReceiptResult } from "@/lib/ocr-paddle-test/receiptResult";
import { paddleToParsedReceipt } from "@/lib/ocr-paddle-test/paddleToParsedReceipt";
import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import { paddleRecognize } from "@/lib/paddle-ocr-worker";
import {
  interpretReceiptLocally,
  toLocalReceiptInput,
  type LocalInterpretationMetrics,
} from "@/lib/local-receipt-ai";
import { releaseDocumentOrientationSession } from "@/lib/receipt-image-orientation";
import { supabase } from "@/integrations/supabase/client";
import { Transaction, PaymentMethod, PAYMENT_METHODS, Category } from "@/lib/types";

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
  const localSnapshotRef = useRef<{
    regions: PaddleOcrRegion[];
    fallback: ParsedReceipt;
  } | null>(null);
  const [localSnapshotAvailable, setLocalSnapshotAvailable] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState("");
  const [localMetrics, setLocalMetrics] = useState<LocalInterpretationMetrics | null>(null);
  const localRunId = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const sharedChecked = useRef(false);
  const [shareDiag, setShareDiag] = useState<ShareDiagnostics | null>(null);
  const openedByShare = new URLSearchParams(window.location.search).has("shared");
  const prefillAttachments = useMemo(
    () => receiptFile ? [receiptFile] : undefined,
    [receiptFile],
  );

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

  const processFileFast = useCallback(
    async (file: File) => {
      const totalStart = performance.now();
      let completedRun: {
        initializationMs: number;
        ocrMs: number;
        parserMs: number;
        preparation: LocalOcrPreparationMetrics;
        regionCount: number;
        itemCount: number;
      } | null = null;
      setPendingFile(file);
      setLoading(true);
      setError(null);
      setDuplicate(false);
      localSnapshotRef.current = null;
      setLocalSnapshotAvailable(false);
      setLocalMetrics(null);
      setLocalStatus("");
      setReadStatus("Preparando imagem...");
      try {
        const localImage = await prepareReceiptForLocalOcr(file);
        setReadStatus("Carregando OCR...");
        const ocr = await paddleRecognize(localImage.image, (status) => setReadStatus(status));
        setReadStatus("Extraindo dados...");
        const parserStart = performance.now();
        const receiptResult = buildPaddleReceiptResult(ocr.regions);
        const parsed = paddleToParsedReceipt(receiptResult);
        const parserMs = performance.now() - parserStart;
        completedRun = {
          initializationMs: ocr.initializationMs,
          ocrMs: ocr.ocrMs,
          parserMs,
          preparation: localImage.metrics,
          regionCount: ocr.regions.length,
          itemCount: receiptResult.items.length,
        };

        if (!parsed.is_receipt) {
          setError("Essa imagem não parece ser um comprovante. Tente outra foto mais nítida.");
          return;
        }
        setReceiptFile(file);
        setReceiptRef(parsed.receipt_id ?? null);
        setLowConfidence(parsed.low_confidence_fields || []);
        setPrefill(buildPrefill(parsed));
        localSnapshotRef.current = {
          regions: ocr.regions,
          fallback: parsed,
        };
        setLocalSnapshotAvailable(true);
        setFormOpen(true);

        const receiptId = parsed.receipt_id;
        if (receiptId) {
          void supabase
            .from("transactions")
            .select("id")
            .eq("receipt_ref", receiptId)
            .limit(1)
            .then(({ data: existing }) => {
              if (localSnapshotRef.current?.fallback !== parsed) return;
              if (existing && existing.length > 0) setDuplicate(true);
            });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível concluir a leitura gratuita.");
      } finally {
        try {
          await releaseDocumentOrientationSession();
        } catch (releaseError) {
          console.warn("[receipt-import] failed to release document orientation session", releaseError);
        }
        if (completedRun && import.meta.env.MODE !== "test") {
          console.info("[receipt-import] full OCR metrics", {
            initializationMs: Math.round(completedRun.initializationMs),
            ocrMs: Math.round(completedRun.ocrMs),
            parserMs: Math.round(completedRun.parserMs),
            totalMs: Math.round(performance.now() - totalStart),
            regionCount: completedRun.regionCount,
            itemCount: completedRun.itemCount,
            originalDimensions: completedRun.preparation.originalDimensions,
            ocrInputDimensions: completedRun.preparation.outputDimensions,
            normalization: completedRun.preparation.normalization,
          });
        }
        setLoading(false);
        setReadStatus("");
      }
    },
    [buildPrefill],
  );

  const interpretLocally = useCallback(async () => {
    const snapshot = localSnapshotRef.current;
    if (!snapshot || localLoading) return;
    const run = localRunId.current + 1;
    localRunId.current = run;
    setLocalLoading(true);
    setError(null);
    setLocalStatus("Preparando interpretação local...");
    try {
      const input = toLocalReceiptInput(
        snapshot.regions,
        allCategoryNames,
        [...accounts.map((a) => `${a.name} (${a.bank})`), ...creditCards.map((c) => `${c.name} (${c.bank})`)],
      );
      const parsed = await interpretReceiptLocally(input, {
        fallback: snapshot.fallback,
        onProgress: (status) => {
          if (localRunId.current === run) setLocalStatus(status);
        },
        onMetrics: (metrics) => {
          if (localRunId.current === run) {
            setLocalMetrics(metrics);
            if (import.meta.env.MODE !== "test") {
              console.info("[receipt-import] local AI metrics", {
                modelId: metrics.modelId,
                backend: metrics.backend,
                initializationMs: Math.round(metrics.initializationMs),
                inferenceMs: Math.round(metrics.inferenceMs),
                totalMs: Math.round(metrics.totalMs),
                fallbackUsed: metrics.fallbackUsed,
              });
            }
          }
        },
      });
      if (localRunId.current !== run) return;
      if (parsed.receipt_id && parsed.receipt_id !== (snapshot.fallback.receipt_id ?? null)) {
        const { data: existing } = await supabase
          .from("transactions")
          .select("id")
          .eq("receipt_ref", parsed.receipt_id)
          .limit(1);
        if (existing && existing.length > 0) setDuplicate(true);
      }
      setReceiptRef(parsed.receipt_id ?? null);
      setLowConfidence(parsed.low_confidence_fields || []);
      setPrefill(buildPrefill(parsed));
      setFormOpen(true);
    } catch (e) {
      if (localRunId.current !== run) return;
      setError(e instanceof Error ? e.message : "Não foi possível executar a interpretação local.");
    } finally {
      if (localRunId.current === run) {
        setLocalLoading(false);
        setLocalStatus("");
      }
    }
  }, [accounts, allCategoryNames, buildPrefill, creditCards, localLoading]);

  const processFileWithAi = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      setDuplicate(false);
      localSnapshotRef.current = null;
      setLocalSnapshotAvailable(false);
      setLocalMetrics(null);
      setLocalStatus("");
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
      localSnapshotRef.current = null;
      setLocalSnapshotAvailable(false);
      setLocalMetrics(null);
      setLocalStatus("");
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
    void takeSharedReceiptWithDiagnostics().then(({ file, diag }) => {
      if (openedByShare) setShareDiag(diag);
      if (file) {
        void processFileFast(file);
      }
    });
  }, [processFileFast]);

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
  const reportedSwVersion = shareDiag?.sw?.swVersion;
  const shareWorkerOutdated = isShareWorkerOutdated(reportedSwVersion);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Ler comprovante</h1>
        <p className="text-muted-foreground mt-1">
          Envie a foto ou o PDF do comprovante e o app preenche o registro para você conferir.
        </p>
      </div>

      {openedByShare && shareDiag && !shareDiag.page.found && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
          Não foi possível receber a imagem compartilhada neste aparelho. Use 'Escolher arquivo' abaixo.
        </div>
      )}

      {shareDiag && (
        <details className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            Diagnóstico do compartilhamento: {shareDiag.page.found ? "arquivo recebido" : "arquivo não encontrado"}
          </summary>
          <p className="mt-2">swVersion: {typeof reportedSwVersion === "string" ? reportedSwVersion : "indisponível"}</p>
          {shareWorkerOutdated && <p className="mt-2 font-medium text-destructive">Service Worker desatualizado</p>}
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
                if (f) {
                  setPendingFile(f);
                  localSnapshotRef.current = null;
                  setLocalSnapshotAvailable(false);
                  setLocalMetrics(null);
                  setLocalStatus("");
                }
              }}
            />
            {pendingFile && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="truncate text-sm font-medium">{pendingFile.name}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="gap-2 sm:flex-1" disabled={loading} onClick={() => void processFileFast(pendingFile)}>
                    <ScanLine className="h-4 w-4" /> Ler gratuitamente
                  </Button>
                  <Button variant="outline" disabled={loading} onClick={() => setAiConfirmOpen(true)}>
                    ✨ Ler com IA
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
          prefillAttachments={prefillAttachments}
          lowConfidence={lowConfidence}
          localAiAction={localSnapshotAvailable ? {
            running: localLoading,
            status: localStatus,
            metricsText: !localLoading && localMetrics
              ? `Modelo local: ${localMetrics.modelId} · ${localMetrics.backend} · inicialização ${Math.round(localMetrics.initializationMs)}ms · inferência ${Math.round(localMetrics.inferenceMs)}ms · total ${Math.round(localMetrics.totalMs)}ms`
              : null,
            fallbackMessage: !localLoading && localMetrics?.fallbackUsed
              ? (localMetrics.error ?? "Não foi possível melhorar a leitura localmente; mantido resultado original.")
              : null,
            onImprove: () => void interpretLocally(),
          } : undefined}
          title="Confira o registro"
          submitLabel="Salvar registro"
          onSubmit={async (data, options) => {
            const created = await addTransaction(data, { ...options, receiptRef: receiptRef ?? undefined });
            if (!created) return false;
            toast({ title: "Registro criado a partir do comprovante" });
            navigate("/records");
            return true;
          }}
        />
      )}
    </div>
  );
}
