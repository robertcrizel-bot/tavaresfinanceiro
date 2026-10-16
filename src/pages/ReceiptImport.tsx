import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Loader2, Paperclip, RefreshCw, ScanLine, AlertTriangle, FileText, ChevronDown, Sparkles } from "lucide-react";
import { TransactionForm } from "@/components/TransactionForm";
import { useFinance } from "@/contexts/FinanceContext";
import { useAccounts } from "@/contexts/AccountContext";
import { useCategories } from "@/contexts/CategoryContext";
import { toast } from "@/hooks/use-toast";
import { isShareWorkerOutdated, takeSharedReceiptWithDiagnostics, type ShareDiagnostics } from "@/lib/shared-receipt";
import { beginAppBusy, endAppBusy } from "@/lib/app-update";
import { parseReceipt, parseReceiptFree, getFreeAiStatus, prepareReceiptForLocalOcr, matchByName, matchCategory, ParsedReceipt, type LocalOcrPreparationMetrics } from "@/lib/receipt";
import { formatReceiptDescription } from "@/lib/receipt-description";
import { buildPaddleReceiptResult } from "@/lib/ocr-paddle-test/receiptResult";
import { paddleToParsedReceipt } from "@/lib/ocr-paddle-test/paddleToParsedReceipt";
import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import { paddleRecognizeWorker, PaddleOcrError, formatOcrDiagnostic } from "@/lib/paddle-ocr-worker";
import {
  interpretReceiptLocally,
  toLocalReceiptInput,
  type LocalInterpretationMetrics,
} from "@/lib/local-receipt-ai";
import { releaseDocumentOrientationSession } from "@/lib/receipt-image-orientation";
import { releaseIdleLocalReceiptModel } from "@/lib/local-receipt-ai/model";
import { CAMERA_FRAME_ASPECT, coverCropForAspect } from "@/lib/camera-crop";
import { supabase } from "@/integrations/supabase/client";
import { Transaction, PaymentMethod, PAYMENT_METHODS, Category } from "@/lib/types";

type FreeAiUiState = "checking" | "available" | "unavailable" | "error";

// Keep capture and processing leases across route remounts.
let cameraEncoding = false;
const receiptReadInFlight = { current: false };

export default function ReceiptImport() {
  const navigate = useNavigate();
  const { addTransaction } = useFinance();
  const { accounts, creditCards } = useAccounts();
  const { allCategoryNames } = useCategories();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrDiagnostic, setOcrDiagnostic] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Partial<Omit<Transaction, "id">> | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptRef, setReceiptRef] = useState<string | null>(null);
  const [lowConfidence, setLowConfidence] = useState<string[]>([]);
  const [duplicate, setDuplicate] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);
  const [freeAiConfirmOpen, setFreeAiConfirmOpen] = useState(false);
  const [freeAiState, setFreeAiState] = useState<FreeAiUiState>("checking");
  const freeAiRetriesRef = useRef(0);
  const freeAiCheckRunRef = useRef(0);
  const freeAiMountedRef = useRef(true);
  const previousPendingFileRef = useRef<File | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const cameraOpeningRef = useRef(false);
  const captureRunRef = useRef(0);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [capturing, setCapturing] = useState(false);
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
  const freeReadInFlight = receiptReadInFlight;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const sharedChecked = useRef(false);
  const pickerOpenRef = useRef(false);
  const pickerReturnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shareDiag, setShareDiag] = useState<ShareDiagnostics | null>(null);
  const openedByShare = new URLSearchParams(window.location.search).has("shared");
  const prefillAttachments = useMemo(
    () => receiptFile ? [receiptFile] : undefined,
    [receiptFile],
  );

  useEffect(() => {
    const reasons: string[] = [];
    if (loading || localLoading) reasons.push("ocr");
    if (cameraOpen || cameraStarting) reasons.push("camera");
    if (formOpen) reasons.push("form");
    if (receiptFile || pendingFile) reasons.push("file");
    reasons.forEach(beginAppBusy);
    return () => reasons.forEach(endAppBusy);
  }, [loading, localLoading, cameraOpen, cameraStarting, formOpen, receiptFile, pendingFile]);

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
      // Repeated taps must never start a second concurrent OCR read.
      if (freeReadInFlight.current || cameraEncoding || cameraOpeningRef.current || cameraStreamRef.current) return;
      freeReadInFlight.current = true;
      const totalStart = performance.now();
      let completedRun: {
        initializationMs: number;
        ocrMs: number;
        parserMs: number;
        preparation: LocalOcrPreparationMetrics;
        regionCount: number;
         itemCount: number;
         mode: "full" | "tiled";
         tiles: number;
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
      setOcrDiagnostic(null);
      let localImageDims: string | null = null;
      try {
        const localImage = await prepareReceiptForLocalOcr(file);
        const dims = localImage.metrics.originalDimensions;
        localImageDims = dims ? `${dims.width}x${dims.height}` : null;
        setReadStatus("Inicializando OCR...");
        const ocr = await paddleRecognizeWorker(localImage.image, (status) => setReadStatus(status));
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
           mode: ocr.mode,
           tiles: ocr.tiles,
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
        if (e instanceof PaddleOcrError) {
          const original = localImageDims;
          setOcrDiagnostic(formatOcrDiagnostic(e.diagnostic, original));
        }
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
             mode: completedRun.mode,
             tiles: completedRun.tiles,
          });
        }
        setLoading(false);
        setReadStatus("");
        freeReadInFlight.current = false;
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
      if (freeReadInFlight.current || cameraEncoding || cameraOpeningRef.current || cameraStreamRef.current) return;
      freeReadInFlight.current = true;
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
        freeReadInFlight.current = false;
        setLoading(false);
      }
    },
    [accounts, creditCards, allCategoryNames, buildPrefill],
  );

  const processFileWithFreeAi = useCallback(
    async (file: File) => {
      if (freeReadInFlight.current || cameraEncoding || cameraOpeningRef.current || cameraStreamRef.current) return;
      freeReadInFlight.current = true;
      setLoading(true);
      setError(null);
      setDuplicate(false);
      localSnapshotRef.current = null;
      setLocalSnapshotAvailable(false);
      setLocalMetrics(null);
      setLocalStatus("");
      setReadStatus("Lendo com IA grátis...");
      try {
        const parsed = await parseReceiptFree(file, {
          categories: allCategoryNames,
          accounts: [...accounts.map((a) => `${a.name} (${a.bank})`), ...creditCards.map((c) => `${c.name} (${c.bank})`)],
        });
        setReadStatus("Extraindo dados...");
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
        setError(e instanceof Error ? e.message : "Não foi possível ler o comprovante com IA grátis.");
      } finally {
        freeReadInFlight.current = false;
        setLoading(false);
        setReadStatus("");
      }
    },
    [accounts, creditCards, allCategoryNames, buildPrefill],
  );

  const releaseCamera = useCallback(() => {
    cameraRequestRef.current++;
    cameraOpeningRef.current = false;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const closeCamera = useCallback(() => {
    captureRunRef.current++;
    if (captureCanvasRef.current) {
      captureCanvasRef.current.width = 0;
      captureCanvasRef.current.height = 0;
      captureCanvasRef.current = null;
    }
    setCapturing(false);
    releaseCamera();
    setCameraStream(null);
    setCameraStarting(false);
    setCameraReady(false);
    setCameraOpen(false);
  }, [releaseCamera]);

  useEffect(() => () => {
    captureRunRef.current++;
    if (captureCanvasRef.current) {
      captureCanvasRef.current.width = 0;
      captureCanvasRef.current.height = 0;
      captureCanvasRef.current = null;
    }
    releaseCamera();
  }, [releaseCamera]);

  const finishFilePicker = useCallback(() => {
    if (pickerReturnTimerRef.current) clearTimeout(pickerReturnTimerRef.current);
    pickerReturnTimerRef.current = null;
    if (!pickerOpenRef.current) return;
    pickerOpenRef.current = false;
    endAppBusy("file-picker");
  }, []);

  const releaseIdleReaderMemory = useCallback(() => {
    if (loading || localLoading) return;
    releaseIdleLocalReceiptModel();
    void releaseDocumentOrientationSession().catch(() => {});
  }, [loading, localLoading]);

  const openFilePicker = () => {
    if (loading || localLoading || pickerOpenRef.current || cameraEncoding || freeReadInFlight.current || cameraOpeningRef.current || cameraStreamRef.current) return;
    closeCamera();
    releaseIdleReaderMemory();
    pickerOpenRef.current = true;
    // Block foreground update/reload while Android's external selector owns the screen.
    beginAppBusy("file-picker");
    try {
      fileInputRef.current?.click();
    } catch {
      finishFilePicker();
      setError("Não foi possível abrir a galeria. Tente a câmera interna.");
    }
  };

  useEffect(() => {
    const input = fileInputRef.current;
    const returned = () => {
      if (!pickerOpenRef.current || document.visibilityState === "hidden") return;
      // Focus can precede change/cancel. Never read, decode or retry on focus alone.
      if (pickerReturnTimerRef.current) clearTimeout(pickerReturnTimerRef.current);
      pickerReturnTimerRef.current = setTimeout(finishFilePicker, 300);
    };
    const hide = () => {
      const interrupted = cameraOpeningRef.current || cameraStreamRef.current || captureCanvasRef.current;
      closeCamera();
      releaseIdleReaderMemory();
      if (interrupted) setError("Câmera interrompida. Toque em Tirar foto para tentar novamente. O arquivo anterior foi mantido.");
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") hide();
      else returned();
    };
    input?.addEventListener("cancel", finishFilePicker);
    window.addEventListener("focus", returned);
    window.addEventListener("pageshow", returned);
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      input?.removeEventListener("cancel", finishFilePicker);
      window.removeEventListener("focus", returned);
      window.removeEventListener("pageshow", returned);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
      finishFilePicker();
    };
  }, [closeCamera, finishFilePicker, releaseIdleReaderMemory]);

  useEffect(() => {
    const video = videoRef.current;
    if (!cameraStream || !video) return;
    video.srcObject = cameraStream;
    void video.play().catch(() => {
      if (cameraStreamRef.current !== cameraStream) return;
      closeCamera();
      setError("Não foi possível iniciar a câmera. Use Galeria/arquivo para enviar a foto.");
    });
    return () => {
      if (video.srcObject === cameraStream) video.srcObject = null;
    };
  }, [cameraStream, closeCamera]);

  const openCamera = async () => {
    if (cameraOpeningRef.current || cameraStreamRef.current || cameraEncoding || freeReadInFlight.current || localLoading || pickerOpenRef.current) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("A câmera não está disponível neste navegador. Use Galeria/arquivo para enviar a foto.");
      return;
    }

    cameraOpeningRef.current = true;
    const requestId = ++cameraRequestRef.current;
    setCameraOpen(true);
    setCameraStarting(true);
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 960, max: 1280 },
          height: { ideal: 1280, max: 1280 },
          frameRate: { ideal: 15, max: 15 },
          // Ask for the portrait aspect the preview frame uses; ideal, so a
          // camera that ignores it still works via the center-crop below.
          aspectRatio: { ideal: CAMERA_FRAME_ASPECT },
        },
        audio: false,
      });
      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraOpeningRef.current = false;
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraStarting(false);
    } catch (cameraError) {
      if (cameraRequestRef.current !== requestId) return;
      closeCamera();
      const permissionDenied = (cameraError as { name?: string })?.name === "NotAllowedError";
      setError(permissionDenied
        ? "A permissão da câmera foi negada. Autorize o acesso ou use Galeria/arquivo."
        : "Não foi possível abrir a câmera. Use Galeria/arquivo para enviar a foto.");
    }
  };

  const captureCameraPhoto = async () => {
    if (cameraEncoding || freeReadInFlight.current || !cameraStreamRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("A câmera ainda não está pronta. Aguarde um instante e tente novamente.");
      return;
    }

    const crop = coverCropForAspect(video.videoWidth, video.videoHeight, CAMERA_FRAME_ASPECT);
    if (!crop.sWidth || !crop.sHeight) {
      setError("A câmera ainda não está pronta. Aguarde um instante e tente novamente.");
      return;
    }

    // One bounded RGBA surface, at most 960 × 1280 (~4.7 MiB), no image decode.
    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(crop.sWidth, crop.sHeight));
    cameraEncoding = true;
    setCapturing(true);
    const canvas = document.createElement("canvas");
    captureCanvasRef.current = canvas;
    canvas.width = Math.round(crop.sWidth * scale);
    canvas.height = Math.round(crop.sHeight * scale);

    const captureRun = captureRunRef.current;
    let encodingPending = false;
    try {
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(video, crop.sx, crop.sy, crop.sWidth, crop.sHeight, 0, 0, canvas.width, canvas.height);
      // Release video buffers before encoding; keep the modal and lease busy.
      releaseCamera();
      setCameraStream(null);
      setCameraReady(false);
      const blob = await new Promise<Blob | null>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("capture timeout")), 12000);
        try {
          encodingPending = true;
          canvas.toBlob((result) => {
            encodingPending = false;
            cameraEncoding = false;
            window.clearTimeout(timer);
            resolve(result);
          }, "image/jpeg", 0.85);
        } catch (error) {
          encodingPending = false;
          window.clearTimeout(timer);
          reject(error);
        }
      });
      if (captureRunRef.current !== captureRun) return;
      if (!blob) throw new Error("capture failed");
      const file = new File([blob], `comprovante-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      closeCamera();
      setPendingFile(file);
      localSnapshotRef.current = null;
      setLocalSnapshotAvailable(false);
      setLocalMetrics(null);
      setLocalStatus("");
    } catch {
      if (captureRunRef.current !== captureRun) return;
      closeCamera();
      setError(encodingPending
        ? "A câmera demorou para preparar a foto. Aguarde a liberação da imagem; se persistir, recarregue a página. O arquivo anterior foi mantido."
        : "Não foi possível fotografar o comprovante. O arquivo anterior foi mantido. Tente novamente ou use Galeria/arquivo.");
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      if (captureCanvasRef.current === canvas) captureCanvasRef.current = null;
      if (!encodingPending) cameraEncoding = false;
      if (captureRunRef.current === captureRun) setCapturing(false);
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

  const checkFreeAi = useCallback(async () => {
    const runId = ++freeAiCheckRunRef.current;
    setFreeAiState("checking");
    const result = await getFreeAiStatus();
    if (!freeAiMountedRef.current || freeAiCheckRunRef.current !== runId) return;
    if (result.state === "available") {
      freeAiRetriesRef.current = 0;
      setFreeAiState("available");
      return;
    }
    if (result.state === "unavailable") {
      setFreeAiState("unavailable");
      return;
    }
    setFreeAiState("error");
    if (result.reason === "unauthorized" && freeAiRetriesRef.current < 2) {
      const attempt = ++freeAiRetriesRef.current;
      window.setTimeout(() => {
        if (freeAiMountedRef.current) void checkFreeAi();
      }, 1500 * attempt);
    }
  }, []);

  useEffect(() => {
    freeAiMountedRef.current = true;
    void checkFreeAi();
    return () => {
      freeAiMountedRef.current = false;
    };
  }, [checkFreeAi]);

  useEffect(() => {
    if (pendingFile && !previousPendingFileRef.current && freeAiState === "error") {
      void checkFreeAi();
    }
    previousPendingFileRef.current = pendingFile;
  }, [pendingFile, freeAiState, checkFreeAi]);

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
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Ler comprovante</h1>
        <p className="text-muted-foreground mt-1">
          Envie a foto ou o PDF do comprovante e o app preenche o registro para você conferir.
        </p>
      </div>

      {openedByShare && shareDiag && !shareDiag.page.found && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
          Não foi possível receber a imagem compartilhada neste aparelho. Use 'Galeria/arquivo' abaixo.
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

      <Card className="p-4 space-y-4 sm:p-6">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Lendo o comprovante...</p>
            {readStatus && <p className="text-xs text-muted-foreground">{readStatus}</p>}
          </div>
        ) : (
          <>
            {pendingFile ? (
              <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <FileText aria-hidden="true" className="h-6 w-6 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Arquivo selecionado</p>
                  <p className="break-all text-sm font-medium">{pendingFile.name}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="receipt-picker-hint">
                Escolha uma imagem ou PDF. Para fotografar, use "Tirar foto".
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant={pendingFile ? "ghost" : "default"} className="gap-2" disabled={capturing || cameraOpen || localLoading} onClick={openFilePicker}>
                <Paperclip className="h-4 w-4" /> {pendingFile ? "Trocar arquivo" : "Galeria/arquivo"}
              </Button>
              <Button variant={pendingFile ? "ghost" : "outline"} className="gap-2" disabled={capturing || cameraOpen || localLoading} onClick={() => void openCamera()}>
                <Camera className="h-4 w-4" /> {pendingFile ? "Tirar nova foto" : "Tirar foto"}
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                finishFilePicker();
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f && !cameraEncoding && !freeReadInFlight.current && !cameraOpeningRef.current && !cameraStreamRef.current) {
                  setReceiptFile(null);
                  setReceiptRef(null);
                  setPrefill(null);
                  setLowConfidence([]);
                  setDuplicate(false);
                  setError(null);
                  setPendingFile(f);
                  localSnapshotRef.current = null;
                  setLocalSnapshotAvailable(false);
                  setLocalMetrics(null);
                  setLocalStatus("");
                }
              }}
            />
            {pendingFile && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  {freeAiState === "available" && (
                      <Button className="min-h-12 w-full gap-2.5 rounded-xl border border-primary/30 bg-[hsl(169_66%_28%)] px-5 text-base font-bold text-white shadow-sm shadow-primary/15 hover:bg-[hsl(169_66%_25%)] hover:text-white active:bg-[hsl(169_66%_22%)] active:text-white active:shadow-none disabled:shadow-none" disabled={loading || capturing || cameraOpen || localLoading} onClick={() => setFreeAiConfirmOpen(true)}>
                      <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-white" />
                      Ler comprovante grátis
                    </Button>
                  )}
                  {freeAiState === "checking" && (
                    <Button variant="outline" disabled>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando IA grátis...
                    </Button>
                  )}
                  {freeAiState === "error" && (
                    <Button type="button" variant="outline" className="gap-2" disabled={loading || capturing || cameraOpen || localLoading} onClick={() => void checkFreeAi()}>
                      <RefreshCw className="h-4 w-4" /> Verificar novamente
                    </Button>
                  )}
                </div>
                {freeAiState === "error" && (
                  <p className="text-xs text-muted-foreground">
                    Não foi possível confirmar a IA grátis no servidor.
                  </p>
                )}
                {freeAiState === "unavailable" && (
                  <p className="text-xs text-muted-foreground">
                    IA grátis indisponível no servidor no momento.
                  </p>
                )}
                <details className="group border-t border-border pt-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    Outros métodos de leitura
                    <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" className="gap-2" disabled={loading || capturing || cameraOpen || localLoading} onClick={() => void processFileFast(pendingFile)}>
                      <ScanLine className="h-4 w-4" /> OCR local
                    </Button>
                    <Button variant="ghost" disabled={loading || capturing || cameraOpen || localLoading} onClick={() => setAiConfirmOpen(true)}>
                      IA do Lovable
                    </Button>
                  </div>
                </details>
              </div>
            )}
            {!pendingFile && <p className="text-xs text-muted-foreground">Confira os dados antes de salvar.</p>}
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-2">
              <span>{error}</span>
              {ocrDiagnostic && (
                <pre className="select-all whitespace-pre-wrap break-all rounded bg-background/60 p-2 text-xs text-muted-foreground">
                  {ocrDiagnostic}
                </pre>
              )}
            </div>
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

      <Dialog open={freeAiConfirmOpen} onOpenChange={setFreeAiConfirmOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Ler com IA grátis (teste)</DialogTitle>
            <DialogDescription>
              Esta leitura envia a foto do comprovante para a Cloudflare Workers AI,
              usando o Gemma no plano gratuito (serviço externo, cota diária limitada e sem cobrança).
              Confira os dados antes de salvar. Deseja continuar?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFreeAiConfirmOpen(false)}>Cancelar</Button>
            <Button
              type="button"
              onClick={() => {
                setFreeAiConfirmOpen(false);
                if (pendingFile) void processFileWithFreeAi(pendingFile);
              }}
            >
              Continuar grátis
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cameraOpen} onOpenChange={(open) => !open && closeCamera()}>
        <DialogContent className="flex max-h-[calc(100dvh-0.75rem)] w-[calc(100%-0.75rem)] max-w-none flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Fotografar comprovante</DialogTitle>
            <DialogDescription>Enquadre todo o comprovante e mantenha o texto bem iluminado.</DialogDescription>
          </DialogHeader>
          <div
            data-testid="receipt-camera-frame"
            className="relative mx-auto aspect-[3/4] h-[min(68dvh,calc(100dvh-12rem),calc((100vw-2rem)*4/3))] min-h-0 shrink overflow-hidden rounded-md bg-black"
          >
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
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={closeCamera}>Cancelar</Button>
            <Button type="button" className="w-full gap-2 sm:w-auto" onClick={() => void captureCameraPhoto()} disabled={capturing || cameraStarting || !cameraReady}>
              <Camera className="h-4 w-4" /> Fotografar
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
