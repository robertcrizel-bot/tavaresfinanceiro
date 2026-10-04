import { PaddleOcrService, V6_SMALL_MODEL, V6_TINY_MODEL, type ModelUrls } from "ppu-paddle-ocr/web";
import { configureOrtWasm } from "@/lib/ocr-runtime";

const FAST_OCR_MODELS: Record<"small" | "tiny", ModelUrls> = {
  small: V6_SMALL_MODEL,
  tiny: V6_TINY_MODEL,
};
const FAST_OCR_MODEL_KEY: keyof typeof FAST_OCR_MODELS = "small";

interface RecognizeMessage {
  image: ArrayBuffer;
}

const scope = self as unknown as {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent<RecognizeMessage>) => void) | null;
};

scope.onmessage = async (event: MessageEvent<RecognizeMessage>) => {
  const { image } = event.data;
  let service: PaddleOcrService | null = null;
  try {
    scope.postMessage({ type: "progress", message: "Carregando modelo de OCR rápido..." });
    configureOrtWasm();

    const initializationStart = performance.now();
    service = new PaddleOcrService({
      model: FAST_OCR_MODELS[FAST_OCR_MODEL_KEY],
      recognition: {
        charactersDictionary: [],
        strategy: "per-line",
        minimumConfidence: 0.4,
      },
    });
    await service.initialize();
    const initializationMs = Math.round(performance.now() - initializationStart);

    scope.postMessage({ type: "progress", message: "Reconhecendo texto..." });
    const ocrStart = performance.now();
    const result = await service.recognize(image);
    const ocrMs = Math.round(performance.now() - ocrStart);

    await service.destroy();
    service = null;
    scope.postMessage({ type: "result", lines: result.lines, initializationMs, ocrMs });
  } catch (error) {
    if (service) {
      try {
        await service.destroy();
      } catch (disposeError) {
        console.warn("[fast-ocr-worker] failed to dispose service", disposeError);
      }
    }
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  scope.close();
};
