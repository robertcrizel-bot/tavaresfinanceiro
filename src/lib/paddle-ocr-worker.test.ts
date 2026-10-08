import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PADDLE_OCR_TILE_COUNT,
  PADDLE_OCR_TIMEOUT_MESSAGE,
  PADDLE_OCR_TIMEOUT_MS,
  buildVerticalOcrTiles,
  paddleRecognize,
} from "@/lib/paddle-ocr-worker";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function makeFile(): File {
  return new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
}

function ocrResult(
  items: Array<{ text: string; score: number; poly: [number, number][] }>,
) {
  return [{
    image: { width: 1280, height: 348 },
    items,
    metrics: {
      detMs: 1,
      recMs: 1,
      totalMs: 2,
      detectedBoxes: items.length,
      recognizedCount: items.length,
    },
    runtime: {
      requestedBackend: "wasm",
      detProvider: "wasm",
      recProvider: "wasm",
      webgpuAvailable: false,
    },
  }];
}

function item(text: string, y: number, score = 0.99) {
  return {
    text,
    score,
    poly: [[10, y], [300, y], [300, y + 20], [10, y + 20]] as [number, number][],
  };
}

function runtimeHarness(predict: ReturnType<typeof vi.fn>) {
  const dispose = vi.fn().mockResolvedValue(undefined);
  const createPaddle = vi.fn().mockResolvedValue({ predict, dispose });
  const bitmap = { width: 1280, height: 900, close: vi.fn() };
  const canvases: Array<HTMLCanvasElement & { drawImage: ReturnType<typeof vi.fn> }> = [];
  const createCanvas = () => {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      drawImage,
      getContext: vi.fn(() => ({
        fillStyle: "",
        fillRect: vi.fn(),
        drawImage,
      })),
      toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(["tile"], { type: "image/jpeg" }))),
    } as unknown as HTMLCanvasElement & { drawImage: ReturnType<typeof vi.fn> };
    canvases.push(canvas);
    return canvas;
  };

  return {
    createPaddle,
    dispose,
    bitmap,
    canvases,
    deps: {
      createPaddle,
      createBitmap: vi.fn().mockResolvedValue(bitmap),
      createCanvas,
      timeoutMs: 1_000,
    },
  };
}

describe("paddleRecognize native worker pipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses a 45s global timeout and three vertical tiles", () => {
    expect(PADDLE_OCR_TIMEOUT_MS).toBe(45_000);
    expect(PADDLE_OCR_TILE_COUNT).toBe(3);
    expect(buildVerticalOcrTiles(900)).toEqual([
      { top: 0, height: 348 },
      { top: 252, height: 396 },
      { top: 552, height: 348 },
    ]);
  });

  it("uses one native Paddle worker and predicts the three tiles sequentially", async () => {
    const calls: Deferred<ReturnType<typeof ocrResult>>[] = [];
    const predict = vi.fn(() => {
      const call = deferred<ReturnType<typeof ocrResult>>();
      calls.push(call);
      return call.promise;
    });
    const harness = runtimeHarness(predict);
    const progress = vi.fn();
    const pending = paddleRecognize(makeFile(), progress, harness.deps);

    await vi.waitFor(() => expect(predict).toHaveBeenCalledTimes(1));
    expect(harness.createPaddle).toHaveBeenCalledTimes(1);
    expect(harness.createPaddle).toHaveBeenCalledWith({
      worker: true,
      lang: "pt",
      ocrVersion: "PP-OCRv6",
      initialize: true,
      ortOptions: {
        backend: "wasm",
        wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/",
      },
    });
    calls[0].resolve(ocrResult([
      item("PADARIA", 20),
      item("PAO FRANCES", 300, 0.9),
    ]));
    await vi.waitFor(() => expect(predict).toHaveBeenCalledTimes(2));
    calls[1].resolve(ocrResult([
      item("PAO FRANCES", 48),
      item("PAO DE QUEIJO", 100),
    ]));
    await vi.waitFor(() => expect(predict).toHaveBeenCalledTimes(3));
    calls[2].resolve(ocrResult([item("VALOR TOTAL 7,85", 50)]));

    const outcome = await pending;
    expect(outcome.regions.map((region) => region.text)).toEqual([
      "PADARIA",
      "PAO FRANCES",
      "PAO DE QUEIJO",
      "VALOR TOTAL 7,85",
    ]);
    expect(outcome.regions[1]).toMatchObject({
      text: "PAO FRANCES",
      confidence: 0.99,
      bbox: [[10, 300], [300, 300], [300, 320], [10, 320]],
    });
    expect(outcome.regions[2].bbox[0][1]).toBe(352);
    expect(outcome.regions[3].bbox[0][1]).toBe(602);
    expect(progress.mock.calls.map(([message]) => message)).toEqual([
      "Carregando OCR...",
      "Lendo parte 1 de 3...",
      "Lendo parte 2 de 3...",
      "Lendo parte 3 de 3...",
    ]);
    expect(harness.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(harness.canvases).toHaveLength(3);
    expect(harness.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it("does not create an application Worker around PaddleOCR", async () => {
    const externalWorker = vi.fn(() => {
      throw new Error("external worker must not be created");
    });
    vi.stubGlobal("Worker", externalWorker);
    const predict = vi.fn()
      .mockResolvedValueOnce(ocrResult([]))
      .mockResolvedValueOnce(ocrResult([]))
      .mockResolvedValueOnce(ocrResult([]));
    const harness = runtimeHarness(predict);

    await paddleRecognize(makeFile(), undefined, harness.deps);

    expect(externalWorker).not.toHaveBeenCalled();
    expect(harness.createPaddle).toHaveBeenCalledTimes(1);
  });

  it("disposes the native instance and rejects promptly after timeout", async () => {
    const predict = vi.fn(() => new Promise(() => undefined));
    const harness = runtimeHarness(predict);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(paddleRecognize(makeFile(), undefined, {
      ...harness.deps,
      timeoutMs: 20,
    })).rejects.toThrow(PADDLE_OCR_TIMEOUT_MESSAGE);

    await vi.waitFor(() => expect(harness.dispose).toHaveBeenCalledTimes(1));
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[paddle-ocr] timeout na etapa:", "predict-1/3");
    warn.mockRestore();
  });

  it("disposes the instance when prediction fails", async () => {
    const predict = vi.fn().mockRejectedValueOnce(new TypeError("predict failed"));
    const harness = runtimeHarness(predict);

    await expect(paddleRecognize(makeFile(), undefined, harness.deps))
      .rejects.toThrow("Falha no OCR durante predict-1/3: TypeError: predict failed");
    expect(harness.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
  });
});
