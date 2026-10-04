import { PaddleOcrService, V6_TINY_MODEL } from "ppu-paddle-ocr/web";
import { configureOrtWasm } from "@/lib/ocr-runtime";

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
      model: V6_TINY_MODEL,
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
