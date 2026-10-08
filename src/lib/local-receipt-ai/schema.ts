import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import type { ParsedReceipt } from "@/lib/receipt";

export interface LocalReceiptGroupedLine {
  index: number;
  text: string;
  regions: PaddleOcrRegion[];
}

export interface LocalReceiptInput {
  regions: PaddleOcrRegion[];
  groupedLines: LocalReceiptGroupedLine[];
  rawText: string;
  categories: string[];
  accounts: string[];
}

export type LocalModelBackend = "webgpu" | "wasm";

export interface LocalModelMetrics {
  modelId: string;
  backend: LocalModelBackend;
  initializationMs: number;
  inferenceMs: number;
  totalMs: number;
}

export interface LocalModelOutput {
  text: string;
  metrics: LocalModelMetrics;
}

export interface LocalInterpretationMetrics extends LocalModelMetrics {
  fallbackUsed: boolean;
  error?: string;
}

export type LocalModelInference = (
  prompt: string,
  onProgress?: (status: string) => void,
) => Promise<LocalModelOutput>;

export interface LocalInterpretationOptions {
  fallback: ParsedReceipt;
  infer?: LocalModelInference;
  onProgress?: (status: string) => void;
  onMetrics?: (metrics: LocalInterpretationMetrics) => void;
}
