/// <reference lib="webworker" />

import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { configureOrtWasm } from "@/lib/ocr-runtime";
import {
  mapPaddleItemsToRegions,
  sortRegionsByPosition,
} from "@/lib/ocr-paddle-test/recognize";

interface RecognizeMessage {
  image: ArrayBuffer;
}

type OcrStage =
  | "worker-start"
  | "ort-configured"
  | "paddle-create-start"
  | "paddle-create-ok"
  | "predict-start"
  | "predict-ok"
  | "dispose-start"
  | "dispose-ok";

const scope = self as unknown as {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent<RecognizeMessage>) => void) | null;
};

function debugStage(stage: OcrStage): void {
  console.debug("[paddle-ocr-worker]", stage);
}

scope.onmessage = async (event: MessageEvent<RecognizeMessage>) => {
  const { image } = event.data;
  let stage: OcrStage = "worker-start";
  let instance: { dispose: () => void | Promise<void> } | null = null;
  debugStage(stage);
  try {
    scope.postMessage({ type: "progress", message: "Carregando OCR..." });
    configureOrtWasm();
    stage = "ort-configured";
    debugStage(stage);

    // Runs directly inside this dedicated worker: no nested Paddle worker.
    stage = "paddle-create-start";
    debugStage(stage);
    const initializationStart = performance.now();
    const created = await PaddleOCR.create({
      worker: false,
      lang: "pt",
      ocrVersion: "PP-OCRv6",
      initialize: true,
      ortOptions: {
        backend: "wasm",
      },
    });
    instance = created as unknown as { dispose: () => void | Promise<void> };
    const initializationMs = Math.round(performance.now() - initializationStart);
    stage = "paddle-create-ok";
    debugStage(stage);

    scope.postMessage({ type: "progress", message: "Lendo comprovante..." });
    const blob = new Blob([image], { type: "image/jpeg" });
    stage = "predict-start";
    debugStage(stage);
    const ocrStart = performance.now();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const results = await (created as any).predict(blob);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const ocrMs = Math.round(performance.now() - ocrStart);
    stage = "predict-ok";
    debugStage(stage);

    const firstResult = results?.[0];
    const regions = sortRegionsByPosition(mapPaddleItemsToRegions(firstResult?.items ?? []));
    const text = regions.map((region) => region.text).join("\n");
    const confidences = regions.map((region) => region.confidence).filter((value) => value > 0);
    const confidence = confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
      : null;

    stage = "dispose-start";
    debugStage(stage);
    try {
      await instance.dispose();
    } catch (disposeError) {
      console.warn("[paddle-ocr-worker] failed to dispose instance", disposeError);
    }
    instance = null;
    stage = "dispose-ok";
    debugStage(stage);

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
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    scope.postMessage({
      type: "error",
      stage,
      message: `Falha no OCR durante ${stage}: ${detail}`,
    });
  }
  scope.close();
};
