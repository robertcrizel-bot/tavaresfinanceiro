import { describe, expect, it } from "vitest";
import { adaptPpuLinesToRegions } from "./fast-ocr-adapter";

describe("adaptPpuLinesToRegions", () => {
  it("converts ppu boxes into the 4-point regions expected by buildPaddleReceiptResult", () => {
    const regions = adaptPpuLinesToRegions([
      [
        { text: "MERCADO CENTRAL", box: { x: 10, y: 20, width: 100, height: 30 }, confidence: 0.912 },
        { text: "TOTAL 120,00", box: { x: 10, y: 60, width: 80, height: 20 }, confidence: 0.876 },
      ],
      [
        { text: "ITEM 1 12,50", box: { x: 12, y: 90, width: 70, height: 18 }, confidence: 1 },
      ],
    ]);

    expect(regions).toEqual([
      {
        text: "MERCADO CENTRAL",
        confidence: 0.91,
        bbox: [[10, 20], [110, 20], [110, 50], [10, 50]],
      },
      {
        text: "TOTAL 120,00",
        confidence: 0.88,
        bbox: [[10, 60], [90, 60], [90, 80], [10, 80]],
      },
      {
        text: "ITEM 1 12,50",
        confidence: 1,
        bbox: [[12, 90], [82, 90], [82, 108], [12, 108]],
      },
    ]);
  });

  it("keeps reading order and tolerates empty lines", () => {
    const regions = adaptPpuLinesToRegions([
      [],
      [{ text: "DATA 11/09/2026", box: { x: 0, y: 0, width: 50, height: 10 }, confidence: 0.75 }],
      [],
    ]);

    expect(regions).toHaveLength(1);
    expect(regions[0].bbox).toHaveLength(4);
    expect(regions[0].confidence).toBe(0.75);
  });
});
