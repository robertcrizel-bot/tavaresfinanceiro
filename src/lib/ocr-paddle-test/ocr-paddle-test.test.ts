import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockPredict = vi.fn();
const mockFetch = vi.fn();

vi.mock("@paddleocr/paddleocr-js", () => ({
  PaddleOCR: {
    create: vi.fn().mockResolvedValue({
      predict: mockPredict,
    }),
  },
}));

vi.mock("@/lib/receipt", () => ({
  receiptToImageDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,test"),
}));

describe("ocr-paddle-test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["test"], { type: "image/jpeg" })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("dataUrlToBlob", () => {
    it("converts a valid data URL to a Blob", async () => {
      const { dataUrlToBlob } = await import("@/lib/ocr-paddle-test/recognize");
      const dataUrl = "data:image/jpeg;base64,AAAA";
      const blob = await dataUrlToBlob(dataUrl);

      expect(mockFetch).toHaveBeenCalledWith(dataUrl);
      expect(blob).toBeInstanceOf(Blob);
    });

    it("throws when fetch fails", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 });
      const { dataUrlToBlob } = await import("@/lib/ocr-paddle-test/recognize");

      await expect(dataUrlToBlob("data:image/jpeg;base64,bad")).rejects.toThrow("Failed to convert data URL to Blob: 400");
    });

    it("throws when fetch rejects", async () => {
      mockFetch.mockRejectedValue(new TypeError("Network error"));
      const { dataUrlToBlob } = await import("@/lib/ocr-paddle-test/recognize");

      await expect(dataUrlToBlob("data:image/jpeg;base64,bad")).rejects.toThrow("Network error");
    });
  });

  describe("paddleRecognize", () => {
    it("returns empty result when no items detected", async () => {
      mockPredict.mockResolvedValue([]);
      const { paddleRecognize } = await import("@/lib/ocr-paddle-test/recognize");
      const result = await paddleRecognize("data:image/jpeg;base64,test");

      expect(result.text).toBe("");
      expect(result.confidence).toBeNull();
      expect(result.regions).toHaveLength(0);
      expect(result.error).toBeUndefined();

      const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
      expect(PaddleOCR.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lang: "pt",
          ocrVersion: "PP-OCRv6",
          ortOptions: expect.objectContaining({
            backend: "wasm",
            wasmPaths: expect.objectContaining({
              mjs: expect.stringContaining("ort-wasm-simd-threaded.jsep.mjs"),
              wasm: "/ort-wasm/ort-wasm-simd-threaded.jsep.wasm",
            }),
          }),
        }),
      );
    });

    it("passes a Blob to predict() instead of a string", async () => {
      mockPredict.mockResolvedValue([]);
      const { paddleRecognize } = await import("@/lib/ocr-paddle-test/recognize");
      await paddleRecognize("data:image/jpeg;base64,test");

      expect(mockPredict).toHaveBeenCalledTimes(1);
      const arg = mockPredict.mock.calls[0][0];
      expect(arg).toBeInstanceOf(Blob);
    });

    it("transforms SDK result to PaddleOcrResult", async () => {
      mockPredict.mockResolvedValue([
        {
          image: { width: 200, height: 150 },
          items: [
            {
              poly: [
                [10, 20],
                [100, 20],
                [100, 40],
                [10, 40],
              ],
              text: "PRODUTO A",
              score: 0.95,
            },
            {
              poly: [
                [10, 50],
                [100, 50],
                [100, 70],
                [10, 70],
              ],
              text: "PRODUTO B",
              score: 0.82,
            },
          ],
          metrics: {
            detMs: 500,
            recMs: 300,
            totalMs: 800,
            detectedBoxes: 2,
            recognizedCount: 2,
          },
          runtime: {
            requestedBackend: "wasm",
            detProvider: "onnx",
            recProvider: "onnx",
            webgpuAvailable: false,
          },
        },
      ]);

      const { paddleRecognize } = await import("@/lib/ocr-paddle-test/recognize");
      const result = await paddleRecognize("data:image/jpeg;base64,test");

      expect(result.text).toContain("PRODUTO A");
      expect(result.text).toContain("PRODUTO B");
      expect(result.confidence).toBeCloseTo(0.89, 1);
      expect(result.regions).toHaveLength(2);
      expect(result.regions[0].bbox).toEqual([
        [10, 20],
        [100, 20],
        [100, 40],
        [10, 40],
      ]);
      expect(result.detectedBoxes).toBe(2);
      expect(result.recognizedCount).toBe(2);
      expect(result.backend).toBe("wasm");
    });

    it("sorts regions by vertical position then horizontal", async () => {
      mockPredict.mockResolvedValue([
        {
          image: { width: 200, height: 150 },
          items: [
            {
              poly: [[10, 100], [100, 100], [100, 120], [10, 120]],
              text: "BOTTOM",
              score: 0.9,
            },
            {
              poly: [[100, 20], [190, 20], [190, 40], [100, 40]],
              text: "TOP RIGHT",
              score: 0.9,
            },
            {
              poly: [[10, 20], [90, 20], [90, 40], [10, 40]],
              text: "TOP LEFT",
              score: 0.9,
            },
          ],
          metrics: { detMs: 100, recMs: 100, totalMs: 200, detectedBoxes: 3, recognizedCount: 3 },
          runtime: { requestedBackend: "wasm", detProvider: "", recProvider: "", webgpuAvailable: false },
        },
      ]);

      const { paddleRecognize } = await import("@/lib/ocr-paddle-test/recognize");
      const result = await paddleRecognize("data:image/jpeg;base64,test");

      expect(result.regions.map((region) => region.text)).toEqual([
        "TOP LEFT",
        "TOP RIGHT",
        "BOTTOM",
      ]);
    });

    it("handles SDK errors gracefully", async () => {
      mockPredict.mockRejectedValue(new Error("model load failed"));
      const { paddleRecognize } = await import("@/lib/ocr-paddle-test/recognize");
      const result = await paddleRecognize("data:image/jpeg;base64,test");

      expect(result.error).toContain("model load failed");
      expect(result.text).toBe("");
      expect(result.regions).toHaveLength(0);
    });

    it("calls onProgress during recognition", async () => {
      mockPredict.mockResolvedValue([]);
      const onProgress = vi.fn();
      const { paddleRecognize } = await import("@/lib/ocr-paddle-test/recognize");
      await paddleRecognize("data:image/jpeg;base64,test", onProgress);

      expect(onProgress).toHaveBeenCalled();
      expect(onProgress.mock.calls.some((c: string[]) => c[0].includes("PaddleOCR"))).toBe(true);
    });

    it("does not alter official OCR flow", async () => {
      mockPredict.mockResolvedValue([]);
      const { paddleRecognize } = await import("@/lib/ocr-paddle-test/recognize");
      const result = await paddleRecognize("data:image/jpeg;base64,test");

      expect(result).not.toHaveProperty("amount");
      expect(result).not.toHaveProperty("purchased_items");
      expect(result).not.toHaveProperty("item_values_are_final");
      expect(result).not.toHaveProperty("receiptDescription");
      expect(result).not.toHaveProperty("date");
      expect(result).not.toHaveProperty("counterparty");
    });
  });

  describe("formatPaddleReport", () => {
    it("produces a complete report", async () => {
      const { formatPaddleReport } = await import("@/lib/ocr-paddle-test/recognize");
      const report = formatPaddleReport({
        text: "LINE 1\nLINE 2",
        confidence: 0.85,
        regions: [
          { text: "LINE 1", confidence: 0.9, bbox: [] },
          { text: "LINE 2", confidence: 0.8, bbox: [] },
        ],
        spatialItems: [],
        spatialHeaderColumns: null,
        timeMs: 3000,
        detectedBoxes: 2,
        recognizedCount: 2,
        backend: "wasm",
      });

      expect(report).toContain("=== RELATÓRIO PaddleOCR (protótipo) ===");
      expect(report).toContain("3.0s");
      expect(report).toContain("LINE 1");
      expect(report).toContain("LINE 2");
      expect(report).toContain("85%");
      expect(report).toContain("--- REGIONS JSON ---");
      expect(report).toContain('"text": "LINE 1"');
      expect(report).toContain('"confidence": 0.9');
      expect(report).toContain("=== FIM ===");
    });

    it("omits REGIONS JSON when no regions", async () => {
      const { formatPaddleReport } = await import("@/lib/ocr-paddle-test/recognize");
      const report = formatPaddleReport({
        text: "",
        confidence: null,
        regions: [],
        spatialItems: [],
        spatialHeaderColumns: null,
        timeMs: 100,
        detectedBoxes: 0,
        recognizedCount: 0,
        backend: "unknown",
        error: "init failed",
      });

      expect(report).toContain("Erro: init failed");
      expect(report).toContain("(sem texto)");
      expect(report).not.toContain("REGIONS JSON");
    });
  });
});
