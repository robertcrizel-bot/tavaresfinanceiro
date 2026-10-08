import type { LocalModelBackend, LocalModelOutput } from "./schema";

export const LOCAL_RECEIPT_MODEL_ID = "HuggingFaceTB/SmolLM2-135M-Instruct";
export const LOCAL_RECEIPT_MODEL_APPROX_MB = { webgpu: 118, wasm: 137 } as const;

type WorkerMessage =
  | { type: "progress"; status: string }
  | { type: "result"; text: string; backend: LocalModelBackend; initializationMs: number; inferenceMs: number; totalMs: number }
  | { type: "error"; message: string };

export async function runLocalReceiptModel(
  prompt: string,
  onProgress?: (status: string) => void,
): Promise<LocalModelOutput> {
  const worker = new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<LocalModelOutput>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          onProgress?.(message.status);
        } else if (message.type === "result") {
          resolve({
            text: message.text,
            metrics: {
              modelId: LOCAL_RECEIPT_MODEL_ID,
              backend: message.backend,
              initializationMs: message.initializationMs,
              inferenceMs: message.inferenceMs,
              totalMs: message.totalMs,
            },
          });
        } else {
          reject(new Error(message.message));
        }
      };
      worker.onerror = (event) => reject(new Error(event.message || "Falha no worker de interpretação local."));
      worker.postMessage({ prompt });
    });
  } finally {
    worker.terminate();
  }
}
