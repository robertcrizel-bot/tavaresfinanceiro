import { describe, expect, it } from "vitest";
import { buildPaddleReceiptResult } from "./receiptResult";
import { paddleToParsedReceipt } from "./paddleToParsedReceipt";
import { formatReceiptDescription } from "@/lib/receipt-description";
import type { PaddleOcrRegion } from "./types";

function makeRegion(
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  confidence = 0.95,
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

const WAFERS = [
  { ean: "7896004009995", name: "BISC WAFER MINUETO 81GR MORANGO" },
  { ean: "7896004009988", name: "BISC WAFER MINUETO 81GR CHOCOLATE" },
  { ean: "7896004009988", name: "BISC WAFER MINUETO 81GR CHOCOLATE" },
];

/** Realistic Fonseca-style promotional item: original price, DESCONTO label,
 *  percentage, negative amount and the final positive price on their own lines. */
function waferRegions(index: number, baseY: number): PaddleOcrRegion[] {
  const wafer = WAFERS[index];
  return [
    makeRegion(`${wafer.ean} ${wafer.name}`, 111, baseY, 480, 16),
    makeRegion("1UN", 600, baseY + 20, 40, 12),
    makeRegion("2,85", 700, baseY + 20, 50, 12),
    makeRegion("DESCONTO", 236, baseY + 36, 90, 12),
    makeRegion("-30,18%", 640, baseY + 50, 70, 12),
    makeRegion("R$-0,86", 640, baseY + 64, 70, 12),
    makeRegion("1,99", 700, baseY + 78, 50, 12),
  ];
}

function buildWafers(): ReturnType<typeof buildPaddleReceiptResult> {
  const regions: PaddleOcrRegion[] = [
    makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
  ];
  WAFERS.forEach((_, index) => {
    regions.push(...waferRegions(index, 150 + index * 105));
  });
  regions.push(makeRegion("Qtde. Total de Itens", 10, 470, 240, 12));
  return buildPaddleReceiptResult(regions);
}

describe("discounted (promotional) item prices", () => {
  it("recovers R$ 1,99 for the three wafers from their own discount blocks", () => {
    const result = buildWafers();
    const wafers = result.items.filter((item) =>
      (item.description ?? "").includes("WAFER MINUETO"),
    );

    expect(wafers).toHaveLength(3);
    expect(wafers.map((item) => item.originalTotal)).toEqual([
      2.85, 2.85, 2.85,
    ]);
    expect(wafers.map((item) => item.explicitFinalValue)).toEqual([
      1.99, 1.99, 1.99,
    ]);
    expect(wafers.map((item) => item.effectiveValue)).toEqual([
      1.99, 1.99, 1.99,
    ]);

    const parsed = paddleToParsedReceipt(result);
    const description = formatReceiptDescription(parsed, true) ?? "";
    const lines = description
      .split("\n")
      .filter(
        (line) =>
          line.includes("WAFER MINUETO") && line.includes("— R$ 1,99"),
      );
    expect(lines).toHaveLength(3);
  });

  it("A: original 2,85 + DESCONTO block + final 1,99 keeps all three values", () => {
    const result = buildPaddleReceiptResult([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("7896004009995 PRODUTO PROMOCIONAL", 111, 150, 400, 16),
      makeRegion("1UN", 600, 170, 40, 12),
      makeRegion("2,85", 700, 170, 50, 12),
      makeRegion("DESCONTO", 236, 186, 90, 12),
      makeRegion("-30,18%", 640, 200, 70, 12),
      makeRegion("R$-0,86", 640, 214, 70, 12),
      makeRegion("1,99", 700, 228, 50, 12),
      makeRegion("Qtde. Total de Itens", 10, 300, 240, 12),
    ]);

    const item = result.items[0];
    expect(item.originalTotal).toBe(2.85);
    expect(item.explicitFinalValue).toBe(1.99);
    expect(item.effectiveValue).toBe(1.99);
  });

  it("B: a negative discount amount is never used as a price", () => {
    const result = buildPaddleReceiptResult([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("PRODUTO SEM FINAL", 111, 150, 300, 16),
      makeRegion("1UN", 600, 170, 40, 12),
      makeRegion("DESCONTO", 236, 186, 90, 12),
      makeRegion("R$-0,86", 640, 200, 70, 12),
      makeRegion("Qtde. Total de Itens", 10, 300, 240, 12),
    ]);

    const item = result.items[0];
    expect(item.effectiveValue).toBeNull();
    expect(item.originalTotal).not.toBe(0.86);
    expect(item.unitPrice).not.toBe(0.86);
    expect(item.explicitFinalValue).not.toBe(0.86);
  });

  it("C: a discount percentage is never used as a price", () => {
    for (const percent of ["-30,18%", "30,18%"]) {
      const result = buildPaddleReceiptResult([
        makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
        makeRegion("PRODUTO SÓ PERCENTUAL", 111, 150, 300, 16),
        makeRegion("1UN", 600, 170, 40, 12),
        makeRegion("DESCONTO", 236, 186, 90, 12),
        makeRegion(percent, 640, 200, 70, 12),
        makeRegion("Qtde. Total de Itens", 10, 300, 240, 12),
      ]);

      const item = result.items[0];
      expect(item.effectiveValue).toBeNull();
      expect(item.originalTotal).not.toBe(30.18);
      expect(item.unitPrice).not.toBe(30.18);
      expect(item.explicitFinalValue).not.toBe(30.18);
    }
  });

  it("D: the discount of item A never escapes to item B", () => {
    const result = buildPaddleReceiptResult([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("7896004009995 PRODUTO A PROMOCAO", 111, 150, 400, 16),
      makeRegion("1UN", 600, 170, 40, 12),
      makeRegion("2,85", 700, 170, 50, 12),
      makeRegion("DESCONTO", 236, 186, 90, 12),
      makeRegion("R$-0,86", 640, 200, 70, 12),
      makeRegion("1,99", 700, 214, 50, 12),
      makeRegion("7891132082469 PRODUTO B NORMAL", 111, 260, 400, 16),
      makeRegion("1UN", 600, 280, 40, 12),
      makeRegion("5,00", 700, 280, 50, 12),
      makeRegion("Qtde. Total de Itens", 10, 350, 240, 12),
    ]);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].effectiveValue).toBe(1.99);
    expect(result.items[1].effectiveValue).toBe(5);
    expect(result.items[1].explicitFinalValue).toBeNull();
    expect(result.items[1].originalTotal).toBe(5);
  });

  it("E: propagates the final price between consecutive items with the same EAN", () => {
    const result = buildPaddleReceiptResult([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("7896004009988 BISC WAFER MINUETO CHOCOLATE", 111, 150, 440, 16),
      makeRegion("1UN", 600, 170, 40, 12),
      makeRegion("1,99", 700, 170, 50, 12),
      makeRegion("7896004009988 BISC WAFER MINUETO CHOCOLATE", 111, 220, 440, 16),
      makeRegion("1UN", 600, 240, 40, 12),
      makeRegion("Qtde. Total de Itens", 10, 300, 240, 12),
    ]);

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      1.99, 1.99,
    ]);
  });

  it("F: does not propagate between different EANs", () => {
    const result = buildPaddleReceiptResult([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("7896004009995 BISC WAFER MINUETO MORANGO", 111, 150, 440, 16),
      makeRegion("1UN", 600, 170, 40, 12),
      makeRegion("1,99", 700, 170, 50, 12),
      makeRegion("7896004009988 BISC WAFER MINUETO CHOCOLATE", 111, 220, 440, 16),
      makeRegion("1UN", 600, 240, 40, 12),
      makeRegion("Qtde. Total de Itens", 10, 300, 240, 12),
    ]);

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      1.99, null,
    ]);
  });

  it("G: never overwrites a different explicit final price by propagation", () => {
    const result = buildPaddleReceiptResult([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("7896004009988 BISC WAFER MINUETO CHOCOLATE", 111, 150, 440, 16),
      makeRegion("1UN", 600, 170, 40, 12),
      makeRegion("1,99", 700, 170, 50, 12),
      makeRegion("7896004009988 BISC WAFER MINUETO CHOCOLATE", 111, 220, 440, 16),
      makeRegion("1UN", 600, 240, 40, 12),
      makeRegion("2,50", 700, 240, 50, 12),
      makeRegion("Qtde. Total de Itens", 10, 300, 240, 12),
    ]);

    expect(result.items.map((item) => item.effectiveValue)).toEqual([
      1.99, 2.5,
    ]);
  });

  it("H: payment, subtotal, change and receipt total never become item prices", () => {
    const result = buildPaddleReceiptResult([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("7891132082469 PRODUTO QUALQUER", 111, 150, 400, 16),
      makeRegion("1UN", 600, 170, 40, 12),
      makeRegion("10,00", 700, 170, 50, 12),
      makeRegion("SUBTOTAL 10,00", 111, 200, 200, 12),
      makeRegion("Qtde. Total de Itens", 10, 260, 240, 12),
      makeRegion("Valor a Pagar R$ 65,67", 111, 280, 300, 12),
      makeRegion("PIX 50,00", 111, 305, 200, 12),
      makeRegion("CARTEIRA DIGITAL 88,38", 111, 330, 260, 12),
      makeRegion("TROCO 2,00", 111, 355, 160, 12),
      makeRegion("TOTAL GERAL 65,67", 111, 380, 240, 12),
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toContain("PRODUTO QUALQUER");
    expect(result.items[0].effectiveValue).toBe(10);
    expect(result.items[0].originalTotal).toBe(10);
    for (const forbidden of [65.67, 50, 88.38, 2]) {
      expect(result.items[0].effectiveValue).not.toBe(forbidden);
      expect(result.items[0].originalTotal).not.toBe(forbidden);
      expect(result.items[0].unitPrice).not.toBe(forbidden);
    }
  });
});
