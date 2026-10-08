/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";
import {
  LOCAL_RECEIPT_MAX_NEW_TOKENS,
  LOCAL_RECEIPT_MODEL_ID,
  LOCAL_RECEIPT_MODEL_TASK,
} from "./model";
import type { LocalModelBackend } from "./schema";

env.allowLocalModels = false;
env.useBrowserCache = true;

interface WorkerRequest {
  id: number;
  prompt: string;
}

interface WebGpuNavigator {
  gpu?: {
    requestAdapter(): Promise<{ features: { has(feature: string): boolean } } | null>;
  };
}

type Generator = (input: string, options: { max_new_tokens: number }) => Promise<unknown>;

interface LoadedModel {
  generator: Generator;
  backend: LocalModelBackend;
  initializationMs: number;
}

// Kept alive for the whole page session: the second run reuses the loaded
// model instead of downloading and initializing everything again.
let loadedModel: LoadedModel | null = null;
let loadingPromise: Promise<LoadedModel> | null = null;

async function supportsFp16WebGpu(): Promise<boolean> {
  try {
    const adapter = await (self.navigator as typeof self.navigator & WebGpuNavigator).gpu?.requestAdapter();
    return adapter?.features.has("shader-f16") ?? false;
  } catch {
    return false;
  }
}

function progressStatus(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const progress = event as { status?: string; progress?: number };
  if (progress.status === "progress" && typeof progress.progress === "number") {
    return `Carregando modelo local... ${Math.round(progress.progress)}%`;
  }
  if (progress.status === "initiate") return "Carregando modelo local...";
  return null;
}

function reply(id: number, message: Record<string, unknown>): void {
  self.postMessage({ id, ...message });
}

async function loadModel(id: number): Promise<LoadedModel> {
  if (loadedModel) return loadedModel;
  if (!loadingPromise) {
    loadingPromise = (async (): Promise<LoadedModel> => {
      let backend: LocalModelBackend = await supportsFp16WebGpu() ? "webgpu" : "wasm";
      const initializationStart = performance.now();
      const create = (device: LocalModelBackend) =>
        pipeline(LOCAL_RECEIPT_MODEL_TASK, LOCAL_RECEIPT_MODEL_ID, {
          device,
          dtype: device === "webgpu" ? "q4f16" : "q8",
          progress_callback: (event: unknown) => {
            const status = progressStatus(event);
            if (status) reply(id, { type: "progress", status });
          },
        });
      try {
        reply(id, {
          type: "progress",
          status: backend === "webgpu" ? "Inicializando WebGPU..." : "Usando WASM...",
        });
        const instance = await create(backend);
        return {
          generator: instance as unknown as Generator,
          backend,
          initializationMs: performance.now() - initializationStart,
        };
      } catch (error) {
        if (backend !== "webgpu") throw error;
        backend = "wasm";
        reply(id, { type: "progress", status: "Usando WASM..." });
        const instance = await create(backend);
        return {
          generator: instance as unknown as Generator,
          backend,
          initializationMs: performance.now() - initializationStart,
        };
      }
    })().catch((error: unknown) => {
      loadingPromise = null;
      throw error;
    });
  }
  loadedModel = await loadingPromise;
  loadingPromise = null;
  return loadedModel;
}

function generatedText(output: unknown): string {
  if (typeof output === "string") return output;
  if (!Array.isArray(output) || !output[0] || typeof output[0] !== "object") {
    throw new Error("O modelo local retornou uma resposta vazia.");
  }
  const generated = (output[0] as { generated_text?: unknown }).generated_text;
  if (typeof generated === "string") return generated;
  throw new Error("O modelo local retornou um formato desconhecido.");
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, prompt } = event.data;
  const totalStart = performance.now();
  try {
    const { generator, backend, initializationMs } = await loadModel(id);
    reply(id, { type: "progress", status: "Interpretando..." });
    const inferenceStart = performance.now();
    const output = await generator(prompt, { max_new_tokens: LOCAL_RECEIPT_MAX_NEW_TOKENS });
    reply(id, {
      type: "result",
      text: generatedText(output),
      backend,
      initializationMs,
      inferenceMs: performance.now() - inferenceStart,
      totalMs: performance.now() - totalStart,
    });
  } catch (error) {
    reply(id, {
      type: "error",
      message: error instanceof Error ? error.message : "Não foi possível executar o modelo local.",
    });
  }
};
