import { describe, expect, it } from "vitest";
import { buildPaddleReceiptResult } from "./receiptResult";
import { detectItemBlocks } from "./itemBlockDetector";
import { spatialGroup } from "./spatialGrouper";
import type { PaddleOcrRegion } from "./types";

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

function detectBlocks(regions: PaddleOcrRegion[]) {
  const { lines } = spatialGroup(regions);
  return detectItemBlocks(lines);
}

const HEADER = () => makeRegion("PRODUTO QTD VALOR", 10, 60, 280, 14);
const SUMMARY = (y: number) => makeRegion("Qtde. Total de Itens", 10, y, 220, 14);

describe("pattern recognition A-O", () => {
  it("A: single-line product yields one strong item with qty and money", () => {
    const regions = [
      HEADER(),
      makeRegion("ARROZ TYPE 1 UN 5,99", 10, 120, 260, 14),
      SUMMARY(200),
    ];
    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe("ARROZ TYPE 1 UN 5,99");
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].unit).toBe("UN");
    expect(result.items[0].unitPrice).toBe(5.99);
    expect(result.items[0].effectiveValue).toBe(5.99);
    expect(result.items[0].classification).toBe("strong");
  });

  it("B: description then quantitative line yields one item", () => {
    const regions = [
      HEADER(),
      makeRegion("PAO FRANCES", 10, 120, 200, 14),
      makeRegion("0,350KG", 10, 150, 90, 14),
      makeRegion("4,00", 250, 150, 60, 14),
      makeRegion("1,40", 360, 150, 60, 14),
      SUMMARY(220),
    ];
    const { blocks } = detectBlocks(regions);
    const result = buildPaddleReceiptResult(regions);

    expect(blocks.map((b) => b.lineIndices)).toEqual([[1, 2]]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe("PAO FRANCES");
    expect(result.items[0].quantity).toBeCloseTo(0.35, 10);
    expect(result.items[0].unit).toBe("KG");
    expect(result.items[0].unitPrice).toBe(4);
    expect(result.items[0].originalTotal).toBe(1.4);
    expect(result.items[0].effectiveValue).toBe(1.4);
  });

  it("C: two consecutive sequences yield two items", () => {
    const regions = [
      HEADER(),
      makeRegion("ARROZ TYPE 1 UN 5,99", 10, 120, 260, 14),
      makeRegion("FEIJAO CARIOCA 1 UN 7,50", 10, 160, 260, 14),
      SUMMARY(230),
    ];
    const { blocks } = detectBlocks(regions);
    const result = buildPaddleReceiptResult(regions);

    expect(blocks.map((b) => b.lineIndices)).toEqual([[1], [2]]);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.effectiveValue)).toEqual([5.99, 7.5]);
  });

  it("D: two description lines plus quantitative line yield one item", () => {
    const regions = [
      HEADER(),
      makeRegion("QUEIJO MUSSARELA", 10, 120, 220, 14),
      makeRegion("FATIADA", 10, 150, 160, 14),
      makeRegion("1 UN 35,00 35,00", 10, 180, 240, 14),
      SUMMARY(250),
    ];
    const { blocks } = detectBlocks(regions);
    const result = buildPaddleReceiptResult(regions);

    expect(blocks.map((b) => b.lineIndices)).toEqual([[1, 2, 3]]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe("QUEIJO MUSSARELA FATIADA");
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].unit).toBe("UN");
    expect(result.items[0].effectiveValue).toBe(35);
  });

  it("E: three description lines plus quantitative line yield one item", () => {
    const regions = [
      HEADER(),
      makeRegion("PRESUNTO", 10, 120, 180, 14),
      makeRegion("COZIDO", 10, 150, 140, 14),
      makeRegion("FATIADO", 10, 180, 150, 14),
      makeRegion("1 UN 28,90 28,90", 10, 210, 240, 14),
      SUMMARY(280),
    ];
    const { blocks } = detectBlocks(regions);
    const result = buildPaddleReceiptResult(regions);

    expect(blocks.map((b) => b.lineIndices)).toEqual([[1, 2, 3, 4]]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe(
      "PRESUNTO COZIDO FATIADO",
    );
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].unit).toBe("UN");
    expect(result.items[0].effectiveValue).toBe(28.9);
  });

  it("F: packaging token in description keeps 1,01KG and uses structural 1 UN", () => {
    const regions = [
      HEADER(),
      makeRegion("QUEIJO MUSSARELA FATIADA 1,01KG", 10, 120, 300, 14),
      makeRegion("1 UN", 340, 120, 50, 14),
      makeRegion("33,00", 420, 120, 60, 14),
      makeRegion("33,00", 500, 120, 60, 14),
      SUMMARY(200),
    ];
    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toContain("1,01KG");
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].unit).toBe("UN");
    expect(result.items[0].effectiveValue).toBe(33);
  });

  it("G: De/Por plus Valor Líquido yields one item with explicitFinalValue", () => {
    const regions = [
      HEADER(),
      makeRegion("555 PRODUTO TESTE", 10, 120, 240, 14),
      makeRegion("1 UN", 340, 120, 50, 14),
      makeRegion("24,78", 420, 120, 60, 14),
      makeRegion("24,78", 500, 120, 60, 14),
      makeRegion("De 24,78 Por 16,11 desconto", 10, 155, 280, 14),
      makeRegion("Valor Líquido 16,11", 10, 185, 200, 14),
      SUMMARY(250),
    ];
    const { blocks } = detectBlocks(regions);
    const result = buildPaddleReceiptResult(regions);

    expect(blocks.map((b) => b.lineIndices)).toEqual([[1, 2, 3]]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unitPrice).toBe(24.78);
    expect(result.items[0].originalTotal).toBe(24.78);
    expect(result.items[0].explicitFinalValue).toBe(16.11);
    expect(result.items[0].effectiveValue).toBe(16.11);
  });

  it("H: fiscal labeled-value lines do not become items", () => {
    const regions = [
      HEADER(),
      makeRegion("GASOLINA COMUM", 10, 120, 220, 14),
      makeRegion("33,421L 6,69 223,58", 10, 150, 260, 14),
      makeRegion("ICMS 12,34", 10, 185, 160, 14),
      makeRegion("CONVENIO 0,00", 10, 215, 170, 14),
      makeRegion("BC 100,00", 10, 245, 150, 14),
      SUMMARY(300),
    ];
    const { blocks } = detectBlocks(regions);
    const result = buildPaddleReceiptResult(regions);

    expect(blocks.map((b) => b.lineIndices)).toEqual([[1, 2]]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe("GASOLINA COMUM");
    const descriptions = result.items.map((i) => i.description).join(" ");
    expect(descriptions).not.toContain("ICMS");
    expect(descriptions).not.toContain("CONVENIO");
    expect(descriptions).not.toContain("BC ");
  });

  it("I: consecutive complete products never merge into one block", () => {
    const regions = [
      HEADER(),
      makeRegion("PRODUTO ALPHA 1 UN 3,00", 10, 120, 260, 14),
      makeRegion("PRODUTO BETA 1 UN 4,00", 10, 160, 260, 14),
      makeRegion("PRODUTO GAMMA 1 UN 5,00", 10, 200, 260, 14),
      SUMMARY(270),
    ];
    const { blocks } = detectBlocks(regions);

    expect(blocks.map((b) => b.lineIndices)).toEqual([[1], [2], [3]]);
    expect(blocks).toHaveLength(3);
  });

  it("J: five identical items stay as five separate blocks", () => {
    const regions = [
      HEADER(),
      ...Array.from({ length: 5 }, (_, i) =>
        makeRegion("BRAHMA LATA 1UN 2,35", 10, 120 + i * 35, 240, 14),
      ),
      SUMMARY(340),
    ];
    const { blocks } = detectBlocks(regions);
    const result = buildPaddleReceiptResult(regions);

    expect(blocks).toHaveLength(5);
    expect(result.items).toHaveLength(5);
    expect(
      result.items.every(
        (i) =>
          i.description === "BRAHMA LATA 1UN 2,35" && i.effectiveValue === 2.35,
      ),
    ).toBe(true);
    expect(result.sumKnownItemValues).toBeCloseTo(11.75, 2);
  });

  it("K: summary line closes the item area and is never an item", () => {
    const regions = [
      HEADER(),
      makeRegion("PRODUTO TESTE 1 UN 9,99", 10, 120, 260, 14),
      SUMMARY(200),
      makeRegion("Valor a Pagar R$: 9,99", 10, 230, 240, 14),
      makeRegion("FORMA PAGAMENTO", 10, 270, 200, 14),
    ];
    const { areaEnd, blocks } = detectBlocks(regions);
    const result = buildPaddleReceiptResult(regions);

    expect(areaEnd).toBe(1);
    expect(blocks.flatMap((b) => b.lineIndices)).not.toContain(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).not.toContain("Qtde");
    expect(result.receiptTotal).toBe(9.99);
  });

  it("L: receiptTotal prefers Valor a Pagar over other strong markers", () => {
    const base = [
      HEADER(),
      makeRegion("PRODUTO TESTE 1 UN 10,00", 10, 120, 260, 14),
      SUMMARY(200),
    ];
    const allMarkers = buildPaddleReceiptResult([
      ...base,
      makeRegion("Valor Total R$: 50,00", 10, 230, 220, 14),
      makeRegion("Valor Pago R$: 45,00", 10, 260, 220, 14),
      makeRegion("Valor a Pagar R$: 40,00", 10, 290, 240, 14),
      makeRegion("Total Geral R$: 60,00", 10, 320, 230, 14),
    ]);
    expect(allMarkers.receiptTotal).toBe(40);

    const pagoOnly = buildPaddleReceiptResult([
      ...base,
      makeRegion("Valor Pago R$: 45,00", 10, 260, 220, 14),
    ]);
    expect(pagoOnly.receiptTotal).toBe(45);

    const totalOnly = buildPaddleReceiptResult([
      ...base,
      makeRegion("Valor Total R$: 50,00", 10, 230, 220, 14),
    ]);
    expect(totalOnly.receiptTotal).toBe(50);

    const geralOnly = buildPaddleReceiptResult([
      ...base,
      makeRegion("Total Geral R$: 60,00", 10, 320, 230, 14),
    ]);
    expect(geralOnly.receiptTotal).toBe(60);
  });

  it("M: fuel item keeps unit L and printed total without multiplication", () => {
    const regions = [
      HEADER(),
      makeRegion("GASOLINA COMUM", 10, 120, 220, 14),
      makeRegion("33,421L 6,69 223,58", 10, 150, 280, 14),
      SUMMARY(230),
      makeRegion("Valor a Pagar R$: 223,58", 10, 260, 250, 14),
    ];
    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe("GASOLINA COMUM");
    expect(result.items[0].quantity).toBeCloseTo(33.421, 10);
    expect(result.items[0].unit).toBe("L");
    expect(result.items[0].unitPrice).toBe(6.69);
    expect(result.items[0].originalTotal).toBe(223.58);
    expect(result.items[0].effectiveValue).toBe(223.58);
    expect(result.receiptTotal).toBe(223.58);
    expect(result.sumKnownItemValues).toBeCloseTo(223.58, 2);
    expect(Math.abs(result.differenceFromReceiptTotal ?? 99)).toBeLessThanOrEqual(0.01);
  });

  it("N: never computes effectiveValue as quantity times unitPrice", () => {
    const regions = [
      HEADER(),
      makeRegion("PRODUTO TESTE", 10, 120, 200, 14),
      makeRegion("2 UN", 340, 120, 50, 14),
      makeRegion("5,00", 420, 120, 60, 14),
      makeRegion("9,00", 500, 120, 60, 14),
      SUMMARY(200),
    ];
    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(2);
    expect(result.items[0].unitPrice).toBe(5);
    expect(result.items[0].originalTotal).toBe(9);
    expect(result.items[0].effectiveValue).toBe(9);
    expect(result.items[0].effectiveValue).not.toBe(10);
  });

  it("O: fragment pieces are never reconstructed into totals", () => {
    const regions = [
      HEADER(),
      makeRegion("PRODUTO FRAGMENTADO", 10, 120, 240, 14),
      makeRegion("0,464KG", 340, 120, 90, 14),
      makeRegion("6", 460, 120, 30, 14),
      makeRegion("79", 510, 120, 40, 14),
      SUMMARY(200),
    ];
    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBeCloseTo(0.464, 10);
    expect(result.items[0].unit).toBe("KG");
    expect(result.items[0].unitPrice).toBeNull();
    expect(result.items[0].originalTotal).toBeNull();
    expect(result.items[0].effectiveValue).toBeNull();
    expect(result.items[0].explicitFinalValue).toBeNull();
  });
});

describe("synthetic receipt targets", () => {
  it("padaria: 2 items summing to 7.34", () => {
    const regions = [
      HEADER(),
      makeRegion("PAO FRANCES", 10, 120, 200, 14),
      makeRegion("0,350KG 4,51 1,58", 10, 150, 260, 14),
      makeRegion("PAO DE QUEIJO", 10, 190, 220, 14),
      makeRegion("1 UN", 340, 190, 50, 14),
      makeRegion("5,76", 420, 190, 60, 14),
      SUMMARY(260),
      makeRegion("Valor a Pagar R$: 7,34", 10, 290, 250, 14),
    ];
    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(2);
    expect(result.sumKnownItemValues).toBeCloseTo(7.34, 2);
    expect(result.receiptTotal).toBe(7.34);
    expect(result.differenceFromReceiptTotal).not.toBeNull();
    expect(Math.abs(result.differenceFromReceiptTotal!)).toBeLessThanOrEqual(0.01);
  });

  it("tradicao: 7 items summing to 159.14", () => {
    const products = [
      ["ARROZ AGULHINHA 5KG", "1 UN", "45,00"],
      ["FEIJAO PRETO 1KG", "1 UN", "30,50"],
      ["ACUCAR REFINADO 1KG", "1 UN", "25,00"],
      ["CAFE TORRADO 500G", "1 UN", "20,00"],
      ["OLEO SOJA 900ML", "1 UN", "15,00"],
      ["LEITE UHT 1L", "1 UN", "14,50"],
      ["MACARRAO ESPAGUETE 500G", "1 UN", "9,14"],
    ] as const;

    const regions = [HEADER()];
    let y = 120;
    for (const [name, qty, money] of products) {
      regions.push(makeRegion(name, 10, y, 280, 14));
      regions.push(makeRegion(`${qty} ${money} ${money}`, 320, y, 180, 14));
      y += 35;
    }
    regions.push(SUMMARY(y + 10));
    regions.push(
      makeRegion("Valor a Pagar R$: 159,14", 10, y + 40, 250, 14),
    );

    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(7);
    expect(result.sumKnownItemValues).toBeCloseTo(159.14, 2);
    expect(result.receiptTotal).toBe(159.14);
    expect(Math.abs(result.differenceFromReceiptTotal!)).toBeLessThanOrEqual(0.01);
  });

  it("multilinha: 4 items summing to 66.51 with packaging in description", () => {
    const regions = [
      HEADER(),
      makeRegion("QUEIJO MUSSARELA FATIADA 1,01KG", 10, 120, 300, 14),
      makeRegion("1 UN", 340, 120, 50, 14),
      makeRegion("33,00", 420, 120, 60, 14),
      makeRegion("33,00", 500, 120, 60, 14),
      makeRegion("PRESUNTO COZIDO", 10, 160, 240, 14),
      makeRegion("FATIADO", 10, 190, 140, 14),
      makeRegion("1 UN 15,75 15,75", 10, 220, 240, 14),
      makeRegion("SALAME FATIADO 1 UN 12,00 12,00", 10, 260, 320, 14),
      makeRegion("PATE SABOR CASERO", 10, 300, 260, 14),
      makeRegion("1 UN 5,76 5,76", 10, 330, 240, 14),
      SUMMARY(390),
      makeRegion("Valor a Pagar R$: 66,51", 10, 420, 250, 14),
    ];
    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(4);
    expect(result.items[0].description).toContain("1,01KG");
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].unit).toBe("UN");
    expect(result.items[1].description).toBe("PRESUNTO COZIDO FATIADO");
    expect(result.items[1].quantity).toBe(1);
    expect(result.sumKnownItemValues).toBeCloseTo(66.51, 2);
    expect(result.receiptTotal).toBe(66.51);
    expect(Math.abs(result.differenceFromReceiptTotal!)).toBeLessThanOrEqual(0.01);
  });

  it("droga raia: 3 items summing to 32.39 with De/Por complement", () => {
    const regions = [
      HEADER(),
      makeRegion("100 PRODUTO A", 10, 120, 220, 14),
      makeRegion("1 UN", 340, 120, 50, 14),
      makeRegion("10,00", 420, 120, 60, 14),
      makeRegion("10,00", 500, 120, 60, 14),
      makeRegion("200 PRODUTO B", 10, 160, 220, 14),
      makeRegion("1 UN", 340, 160, 50, 14),
      makeRegion("6,28", 420, 160, 60, 14),
      makeRegion("6,28", 500, 160, 60, 14),
      makeRegion("300 PRODUTO C", 10, 200, 220, 14),
      makeRegion("1 UN", 340, 200, 50, 14),
      makeRegion("24,78", 420, 200, 60, 14),
      makeRegion("24,78", 500, 200, 60, 14),
      makeRegion("De 24,78 Por 16,11 desconto", 10, 235, 280, 14),
      makeRegion("Valor Líquido 16,11", 10, 265, 200, 14),
      SUMMARY(320),
      makeRegion("Valor a Pagar R$: 32,39", 10, 350, 250, 14),
    ];
    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(3);
    expect(result.items[2].unitPrice).toBe(24.78);
    expect(result.items[2].originalTotal).toBe(24.78);
    expect(result.items[2].explicitFinalValue).toBe(16.11);
    expect(result.items[2].effectiveValue).toBe(16.11);
    expect(result.sumKnownItemValues).toBeCloseTo(32.39, 2);
    expect(result.receiptTotal).toBe(32.39);
    expect(Math.abs(result.differenceFromReceiptTotal!)).toBeLessThanOrEqual(0.01);
  });

  it("combustivel: 1 GASOLINA item with fiscal lines excluded", () => {
    const regions = [
      HEADER(),
      makeRegion("GASOLINA COMUM", 10, 120, 220, 14),
      makeRegion("33,421L", 10, 150, 90, 14),
      makeRegion("6,69", 340, 150, 60, 14),
      makeRegion("223,58", 430, 150, 70, 14),
      makeRegion("ICMS 26,83", 10, 190, 160, 14),
      makeRegion("CONVENIO 0,00", 10, 220, 170, 14),
      makeRegion("BC 1863,17", 10, 250, 160, 14),
      SUMMARY(300),
      makeRegion("Valor a Pagar R$: 223,58", 10, 330, 250, 14),
    ];
    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe("GASOLINA COMUM");
    expect(result.items[0].quantity).toBeCloseTo(33.421, 10);
    expect(result.items[0].unit).toBe("L");
    expect(result.items[0].unitPrice).toBe(6.69);
    expect(result.items[0].effectiveValue).toBe(223.58);
    expect(result.receiptTotal).toBe(223.58);
    expect(Math.abs(result.differenceFromReceiptTotal!)).toBeLessThanOrEqual(0.01);
    const descriptions = result.items.map((i) => i.description).join("|");
    expect(descriptions).not.toContain("ICMS");
    expect(descriptions).not.toContain("CONVENIO");
    expect(descriptions).not.toContain("BC");
  });

  it("fonseca-10 synthetic: 10 items summing to 120.62 with separate identical rows", () => {
    const regions = [
      makeRegion("CODIGO DESCRICAO GTDE UN VL UNIT VL TOTAL", 10, 60, 420, 14),
      makeRegion("PANCETA SUINA", 10, 120, 220, 14),
      makeRegion("0,332KG 26,49", 10, 150, 160, 14),
      makeRegion("8,79", 360, 150, 60, 14),
      makeRegion("ANTARCTICA ORIGINAL", 10, 190, 240, 14),
      makeRegion("1UN", 340, 190, 50, 14),
      makeRegion("2,29", 420, 190, 60, 14),
      makeRegion("2,29", 500, 190, 60, 14),
      ...Array.from({ length: 5 }, (_, i) => [
        makeRegion("BRAHMA LATA", 10, 230 + i * 35, 200, 14),
        makeRegion("1UN", 340, 230 + i * 35, 50, 14),
        makeRegion("2,35", 420, 230 + i * 35, 60, 14),
        makeRegion("2,35", 500, 230 + i * 35, 60, 14),
      ]).flat(),
      makeRegion("LINGUICA TOSCANA", 10, 410, 240, 14),
      makeRegion("0,436KG 23,90", 10, 440, 160, 14),
      makeRegion("10,42", 360, 440, 70, 14),
      makeRegion("FRALDINHA", 10, 480, 200, 14),
      makeRegion("1,406KG 47,99", 10, 510, 170, 14),
      makeRegion("67,47", 360, 510, 70, 14),
      makeRegion("CARVAO 2KG", 10, 550, 200, 14),
      makeRegion("1 UN", 340, 550, 50, 14),
      makeRegion("19,90", 420, 550, 60, 14),
      makeRegion("19,90", 500, 550, 60, 14),
      SUMMARY(600),
      makeRegion("Valor a Pagar R$: 120,62", 10, 630, 260, 14),
    ];

    const result = buildPaddleReceiptResult(regions);

    expect(result.items).toHaveLength(10);
    expect(result.sumKnownItemValues).toBeCloseTo(120.62, 2);
    expect(result.receiptTotal).toBe(120.62);
    expect(result.differenceFromReceiptTotal).not.toBeNull();
    expect(Math.abs(result.differenceFromReceiptTotal!)).toBeLessThanOrEqual(0.01);

    const panceta = result.items[0];
    expect(panceta.quantity).toBeCloseTo(0.332, 10);
    expect(panceta.unit).toBe("KG");
    expect(panceta.unitPrice).toBe(26.49);
    expect(panceta.effectiveValue).toBe(8.79);

    const antarctica = result.items[1];
    expect(antarctica.quantity).toBe(1);
    expect(antarctica.unit).toBe("UN");
    expect(antarctica.unitPrice).toBe(2.29);
    expect(antarctica.effectiveValue).toBe(2.29);

    const brahmas = result.items.slice(2, 7);
    expect(brahmas).toHaveLength(5);
    for (const brahma of brahmas) {
      expect(brahma.description).toBe("BRAHMA LATA");
      expect(brahma.quantity).toBe(1);
      expect(brahma.unit).toBe("UN");
      expect(brahma.unitPrice).toBe(2.35);
      expect(brahma.effectiveValue).toBe(2.35);
    }

    const ling = result.items[7];
    expect(ling.quantity).toBeCloseTo(0.436, 10);
    expect(ling.unit).toBe("KG");
    expect(ling.unitPrice).toBe(23.9);
    expect(ling.effectiveValue).toBe(10.42);

    const fraldinha = result.items[8];
    expect(fraldinha.quantity).toBeCloseTo(1.406, 10);
    expect(fraldinha.unit).toBe("KG");
    expect(fraldinha.unitPrice).toBe(47.99);
    expect(fraldinha.effectiveValue).toBe(67.47);

    const carvao = result.items[9];
    expect(carvao.description).toContain("CARVAO");
    expect(carvao.quantity).toBe(1);
    expect(carvao.unit).toBe("UN");
    expect(carvao.unitPrice).toBe(19.9);
    expect(carvao.effectiveValue).toBe(19.9);
  });
});
