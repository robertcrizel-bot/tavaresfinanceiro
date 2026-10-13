import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import { BUILD_COMMIT } from "@/lib/build-info";
import { decodeImageToRgba, type RgbaImage } from "@/lib/paddle-ocr-worker-image";
import { PADDLE_OCR_TILE_COUNT } from "@/lib/paddle-ocr-tiling";

// Safety net against a permanently stuck read — not a duration target.
// Slow Android devices (e.g. Moto G32) can take 2-4 minutes to initialize
// PP-OCRv6 and run three sequential tile predictions on WASM.
export const PADDLE_OCR_TIMEOUT_MS = 300_000;
export const PADDLE_OCR_TIMEOUT_MESSAGE =
  "Não foi possível concluir a leitura gratuita. Você pode preencher manualmente ou usar Ler com IA.";
export type PaddleOcrMode = "full" | "tiled";

export interface PaddleOcrStageTimings {
  decodeMs: number | null;
  initializationMs: number | null;
  tileMs: number[];
  consolidationMs: number | null;
  totalMs: number | null;
}

export interface PaddleOcrTimingsPatch {
  initializationMs?: number;
  tileMs?: number[];
  consolidationMs?: number;
}

export interface PaddleWorkerOutcome {
  regions: PaddleOcrRegion[];
  text: string;
  confidence: number | null;
  initializationMs: number;
  ocrMs: number;
  detectedBoxes: number;
  recognizedCount: number;
  mode: PaddleOcrMode;
  tiles: number;
  tileTimingsMs: number[];
  consolidationMs: number | null;
  totalMs: number;
}

type PaddleOcrWorkerMessage =
  | { type: "progress"; message: string; stage?: string; timings?: PaddleOcrTimingsPatch }
  | {
      type: "result";
      regions: PaddleOcrRegion[];
      text: string;
      confidence: number | null;
      initializationMs: number;
      ocrMs: number;
       detectedBoxes: number;
       recognizedCount: number;
       mode: PaddleOcrMode;
       tiles: number;
       tileTimingsMs?: number[];
       consolidationMs?: number;
    }
  | { type: "error"; message: string; stage?: string };

export interface PaddleRecognizeWorkerDeps {
  createWorker?: () => Worker;
  timeoutMs?: number;
  decode?: (blob: Blob) => Promise<RgbaImage>;
  mode?: PaddleOcrMode;
}

export interface OcrDiagnostic {
  build: string;
  stage: string;
  elapsedMs: number;
  ocrDimensions: string | null;
  createImageBitmap: boolean;
  offscreenCanvas: boolean;
  mode: PaddleOcrMode;
  tiles: number;
  timings: string | null;
  error: string;
}

export class PaddleOcrError extends Error {
  diagnostic: OcrDiagnostic;
  constructor(message: string, diagnostic: OcrDiagnostic) {
    super(message);
    this.name = "PaddleOcrError";
    this.diagnostic = diagnostic;
  }
}

export function formatStageTimings(timings: PaddleOcrStageTimings): string | null {
  const parts: string[] = [];
  if (timings.decodeMs !== null) parts.push(`decode=${timings.decodeMs}ms`);
  if (timings.initializationMs !== null) parts.push(`init=${timings.initializationMs}ms`);
  if (timings.tileMs.length > 0) parts.push(`tiles=[${timings.tileMs.join(",")}]ms`);
  if (timings.consolidationMs !== null) parts.push(`consolidation=${timings.consolidationMs}ms`);
  if (timings.totalMs !== null) parts.push(`total=${timings.totalMs}ms`);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function formatOcrDiagnostic(d: OcrDiagnostic, originalDimensions?: string | null): string {
  return [
    `build=${d.build}`,
    `stage=${d.stage}`,
    `elapsedMs=${d.elapsedMs}`,
    `original=${originalDimensions ?? "?"}`,
    `ocr=${d.ocrDimensions ?? "?"}`,
    `mode=${d.mode}`,
    `tiles=${d.tiles}`,
    `createImageBitmap=${d.createImageBitmap}`,
    `OffscreenCanvas=${d.offscreenCanvas}`,
    `timings=${d.timings ?? "?"}`,
    `erro=${d.error.slice(0, 300)}`,
  ].join(" | ");
}

export interface PaddleOcrDeviceSignals {
  viewportWidth: number | null;
  deviceMemory: number | null;
  maxTouchPoints: number;
  coarsePointer: boolean;
  android: boolean;
}

export function choosePaddleOcrMode(signals: PaddleOcrDeviceSignals): PaddleOcrMode {
  const touch = signals.maxTouchPoints > 0;
  const narrowTouch = touch && signals.viewportWidth !== null && signals.viewportWidth <= 820;
  const touchTablet = touch && signals.coarsePointer && signals.viewportWidth !== null && signals.viewportWidth <= 1180;
  const constrainedTouch = touch && signals.deviceMemory !== null && signals.deviceMemory <= 4;
  const androidTouch = touch && signals.android;
  return narrowTouch || touchTablet || constrainedTouch || androidTouch ? "tiled" : "full";
}

export function detectPaddleOcrMode(): PaddleOcrMode {
  const nav = typeof navigator === "undefined" ? null : navigator as Navigator & { deviceMemory?: number };
  const viewportWidth = typeof window === "undefined"
    ? null
    : Math.min(window.innerWidth, window.screen?.width || window.innerWidth);
  return choosePaddleOcrMode({
    viewportWidth,
    deviceMemory: typeof nav?.deviceMemory === "number" ? nav.deviceMemory : null,
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    coarsePointer: typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false,
    android: /Android/i.test(nav?.userAgent ?? ""),
  });
}

/**
 * Two-step pipeline:
 *  1) main thread decodes the image to RGBA (stable DOM APIs);
 *  2) the RGBA buffer is transferred to a dedicated worker that builds a cv.Mat
 *     and runs PP-OCRv6. One read = one worker, always terminated.
 */
export async function paddleRecognizeWorker(
  image: File,
  onProgress?: (status: string) => void,
  deps: PaddleRecognizeWorkerDeps = {},
): Promise<PaddleWorkerOutcome> {
  const timeoutMs = deps.timeoutMs ?? PADDLE_OCR_TIMEOUT_MS;
  const mode = deps.mode ?? detectPaddleOcrMode();
  const tiles = mode === "tiled" ? PADDLE_OCR_TILE_COUNT : 1;
  const start = performance.now();
  let stage = "decode-start";
  let ocrDimensions: string | null = null;
  const stageTimings: PaddleOcrStageTimings = {
    decodeMs: null,
    initializationMs: null,
    tileMs: [],
    consolidationMs: null,
    totalMs: null,
  };
  const fail = (message: string, error: string) =>
    new PaddleOcrError(message, {
      build: BUILD_COMMIT,
      stage,
      elapsedMs: Math.round(performance.now() - start),
      ocrDimensions,
      createImageBitmap: typeof createImageBitmap === "function",
      offscreenCanvas: typeof OffscreenCanvas === "function",
      mode,
      tiles,
      timings: formatStageTimings({
        ...stageTimings,
        totalMs: Math.round(performance.now() - start),
      }),
      error,
    });

  onProgress?.("Convertendo imagem...");
  let rgba: RgbaImage;
  try {
    const decodeStart = performance.now();
    rgba = await (deps.decode ?? decodeImageToRgba)(image);
    stageTimings.decodeMs = Math.round(performance.now() - decodeStart);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw fail(`Falha ao preparar a imagem: ${detail}`, detail);
  }
  ocrDimensions = `${rgba.width}x${rgba.height}`;
  stage = "worker-start";

  const worker = (deps.createWorker ?? (() =>
    new Worker(new URL("./paddle-ocr.worker.ts", import.meta.url), { type: "module" })
  ))();
  try {
    return await new Promise<PaddleWorkerOutcome>((resolve, reject) => {
      let lastStatus = "worker-start";
      const timeout = setTimeout(() => {
        console.warn("[paddle-ocr-worker] timeout na etapa:", lastStatus);
        worker.terminate();
        reject(fail(PADDLE_OCR_TIMEOUT_MESSAGE, `timeout ${timeoutMs}ms`));
      }, timeoutMs);
      worker.onmessage = (event: MessageEvent<PaddleOcrWorkerMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          lastStatus = message.message;
          if (message.stage) stage = message.stage;
          if (message.timings) {
            if (typeof message.timings.initializationMs === "number") {
              stageTimings.initializationMs = message.timings.initializationMs;
            }
            if (Array.isArray(message.timings.tileMs)) {
              stageTimings.tileMs = message.timings.tileMs;
            }
            if (typeof message.timings.consolidationMs === "number") {
              stageTimings.consolidationMs = message.timings.consolidationMs;
            }
          }
          onProgress?.(message.message);
        } else if (message.type === "result") {
          clearTimeout(timeout);
          const tileTimingsMs = message.tileTimingsMs ?? stageTimings.tileMs;
          const consolidationMs = message.consolidationMs ?? stageTimings.consolidationMs;
          resolve({
            regions: message.regions,
            text: message.text,
            confidence: message.confidence,
            initializationMs: message.initializationMs,
            ocrMs: message.ocrMs,
              detectedBoxes: message.detectedBoxes,
              recognizedCount: message.recognizedCount,
              mode: message.mode,
              tiles: message.tiles,
              tileTimingsMs,
              consolidationMs,
              totalMs: Math.round(performance.now() - start),
          });
        } else {
          clearTimeout(timeout);
          if (message.stage) stage = message.stage;
          const text = message.message || "Não foi possível executar o OCR.";
          reject(fail(text, text));
        }
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        const text = event.message || "Falha no worker do OCR.";
        reject(fail(text, text));
      };
      worker.postMessage(
        { pixels: rgba.pixels, width: rgba.width, height: rgba.height, mode },
        [rgba.pixels],
      );
    });
  } finally {
    // Terminating releases the model sessions and WASM memory on Android.
    worker.terminate();
  }
}
