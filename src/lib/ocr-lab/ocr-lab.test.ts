import { describe, expect, it, vi, beforeEach } from "vitest";

const mockTerminate = vi.fn().mockResolvedValue(undefined);
const mockRecognize = vi.fn();
const mockSetParameters = vi.fn().mockResolvedValue(undefined);

vi.mock("tesseract.js", () => ({
  createWorker: vi.fn().mockResolvedValue({
    recognize: mockRecognize,
    terminate: mockTerminate,
    setParameters: mockSetParameters,
  }),
}));

vi.mock("@/lib/receipt-ocr-preprocess", () => ({
  preprocessReceiptImage: vi.fn().mockResolvedValue({
    imageDataUrl: "data:image/jpeg;base64,preprocessed",
    width: 200,
    height: 150,
    durationMs: 12,
    applied: true,
    originalWidth: 200,
    originalHeight: 150,
  }),
  loadImage: vi.fn().mockResolvedValue({ naturalWidth: 200, naturalHeight: 150 }),
}));

vi.mock("@/lib/receipt", () => ({
  receiptToImageDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,original"),
}));

vi.mock("@/lib/ocr-lab/preprocessor", () => ({
  preprocessForStrategy: vi.fn().mockResolvedValue({
    imageDataUrl: "data:image/jpeg;base64,labpreprocessed",
    width: 200,
    height: 150,
  }),
}));

describe("ocr-lab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecognize.mockResolvedValue({
      data: {
        text: "PRODUTO A 1 UN 5.00",
        confidence: 72.5,
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    text: "PRODUTO A 1 UN 5.00",
                    confidence: 72.5,
                    bbox: { x0: 10, y0: 20, x1: 190, y1: 30 },
                    words: [
                      { text: "PRODUTO", confidence: 80, bbox: { x0: 10, y0: 20, x1: 60, y1: 30 } },
                      { text: "A", confidence: 75, bbox: { x0: 65, y0: 20, x1: 75, y1: 30 } },
                      { text: "1", confidence: 70, bbox: { x0: 80, y0: 20, x1: 90, y1: 30 } },
                      { text: "UN", confidence: 68, bbox: { x0: 95, y0: 20, x1: 115, y1: 30 } },
                      { text: "5.00", confidence: 72, bbox: { x0: 120, y0: 20, x1: 160, y1: 30 } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  describe("runLaboratory", () => {
    it("runs all 8 strategies sequentially", async () => {
      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      const results = await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
      });

      expect(results).toHaveLength(8);
      expect(results.map((r) => r.strategyId)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    });

    it("returns LabResult with required fields", async () => {
      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      const results = await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
      });

      for (const r of results) {
        expect(r).toHaveProperty("strategyId");
        expect(r).toHaveProperty("strategyName");
        expect(r).toHaveProperty("confidence");
        expect(r).toHaveProperty("timeMs");
        expect(r).toHaveProperty("text");
        expect(typeof r.strategyId).toBe("string");
        expect(typeof r.strategyName).toBe("string");
        expect(typeof r.confidence).toBe("number");
        expect(typeof r.timeMs).toBe("number");
        expect(typeof r.text).toBe("string");
      }
    });

    it("calls onProgress with correct arguments", async () => {
      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      const onProgress = vi.fn();

      await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledTimes(8);
      expect(onProgress).toHaveBeenCalledWith("A", 0, 8);
      expect(onProgress).toHaveBeenCalledWith("H", 7, 8);
    });

    it("sets correct PSM for each strategy", async () => {
      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
      });

      const calls = mockSetParameters.mock.calls.map((c) => c[0]);
      const psms = calls.map((c) => c.tessedit_pageseg_mode);

      expect(psms).toContain("3");
      expect(psms).toContain("6");
      expect(psms).toContain("7");
      expect(psms).toContain("11");
    });

    it("strategy F uses individual rectangles", async () => {
      vi.clearAllMocks();
      mockSetParameters.mockResolvedValue(undefined);
      mockTerminate.mockResolvedValue(undefined);

      const baselineBlocks = {
        data: {
          text: "baseline",
          confidence: 70,
          blocks: [
            {
              paragraphs: [
                {
                  lines: [
                    {
                      text: "PRODUTO A 1 UN 5.00",
                      confidence: 72.5,
                      bbox: { x0: 10, y0: 20, x1: 190, y1: 30 },
                      words: [
                        { text: "PRODUTO", confidence: 80, bbox: { x0: 10, y0: 20, x1: 60, y1: 30 } },
                        { text: "A", confidence: 75, bbox: { x0: 65, y0: 20, x1: 75, y1: 30 } },
                        { text: "1", confidence: 70, bbox: { x0: 80, y0: 20, x1: 90, y1: 30 } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const lineResult = { data: { text: "PRODUTO A 1 UN 5.00", confidence: 75 } };
      const fallbackResult = { data: { text: "other", confidence: 50 } };

      let callIdx = 0;
      mockRecognize.mockImplementation(() => {
        callIdx++;
        if (callIdx === 6) return Promise.resolve(baselineBlocks);
        if (callIdx === 7) return Promise.resolve(lineResult);
        return Promise.resolve(fallbackResult);
      });

      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      const results = await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
      });

      const fResult = results.find((r) => r.strategyId === "F");
      expect(fResult).toBeDefined();

      const recognizeCalls = mockRecognize.mock.calls;
      const fCalls = recognizeCalls.filter((call) => {
        const opts = call[1];
        return opts && typeof opts === "object" && "rectangle" in opts;
      });

      expect(fCalls.length).toBeGreaterThanOrEqual(1);
      for (const call of fCalls) {
        const rect = call[1].rectangle;
        expect(rect).toHaveProperty("left");
        expect(rect).toHaveProperty("top");
        expect(rect).toHaveProperty("width");
        expect(rect).toHaveProperty("height");
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
      }
    });

    it("cancels remaining strategies on abort", async () => {
      const controller = new AbortController();
      let callCount = 0;

      mockRecognize.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          controller.abort();
        }
        return Promise.resolve({
          data: { text: "result", confidence: 70 },
        });
      });

      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      const results = await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
        signal: controller.signal,
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("continues to next strategy after error in one", async () => {
      let callCount = 0;
      mockRecognize.mockImplementation(() => {
        callCount++;
        if (callCount === 3) {
          return Promise.reject(new Error("simulated failure"));
        }
        return Promise.resolve({
          data: { text: "ok", confidence: 70 },
        });
      });

      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      const results = await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
      });

      expect(results).toHaveLength(8);
      const errored = results.find((r) => r.error);
      expect(errored).toBeDefined();
      expect(errored!.error).toContain("simulated failure");

      const nonErrored = results.filter((r) => !r.error);
      expect(nonErrored.length).toBeGreaterThanOrEqual(7);
    });

    it("terminates worker after all strategies complete", async () => {
      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
      });

      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });

    it("terminates worker even if an error occurs", async () => {
      mockRecognize.mockRejectedValueOnce(new Error("fail"));
      mockRecognize.mockResolvedValue({ data: { text: "", confidence: 0 } });

      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
      });

      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });
  });

  describe("reporter", () => {
    it("buildLabReports produces correct structure", async () => {
      const { buildLabReports } = await import("@/lib/ocr-lab/reporter");
      const results = [
        { strategyId: "A", strategyName: "Baseline", confidence: 65.3, timeMs: 4200, text: "line1\nline2" },
        { strategyId: "B", strategyName: "PSM 6", confidence: 58.1, timeMs: 3800, text: "other" },
      ];

      const reports = buildLabReports(results);
      expect(reports).toHaveLength(2);
      expect(reports[0].lineCount).toBe(2);
      expect(reports[0].charCount).toBe(11);
      expect(reports[1].lineCount).toBe(1);
    });

    it("formatLabReport includes all strategies and headers", async () => {
      const { formatLabReport, buildLabReports } = await import("@/lib/ocr-lab/reporter");
      const results = [
        { strategyId: "A", strategyName: "Baseline", confidence: 65.3, timeMs: 4200, text: "text A" },
        { strategyId: "F", strategyName: "Linha a linha", confidence: 71.5, timeMs: 12000, text: "text F" },
      ];

      const reports = buildLabReports(results);
      const text = formatLabReport(reports);

      expect(text).toContain("=== RELATÓRIO DO LABORATÓRIO OCR ===");
      expect(text).toContain("--- A: Baseline");
      expect(text).toContain("--- F: Linha a linha");
      expect(text).toContain("text A");
      expect(text).toContain("text F");
      expect(text).toContain("=== FIM ===");
    });

    it("formatLabReport handles errors", async () => {
      const { formatLabReport, buildLabReports } = await import("@/lib/ocr-lab/reporter");
      const results = [
        { strategyId: "C", strategyName: "Threshold", confidence: 0, timeMs: 1000, text: "", error: "failed" },
      ];

      const reports = buildLabReports(results);
      const text = formatLabReport(reports);

      expect(text).toContain("Erro: failed");
      expect(text).toContain("(sem texto)");
    });
  });

  describe("types", () => {
    it("has exactly 8 strategies", async () => {
      const { STRATEGIES, STRATEGY_CONFIGS } = await import("@/lib/ocr-lab/types");
      expect(STRATEGIES).toHaveLength(8);
      expect(Object.keys(STRATEGY_CONFIGS)).toHaveLength(8);
    });

    it("each strategy has a matching config", async () => {
      const { STRATEGIES, STRATEGY_CONFIGS } = await import("@/lib/ocr-lab/types");
      for (const s of STRATEGIES) {
        expect(STRATEGY_CONFIGS[s.id]).toBeDefined();
      }
    });

    it("strategy F uses PSM 7", async () => {
      const { STRATEGY_CONFIGS } = await import("@/lib/ocr-lab/types");
      expect(STRATEGY_CONFIGS.F.psm).toBe("7");
    });

    it("strategy H has preserve_interword_spaces", async () => {
      const { STRATEGY_CONFIGS } = await import("@/lib/ocr-lab/types");
      expect(STRATEGY_CONFIGS.H.params.preserve_interword_spaces).toBe("1");
    });

    it("all strategies use por+eng", async () => {
      const { STRATEGIES, STRATEGY_CONFIGS } = await import("@/lib/ocr-lab/types");
      for (const s of STRATEGIES) {
        expect(STRATEGY_CONFIGS[s.id].lang).toBe("por+eng");
      }
    });
  });

  describe("isolation from official OCR", () => {
    it("lab results do not export to TransactionForm", async () => {
      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      const results = await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
      });

      for (const r of results) {
        expect(r).not.toHaveProperty("amount");
        expect(r).not.toHaveProperty("purchased_items");
        expect(r).not.toHaveProperty("item_values_are_final");
        expect(r).not.toHaveProperty("receiptDescription");
        expect(r).not.toHaveProperty("date");
        expect(r).not.toHaveProperty("counterparty");
      }
    });

    it("lab does not call parseReceiptText", async () => {
      const parseReceiptText = vi.fn();
      vi.doMock("@/lib/receipt-parser", () => ({ parseReceiptText }));

      const { runLaboratory } = await import("@/lib/ocr-lab/runner");
      await runLaboratory({
        imageDataUrl: "data:image/jpeg;base64,test",
      });

      expect(parseReceiptText).not.toHaveBeenCalled();
    });
  });
});
