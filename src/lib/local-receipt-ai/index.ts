import type { ParsedReceipt } from "@/lib/receipt";
import { runLocalReceiptModel, LOCAL_RECEIPT_MODEL_ID } from "./model";
import { normalizeLocalReceiptResponse } from "./normalize";
import { buildLocalReceiptPrompt } from "./prompt";
import type { LocalInterpretationOptions, LocalReceiptInput } from "./schema";

export async function interpretReceiptLocally(
  input: LocalReceiptInput,
  options: LocalInterpretationOptions,
): Promise<ParsedReceipt> {
  const startedAt = performance.now();
  try {
    const inference = options.infer ?? runLocalReceiptModel;
    const output = await inference(buildLocalReceiptPrompt(input), options.onProgress);
    const parsed = normalizeLocalReceiptResponse(output.text, input);
    options.onMetrics?.({ ...output.metrics, fallbackUsed: false });
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na interpretação local.";
    options.onMetrics?.({
      modelId: LOCAL_RECEIPT_MODEL_ID,
      backend: "wasm",
      initializationMs: 0,
      inferenceMs: 0,
      totalMs: performance.now() - startedAt,
      fallbackUsed: true,
      error: message,
    });
    return options.fallback;
  }
}

export { buildLocalReceiptPrompt } from "./prompt";
export { normalizeLocalReceiptResponse } from "./normalize";
export { toLocalReceiptInput } from "./ocr-input";
export {
  LOCAL_RECEIPT_MAX_NEW_TOKENS,
  LOCAL_RECEIPT_MODEL_APPROX_MB,
  LOCAL_RECEIPT_MODEL_ID,
  LOCAL_RECEIPT_TIMEOUT_MESSAGE,
  LOCAL_RECEIPT_TIMEOUT_MS,
  resetLocalReceiptModelState,
  runLocalReceiptModel,
} from "./model";
export type {
  LocalInterpretationMetrics,
  LocalInterpretationOptions,
  LocalModelBackend,
  LocalModelInference,
  LocalModelMetrics,
  LocalModelOutput,
  LocalReceiptGroupedLine,
  LocalReceiptInput,
} from "./schema";
