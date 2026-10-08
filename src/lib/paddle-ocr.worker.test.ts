import { beforeEach, describe, expect, it, vi } from "vitest";

const paddleMocks = vi.hoisted(() => ({
  create: vi.fn(),
  predict: vi.fn(),
  dispose: vi.fn(),
  configureOrtWasm: vi.fn(),
}));

vi.mock("@paddleocr/paddleocr-js", () => ({
  PaddleOCR: { create: paddleMocks.create },
}));

vi.mock("@/lib/ocr-runtime", () => ({
  configureOrtWasm: paddleMocks.configureOrtWasm,
  ORT_WASM_PATHS: { mjs: "mock.mjs", wasm: "mock.wasm" },
}));

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
    paddleMocks.predict.mockResolvedValue(predictResult());
    paddleMocks.create.mockResolvedValue({
      predict: paddleMocks.predict,
      dispose: paddleMocks.dispose,
    });
    await import("@/lib/paddle-ocr.worker");
  });

  function runWorker(image = new ArrayBuffer(8)) {
    const handler = (window as unknown as {
      onmessage: ((event: { data: { image: ArrayBuffer } }) => Promise<void>) | null;
    }).onmessage;
    if (!handler) throw new Error("worker onmessage not installed");
    return handler({ data: { image } });
  }

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
    expect(typeof result.initializationMs).toBe("number");
    expect(typeof result.ocrMs).toBe("number");
    expect(paddleMocks.dispose).toHaveBeenCalledTimes(1);
    expect(closedCount).toBe(1);
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
