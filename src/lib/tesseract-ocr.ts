import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import { adaptTesseractPageToRegions } from "./tesseract-ocr-adapter";

export interface TesseractOcrOutcome {
  regions: PaddleOcrRegion[];
  initializationMs: number;
  ocrMs: number;
  adapterMs: number;
  languageLoadMs: number | null;
}

export async function tesseractRecognize(
  image: File,
  onProgress?: (status: string) => void,
): Promise<TesseractOcrOutcome> {
  const Tesseract = await import("tesseract.js");

  const initializationStart = performance.now();
  let languageLoadStart: number | null = null;
  let languageLoadMs: number | null = null;

  const worker = await Tesseract.createWorker("por", undefined, {
    logger: (message) => {
      if (message.status === "loading language traineddata") {
        if (languageLoadStart === null) {
          languageLoadStart = performance.now();
        } else if (message.progress >= 1 && languageLoadMs === null) {
          languageLoadMs = Math.round(performance.now() - languageLoadStart);
        }
      }
      onProgress?.(message.status);
    },
  });
  const initializationMs = Math.round(performance.now() - initializationStart);

  try {
    const ocrStart = performance.now();
    const result = await worker.recognize(image, undefined, { blocks: true });
    const ocrMs = Math.round(performance.now() - ocrStart);

    const adapterStart = performance.now();
    const regions = adaptTesseractPageToRegions(result.data);
    const adapterMs = Math.round(performance.now() - adapterStart);

    return { regions, initializationMs, ocrMs, adapterMs, languageLoadMs };
  } finally {
    await worker.terminate();
  }
}
