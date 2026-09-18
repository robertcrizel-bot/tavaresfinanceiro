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

vi.mock("@/lib/receipt", () => ({
  receiptToImageDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,abc123"),
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
}));

describe("detectItemRegion", () => {
  function makeLine(text: string, y0: number, y1: number) {
    return {
      text,
      confidence: 80,
      bbox: { x0: 0, y0, x1: 200, y1 },
      words: [{ text, confidence: 80, bbox: { x0: 0, y0, x1: 200, y1 } }],
    };
  }

  it("detects header and footer structurally", async () => {
    const { detectItemRegion } = await import("@/lib/receipt-ocr");
    const lines = [
      makeLine("Empresa LTDA", 0, 10),
      makeLine("# COD  DESC QTD  UN  VL UN R$  VL ITEM R$", 12, 22),
      makeLine("PRODUTO A 1 UN 5.00 5.00", 24, 34),
      makeLine("PRODUTO B 2 UN 3.00 6.00", 36, 46),
      makeLine("Qtde. Total de Itens 3", 48, 58),
    ];
    const result = detectItemRegion(lines, 300, 200);
    expect(result).not.toBeNull();
    expect(result!.top).toBe(24);
    expect(result!.height).toBe(24);
    expect(result!.left).toBe(0);
    expect(result!.width).toBe(300);
  });

  it("does not confuse Valor Total with end of table", async () => {
    const { detectItemRegion } = await import("@/lib/receipt-ocr");
    const lines = [
      makeLine("# COD  DESC QTD  UN  VL UN R$  VL ITEM R$", 12, 22),
      makeLine("PRODUTO A 1 UN 5.00 5.00", 24, 34),
      makeLine("Valor Total R$ 50.00", 36, 46),
      makeLine("Qtde. Total de Itens 1", 48, 58),
    ];
    const result = detectItemRegion(lines, 300, 200);
    expect(result).not.toBeNull();
    expect(result!.top).toBe(24);
    expect(result!.height).toBe(24);
  });

  it("returns null when no header found", async () => {
    const { detectItemRegion } = await import("@/lib/receipt-ocr");
    const lines = [
      makeLine("Empresa LTDA", 0, 10),
      makeLine("PRODUTO A 1 UN 5.00", 12, 22),
      makeLine("Qtde. Total de Itens 1", 24, 34),
    ];
    expect(detectItemRegion(lines, 300, 200)).toBeNull();
  });

  it("returns null when no footer found", async () => {
    const { detectItemRegion } = await import("@/lib/receipt-ocr");
    const lines = [
      makeLine("# COD  DESC QTD  UN  VL UN R$  VL ITEM R$", 12, 22),
      makeLine("PRODUTO A 1 UN 5.00", 24, 34),
      makeLine("Empresa LTDA", 36, 46),
    ];
    expect(detectItemRegion(lines, 300, 200)).toBeNull();
  });

  it("generates rectangle with valid dimensions", async () => {
    const { detectItemRegion } = await import("@/lib/receipt-ocr");
    const lines = [
      makeLine("# COD  DESC QTD  UN  VL UN R$  VL ITEM R$", 50, 70),
      makeLine("PRODUTO A", 80, 100),
      makeLine("Qtde. Total de Itens 1", 110, 130),
    ];
    const result = detectItemRegion(lines, 400, 600);
    expect(result).not.toBeNull();
    expect(result!.left).toBe(0);
    expect(result!.width).toBe(400);
    expect(result!.top).toBeGreaterThanOrEqual(0);
    expect(result!.height).toBeGreaterThan(0);
    expect(result!.top + result!.height).toBeLessThanOrEqual(600);
  });
});

describe("extractReceiptText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecognize.mockReset();
    mockSetParameters.mockReset();
    mockSetParameters.mockResolvedValue(undefined);
  });

  it("returns text, confidence and duration", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "PIX R$ 50,00\nJoão Silva", confidence: 87.5 },
    });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "comprovante.jpg", { type: "image/jpeg" });
    const result = await extractReceiptText(file);

    expect(result.text).toBe("PIX R$ 50,00\nJoão Silva");
    expect(result.confidence).toBe(87.5);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("calls worker.terminate() even when recognize throws", async () => {
    mockRecognize.mockRejectedValue(new Error("OCR failed"));

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "comprovante.jpg", { type: "image/jpeg" });

    await expect(extractReceiptText(file)).rejects.toThrow("OCR failed");
    expect(mockTerminate).toHaveBeenCalled();
  });

  it("passes progress callback to worker logger", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "teste", confidence: 50 },
    });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "img.jpg", { type: "image/jpeg" });
    const onProgress = vi.fn();

    await extractReceiptText(file, onProgress);

    const Tesseract = await import("tesseract.js");
    expect(Tesseract.createWorker).toHaveBeenCalledWith(
      "por+eng",
      undefined,
      expect.objectContaining({
        logger: expect.any(Function),
      }),
    );
  });

  it("calls receiptToImageDataUrl to reuse existing pipeline", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "", confidence: 0 },
    });

    const receipt = await import("@/lib/receipt");
    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });

    await extractReceiptText(file);

    expect(receipt.receiptToImageDataUrl).toHaveBeenCalledWith(file);
  });

  it("calls preprocessReceiptImage and returns preprocessing info", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "texto", confidence: 75 },
    });

    const preprocess = await import("@/lib/receipt-ocr-preprocess");
    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });

    const result = await extractReceiptText(file);

    expect(preprocess.preprocessReceiptImage).toHaveBeenCalled();
    expect(result.preprocessApplied).toBe(true);
    expect(result.preprocessDurationMs).toBe(12);
  });

  it("passes preprocessed image to Tesseract worker", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "ok", confidence: 80 },
    });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });

    await extractReceiptText(file);

    expect(mockRecognize).toHaveBeenCalledWith("data:image/jpeg;base64,preprocessed", undefined, { blocks: true });
  });

  it("both recognize calls request blocks: true", async () => {
    mockRecognize
      .mockResolvedValueOnce({ data: { text: "A", confidence: 70, blocks: null } })
      .mockResolvedValueOnce({ data: { text: "B", confidence: 60, blocks: null } });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });

    await extractReceiptText(file);

    expect(mockRecognize).toHaveBeenCalledTimes(2);
    expect(mockRecognize.mock.calls[0]).toEqual([
      "data:image/jpeg;base64,preprocessed",
      undefined,
      { blocks: true },
    ]);
    expect(mockRecognize.mock.calls[1]).toEqual([
      "data:image/jpeg;base64,preprocessed",
      undefined,
      { blocks: true },
    ]);
  });

  it("returns preprocessedImageDataUrl for preview use", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "ok", confidence: 80 },
    });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });

    const result = await extractReceiptText(file);

    expect(result.preprocessedImageDataUrl).toBe("data:image/jpeg;base64,preprocessed");
  });

  it("calls receiptToImageDataUrl and preprocessReceiptImage exactly once each", async () => {
    mockRecognize.mockResolvedValue({
      data: { text: "", confidence: 0 },
    });

    const receipt = await import("@/lib/receipt");
    const preprocess = await import("@/lib/receipt-ocr-preprocess");
    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });

    await extractReceiptText(file);

    expect(receipt.receiptToImageDataUrl).toHaveBeenCalledTimes(1);
    expect(receipt.receiptToImageDataUrl).toHaveBeenCalledWith(file);
    expect(preprocess.preprocessReceiptImage).toHaveBeenCalledTimes(1);
  });

  it("returns psm3Lines extracted from PSM 3 recognize", async () => {
    mockRecognize
      .mockResolvedValueOnce({
        data: {
          text: "PRODUTO 1\nPRODUTO 2",
          confidence: 70,
          blocks: [
            {
              paragraphs: [
                {
                  lines: [
                    {
                      text: "PRODUTO 1",
                      confidence: 85,
                      bbox: { x0: 10, y0: 20, x1: 100, y1: 30 },
                      words: [
                        { text: "PRODUTO", confidence: 90, bbox: { x0: 10, y0: 20, x1: 70, y1: 30 } },
                        { text: "1", confidence: 75, bbox: { x0: 75, y0: 20, x1: 100, y1: 30 } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: { text: "PSM4 text", confidence: 60 },
      });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
    const result = await extractReceiptText(file);

    expect(result.psm3Lines).toHaveLength(1);
    expect(result.psm3Lines![0].text).toBe("PRODUTO 1");
    expect(result.psm3Lines![0].confidence).toBe(85);
    expect(result.psm3Lines![0].bbox).toEqual({ x0: 10, y0: 20, x1: 100, y1: 30 });
    expect(result.psm3Lines![0].words).toHaveLength(2);
    expect(result.psm3Lines![0].words[0].text).toBe("PRODUTO");
    expect(result.psm3Lines![0].words[0].confidence).toBe(90);
    expect(result.psm3Lines![0].words[1].text).toBe("1");
  });

  it("returns psm4Lines extracted from PSM 4 recognize", async () => {
    mockRecognize
      .mockResolvedValueOnce({
        data: {
          text: "LINE A",
          confidence: 70,
          blocks: [
            {
              paragraphs: [
                {
                  lines: [
                    {
                      text: "LINE A",
                      confidence: 80,
                      bbox: { x0: 5, y0: 10, x1: 60, y1: 20 },
                      words: [
                        { text: "LINE", confidence: 85, bbox: { x0: 5, y0: 10, x1: 35, y1: 20 } },
                        { text: "A", confidence: 70, bbox: { x0: 40, y0: 10, x1: 60, y1: 20 } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          text: "PSM4 LINE B",
          confidence: 65,
          blocks: [
            {
              paragraphs: [
                {
                  lines: [
                    {
                      text: "PSM4 LINE B",
                      confidence: 75,
                      bbox: { x0: 5, y0: 10, x1: 80, y1: 20 },
                      words: [
                        { text: "PSM4", confidence: 60, bbox: { x0: 5, y0: 10, x1: 30, y1: 20 } },
                        { text: "LINE", confidence: 80, bbox: { x0: 35, y0: 10, x1: 60, y1: 20 } },
                        { text: "B", confidence: 55, bbox: { x0: 65, y0: 10, x1: 80, y1: 20 } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
    const result = await extractReceiptText(file);

    expect(result.psm4Lines).toHaveLength(1);
    expect(result.psm4Lines![0].text).toBe("PSM4 LINE B");
    expect(result.psm4Lines![0].confidence).toBe(75);
    expect(result.psm4Lines![0].words).toHaveLength(3);
    expect(result.psm4Lines![0].words[0].confidence).toBe(60);
  });

  it("psm3Lines has no symbols, paragraphs, or full Page", async () => {
    mockRecognize
      .mockResolvedValueOnce({
        data: {
          text: "X",
          confidence: 50,
          blocks: [
            {
              blocktype: "TEXT",
              paragraphs: [
                {
                  lines: [
                    {
                      text: "X",
                      confidence: 50,
                      bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
                      words: [
                        {
                          text: "X",
                          confidence: 50,
                          bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
                          symbols: [{ text: "X", confidence: 50, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 }, is_superscript: false, is_subscript: false, is_dropcap: false }],
                          choices: [{ text: "X", confidence: 50 }],
                          font_name: "Arial",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { text: "", confidence: 0 } });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
    const result = await extractReceiptText(file);

    const line = result.psm3Lines![0];
    expect(line).not.toHaveProperty("symbols");
    expect(line).not.toHaveProperty("paragraphs");
    expect(line).not.toHaveProperty("blocktype");
    const word = line.words[0];
    expect(word).not.toHaveProperty("symbols");
    expect(word).not.toHaveProperty("choices");
    expect(word).not.toHaveProperty("font_name");
  });

  it("official text still comes from PSM 3", async () => {
    mockRecognize
      .mockResolvedValueOnce({
        data: { text: "PSM3 OFFICIAL", confidence: 80 },
      })
      .mockResolvedValueOnce({
        data: { text: "PSM4 DIAGNOSTIC", confidence: 70 },
      });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
    const result = await extractReceiptText(file);

    expect(result.text).toBe("PSM3 OFFICIAL");
    expect(result.confidence).toBe(80);
    expect(result.psm4Text).toBe("PSM4 DIAGNOSTIC");
    expect(result.psm4Confidence).toBe(70);
  });

  it("executes 3 recognizes when item region is found and returns psm3Crop data", async () => {
    const headerLine = "# COD  DESC QTD  UN  VL UN R$  VL ITEM R$";
    const footerLine = "Qtde. Total de Itens 3";
    const psm3Lines = [
      { text: headerLine, confidence: 90, bbox: { x0: 0, y0: 50, x1: 200, y1: 70 }, words: [{ text: headerLine, confidence: 90, bbox: { x0: 0, y0: 50, x1: 200, y1: 70 } }] },
      { text: "PRODUTO A 1 UN 5.00", confidence: 80, bbox: { x0: 0, y0: 80, x1: 200, y1: 100 }, words: [{ text: "PRODUTO", confidence: 85, bbox: { x0: 0, y0: 80, x1: 80, y1: 100 } }] },
      { text: footerLine, confidence: 85, bbox: { x0: 0, y0: 110, x1: 200, y1: 130 }, words: [{ text: footerLine, confidence: 85, bbox: { x0: 0, y0: 110, x1: 200, y1: 130 } }] },
    ];

    mockRecognize
      .mockResolvedValueOnce({ data: { text: "header\nitem\nfooter", confidence: 70, blocks: null } })
      .mockResolvedValueOnce({ data: { text: "PSM4", confidence: 60, blocks: null } })
      .mockResolvedValueOnce({ data: { text: "CROPPED ITEM A", confidence: 90, blocks: null } });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });

    const origExtract = (await import("@/lib/receipt-ocr")).extractDiagnosticLines;
    const psm3LinesReal = origExtract({
      blocks: psm3Lines.map((l) => ({
        paragraphs: [{ lines: [l] }],
      })),
    });
    expect(psm3LinesReal).toHaveLength(3);

    mockRecognize.mockReset();
    mockRecognize
      .mockResolvedValueOnce({
        data: {
          text: `${headerLine}\nPRODUTO A 1 UN 5.00\n${footerLine}`,
          confidence: 70,
          blocks: [
            { paragraphs: [{ lines: psm3Lines }] },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { text: "PSM4", confidence: 60 } })
      .mockResolvedValueOnce({ data: { text: "CROPPED ITEM A", confidence: 90 } });

    const result = await extractReceiptText(file);

    expect(mockRecognize).toHaveBeenCalledTimes(3);
    expect(result.text).toContain("PRODUTO");
    expect(result.psm3CropText).toBe("CROPPED ITEM A");
    expect(result.psm3CropConfidence).toBe(90);
    expect(result.psm3CropRectangle).toBeDefined();
    expect(result.psm3CropRectangle!.left).toBe(0);
    expect(result.psm3CropRectangle!.width).toBe(200);
    expect(result.psm3CropRectangle!.top).toBe(80);
    expect(result.psm3CropRectangle!.height).toBe(30);
  });

  it("executes only 2 recognizes when no item region is found", async () => {
    mockRecognize
      .mockResolvedValueOnce({
        data: { text: "Empresa LTDA\nValor Total R$ 50.00", confidence: 75 },
      })
      .mockResolvedValueOnce({ data: { text: "PSM4", confidence: 60 } });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
    const result = await extractReceiptText(file);

    expect(mockRecognize).toHaveBeenCalledTimes(2);
    expect(result.psm3CropText).toBeUndefined();
    expect(result.psm3CropRectangle).toBeUndefined();
  });

  it("restores PSM 3 before rectangle recognize even after PSM 4", async () => {
    const headerLine = "# COD  DESC QTD  UN  VL UN R$  VL ITEM R$";
    const footerLine = "Qtde. Total de Itens 1";
    const psm3Lines = [
      { text: headerLine, confidence: 90, bbox: { x0: 0, y0: 50, x1: 200, y1: 70 }, words: [{ text: headerLine, confidence: 90, bbox: { x0: 0, y0: 50, x1: 200, y1: 70 } }] },
      { text: "ITEM", confidence: 80, bbox: { x0: 0, y0: 80, x1: 200, y1: 100 }, words: [{ text: "ITEM", confidence: 80, bbox: { x0: 0, y0: 80, x1: 200, y1: 100 } }] },
      { text: footerLine, confidence: 85, bbox: { x0: 0, y0: 110, x1: 200, y1: 130 }, words: [{ text: footerLine, confidence: 85, bbox: { x0: 0, y0: 110, x1: 200, y1: 130 } }] },
    ];

    mockRecognize
      .mockResolvedValueOnce({
        data: { text: "header\nitem\nfooter", confidence: 70, blocks: [{ paragraphs: [{ lines: psm3Lines }] }] },
      })
      .mockResolvedValueOnce({ data: { text: "PSM4", confidence: 60 } })
      .mockResolvedValueOnce({ data: { text: "CROPPED", confidence: 85 } });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
    await extractReceiptText(file);

    const setParamCalls = mockSetParameters.mock.calls.map((c) => c[0]);
    const psm4Call = setParamCalls.findIndex((c) => c.tessedit_pageseg_mode === "4");
    const restoreCall = setParamCalls.findIndex((c) => c.tessedit_pageseg_mode === "3");
    expect(psm4Call).toBeGreaterThanOrEqual(0);
    expect(restoreCall).toBeGreaterThan(psm4Call);

    const thirdRecognizeArgs = mockRecognize.mock.calls[2];
    expect(thirdRecognizeArgs[1]).toEqual(
      expect.objectContaining({ rectangle: expect.any(Object) }),
    );
  });

  it("psm3CropError is set when rectangle recognize throws", async () => {
    const headerLine = "# COD  DESC QTD  UN  VL UN R$  VL ITEM R$";
    const footerLine = "Qtde. Total de Itens 1";
    const psm3Lines = [
      { text: headerLine, confidence: 90, bbox: { x0: 0, y0: 50, x1: 200, y1: 70 }, words: [{ text: headerLine, confidence: 90, bbox: { x0: 0, y0: 50, x1: 200, y1: 70 } }] },
      { text: "ITEM", confidence: 80, bbox: { x0: 0, y0: 80, x1: 200, y1: 100 }, words: [{ text: "ITEM", confidence: 80, bbox: { x0: 0, y0: 80, x1: 200, y1: 100 } }] },
      { text: footerLine, confidence: 85, bbox: { x0: 0, y0: 110, x1: 200, y1: 130 }, words: [{ text: footerLine, confidence: 85, bbox: { x0: 0, y0: 110, x1: 200, y1: 130 } }] },
    ];

    mockRecognize
      .mockResolvedValueOnce({
        data: { text: "header\nitem\nfooter", confidence: 70, blocks: [{ paragraphs: [{ lines: psm3Lines }] }] },
      })
      .mockResolvedValueOnce({ data: { text: "PSM4", confidence: 60 } })
      .mockRejectedValueOnce(new Error("CROP FAIL"));

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
    const result = await extractReceiptText(file);

    expect(result.psm3CropError).toBe("CROP FAIL");
    expect(result.psm3CropText).toBeUndefined();
    expect(result.text).toContain("header");
  });

  it("psm4 error does not prevent rectangle recognize", async () => {
    const headerLine = "# COD  DESC QTD  UN  VL UN R$  VL ITEM R$";
    const footerLine = "Qtde. Total de Itens 1";
    const psm3Lines = [
      { text: headerLine, confidence: 90, bbox: { x0: 0, y0: 50, x1: 200, y1: 70 }, words: [{ text: headerLine, confidence: 90, bbox: { x0: 0, y0: 50, x1: 200, y1: 70 } }] },
      { text: "ITEM", confidence: 80, bbox: { x0: 0, y0: 80, x1: 200, y1: 100 }, words: [{ text: "ITEM", confidence: 80, bbox: { x0: 0, y0: 80, x1: 200, y1: 100 } }] },
      { text: footerLine, confidence: 85, bbox: { x0: 0, y0: 110, x1: 200, y1: 130 }, words: [{ text: footerLine, confidence: 85, bbox: { x0: 0, y0: 110, x1: 200, y1: 130 } }] },
    ];

    mockRecognize
      .mockResolvedValueOnce({
        data: { text: "header\nitem\nfooter", confidence: 70, blocks: [{ paragraphs: [{ lines: psm3Lines }] }] },
      })
      .mockRejectedValueOnce(new Error("PSM4 FAIL"))
      .mockResolvedValueOnce({ data: { text: "CROPPED", confidence: 85 } });

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
    const result = await extractReceiptText(file);

    expect(result.psm4Error).toBe("PSM4 FAIL");
    expect(result.psm3CropText).toBe("CROPPED");
    expect(result.psm3CropRectangle).toBeDefined();
  });

  it("psm4 error does not prevent rectangle recognize even when setParameters for PSM 4 fails", async () => {
    const headerLine = "# COD  DESC QTD  UN  VL UN R$  VL ITEM R$";
    const footerLine = "Qtde. Total de Itens 1";
    const psm3Lines = [
      { text: headerLine, confidence: 90, bbox: { x0: 0, y0: 50, x1: 200, y1: 70 }, words: [{ text: headerLine, confidence: 90, bbox: { x0: 0, y0: 50, x1: 200, y1: 70 } }] },
      { text: "ITEM", confidence: 80, bbox: { x0: 0, y0: 80, x1: 200, y1: 100 }, words: [{ text: "ITEM", confidence: 80, bbox: { x0: 0, y0: 80, x1: 200, y1: 100 } }] },
      { text: footerLine, confidence: 85, bbox: { x0: 0, y0: 110, x1: 200, y1: 130 }, words: [{ text: footerLine, confidence: 85, bbox: { x0: 0, y0: 110, x1: 200, y1: 130 } }] },
    ];

    mockRecognize
      .mockResolvedValueOnce({
        data: { text: "header\nitem\nfooter", confidence: 70, blocks: [{ paragraphs: [{ lines: psm3Lines }] }] },
      })
      .mockResolvedValueOnce({ data: { text: "CROPPED", confidence: 85 } });

    mockSetParameters
      .mockRejectedValueOnce(new Error("PSM4 SET FAIL"))
      .mockResolvedValueOnce(undefined);

    const { extractReceiptText } = await import("@/lib/receipt-ocr");
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
    const result = await extractReceiptText(file);

    expect(result.psm4Error).toBe("PSM4 SET FAIL");
    expect(result.psm3CropText).toBe("CROPPED");
    expect(mockRecognize).toHaveBeenCalledTimes(2);
  });
});
