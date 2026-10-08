import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";

export const PADDLE_OCR_TIMEOUT_MS = 35_000;
export const PADDLE_OCR_TIMEOUT_MESSAGE =
  "Não foi possível concluir a leitura gratuita. Você pode preencher manualmente ou usar Ler com IA.";

export interface PaddleWorkerOutcome {
  regions: PaddleOcrRegion[];
  text: string;
  confidence: number | null;
  initializationMs: number;
  ocrMs: number;
  detectedBoxes: number;
  recognizedCount: number;
}

type PaddleOcrWorkerMessage =
  | { type: "progress"; message: string }
  | {
      type: "result";
      regions: PaddleOcrRegion[];
      text: string;
      confidence: number | null;
      initializationMs: number;
      ocrMs: number;
      detectedBoxes: number;
      recognizedCount: number;
    }
  | { type: "error"; message: string };

export interface PaddleRecognizeWorkerDeps {
  createWorker?: () => Worker;
  timeoutMs?: number;
}

/**
 * Runs the full PP-OCRv6 recognizer in a dedicated worker.
 * One read = one worker, always terminated (success or error),
 * so no ONNX/OpenCV/Paddle session stays alive on the page.
 */
export async function paddleRecognizeWorker(
  image: File,
  onProgress?: (status: string) => void,
  deps: PaddleRecognizeWorkerDeps = {},
): Promise<PaddleWorkerOutcome> {
  const timeoutMs = deps.timeoutMs ?? PADDLE_OCR_TIMEOUT_MS;
  const imageBuffer = await image.arrayBuffer();
  const worker = (deps.createWorker ?? (() =>
    new Worker(new URL("./paddle-ocr.worker.ts", import.meta.url), { type: "module" })
  ))();
  try {
    return await new Promise<PaddleWorkerOutcome>((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error(PADDLE_OCR_TIMEOUT_MESSAGE));
      }, timeoutMs);
      worker.onmessage = (event: MessageEvent<PaddleOcrWorkerMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          onProgress?.(message.message);
        } else if (message.type === "result") {
          clearTimeout(timeout);
          resolve({
            regions: message.regions,
            text: message.text,
            confidence: message.confidence,
            initializationMs: message.initializationMs,
            ocrMs: message.ocrMs,
            detectedBoxes: message.detectedBoxes,
            recognizedCount: message.recognizedCount,
          });
        } else {
          clearTimeout(timeout);
          reject(new Error(message.message || "Não foi possível executar o OCR."));
        }
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message || "Falha no worker do OCR."));
      };
      worker.postMessage({ image: imageBuffer }, [imageBuffer]);
    });
  } finally {
    // Terminating releases the model sessions and WASM memory on Android.
    worker.terminate();
  }
}
