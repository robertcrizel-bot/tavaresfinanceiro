import { describe, expect, it } from "vitest";
import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import type { FastOcrLineItem } from "./fast-ocr-adapter";
import { summarizeFastOcrGroupedLines, summarizeFastOcrRawLines } from "./fast-ocr-debug";

function region(text: string, x: number, y: number, width: number, height: number): PaddleOcrRegion {
  return {
    text,
    confidence: 0.9,
    bbox: [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
  };
}

describe("summarizeFastOcrRawLines", () => {
  it("flattens the worker output keeping the exact OCR text, confidence and box", () => {
    const lines: FastOcrLineItem[][] = [
      [{ text: "FONSECA MERCADO", box: { x: 4, y: 6, width: 120, height: 12 }, confidence: 0.98765 }],
      [
        { text: "CREME LEITE UHT ITALAC 200G TP", box: { x: 8, y: 120, width: 260, height: 14 }, confidence: 0.8123 },
        { text: "2.7S", box: { x: 300, y: 120, width: 40, height: 14 }, confidence: 0.55 },
      ],
    ];

    expect(summarizeFastOcrRawLines(lines)).toEqual([
      { index: 1, text: "FONSECA MERCADO", confidence: 0.98765, box: { x: 4, y: 6, width: 120, height: 12 } },
      { index: 2, text: "CREME LEITE UHT ITALAC 200G TP", confidence: 0.8123, box: { x: 8, y: 120, width: 260, height: 14 } },
      { index: 3, text: "2.7S", confidence: 0.55, box: { x: 300, y: 120, width: 40, height: 14 } },
    ]);
  });

  it("returns an empty summary when the model returned nothing", () => {
    expect(summarizeFastOcrRawLines([])).toEqual([]);
  });
});

describe("summarizeFastOcrGroupedLines", () => {
  it("keeps description and price on the same line and exposes each region", () => {
    const regions = [
      region("FONSECA", 10, 10, 80, 10),
      region("CREME LEITE UHT ITALAC 200G TP", 10, 100, 260, 10),
      region("2,75", 500, 100, 40, 10),
    ];

    expect(summarizeFastOcrGroupedLines(regions)).toEqual([
      { index: 1, text: "FONSECA", parts: ["FONSECA"] },
      {
        index: 2,
        text: "CREME LEITE UHT ITALAC 200G TP 2,75",
        parts: ["CREME LEITE UHT ITALAC 200G TP", "2,75"],
      },
    ]);
  });

  it("splits regions far apart vertically into separate lines", () => {
    const regions = [region("TOTAL 65,67", 10, 10, 120, 10), region("2,75", 10, 300, 40, 10)];

    expect(summarizeFastOcrGroupedLines(regions).map((line) => line.text)).toEqual([
      "TOTAL 65,67",
      "2,75",
    ]);
  });

  it("returns no lines for no regions", () => {
    expect(summarizeFastOcrGroupedLines([])).toEqual([]);
  });
});
