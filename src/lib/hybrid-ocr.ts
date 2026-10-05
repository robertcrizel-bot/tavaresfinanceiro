import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import type { SuspiciousReason } from "@/lib/hybrid-ocr-regions";

export interface HybridCropPreviewData {
  index: number;
  reason: SuspiciousReason;
  originalText: string;
  cropWidth: number;
  cropHeight: number;
  sentWidth: number;
  sentHeight: number;
  scale: number;
  recognizedText: string;
  preview: ArrayBuffer;
}

export interface HybridOcrOutcome {
  regions: PaddleOcrRegion[];
  initializationMs: number;
  firstPassMs: number;
  suspiciousCount: number;
  smallInitializationMs: number;
  smallCropsMs: number;
  cropsProcessed: number;
  mergeMs: number;
  crops: HybridCropPreviewData[];
}

type HybridOcrWorkerMessage =
  | { type: "progress"; message: string }
  | {
      type: "result";
      regions: PaddleOcrRegion[];
      initializationMs: number;
      firstPassMs: number;
      suspiciousCount: number;
      smallInitializationMs: number;
      smallCropsMs: number;
      cropsProcessed: number;
      mergeMs: number;
      previews: HybridCropPreviewData[];
    }
  | { type: "error"; message: string };

export async function hybridOcrRecognize(
  image: File,
  imageWidth: number,
  imageHeight: number,
  onProgress?: (status: string) => void,
): Promise<HybridOcrOutcome> {
  const imageBuffer = await image.arrayBuffer();
  const worker = new Worker(new URL("./hybrid-ocr.worker.ts", import.meta.url), { type: "module" });
  try {
    const result = await new Promise<Extract<HybridOcrWorkerMessage, { type: "result" }>>(
      (resolve, reject) => {
        worker.onmessage = (event: MessageEvent<HybridOcrWorkerMessage>) => {
          const message = event.data;
          if (message.type === "progress") {
            onProgress?.(message.message);
          } else if (message.type === "result") {
            resolve(message);
          } else {
            reject(new Error(message.message || "Não foi possível executar o OCR híbrido."));
          }
        };
        worker.onerror = (event) => {
          reject(new Error(event.message || "Falha no worker do OCR híbrido."));
        };
        worker.postMessage({ image: imageBuffer, imageWidth, imageHeight }, [imageBuffer]);
      },
    );
    return {
      regions: result.regions,
      initializationMs: result.initializationMs,
      firstPassMs: result.firstPassMs,
      suspiciousCount: result.suspiciousCount,
      smallInitializationMs: result.smallInitializationMs,
      smallCropsMs: result.smallCropsMs,
      cropsProcessed: result.cropsProcessed,
      mergeMs: result.mergeMs,
      crops: result.previews,
    };
  } finally {
    // Terminating the worker releases the model sessions and WASM memory on Android.
    worker.terminate();
  }
}
