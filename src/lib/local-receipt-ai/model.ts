import type { LocalModelBackend, LocalModelOutput } from "./schema";

export const LOCAL_RECEIPT_MODEL_ID = "Xenova/flan-t5-small";
export const LOCAL_RECEIPT_MODEL_TASK = "text2text-generation";
export const LOCAL_RECEIPT_MODEL_APPROX_MB = { webgpu: 100, wasm: 95 } as const;
export const LOCAL_RECEIPT_MAX_NEW_TOKENS = 320;
export const LOCAL_RECEIPT_TIMEOUT_MS = 45_000;
export const LOCAL_RECEIPT_TIMEOUT_MESSAGE =
  "Interpretação local demorou demais; mantido resultado original.";

interface WorkerRequest {
  id: number;
  prompt: string;
}

type WorkerResponse =
  | { id: number; type: "progress"; status: string }
  | {
      id: number;
      type: "result";
      text: string;
      backend: LocalModelBackend;
      initializationMs: number;
      inferenceMs: number;
      totalMs: number;
    }
  | { id: number; type: "error"; message: string };

interface PendingCall {
  resolve: (output: LocalModelOutput) => void;
  reject: (error: Error) => void;
  onProgress?: (status: string) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface RunLocalReceiptModelDeps {
  createWorker?: () => Worker;
  timeoutMs?: number;
}

let cachedWorker: Worker | null = null;
let nextRequestId = 0;
const pendingCalls = new Map<number, PendingCall>();

function destroyWorker(): void {
  pendingCalls.clear();
  try {
    cachedWorker?.terminate();
  } catch {
    /* ignore termination errors */
  }
  cachedWorker = null;
}

/** Test hook: drops the cached worker so tests start from a clean session. */
export function resetLocalReceiptModelState(): void {
  destroyWorker();
  nextRequestId = 0;
}

function ensureWorker(createWorker: () => Worker): Worker {
  if (cachedWorker) return cachedWorker;
  const worker = createWorker();
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const call = pendingCalls.get(message.id);
    if (!call) return;
    if (message.type === "progress") {
      call.onProgress?.(message.status);
      return;
    }
    pendingCalls.delete(message.id);
    clearTimeout(call.timeout);
    if (message.type === "result") {
      call.resolve({
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
      call.reject(new Error(message.message));
    }
  };
  worker.onerror = (event) => {
    const calls = [...pendingCalls.values()];
    destroyWorker();
    for (const call of calls) {
      clearTimeout(call.timeout);
      call.reject(new Error((event as ErrorEvent).message || "Falha no worker de interpretação local."));
    }
  };
  cachedWorker = worker;
  return worker;
}

export async function runLocalReceiptModel(
  prompt: string,
  onProgress?: (status: string) => void,
  deps: RunLocalReceiptModelDeps = {},
): Promise<LocalModelOutput> {
  const timeoutMs = deps.timeoutMs ?? LOCAL_RECEIPT_TIMEOUT_MS;
  const worker = ensureWorker(deps.createWorker ?? (() =>
    new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module" })
  ));
  const id = ++nextRequestId;
  const request: WorkerRequest = { id, prompt };
  try {
    return await new Promise<LocalModelOutput>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingCalls.delete(id);
        // Terminating frees the stuck session; the next run starts fresh.
        destroyWorker();
        reject(new Error(LOCAL_RECEIPT_TIMEOUT_MESSAGE));
      }, timeoutMs);
      pendingCalls.set(id, { resolve, reject, onProgress, timeout });
      worker.postMessage(request);
    });
  } catch (error) {
    pendingCalls.delete(id);
    throw error;
  }
}
