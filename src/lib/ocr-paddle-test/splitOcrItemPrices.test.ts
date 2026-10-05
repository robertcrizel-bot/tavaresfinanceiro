import { describe, expect, it } from "vitest";
import { buildPaddleReceiptResult } from "./receiptResult";
import { paddleToParsedReceipt } from "./paddleToParsedReceipt";
import { formatReceiptDescription } from "@/lib/receipt-description";
import { fonsecaRegions } from "./__fixtures__/fonseca.fixture";
import type { PaddleOcrRegion } from "./types";

const CREAMS = [
  "7898080640222 CREME LEITE OHT ITALAC 200G TP",
  "7898080640222 CREME LEITE UHI IIALAC 200G TP",
  "7898080640222 CREME LEITE UHT ITALAC 200G TP",
];
const PRICES = ["2,75", "2:75", "2.75"];

function makeRegion(
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  confidence = 0.9,
): PaddleOcrRegion {
  return {
    text,
    confidence,
    bbox: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
  };
}

function toDescription(regions: PaddleOcrRegion[]) {
  const result = buildPaddleReceiptResult(regions);
  const parsed = paddleToParsedReceipt(result);
  return {
    result,
    description: formatReceiptDescription(parsed, true) ?? "",
  };
}

function creamPriceLineCount(description: string): number {
  return description
    .split("\n")
    .filter((line) => line.includes("CREME LEITE") && line.includes("— R$ 2,75"))
    .length;
}

describe("split OCR item prices reach the final description", () => {
  it("keeps 2,75 / 2:75 / 2.75 when description, quantity and price are separate regions of the same visual line", () => {
    const regions: PaddleOcrRegion[] = [
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
    ];
    CREAMS.forEach((cream, index) => {
      const y = 150 + index * 30;
      regions.push(makeRegion(cream, 10, y, 300, 16));
      regions.push(makeRegion("1UN", 240, y + 2, 40, 12));
      regions.push(makeRegion(PRICES[index], 300, y + 2, 50, 12));
    });
    regions.push(makeRegion("Qtde. Total de Itens", 10, 250, 200, 12));

    const { result, description } = toDescription(regions);

    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      2.75, 2.75, 2.75,
    ]);
    expect(creamPriceLineCount(description)).toBe(3);
  });

  it("keeps 2,75 / 2:75 / 2.75 when description, quantity and price end up as independent grid lines", () => {
    const regions: PaddleOcrRegion[] = [
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
    ];
    CREAMS.forEach((cream, index) => {
      const y = 150 + index * 75;
      regions.push(makeRegion(cream, 10, y, 300, 12));
      regions.push(makeRegion("1UN", 240, y + 25, 40, 12));
      regions.push(makeRegion(PRICES[index], 300, y + 50, 50, 12));
    });
    regions.push(makeRegion("Qtde. Total de Itens", 10, 400, 200, 12));

    const { result, description } = toDescription(regions);

    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      2.75, 2.75, 2.75,
    ]);
    expect(creamPriceLineCount(description)).toBe(3);
  });

  it("keeps 2,75 / 2:75 / 2.75 when the price is glued to the quantity in a single region", () => {
    const regions: PaddleOcrRegion[] = [
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
    ];
    CREAMS.forEach((cream, index) => {
      const y = 150 + index * 30;
      regions.push(makeRegion(cream, 10, y, 300, 16));
      regions.push(makeRegion(`1UN ${PRICES[index]}`, 240, y + 2, 120, 12));
    });
    regions.push(makeRegion("Qtde. Total de Itens", 10, 250, 200, 12));

    const { result, description } = toDescription(regions);

    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      2.75, 2.75, 2.75,
    ]);
    expect(creamPriceLineCount(description)).toBe(3);
  });

  it("keeps the three prices on the real Fonseca receipt geometry", () => {
    const regions: PaddleOcrRegion[] = [...fonsecaRegions];
    regions.push(makeRegion(PRICES[0], 923, 891, 70, 30));
    regions.push(makeRegion(PRICES[1], 923, 920, 70, 30));
    regions.push(makeRegion(PRICES[2], 923, 949, 70, 30));

    const { result, description } = toDescription(regions);
    const creams = result.items.filter((item) =>
      (item.description ?? "").includes("CREME LEITE"),
    );

    expect(creams.map((item) => item.effectiveValue)).toEqual([
      2.75, 2.75, 2.75,
    ]);
    expect(creamPriceLineCount(description)).toBe(3);
  });
});
