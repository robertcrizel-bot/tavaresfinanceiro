import type {
  OcrResult,
  PaddleOCRCreateOptions,
} from "@paddleocr/paddleocr-js";
import { PADDLE_ORT_WASM_BASE_URL } from "@/lib/ocr-runtime";
import {
  mapPaddleItemsToRegions,
  sortRegionsByPosition,
} from "@/lib/ocr-paddle-test/recognize";
import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";

export const PADDLE_OCR_TIMEOUT_MS = 45_000;
export const PADDLE_OCR_TIMEOUT_MESSAGE =
  "Não foi possível concluir a leitura gratuita. Você pode preencher manualmente ou usar Ler com IA.";
export const PADDLE_OCR_TILE_COUNT = 3;

export interface PaddleOcrOutcome {
  regions: PaddleOcrRegion[];
  text: string;
  confidence: number | null;
  initializationMs: number;
  ocrMs: number;
  detectedBoxes: number;
  recognizedCount: number;
}

interface PaddleOcrInstance {
  predict(input: unknown): Promise<OcrResult[]>;
  dispose(): Promise<void>;
}

interface SourceBitmap {
  width: number;
  height: number;
  close(): void;
}

export interface PaddleRecognizeDeps {
  createPaddle?: (options: PaddleOCRCreateOptions) => Promise<PaddleOcrInstance>;
  createBitmap?: (image: Blob) => Promise<SourceBitmap>;
  createCanvas?: () => HTMLCanvasElement;
  timeoutMs?: number;
}

export interface VerticalOcrTile {
  top: number;
  height: number;
}

export function buildVerticalOcrTiles(
  imageHeight: number,
  requestedCount = PADDLE_OCR_TILE_COUNT,
): VerticalOcrTile[] {
  if (!Number.isFinite(imageHeight) || imageHeight <= 0) {
    throw new Error("Dimensões inválidas para dividir o comprovante.");
  }
  const count = Math.max(1, Math.min(requestedCount, Math.floor(imageHeight)));
  const overlap = Math.min(120, Math.max(48, Math.round(imageHeight * 0.04)));

  return Array.from({ length: count }, (_, index) => {
    const coreTop = Math.floor((index * imageHeight) / count);
    const coreBottom = Math.floor(((index + 1) * imageHeight) / count);
    const top = index === 0 ? 0 : Math.max(0, coreTop - overlap);
    const bottom = index === count - 1
      ? imageHeight
      : Math.min(imageHeight, coreBottom + overlap);
    return { top, height: bottom - top };
  });
}

function regionBounds(region: PaddleOcrRegion) {
  const xs = region.bbox.map(([x]) => x);
  const ys = region.bbox.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function regionsOverlap(a: PaddleOcrRegion, b: PaddleOcrRegion): boolean {
  if (a.text.trim().replace(/\s+/g, " ").toUpperCase() !== b.text.trim().replace(/\s+/g, " ").toUpperCase()) {
    return false;
  }
  const left = regionBounds(a);
  const right = regionBounds(b);
  const overlapX = Math.max(0, Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX));
  const overlapY = Math.max(0, Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY));
  const minWidth = Math.max(1, Math.min(left.maxX - left.minX, right.maxX - right.minX));
  const minHeight = Math.max(1, Math.min(left.maxY - left.minY, right.maxY - right.minY));
  return overlapX / minWidth >= 0.5 && overlapY / minHeight >= 0.5;
}

export function deduplicateOverlapRegions(regions: PaddleOcrRegion[]): PaddleOcrRegion[] {
  const deduplicated: PaddleOcrRegion[] = [];
  for (const region of sortRegionsByPosition(regions)) {
    const duplicateIndex = deduplicated.findIndex((candidate) => regionsOverlap(candidate, region));
    if (duplicateIndex < 0) {
      deduplicated.push(region);
    } else if (region.confidence > deduplicated[duplicateIndex].confidence) {
      deduplicated[duplicateIndex] = region;
    }
  }
  return sortRegionsByPosition(deduplicated);
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível preparar uma faixa do comprovante."));
    }, "image/jpeg", 0.92);
  });
}

async function createTileBlob(
  bitmap: SourceBitmap,
  tile: VerticalOcrTile,
  createCanvas: () => HTMLCanvasElement,
): Promise<Blob> {
  const canvas = createCanvas();
  canvas.width = bitmap.width;
  canvas.height = tile.height;
  try {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas indisponível para preparar o OCR.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      bitmap as CanvasImageSource,
      0,
      tile.top,
      bitmap.width,
      tile.height,
      0,
      0,
      bitmap.width,
      tile.height,
    );
    return await canvasToJpeg(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function paddleRecognize(
  image: File,
  onProgress?: (status: string) => void,
  deps: PaddleRecognizeDeps = {},
): Promise<PaddleOcrOutcome> {
  const timeoutMs = deps.timeoutMs ?? PADDLE_OCR_TIMEOUT_MS;
  const createPaddle = deps.createPaddle ?? (async (options) => {
    const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
    return PaddleOCR.create(options);
  });
  const createBitmap = deps.createBitmap ?? ((source) => createImageBitmap(source));
  const createCanvas = deps.createCanvas ?? (() => document.createElement("canvas"));
  let stage = "paddle-create";
  let expired = false;
  let timedOut = false;
  let instance: PaddleOcrInstance | null = null;
  let bitmap: SourceBitmap | null = null;
  let disposePromise: Promise<void> | null = null;

  const dispose = () => {
    if (!instance) return Promise.resolve();
    if (!disposePromise) {
      disposePromise = instance.dispose().catch((error) => {
        console.warn("[paddle-ocr] failed to dispose instance", error);
      });
    }
    return disposePromise;
  };
  const closeBitmap = () => {
    if (!bitmap) return;
    bitmap.close();
    bitmap = null;
  };

  const operation = async (): Promise<PaddleOcrOutcome> => {
    onProgress?.("Carregando OCR...");
    const initializationStart = performance.now();
    instance = await createPaddle({
      worker: true,
      lang: "pt",
      ocrVersion: "PP-OCRv6",
      initialize: true,
      ortOptions: {
        backend: "wasm",
        wasmPaths: PADDLE_ORT_WASM_BASE_URL,
      },
    });
    const initializationMs = Math.round(performance.now() - initializationStart);
    if (expired) {
      await dispose();
      throw new Error(PADDLE_OCR_TIMEOUT_MESSAGE);
    }

    stage = "image-decode";
    bitmap = await createBitmap(image);
    if (expired) {
      closeBitmap();
      await dispose();
      throw new Error(PADDLE_OCR_TIMEOUT_MESSAGE);
    }
    const tiles = buildVerticalOcrTiles(bitmap.height);
    const allRegions: PaddleOcrRegion[] = [];
    let detectedBoxes = 0;
    let recognizedCount = 0;
    let ocrMs = 0;

    for (let index = 0; index < tiles.length; index += 1) {
      if (expired) throw new Error(PADDLE_OCR_TIMEOUT_MESSAGE);
      const tile = tiles[index];
      stage = `predict-${index + 1}/${tiles.length}`;
      onProgress?.(`Lendo parte ${index + 1} de ${tiles.length}...`);
      const tileBlob = await createTileBlob(bitmap, tile, createCanvas);
      const inferenceStart = performance.now();
      const [result] = await instance.predict(tileBlob);
      ocrMs += performance.now() - inferenceStart;
      if (expired) throw new Error(PADDLE_OCR_TIMEOUT_MESSAGE);
      if (!result) continue;

      detectedBoxes += result.metrics?.detectedBoxes ?? 0;
      recognizedCount += result.metrics?.recognizedCount ?? 0;
      const regions = mapPaddleItemsToRegions(result.items ?? []).map((region) => ({
        ...region,
        bbox: region.bbox.map(([x, y]) => [x, y + tile.top] as [number, number]),
      }));
      allRegions.push(...regions);
    }

    const regions = deduplicateOverlapRegions(allRegions);
    const confidences = regions.map((region) => region.confidence).filter((value) => value > 0);
    const confidence = confidences.length > 0
      ? Math.round((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100) / 100
      : null;

    return {
      regions,
      text: regions.map((region) => region.text).join("\n"),
      confidence,
      initializationMs,
      ocrMs: Math.round(ocrMs),
      detectedBoxes,
      recognizedCount,
    };
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      expired = true;
      console.warn("[paddle-ocr] timeout na etapa:", stage);
      void dispose();
      closeBitmap();
      reject(new Error(PADDLE_OCR_TIMEOUT_MESSAGE));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeout]);
  } catch (error) {
    if (timedOut || (error instanceof Error && error.message === PADDLE_OCR_TIMEOUT_MESSAGE)) {
      throw new Error(PADDLE_OCR_TIMEOUT_MESSAGE);
    }
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(`Falha no OCR durante ${stage}: ${detail}`);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    closeBitmap();
    if (timedOut) void dispose();
    else await dispose();
  }
}
