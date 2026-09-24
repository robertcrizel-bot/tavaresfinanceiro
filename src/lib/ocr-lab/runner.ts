import type { LabResult, LabRunOptions, StrategyConfig } from "./types";
import { STRATEGIES, STRATEGY_CONFIGS } from "./types";
import { preprocessForStrategy } from "./preprocessor";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TesseractWorker {
  recognize: (image: any, options?: any, output?: any) => Promise<{ data: any }>;
  setParameters: (params: Record<string, string>) => Promise<any>;
  terminate: () => Promise<any>;
}

async function detectProductLines(
  worker: TesseractWorker,
  imageDataUrl: string,
): Promise<Array<{ y0: number; y1: number; x0: number; x1: number }>> {
  await worker.setParameters({ tessedit_pageseg_mode: "3" });
  const { data } = await worker.recognize(imageDataUrl, undefined, { blocks: true });

  const lines: Array<{ y0: number; y1: number; x0: number; x1: number }> = [];
  if (!data?.blocks) return lines;

  for (const block of data.blocks) {
    if (!block?.paragraphs) continue;
    for (const para of block.paragraphs) {
      if (!para?.lines) continue;
      for (const line of para.lines) {
        const t = line.text || "";
        const hasLetters = /[a-zA-ZÀ-ÿ]/.test(t);
        const hasNumbers = /\d/.test(t);
        const multiWord = (line.words?.length || 0) >= 2;
        const notJustValue = !/^\d+[.,]\d{2}$/.test(t.trim());
        const notJustCnpj = /^\d[\d./-]{9,}$/.test(t.trim());
        if (hasLetters && hasNumbers && multiWord && notJustValue && !notJustCnpj) {
          lines.push({
            y0: line.bbox.y0,
            y1: line.bbox.y1,
            x0: line.bbox.x0,
            x1: line.bbox.x1,
          });
        }
      }
    }
  }
  return lines;
}

async function runStrategyA(
  worker: TesseractWorker,
  imageDataUrl: string,
  config: StrategyConfig,
): Promise<{ text: string; confidence: number }> {
  await worker.setParameters({ tessedit_pageseg_mode: config.psm, ...config.params });
  const { data } = await worker.recognize(imageDataUrl);
  return { text: data.text || "", confidence: data.confidence || 0 };
}

async function runStrategyF(
  worker: TesseractWorker,
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
): Promise<{ text: string; confidence: number }> {
  const productLines = await detectProductLines(worker, imageDataUrl);

  if (productLines.length === 0) {
    await worker.setParameters({ tessedit_pageseg_mode: "7" });
    const { data } = await worker.recognize(imageDataUrl);
    return { text: data.text || "", confidence: data.confidence || 0 };
  }

  const results: string[] = [];
  let totalConf = 0;

  for (const line of productLines) {
    const padding = 4;
    const rect = {
      left: Math.max(0, Math.round(line.x0 - padding)),
      top: Math.max(0, Math.round(line.y0 - padding)),
      width: Math.min(imageWidth - Math.max(0, Math.round(line.x0 - padding)), Math.round(line.x1 - line.x0 + padding * 2)),
      height: Math.min(imageHeight - Math.max(0, Math.round(line.y0 - padding)), Math.round(line.y1 - line.y0 + padding * 2)),
    };

    if (rect.width <= 0 || rect.height <= 0) continue;

    await worker.setParameters({ tessedit_pageseg_mode: "7" });
    try {
      const { data } = await worker.recognize(imageDataUrl, { rectangle: rect });
      if (data.text && data.text.trim()) {
        results.push(data.text.trim());
        totalConf += data.confidence || 0;
      }
    } catch {
      // skip failed lines
    }
  }

  const avgConf = productLines.length > 0 ? totalConf / productLines.length : 0;
  return { text: results.join("\n"), confidence: avgConf };
}

export async function runLaboratory(options: LabRunOptions): Promise<LabResult[]> {
  const { imageDataUrl, onProgress, signal } = options;
  const results: LabResult[] = [];

  const Tesseract = await import("tesseract.js");
  const worker: TesseractWorker = await Tesseract.createWorker("por+eng", undefined, {
    logger: () => {},
  });

  try {
    for (let i = 0; i < STRATEGIES.length; i++) {
      if (signal?.aborted) break;

      const strategy = STRATEGIES[i];
      const config = STRATEGY_CONFIGS[strategy.id];

      onProgress?.(strategy.id, i, STRATEGIES.length);

      let preprocessedUrl = imageDataUrl;
      let imgWidth = 0;
      let imgHeight = 0;

      try {
        const prepped = await preprocessForStrategy(imageDataUrl, config.preprocessVariant);
        preprocessedUrl = prepped.imageDataUrl;
        imgWidth = prepped.width;
        imgHeight = prepped.height;
      } catch (e: unknown) {
        results.push({
          strategyId: strategy.id,
          strategyName: strategy.name,
          confidence: 0,
          timeMs: 0,
          text: "",
          error: `Preprocessing failed: ${e instanceof Error ? e.message : String(e)}`,
        });
        continue;
      }

      const start = performance.now();

      try {
        let text: string;
        let confidence: number;

        if (strategy.id === "F") {
          const res = await runStrategyF(worker, preprocessedUrl, imgWidth, imgHeight);
          text = res.text;
          confidence = res.confidence;
        } else {
          const res = await runStrategyA(worker, preprocessedUrl, config);
          text = res.text;
          confidence = res.confidence;
        }

        results.push({
          strategyId: strategy.id,
          strategyName: strategy.name,
          confidence: Math.round(confidence * 10) / 10,
          timeMs: Math.round(performance.now() - start),
          text,
        });
      } catch (e: unknown) {
        results.push({
          strategyId: strategy.id,
          strategyName: strategy.name,
          confidence: 0,
          timeMs: Math.round(performance.now() - start),
          text: "",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } finally {
    await worker.terminate();
  }

  return results;
}
