/// <reference lib="webworker" />

import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { configureOrtWasm, ORT_WASM_PATHS } from "@/lib/ocr-runtime";
import {
  mapPaddleItemsToRegions,
  sortRegionsByPosition,
} from "@/lib/ocr-paddle-test/recognize";

interface RecognizeMessage {
  image: ArrayBuffer;
}

const scope = self as unknown as {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent<RecognizeMessage>) => void) | null;
};

scope.onmessage = async (event: MessageEvent<RecognizeMessage>) => {
  const { image } = event.data;
  let instance: { dispose: () => void | Promise<void> } | null = null;
  try {
    scope.postMessage({ type: "progress", message: "Carregando OCR..." });
    configureOrtWasm();

    const initializationStart = performance.now();
    const created = await PaddleOCR.create({
      worker: true,
      lang: "pt",
      ocrVersion: "PP-OCRv6",
      initialize: true,
      ortOptions: {
        backend: "wasm",
        wasmPaths: ORT_WASM_PATHS as unknown as string,
      },
    });
    instance = created as unknown as { dispose: () => void | Promise<void> };
    const initializationMs = Math.round(performance.now() - initializationStart);

    scope.postMessage({ type: "progress", message: "Lendo comprovante..." });
    const blob = new Blob([image], { type: "image/jpeg" });
    const ocrStart = performance.now();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const results = await (created as any).predict(blob);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const ocrMs = Math.round(performance.now() - ocrStart);

    const firstResult = results?.[0];
    const regions = sortRegionsByPosition(mapPaddleItemsToRegions(firstResult?.items ?? []));
    const text = regions.map((region) => region.text).join("\n");
    const confidences = regions.map((region) => region.confidence).filter((value) => value > 0);
    const confidence = confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
      : null;

    try {
      await instance.dispose();
    } catch (disposeError) {
      console.warn("[paddle-ocr-worker] failed to dispose instance", disposeError);
    }
    instance = null;

    scope.postMessage({
      type: "result",
      regions,
      text,
      confidence,
      initializationMs,
      ocrMs,
      detectedBoxes: firstResult?.metrics?.detectedBoxes ?? 0,
      recognizedCount: firstResult?.metrics?.recognizedCount ?? 0,
      backend: firstResult?.runtime?.requestedBackend ?? "unknown",
    });
  } catch (error) {
    if (instance) {
      try {
        await instance.dispose();
      } catch (disposeError) {
        console.warn("[paddle-ocr-worker] failed to dispose instance", disposeError);
      }
    }
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Não foi possível executar o OCR.",
    });
  }
  scope.close();
};
