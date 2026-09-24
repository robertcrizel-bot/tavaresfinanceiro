import ortWasmMjsUrl from "./runtime/ort-wasm-simd-threaded.jsep.mjs?url";
import { spatialGroup } from "./spatialGrouper";
import type { PaddleOcrRegion, PaddleOcrResult } from "./types";

let paddleInstance: unknown = null;
let initializing = false;
let initError: string | null = null;

async function getOrCreateInstance(): Promise<unknown> {
  if (paddleInstance) return paddleInstance;
  if (initError) throw new Error(initError);
  if (initializing) {
    while (initializing && !paddleInstance && !initError) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (paddleInstance) return paddleInstance;
    if (initError) throw new Error(initError);
  }

  initializing = true;
  try {
    const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
    const instance = await PaddleOCR.create({
      lang: "pt",
      ocrVersion: "PP-OCRv6",
      initialize: true,
      ortOptions: {
        backend: "wasm",
        wasmPaths: {
          mjs: ortWasmMjsUrl,
          wasm: "/ort-wasm/ort-wasm-simd-threaded.jsep.wasm",
        },
      },
    });
    paddleInstance = instance;
    return instance;
  } catch (e: unknown) {
    initError = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    initializing = false;
  }
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error(`Failed to convert data URL to Blob: ${res.status}`);
  return res.blob();
}

function sortRegionsByPosition(regions: PaddleOcrRegion[]) {
  return [...regions].sort((a, b) => {
    const aY = a.bbox.length > 0 ? Math.min(...a.bbox.map((p) => p[1])) : 0;
    const bY = b.bbox.length > 0 ? Math.min(...b.bbox.map((p) => p[1])) : 0;
    const yDiff = aY - bY;
    if (Math.abs(yDiff) > 10) return yDiff;
    const aX = a.bbox.length > 0 ? Math.min(...a.bbox.map((p) => p[0])) : 0;
    const bX = b.bbox.length > 0 ? Math.min(...b.bbox.map((p) => p[0])) : 0;
    return aX - bX;
  });
}

export async function paddleRecognize(
  imageDataUrl: string,
  onProgress?: (status: string) => void,
): Promise<PaddleOcrResult> {
  const start = performance.now();

  try {
    onProgress?.("Carregando modelo PaddleOCR...");
    const instance = await getOrCreateInstance();

    onProgress?.("Reconhecendo texto...");
    const imageBlob = await dataUrlToBlob(imageDataUrl);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const ocr = instance as any;
    const results = await ocr.predict(imageBlob);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (!results || results.length === 0) {
      return {
        text: "",
        confidence: null,
        regions: [],
        spatialItems: [],
        spatialHeaderColumns: null,
        timeMs: Math.round(performance.now() - start),
        detectedBoxes: 0,
        recognizedCount: 0,
        backend: "unknown",
      };
    }

    const firstResult = results[0];
    const items: Array<{ poly: [number, number][]; text: string; score: number }> =
      firstResult.items ?? [];

    const regions = items.map((item) => ({
      text: item.text,
      confidence: Math.round(item.score * 100) / 100,
      bbox: item.poly,
    }));

    const sorted = sortRegionsByPosition(regions);
    const text = sorted.map((r) => r.text).join("\n");

    const confidences = sorted.map((r) => r.confidence).filter((c) => c > 0);
    const avgConfidence =
      confidences.length > 0
        ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
        : null;

    const spatial = spatialGroup(sorted);

    return {
      text,
      confidence: avgConfidence,
      regions: sorted,
      spatialItems: spatial.items,
      spatialHeaderColumns: spatial.headerColumns,
      timeMs: Math.round(performance.now() - start),
      detectedBoxes: firstResult.metrics?.detectedBoxes ?? 0,
      recognizedCount: firstResult.metrics?.recognizedCount ?? 0,
      backend: firstResult.runtime?.requestedBackend ?? "unknown",
    };
  } catch (e: unknown) {
    return {
      text: "",
      confidence: null,
      regions: [],
      spatialItems: [],
      spatialHeaderColumns: null,
      timeMs: Math.round(performance.now() - start),
      detectedBoxes: 0,
      recognizedCount: 0,
      backend: "unknown",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function formatPaddleReport(result: PaddleOcrResult): string {
  const parts: string[] = [];
  parts.push("=== RELATÓRIO PaddleOCR (protótipo) ===");
  parts.push(`Tempo: ${(result.timeMs / 1000).toFixed(1)}s`);
  parts.push(`Backend: ${result.backend}`);
  parts.push(`Caixas detectadas: ${result.detectedBoxes}`);
  parts.push(`Regiões reconhecidas: ${result.recognizedCount}`);
  if (result.confidence !== null) {
    parts.push(`Confiança média: ${Math.round(result.confidence * 100)}%`);
  }
  if (result.error) {
    parts.push(`Erro: ${result.error}`);
  }
  parts.push("");
  parts.push("--- Texto bruto ---");
  parts.push(result.text || "(sem texto)");
  parts.push("");
  if (result.regions.length > 0) {
    parts.push("--- Regiões ---");
    for (const r of result.regions) {
      parts.push(`[${Math.round(r.confidence * 100)}%] ${r.text}`);
    }
  }
  if (result.spatialItems.length > 0) {
    parts.push("");
    parts.push("--- Itens estruturados ---");
    for (const item of result.spatialItems) {
      const fields: string[] = [item.name];
      if (item.quantity !== null) fields.push(`Qtd: ${item.quantity}`);
      if (item.unit !== null) fields.push(`Un: ${item.unit}`);
      if (item.unitPrice !== null) fields.push(`Unit: R$ ${item.unitPrice.toFixed(2)}`);
      if (item.total !== null) fields.push(`Total: R$ ${item.total.toFixed(2)}`);
      if (item.lowConfidenceFields.length > 0) {
        fields.push(`[baixa confiança: ${item.lowConfidenceFields.join(", ")}]`);
      }
      parts.push(fields.join(" | "));
    }
  }
  if (result.regions.length > 0) {
    parts.push("");
    parts.push("--- REGIONS JSON ---");
    parts.push(JSON.stringify(result.regions, null, 2));
  }
  parts.push("=== FIM ===");
  return parts.join("\n");
}
