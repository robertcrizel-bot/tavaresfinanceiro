import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rgbaToPaddleMat } from "@/lib/paddle-ocr-worker-image";
import { buildVerticalOcrTiles, extractVerticalRgbaTile } from "@/lib/paddle-ocr-tiling";

const paddleMocks = vi.hoisted(() => ({
  create: vi.fn(),
  predict: vi.fn(),
  dispose: vi.fn(),
  configureOrtWasm: vi.fn(),
  matFromArray: vi.fn(),
  matDelete: vi.fn(),
  bitmapClose: vi.fn(),
}));

vi.mock("@paddleocr/paddleocr-js", () => ({
  PaddleOCR: { create: paddleMocks.create },
}));

vi.mock("@/lib/ocr-runtime", () => ({
  configureOrtWasm: paddleMocks.configureOrtWasm,
  ORT_WASM_PATHS: { mjs: "mock.mjs", wasm: "mock.wasm" },
}));

const actualPaddle = await vi.importActual<typeof import("@paddleocr/paddleocr-js")>(
  "@paddleocr/paddleocr-js",
);

const posted: unknown[] = [];
let closedCount = 0;

function installScopeSpies() {
  posted.length = 0;
  closedCount = 0;
  (window as unknown as { postMessage: unknown }).postMessage = vi.fn((message: unknown) => {
    posted.push(message);
  });
  (window as unknown as { close: unknown }).close = vi.fn(() => {
    closedCount += 1;
  });
}

function predictResult() {
  return [
    {
      items: [
        { poly: [[0, 0], [10, 0], [10, 5], [0, 5]], text: "PAO FRANCES", score: 0.991 },
        { poly: [[0, 10], [10, 10], [10, 15], [0, 15]], text: "6,03", score: 0.87 },
      ],
      metrics: { detectedBoxes: 2 },
      runtime: { requestedBackend: "wasm" },
    },
  ];
}

describe("paddle-ocr.worker", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    installScopeSpies();
    paddleMocks.matFromArray.mockReturnValue({ delete: paddleMocks.matDelete });
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({
      width: 2,
      height: 1,
      close: paddleMocks.bitmapClose,
    })));
    vi.stubGlobal("OffscreenCanvas", class {
      getContext() {
        return {
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({
            width: 2,
            height: 1,
            data: new Uint8ClampedArray(8),
          })),
        };
      }
    });
    paddleMocks.predict.mockResolvedValue(predictResult());
    paddleMocks.create.mockResolvedValue({
      cv: {
        CV_8UC4: 24,
        matFromArray: paddleMocks.matFromArray,
      },
      predict: paddleMocks.predict,
      dispose: paddleMocks.dispose,
    });
    await import("@/lib/paddle-ocr.worker");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function runWorker(
    pixels = new ArrayBuffer(8),
    width = 2,
    height = 1,
    mode: "full" | "tiled" = "full",
  ) {
    const handler = (window as unknown as {
      onmessage: ((event: { data: { pixels: ArrayBuffer; width: number; height: number; mode: "full" | "tiled" } }) => Promise<void>) | null;
    }).onmessage;
    if (!handler) throw new Error("worker onmessage not installed");
    return handler({ data: { pixels, width, height, mode } });
  }

  it("never touches document, createImageBitmap or OffscreenCanvas", async () => {
    const bitmapSpy = vi.fn();
    vi.stubGlobal("createImageBitmap", bitmapSpy);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    Reflect.deleteProperty(globalThis, "document");
    try {
      await runWorker();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    }
    expect(bitmapSpy).not.toHaveBeenCalled();
    expect(posted.some((m) => (m as { type?: string }).type === "result")).toBe(true);
    expect(paddleMocks.matFromArray).toHaveBeenCalledWith(1, 2, 24, expect.any(Uint8Array));
  });

  it("creates PaddleOCR directly inside the worker without worker:true or wasmPaths", async () => {
    await runWorker();
    expect(paddleMocks.create).toHaveBeenCalledTimes(1);
    const options = paddleMocks.create.mock.calls[0][0];
    expect(options.worker).toBe(false);
    expect(options.lang).toBe("pt");
    expect(options.ocrVersion).toBe("PP-OCRv6");
    expect(options.ortOptions).toEqual({ backend: "wasm" });
    expect(options.ortOptions).not.toHaveProperty("wasmPaths");
    expect(paddleMocks.configureOrtWasm).toHaveBeenCalled();
  });

  it("returns mapped regions, text and metrics on success", async () => {
    await runWorker();
    const messages = posted.filter(
      (message): message is { type: string } =>
        typeof message === "object" && message !== null && "type" in message,
    );
    expect(messages.map((message) => message.type)).toContain("progress");
    const result = messages.find((message) => message.type === "result") as unknown as {
      regions: { text: string; confidence: number }[];
      text: string;
      initializationMs: number;
      ocrMs: number;
    };
    expect(result.regions).toEqual([
      { text: "PAO FRANCES", confidence: 0.99, bbox: [[0, 0], [10, 0], [10, 5], [0, 5]] },
      { text: "6,03", confidence: 0.87, bbox: [[0, 10], [10, 10], [10, 15], [0, 15]] },
    ]);
    expect(result.text).toBe("PAO FRANCES\n6,03");
    expect(result).toMatchObject({ mode: "full", tiles: 1 });
    expect(typeof result.initializationMs).toBe("number");
    expect(typeof result.ocrMs).toBe("number");
    expect(paddleMocks.predict).toHaveBeenCalledWith(
      expect.objectContaining({ delete: paddleMocks.matDelete }),
    );
    expect(paddleMocks.matDelete).toHaveBeenCalledTimes(1);
    expect(paddleMocks.dispose).toHaveBeenCalledTimes(1);
    expect(closedCount).toBe(1);
  });

  it("runs three tiled predictions sequentially on the same PaddleOCR instance", async () => {
    const tileResult = (text: string, y: number, score: number) => [{
      items: [{ poly: [[0, y], [10, y], [10, y + 5], [0, y + 5]], text, score }],
      metrics: { detectedBoxes: 1, recognizedCount: 1 },
      runtime: { requestedBackend: "wasm" },
    }];
    paddleMocks.predict
      .mockResolvedValueOnce(tileResult("ITEM", 93, 0.7))
      .mockResolvedValueOnce(tileResult("ITEM", 2, 0.9))
      .mockResolvedValueOnce(tileResult("TOTAL", 50, 0.95));

    await runWorker(new ArrayBuffer(2 * 300 * 4), 2, 300, "tiled");

    expect(paddleMocks.create).toHaveBeenCalledTimes(1);
    expect(paddleMocks.predict).toHaveBeenCalledTimes(3);
    expect(paddleMocks.matFromArray.mock.calls.map((call) => call[0])).toEqual([109, 118, 109]);
    expect(paddleMocks.matDelete).toHaveBeenCalledTimes(3);
    const result = posted.find((message) => (message as { type?: string }).type === "result") as {
      mode: string;
      tiles: number;
      detectedBoxes: number;
      recognizedCount: number;
      regions: { text: string; confidence: number; bbox: [number, number][] }[];
    };
    expect(result).toMatchObject({ mode: "tiled", tiles: 3, detectedBoxes: 3, recognizedCount: 3 });
    expect(result.regions).toEqual([
      { text: "ITEM", confidence: 0.9, bbox: [[0, 93], [10, 93], [10, 98], [0, 98]] },
      { text: "TOTAL", confidence: 0.95, bbox: [[0, 241], [10, 241], [10, 246], [0, 246]] },
    ]);
    expect(posted).toContainEqual(expect.objectContaining({
      type: "progress",
      stage: "predict-3/3",
      message: "Lendo parte 3 de 3...",
    }));
    expect(paddleMocks.dispose).toHaveBeenCalledTimes(1);
  });

  it("reports the failing stage without masking the error", async () => {
    paddleMocks.predict.mockRejectedValueOnce(new TypeError("predict explodiu"));
    await runWorker();
    const error = (posted as { type: string; stage?: string; message?: string }[]).find(
      (message) => message.type === "error",
    );
    expect(error?.stage).toBe("predict-start");
    expect(error?.message).toContain("predict-start");
    expect(error?.message).toContain("predict explodiu");
    expect(paddleMocks.dispose).toHaveBeenCalled();
    expect(closedCount).toBe(1);
  });
});

describe("worker-safe PaddleOCR input", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the package's real cv.Mat normalization without global.document", async () => {
    const ocr = await actualPaddle.PaddleOCR.create({
      worker: false,
      lang: "pt",
      ocrVersion: "PP-OCRv6",
      initialize: false,
      ortOptions: { backend: "wasm" },
    });

    class FakeMat {
      rows = 1;
      cols = 2;
      delete = vi.fn();

      clone() {
        return new FakeMat();
      }
    }

    const cv = {
      Mat: FakeMat,
      CV_8UC4: 24,
      matFromArray: vi.fn(() => new FakeMat()),
    };
    Object.assign(ocr, {
      cv,
      ort: {},
      detModel: {
        provider: "wasm",
        predict: vi.fn(async () => [{ boxes: [] }]),
        dispose: vi.fn(),
      },
      recModel: {
        provider: "wasm",
        predict: vi.fn(async () => []),
        dispose: vi.fn(),
      },
      webgpuState: { available: false, reason: "test" },
    });

    const bitmapClose = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({
      width: 2,
      height: 1,
      close: bitmapClose,
    })));
    vi.stubGlobal("OffscreenCanvas", class {
      getContext() {
        return {
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({
            width: 2,
            height: 1,
            data: new Uint8ClampedArray(8),
          })),
        };
      }
    });

    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    expect(Reflect.deleteProperty(globalThis, "document")).toBe(true);
    expect("document" in globalThis).toBe(false);
    try {
      const input = rgbaToPaddleMat({ pixels: new ArrayBuffer(8), width: 2, height: 1 }, cv);
      const results = await ocr.predict(input);

      expect(results).toHaveLength(1);
      expect(results[0].image).toEqual({ width: 2, height: 1 });
      expect(cv.matFromArray).toHaveBeenCalledWith(1, 2, 24, expect.any(Uint8Array));
    } finally {
      if (documentDescriptor) {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      }
      await ocr.dispose();
    }
  });

  it("extracts exact RGBA rows for a vertical tile without canvas APIs", () => {
    const source = new Uint8Array(2 * 4 * 4);
    source.forEach((_, index) => { source[index] = index; });
    const tile = extractVerticalRgbaTile(
      { pixels: source.buffer, width: 2, height: 4 },
      { top: 1, height: 2 },
    );
    expect(tile).toMatchObject({ width: 2, height: 2 });
    expect(Array.from(new Uint8Array(tile.pixels))).toEqual(Array.from(source.slice(8, 24)));
  });

  it("builds three vertical tiles with approximately six percent overlap", () => {
    expect(buildVerticalOcrTiles(300)).toEqual([
      { top: 0, height: 109 },
      { top: 91, height: 118 },
      { top: 191, height: 109 },
    ]);
  });
});
