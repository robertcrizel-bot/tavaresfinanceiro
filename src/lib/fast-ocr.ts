import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import { adaptPpuLinesToRegions, type FastOcrLineItem } from "./fast-ocr-adapter";

export interface FastOcrOutcome {
  regions: PaddleOcrRegion[];
  rawLines: FastOcrLineItem[][];
  initializationMs: number;
  ocrMs: number;
}

type FastOcrWorkerMessage =
  | { type: "progress"; message: string }
  | { type: "result"; lines: FastOcrLineItem[][]; initializationMs: number; ocrMs: number }
  | { type: "error"; message: string };

export async function fastOcrRecognize(
  image: File,
  onProgress?: (status: string) => void,
): Promise<FastOcrOutcome> {
  const imageBuffer = await image.arrayBuffer();
  const worker = new Worker(new URL("./fast-ocr.worker.ts", import.meta.url), { type: "module" });
  try {
    const result = await new Promise<Extract<FastOcrWorkerMessage, { type: "result" }>>(
      (resolve, reject) => {
        worker.onmessage = (event: MessageEvent<FastOcrWorkerMessage>) => {
          const message = event.data;
          if (message.type === "progress") {
            onProgress?.(message.message);
          } else if (message.type === "result") {
            resolve(message);
          } else {
            reject(new Error(message.message || "Não foi possível executar o OCR rápido."));
          }
        };
        worker.onerror = (event) => {
          reject(new Error(event.message || "Falha no worker do OCR rápido."));
        };
        worker.postMessage({ image: imageBuffer }, [imageBuffer]);
      },
    );
    return {
      regions: adaptPpuLinesToRegions(result.lines),
      rawLines: result.lines,
      initializationMs: result.initializationMs,
      ocrMs: result.ocrMs,
    };
  } finally {
    // Terminating the worker releases the model sessions and WASM memory on Android.
    worker.terminate();
  }
}
