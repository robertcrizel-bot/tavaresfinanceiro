/// <reference lib="webworker" />

import { PaddleOCR } from "@paddleocr/paddleocr-js";
import { configureOrtWasm } from "@/lib/ocr-runtime";
import {
  rgbaToPaddleMat,
  type PaddleMat,
  type PaddleOpenCv,
} from "@/lib/paddle-ocr-worker-image";
import {
  mapPaddleItemsToRegions,
  sortRegionsByPosition,
} from "@/lib/ocr-paddle-test/recognize";
import {
  buildVerticalOcrTiles,
  deduplicateOverlapRegions,
  extractVerticalRgbaTile,
  remapTileRegions,
} from "@/lib/paddle-ocr-tiling";
import type { PaddleOcrMode } from "@/lib/paddle-ocr-worker";

interface RecognizeMessage {
  pixels: ArrayBuffer;
  width: number;
  height: number;
  mode?: PaddleOcrMode;
}

type OcrStage =
  | "worker-start"
  | "ort-configured"
  | "paddle-create-start"
  | "paddle-create-ok"
  | "predict-start"
  | `predict-${number}/${number}`
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
  const { pixels, width, height, mode = "full" } = event.data;
  let stage: OcrStage = "worker-start";
  let instance: { dispose: () => void | Promise<void> } | null = null;
  debugStage(stage);
  try {
    scope.postMessage({ type: "progress", stage: "paddle-create-start", message: "Inicializando OCR..." });
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

    const directOcr = created as unknown as {
      cv: PaddleOpenCv | null;
      predict(input: PaddleMat): Promise<Awaited<ReturnType<typeof created.predict>>>;
    };
    if (!directOcr.cv) throw new Error("OpenCV não foi inicializado pelo PaddleOCR.");
    let regions;
    let detectedBoxes = 0;
    let recognizedCount = 0;
    let tileCount = 1;
    let backend = "unknown";
    let ocrStart: number;

    if (mode === "full") {
      scope.postMessage({ type: "progress", stage: "predict-start", message: "Reconhecendo texto..." });
      stage = "predict-start";
      debugStage(stage);
      ocrStart = performance.now();
      const sourceMat = rgbaToPaddleMat({ pixels, width, height }, directOcr.cv);
      let results: Awaited<ReturnType<typeof created.predict>>;
      try {
        results = await directOcr.predict(sourceMat);
      } finally {
        sourceMat.delete();
      }
      const firstResult = results?.[0];
      regions = sortRegionsByPosition(mapPaddleItemsToRegions(firstResult?.items ?? []));
      detectedBoxes = firstResult?.metrics?.detectedBoxes ?? 0;
      recognizedCount = firstResult?.metrics?.recognizedCount ?? 0;
      backend = firstResult?.runtime?.requestedBackend ?? "unknown";
    } else {
      const image = { pixels, width, height };
      const tiles = buildVerticalOcrTiles(height);
      tileCount = tiles.length;
      const allRegions = [];
      ocrStart = performance.now();
      for (let index = 0; index < tiles.length; index += 1) {
        const tile = tiles[index];
        stage = `predict-${index + 1}/${tiles.length}`;
        scope.postMessage({
          type: "progress",
          stage,
          message: `Lendo parte ${index + 1} de ${tiles.length}...`,
        });
        debugStage(stage);
        const tileImage = extractVerticalRgbaTile(image, tile);
        const tileMat = rgbaToPaddleMat(tileImage, directOcr.cv);
        let tileResults: Awaited<ReturnType<typeof created.predict>>;
        try {
          tileResults = await directOcr.predict(tileMat);
        } finally {
          tileMat.delete();
        }
        const tileResult = tileResults?.[0];
        detectedBoxes += tileResult?.metrics?.detectedBoxes ?? 0;
        recognizedCount += tileResult?.metrics?.recognizedCount ?? 0;
        backend = tileResult?.runtime?.requestedBackend ?? backend;
        allRegions.push(...remapTileRegions(
          mapPaddleItemsToRegions(tileResult?.items ?? []),
          tile,
        ));
      }
      regions = deduplicateOverlapRegions(allRegions);
    }
    const ocrMs = Math.round(performance.now() - ocrStart);
    stage = "predict-ok";
    debugStage(stage);

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
      detectedBoxes,
      recognizedCount,
      mode,
      tiles: tileCount,
      backend,
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
