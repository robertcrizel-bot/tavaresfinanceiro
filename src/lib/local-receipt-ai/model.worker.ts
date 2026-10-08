/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";
import { LOCAL_RECEIPT_MODEL_ID } from "./model";
import type { LocalModelBackend } from "./schema";

env.allowLocalModels = false;
env.useBrowserCache = true;

interface WorkerRequest {
  prompt: string;
}

interface WebGpuNavigator {
  gpu?: {
    requestAdapter(): Promise<{ features: { has(feature: string): boolean } } | null>;
  };
}

type Generator = (
  messages: { role: "system" | "user"; content: string }[],
  options: { max_new_tokens: number; do_sample: boolean; temperature: number },
) => Promise<unknown>;

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
    return `Baixando modelo local... ${Math.round(progress.progress)}%`;
  }
  if (progress.status === "initiate") return "Baixando modelo local...";
  return null;
}

async function createGenerator(backend: LocalModelBackend): Promise<Generator> {
  const dtype = backend === "webgpu" ? "q4f16" : "q8";
  const instance = await pipeline("text-generation", LOCAL_RECEIPT_MODEL_ID, {
    device: backend,
    dtype,
    progress_callback: (event: unknown) => {
      const status = progressStatus(event);
      if (status) self.postMessage({ type: "progress", status });
    },
  });
  return instance as unknown as Generator;
}

function generatedText(output: unknown): string {
  if (!Array.isArray(output) || !output[0] || typeof output[0] !== "object") {
    throw new Error("O modelo local retornou uma resposta vazia.");
  }
  const generated = (output[0] as { generated_text?: unknown }).generated_text;
  if (typeof generated === "string") return generated;
  if (Array.isArray(generated)) {
    const last = generated.at(-1);
    if (last && typeof last === "object" && typeof (last as { content?: unknown }).content === "string") {
      return (last as { content: string }).content;
    }
  }
  throw new Error("O modelo local retornou um formato desconhecido.");
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const totalStart = performance.now();
  try {
    let backend: LocalModelBackend = await supportsFp16WebGpu() ? "webgpu" : "wasm";
    self.postMessage({ type: "progress", status: backend === "webgpu"
      ? "Inicializando modelo local com WebGPU..."
      : "Inicializando modelo local com WASM..." });

    const initializationStart = performance.now();
    let generator: Generator;
    try {
      generator = await createGenerator(backend);
    } catch (error) {
      if (backend !== "webgpu") throw error;
      backend = "wasm";
      self.postMessage({ type: "progress", status: "WebGPU indisponível; tentando WASM..." });
      generator = await createGenerator(backend);
    }
    const initializationMs = performance.now() - initializationStart;

    self.postMessage({ type: "progress", status: "Interpretando texto OCR localmente..." });
    const inferenceStart = performance.now();
    const output = await generator([
      { role: "system", content: "Return only grounded JSON extracted from the supplied OCR. Never invent missing data." },
      { role: "user", content: event.data.prompt },
    ], {
      max_new_tokens: 768,
      do_sample: false,
      temperature: 0,
    });
    const inferenceMs = performance.now() - inferenceStart;
    self.postMessage({
      type: "result",
      text: generatedText(output),
      backend,
      initializationMs,
      inferenceMs,
      totalMs: performance.now() - totalStart,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Não foi possível executar o modelo local.",
    });
  }
};
