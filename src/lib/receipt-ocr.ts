import { receiptToImageDataUrl } from "@/lib/receipt";
import { preprocessReceiptImage, type CropInfo } from "@/lib/receipt-ocr-preprocess";

export interface OcrDiagnosticWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrDiagnosticLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: OcrDiagnosticWord[];
}

export interface OcrResult {
  text: string;
  confidence: number;
  durationMs: number;
  preprocessDurationMs: number;
  preprocessApplied: boolean;
  preprocessedImageDataUrl: string | null;
  cropInfo?: CropInfo;
  psm4Text?: string;
  psm4Confidence?: number;
  psm4Error?: string;
  psm3Lines?: OcrDiagnosticLine[];
  psm4Lines?: OcrDiagnosticLine[];
  psm3CropText?: string;
  psm3CropConfidence?: number;
  psm3CropLines?: OcrDiagnosticLine[];
  psm3CropError?: string;
  psm3CropRectangle?: { left: number; top: number; width: number; height: number };
}

export type OcrProgress = (status: string, progress: number) => void;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function extractDiagnosticLines(
  page: any,
): OcrDiagnosticLine[] {
  const lines: OcrDiagnosticLine[] = [];
  if (!page?.blocks) return lines;
  for (const block of page.blocks) {
    if (!block?.paragraphs) continue;
    for (const para of block.paragraphs) {
      if (!para?.lines) continue;
      for (const line of para.lines) {
        const words: OcrDiagnosticWord[] = (line.words ?? []).map((w: any) => ({
          text: w.text,
          confidence: w.confidence,
          bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
        }));
        lines.push({
          text: line.text,
          confidence: line.confidence,
          bbox: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 },
          words,
        });
      }
    }
  }
  return lines;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const HEADER_MARKERS = ["COD", "DESC", "QTD", "UN", "VL", "ITEM"];
const FOOTER_PATTERNS = [/qtde\.?\s*total/i, /total\s*de\s*itens/i];

export function detectItemRegion(
  lines: OcrDiagnosticLine[],
  imageWidth: number,
  imageHeight: number,
): { left: number; top: number; width: number; height: number } | null {
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].text.toUpperCase();
    const hits = HEADER_MARKERS.filter((m) => upper.includes(m)).length;
    if (hits >= 3) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  let footerIdx = -1;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (FOOTER_PATTERNS.some((p) => p.test(lines[i].text))) {
      footerIdx = i;
      break;
    }
  }
  if (footerIdx === -1) return null;
  if (footerIdx <= headerIdx) return null;

  const top = lines[headerIdx + 1].bbox.y0;
  const bottom = lines[footerIdx].bbox.y0;
  if (bottom <= top) return null;

  return {
    left: 0,
    top: Math.max(0, Math.round(top)),
    width: imageWidth,
    height: Math.min(Math.round(bottom - top), imageHeight),
  };
}

export async function extractReceiptText(
  file: File,
  onProgress?: OcrProgress,
): Promise<OcrResult> {
  const imageDataUrl = await receiptToImageDataUrl(file);

  const preprocessResult = await preprocessReceiptImage(imageDataUrl);

  const Tesseract = await import("tesseract.js");

  const worker = await Tesseract.createWorker("por+eng", undefined, {
    logger: (msg) => {
      if (onProgress && typeof msg.progress === "number") {
        onProgress(msg.status, msg.progress);
      }
    },
  });

  const start = performance.now();
  try {
    const { data } = await worker.recognize(preprocessResult.imageDataUrl, undefined, { blocks: true });
    const psm3Lines = extractDiagnosticLines(data);

    let psm4Text: string | undefined;
    let psm4Confidence: number | undefined;
    let psm4Error: string | undefined;
    let psm4Lines: OcrDiagnosticLine[] | undefined;
    try {
      await worker.setParameters({ tessedit_pageseg_mode: "4" as any });
      const psm4 = await worker.recognize(preprocessResult.imageDataUrl, undefined, { blocks: true });
      psm4Text = psm4.data.text;
      psm4Confidence = psm4.data.confidence;
      psm4Lines = extractDiagnosticLines(psm4.data);
      await worker.setParameters({ tessedit_pageseg_mode: "3" as any });
    } catch (e: unknown) {
      psm4Error = e instanceof Error ? e.message : String(e);
    }

    let psm3CropText: string | undefined;
    let psm3CropConfidence: number | undefined;
    let psm3CropLines: OcrDiagnosticLine[] | undefined;
    let psm3CropError: string | undefined;
    let psm3CropRectangle: { left: number; top: number; width: number; height: number } | undefined;
    try {
      await worker.setParameters({ tessedit_pageseg_mode: "3" as any });
      const rect = detectItemRegion(psm3Lines, preprocessResult.width, preprocessResult.height);
      if (rect) {
        psm3CropRectangle = rect;
        const crop = await worker.recognize(preprocessResult.imageDataUrl, { rectangle: rect }, { blocks: true });
        psm3CropText = crop.data.text;
        psm3CropConfidence = crop.data.confidence;
        psm3CropLines = extractDiagnosticLines(crop.data);
      }
    } catch (e: unknown) {
      psm3CropError = e instanceof Error ? e.message : String(e);
    }

    const durationMs = Math.round(performance.now() - start);
    return {
      text: data.text,
      confidence: data.confidence,
      durationMs,
      preprocessDurationMs: preprocessResult.durationMs,
      preprocessApplied: preprocessResult.applied,
      preprocessedImageDataUrl: preprocessResult.applied ? preprocessResult.imageDataUrl : null,
      cropInfo: preprocessResult.cropInfo,
      psm4Text,
      psm4Confidence,
      psm4Error,
      psm3Lines,
      psm4Lines,
      psm3CropText,
      psm3CropConfidence,
      psm3CropLines,
      psm3CropError,
      psm3CropRectangle,
    };
  } finally {
    await worker.terminate();
  }
}
