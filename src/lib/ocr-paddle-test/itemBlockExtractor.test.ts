import { describe, expect, it } from "vitest";
import { detectItemBlocks } from "./itemBlockDetector";
import { extractItemBlock } from "./itemBlockExtractor";
import type { ExtractedItemBlock } from "./itemBlockExtractor";
import { spatialGroup } from "./spatialGrouper";
import type { PaddleOcrRegion } from "./types";
import { drogalRegions } from "./__fixtures__/drogal.fixture";
import { fonsecaRegions } from "./__fixtures__/fonseca.fixture";

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

function extractAll(regions: PaddleOcrRegion[]): ExtractedItemBlock[] {
  const { lines } = spatialGroup(regions);
  const { blocks } = detectItemBlocks(lines);
  return blocks.map((block) => extractItemBlock(lines, block));
}

function extractOnly(regions: PaddleOcrRegion[]): ExtractedItemBlock[] {
  return extractAll(regions);
}

describe("itemBlockExtractor synthetic", () => {
  it("A: removes leading product code but keeps descriptive numbers", () => {
    const extracted = extractOnly([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("12345 PRODUTO TESTE 500G", 10, 150, 220, 12),
      makeRegion("1 UN 9,99", 300, 150, 100, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(extracted).toHaveLength(1);
    expect(extracted[0].description).toBe("PRODUTO TESTE 500G");
  });

  it("B: preserves numbers inside the description", () => {
    const extracted = extractOnly([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO 2 EM 1", 10, 150, 200, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(extracted[0].description).toBe("PRODUTO 2 EM 1");
  });

  it("C: ignores De/Por/desconto lines and keeps only the description", () => {
    const extracted = extractOnly([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("64780 MAMADES 75MCG 28CPR", 10, 150, 220, 12),
      makeRegion("1X UN 47.46", 300, 150, 100, 12),
      makeRegion("De 47,46 Por 35,60 desconto de 24,99%", 10, 180, 250, 12),
      makeRegion("11,86", 300, 180, 60, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(extracted).toHaveLength(1);
    expect(extracted[0].lineIndices).toEqual([1, 2]);
    expect(extracted[0].description).toBe("MAMADES 75MCG 28CPR");
  });

  it("D: returns null when there is no reliable descriptive text", () => {
    const extracted = extractOnly([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("12345", 10, 150, 80, 12),
      makeRegion("9,99", 300, 150, 60, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(extracted).toHaveLength(0);
  });

  it("D2: description null when a block exists without alphabetic region", () => {
    const { lines } = spatialGroup([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("12 34", 10, 150, 80, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    const extracted = extractItemBlock(lines, {
      lineIndices: [1],
      startLine: 1,
      endLine: 1,
      classification: "fragment",
    });
    expect(extracted.description).toBeNull();
  });

  it("E: ambiguous block with clear alphabetic description still returns it", () => {
    const { lines } = spatialGroup([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO PARCIAL XYZ 12345", 10, 150, 220, 12),
      makeRegion("2252", 300, 150, 30, 120),
      makeRegion("Qtde. Total de Itens", 10, 300, 200, 12),
    ]);
    const { blocks } = detectItemBlocks(lines);
    expect(blocks[0].classification).toBe("ambiguous");

    const extracted = extractItemBlock(lines, blocks[0]);
    expect(extracted.classification).toBe("ambiguous");
    expect(extracted.description).toBe("PRODUTO PARCIAL XYZ 12345");
  });
});

function extractWithSideRegion(
  descriptionText: string,
  sideText: string,
): ExtractedItemBlock[] {
  return extractOnly([
    makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
    makeRegion(descriptionText, 10, 150, 220, 12),
    makeRegion(sideText, 300, 150, 120, 12),
    makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
  ]);
}

describe("itemBlockExtractor quantity/unit synthetic", () => {
  it("A: separate region '1 UN' yields quantity 1 and unit UN", () => {
    const extracted = extractWithSideRegion(
      "ARROZ TYPE LONG GRAIN",
      "1 UN",
    );

    expect(extracted).toHaveLength(1);
    expect(extracted[0].quantity).toBe(1);
    expect(extracted[0].unit).toBe("UN");
    expect(extracted[0].description).toBe("ARROZ TYPE LONG GRAIN");
  });

  it("B: '1X UN' yields quantity 1 and unit UN", () => {
    const extracted = extractWithSideRegion(
      "ARROZ TYPE LONG GRAIN",
      "1X UN 9,99",
    );

    expect(extracted[0].quantity).toBe(1);
    expect(extracted[0].unit).toBe("UN");
  });

  it("C: '1XUN' yields quantity 1 and unit UN", () => {
    const extracted = extractWithSideRegion(
      "CAFEINA+CARISOPRODO",
      "1XUN  31,34",
    );

    expect(extracted[0].quantity).toBe(1);
    expect(extracted[0].unit).toBe("UN");
  });

  it("D: '0.742KG' yields quantity 0.742 and unit KG", () => {
    const extracted = extractWithSideRegion("BETERRABA kg", "0.742KG");

    expect(extracted[0].quantity).toBeCloseTo(0.742, 10);
    expect(extracted[0].unit).toBe("KG");
  });

  it("E: description ending in 500G without structural evidence stays null", () => {
    const extracted = extractOnly([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE 500G", 10, 150, 220, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(extracted).toHaveLength(1);
    expect(extracted[0].description).toBe("PRODUTO TESTE 500G");
    expect(extracted[0].quantity).toBeNull();
    expect(extracted[0].unit).toBeNull();
  });

  it("F: 'MAMADES 75MCG 28CPR' yields no purchased quantity", () => {
    const extracted = extractOnly([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("64780 MAMADES 75MCG 28CPR", 10, 150, 220, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(extracted[0].description).toBe("MAMADES 75MCG 28CPR");
    expect(extracted[0].quantity).toBeNull();
    expect(extracted[0].unit).toBeNull();
  });

  it("G: corrupted 'IUN' does not invent quantity 1 or a corrected unit", () => {
    const extracted = extractWithSideRegion(
      "CREME LEITE OHT ITALAC 200G TP",
      "IUN",
    );

    expect(extracted[0].description).toBe("CREME LEITE OHT ITALAC 200G TP");
    expect(extracted[0].quantity).toBeNull();
    expect(extracted[0].unit).toBeNull();
  });

  it("H: monetary region '1,29' is never interpreted as quantity", () => {
    const extracted = extractWithSideRegion("REFRESCO EM PO TANG", "1,29");

    expect(extracted[0].quantity).toBeNull();
    expect(extracted[0].unit).toBeNull();
  });

  it("I: ambiguous block with explicit '1UN' still yields 1/UN", () => {
    const { lines } = spatialGroup([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO PARCIAL XYZ", 10, 150, 220, 12),
      makeRegion("1UN", 300, 150, 40, 12),
      makeRegion("2252", 360, 150, 30, 120),
      makeRegion("Qtde. Total de Itens", 10, 320, 200, 12),
    ]);
    const { blocks } = detectItemBlocks(lines);
    expect(blocks[0].classification).toBe("ambiguous");

    const extracted = extractItemBlock(lines, blocks[0]);
    expect(extracted.classification).toBe("ambiguous");
    expect(extracted.quantity).toBe(1);
    expect(extracted.unit).toBe("UN");
  });

  it("J: exposes only the expected ExtractedItemBlock fields", () => {
    const extracted = extractWithSideRegion(
      "ARROZ TYPE LONG GRAIN",
      "1UN 5,99",
    );

    expect(Object.keys(extracted[0]).sort()).toEqual([
      "classification",
      "description",
      "explicitFinalValue",
      "lineIndices",
      "originalTotal",
      "quantity",
      "signals",
      "unit",
      "unitPrice",
    ]);
    expect(extracted[0].quantity).toBe(1);
    expect(extracted[0].unit).toBe("UN");
  });
});

describe("itemBlockExtractor monetary synthetic", () => {
  function extractItem(
    regions: PaddleOcrRegion[],
  ): ExtractedItemBlock {
    const extracted = extractOnly(regions);
    expect(extracted).toHaveLength(1);
    return extracted[0];
  }

  function moneyTriple(block: ExtractedItemBlock): [
    number | null,
    number | null,
    number | null,
  ] {
    return [
      block.unitPrice,
      block.originalTotal,
      block.explicitFinalValue,
    ];
  }

  it("A: Por sets explicitFinalValue exactly as printed, never derived", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1X UN 10,00 10,00", 300, 150, 180, 12),
      makeRegion(
        "De 10,00 Por 8,00 desconto de 20,00%",
        10,
        180,
        280,
        12,
      ),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([10, 10, 8]);
  });

  it("B: 'desconto de X' never becomes originalTotal", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN 9,99", 300, 150, 100, 12),
      makeRegion("Por 7,99 desconto de 2,00", 10, 180, 250, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(block.originalTotal).toBeNull();
    expect(block.explicitFinalValue).toBe(7.99);
    expect(block.unitPrice).toBe(9.99);
  });

  it("C: suffix unitPrice takes the first money token after qty/unit", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1X UN 10,00 99,99", 300, 150, 180, 12),
      makeRegion("99,99", 700, 150, 60, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(block.unitPrice).toBe(10);
  });

  it("D: glued suffix '1UN5.99' yields unitPrice 5.99", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN5.99", 300, 150, 100, 12),
      makeRegion("5,99", 700, 150, 60, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([5.99, 5.99, null]);
  });

  it("E: two money candidates split into unitPrice (left) and total (right)", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN", 300, 150, 40, 12),
      makeRegion("5,00", 450, 150, 50, 12),
      makeRegion("7,50", 700, 150, 50, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([5, 7.5, null]);
  });

  it("F: single pure money right of suffix anchor becomes total only", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1X UN 9,99", 300, 150, 140, 12),
      makeRegion("12,50", 700, 150, 60, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([9.99, 12.5, null]);
  });

  it("G: single pure money without suffix anchor becomes total, unitPrice null", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UM 24,99", 300, 150, 140, 12),
      makeRegion("24,99", 700, 150, 60, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([null, 24.99, null]);
  });

  it("H: rejects non-money tokens like '99' and '2252'", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("99", 300, 150, 40, 12),
      makeRegion("2252", 400, 150, 60, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([null, null, null]);
  });

  it("I: fragment pieces too far apart (like 6 and 79) never reconstruct", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("0.464KG", 300, 150, 100, 12),
      makeRegion("6", 500, 150, 30, 12),
      makeRegion("79", 600, 150, 40, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([null, null, null]);
    expect(block.quantity).toBeCloseTo(0.464, 10);
    expect(block.unit).toBe("KG");
  });

  it("J: monetary keys are present even when every value is null", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN", 300, 150, 40, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(Object.keys(block).sort()).toEqual([
      "classification",
      "description",
      "explicitFinalValue",
      "lineIndices",
      "originalTotal",
      "quantity",
      "signals",
      "unit",
      "unitPrice",
    ]);
    expect(moneyTriple(block)).toEqual([null, null, null]);
  });

  it("K: DESCONTO complement line sets explicitFinalValue from rightmost money", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN5.99", 300, 150, 100, 12),
      makeRegion("5,99", 700, 150, 60, 12),
      makeRegion("DESCONTO", 10, 180, 80, 12),
      makeRegion("-16.698", 100, 180, 70, 12),
      makeRegion("R$-1,00", 180, 180, 70, 12),
      makeRegion("4.99", 400, 180, 50, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([5.99, 5.99, 4.99]);
  });

  it("L: DESCONTO joins aligned decimal fragments into explicitFinalValue", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN", 300, 150, 40, 12),
      makeRegion("5.99", 450, 150, 50, 12),
      makeRegion("5,99", 700, 150, 50, 12),
      makeRegion("DESCONTO", 10, 180, 80, 12),
      makeRegion("-16.698", 100, 180, 70, 12),
      makeRegion("R$ -1,00", 180, 180, 70, 12),
      makeRegion("4,", 400, 180, 30, 12),
      makeRegion("99", 430, 180, 30, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(block.explicitFinalValue).toBe(4.99);
  });

  it("M: DESCONTO fragments too far apart stay null", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN", 300, 150, 40, 12),
      makeRegion("5.99", 450, 150, 50, 12),
      makeRegion("5,99", 700, 150, 50, 12),
      makeRegion("DESCONTO", 10, 180, 80, 12),
      makeRegion("4,", 400, 180, 30, 12),
      makeRegion("99", 600, 180, 30, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(block.explicitFinalValue).toBeNull();
  });

  it("N: DESCONTO fragments with region between them stay null", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN", 300, 150, 40, 12),
      makeRegion("5.99", 450, 150, 50, 12),
      makeRegion("5,99", 700, 150, 50, 12),
      makeRegion("DESCONTO", 10, 180, 80, 12),
      makeRegion("4,", 400, 180, 30, 12),
      makeRegion("X", 435, 180, 20, 12),
      makeRegion("99", 470, 180, 30, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(block.explicitFinalValue).toBeNull();
  });

  it("O: non-DESCONTO complement money never becomes explicitFinalValue", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN", 300, 150, 40, 12),
      makeRegion("5.99", 450, 150, 50, 12),
      makeRegion("5,99", 700, 150, 50, 12),
      makeRegion("ACRESCIMO", 10, 180, 80, 12),
      makeRegion("4.99", 400, 180, 50, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(block.explicitFinalValue).toBeNull();
  });

  it("P: DESCONTO does not override an explicit Por marker", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1X UN 10,00 10,00", 300, 150, 180, 12),
      makeRegion(
        "De 10,00 Por 8,00 desconto de 20,00%",
        10,
        180,
        280,
        12,
      ),
      makeRegion("DESCONTO", 10, 210, 80, 12),
      makeRegion("4.99", 400, 210, 50, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(block.explicitFinalValue).toBe(8);
  });

  it("Q: adjacent integer fragments join into a unit price in the unit column", () => {
    const extracted = extractAll([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("0.464KG", 260, 150, 90, 12),
      makeRegion("6", 460, 150, 22, 12),
      makeRegion("79", 487, 150, 40, 12),
      makeRegion("PRODUTO DOIS", 10, 200, 200, 12),
      makeRegion("1UN", 300, 200, 40, 12),
      makeRegion("5,00", 450, 200, 50, 12),
      makeRegion("9,99", 700, 200, 50, 12),
      makeRegion("PRODUTO TRES", 10, 250, 200, 12),
      makeRegion("1UN", 300, 250, 40, 12),
      makeRegion("2,00", 450, 250, 50, 12),
      makeRegion("4,99", 700, 250, 50, 12),
      makeRegion("Qtde. Total de Itens", 10, 300, 200, 12),
    ]);

    expect(extracted).toHaveLength(3);
    expect([extracted[0].unitPrice, extracted[0].originalTotal]).toEqual([
      6.79, null,
    ]);
    expect([extracted[1].unitPrice, extracted[1].originalTotal]).toEqual([
      5, 9.99,
    ]);
    expect([extracted[2].unitPrice, extracted[2].originalTotal]).toEqual([
      2, 4.99,
    ]);
  });

  it("R: adjacent integer fragments join into a total in a one-column receipt", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1.127KG", 260, 150, 90, 12),
      makeRegion("3", 700, 150, 18, 12),
      makeRegion("37", 723, 150, 40, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([null, 3.37, null]);
  });

  it("S: integer fragments never join when the cents piece has 3 digits", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("0.464KG", 260, 150, 90, 12),
      makeRegion("6", 460, 150, 22, 12),
      makeRegion("999", 487, 150, 60, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([null, null, null]);
    expect(block.quantity).toBeCloseTo(0.464, 10);
  });

  it("T: integer fragments never join when the left piece has 4 digits", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("0.464KG", 260, 150, 90, 12),
      makeRegion("2252", 460, 150, 60, 12),
      makeRegion("99", 527, 150, 40, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([null, null, null]);
  });

  it("U: a parseable money beside an integer fragment stays a single value", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN", 300, 150, 40, 12),
      makeRegion("24,99", 450, 150, 50, 12),
      makeRegion("99", 505, 150, 40, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([null, 24.99, null]);
  });

  it("V: a lone money in the unit column becomes unitPrice, not total", () => {
    const extracted = extractAll([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("1UN", 300, 150, 40, 12),
      makeRegion("5,00", 450, 150, 50, 12),
      makeRegion("PRODUTO DOIS", 10, 200, 200, 12),
      makeRegion("1UN", 300, 200, 40, 12),
      makeRegion("7,00", 450, 200, 50, 12),
      makeRegion("9,99", 700, 200, 50, 12),
      makeRegion("PRODUTO TRES", 10, 250, 200, 12),
      makeRegion("1UN", 300, 250, 40, 12),
      makeRegion("2,00", 450, 250, 50, 12),
      makeRegion("4,99", 700, 250, 50, 12),
      makeRegion("Qtde. Total de Itens", 10, 300, 200, 12),
    ]);

    expect(extracted).toHaveLength(3);
    expect([extracted[0].unitPrice, extracted[0].originalTotal]).toEqual([
      5, null,
    ]);
  });

  it("W: integer fragments with mismatched heights never join", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("0.464KG", 260, 150, 90, 12),
      makeRegion("6", 460, 150, 22, 12),
      makeRegion("79", 487, 150, 40, 36),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([null, null, null]);
  });

  it("X: an extra region between the fragments prevents the join", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("0.464KG", 260, 150, 90, 12),
      makeRegion("6", 460, 150, 22, 12),
      makeRegion("T14", 487, 150, 40, 12),
      makeRegion("79", 532, 150, 40, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([null, null, null]);
  });

  it("Y: integer fragments with a gap above 15px never join", () => {
    const block = extractItem([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 300, 12),
      makeRegion("PRODUTO TESTE", 10, 150, 200, 12),
      makeRegion("0.464KG", 260, 150, 90, 12),
      makeRegion("6", 460, 150, 22, 12),
      makeRegion("79", 498, 150, 40, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(moneyTriple(block)).toEqual([null, null, null]);
  });
});

describe("itemBlockExtractor monetary fixtures", () => {
  it("extracts the four Drogal monetary triples", () => {
    const extracted = extractAll(drogalRegions);

    expect(extracted.map((e) => [e.unitPrice, e.originalTotal, e.explicitFinalValue])).toEqual([
      [152.43, 152.43, 114.32],
      [47.46, 47.46, 35.6],
      [31.34, 31.34, 18.8],
      [27.24, 27.24, 16.34],
    ]);
  });

  it("keeps Fonseca explicitFinalValue null except on DESCONTO milk blocks", () => {
    const extracted = extractAll(fonsecaRegions);

    expect(extracted).toHaveLength(21);
    const withFinal = extracted.filter((e) => e.explicitFinalValue !== null);
    expect(withFinal).toHaveLength(2);
    expect(withFinal.every((e) => e.explicitFinalValue === 4.99)).toBe(true);
    expect(
      extracted.filter((e) => e.explicitFinalValue === null),
    ).toHaveLength(19);
  });

  it("counts Fonseca unitPrice and originalTotal fields", () => {
    const extracted = extractAll(fonsecaRegions);

    expect(extracted.filter((e) => e.unitPrice !== null)).toHaveLength(14);
    expect(extracted.filter((e) => e.originalTotal !== null)).toHaveLength(14);
  });

  it("extracts Fonseca banana triple from suffix and geometry", () => {
    const banana = extractAll(fonsecaRegions)[0];

    expect([
      banana.unitPrice,
      banana.originalTotal,
      banana.explicitFinalValue,
    ]).toEqual([6.98, 8.7, null]);
  });

  it("extracts both PIRACANJUBA triples", () => {
    const extracted = extractAll(fonsecaRegions);

    expect([
      extracted[10].unitPrice,
      extracted[10].originalTotal,
      extracted[10].explicitFinalValue,
    ]).toEqual([5.99, 5.99, 4.99]);
    expect([
      extracted[11].unitPrice,
      extracted[11].originalTotal,
      extracted[11].explicitFinalValue,
    ]).toEqual([5.99, 5.99, 4.99]);
  });

  it("keeps every Fonseca ambiguous block monetary fields null", () => {
    const ambiguous = extractAll(fonsecaRegions).filter(
      (e) => e.classification === "ambiguous",
    );

    expect(ambiguous).toHaveLength(4);
    expect(
      ambiguous.every(
        (e) =>
          e.unitPrice === null &&
          e.originalTotal === null &&
          e.explicitFinalValue === null,
      ),
    ).toBe(true);
  });

  it("recovers Fonseca weight money only when fragments are adjacent", () => {
    const weights = extractAll(fonsecaRegions).slice(16, 20);

    expect(weights).toHaveLength(4);
    expect([weights[0].unitPrice, weights[0].originalTotal]).toEqual([
      null, null,
    ]);
    expect([weights[1].unitPrice, weights[1].originalTotal]).toEqual([
      6.79, null,
    ]);
    expect([weights[2].unitPrice, weights[2].originalTotal]).toEqual([
      5.99, null,
    ]);
    expect([weights[3].unitPrice, weights[3].originalTotal]).toEqual([
      null, 3.37,
    ]);
  });
});

describe("itemBlockExtractor real fixtures", () => {
  it("extracts descriptions from the four Drogal blocks", () => {
    const extracted = extractAll(drogalRegions);

    expect(extracted.map((e) => e.lineIndices)).toEqual([
      [8, 9],
      [10, 11],
      [12, 13],
      [14, 15],
    ]);
    expect(extracted.map((e) => e.classification)).toEqual([
      "strong",
      "strong",
      "strong",
      "strong",
    ]);
    expect(extracted.map((e) => e.description)).toEqual([
      "POSTEC POMADA 20G",
      "MAMADES 75MCG 28CPR",
      "CAFEINA+CARISOPRODO",
      "ME OXICAM 1SMG 10CPR",
    ]);
    expect(extracted.map((e) => e.quantity)).toEqual([1, 1, 1, 1]);
    expect(extracted.map((e) => e.unit)).toEqual(["UN", "UN", "UN", "UN"]);
  });

  it("keeps Fonseca lineIndices and classifications unchanged", () => {
    const extracted = extractAll(fonsecaRegions);

    expect(extracted.map((e) => e.lineIndices)).toEqual([
      [7],
      [8, 9],
      [10, 11],
      [12, 13],
      [14],
      [15],
      [16],
      [17],
      [18],
      [19],
      [20, 21, 22],
      [23, 24, 25],
      [26],
      [27],
      [28],
      [29],
      [30],
      [31],
      [32],
      [33],
      [34],
    ]);
    expect(extracted.map((e) => e.classification)).toEqual([
      "strong",
      "strong",
      "strong",
      "strong",
      "strong",
      "strong",
      "strong",
      "strong",
      "strong",
      "strong",
      "strong",
      "strong",
      "ambiguous",
      "ambiguous",
      "ambiguous",
      "ambiguous",
      "strong",
      "strong",
      "strong",
      "strong",
      "strong",
    ]);
  });

  it("returns descriptions for Fonseca ambiguous blocks without OCR correction", () => {
    const extracted = extractAll(fonsecaRegions);
    const ambiguous = extracted.filter((e) => e.classification === "ambiguous");

    expect(ambiguous.map((e) => e.lineIndices)).toEqual([[26], [27], [28], [29]]);
    expect(ambiguous.map((e) => e.description)).toEqual([
      "CREME LEITE OHT ITALAC 200G TP",
      "CREME LEITE UHI IIALAC 200G TP",
      "CREME LEITE UHT ITALAC 200G TP",
      "PA0 FORMA UISCONTI 400G",
    ]);
  });

  it("keeps every Fonseca description unchanged while adding quantity/unit", () => {
    const extracted = extractAll(fonsecaRegions);

    expect(extracted.map((e) => e.description)).toEqual([
      "BANANA NANICA Kg",
      "SORUETE NESILE Y.5L NAPOLITANO FLOCOS TRAD",
      "REFRESCO EM PO TANG 18GR MORANG0",
      "REFRESCO EM PO TANG 18GR MARACUJA",
      "REFRESCO EM PO MID 20GR CAJU",
      "REFRESCO EK PO MID 20GR CAJU",
      "REFRESCO EM PO H1D 20GR ABACAXI",
      "REFRESCO EN PO NID 20GR ABACAXI 1UN",
      "REFRESCO EN PO MID 203R MANGA",
      "UUA BRANCA AUTUNCRISP 500GR",
      "LEITE COND PIRACANJUBA 395G TP SEMI DESN",
      "IEIIE CUND PIRACANJUBA 395G TP SENI DESH",
      "CREME LEITE OHT ITALAC 200G TP",
      "CREME LEITE UHI IIALAC 200G TP",
      "CREME LEITE UHT ITALAC 200G TP",
      "PA0 FORMA UISCONTI 400G",
      "BETERRABA kg",
      "CEBOLA Kg",
      "MANGA TOMY kg",
      "REPOLHO VERDE kg",
      "BALA DR0PS H6LLS 28GR 8UFPFRRY",
    ]);
    expect(extracted.map((e) => e.quantity)).toEqual([
      1.246,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      null,
      1,
      null,
      1,
      0.742,
      0.464,
      0.402,
      1.127,
      1,
    ]);
    expect(extracted.map((e) => e.unit)).toEqual([
      "KG",
      null,
      "UN",
      "UN",
      "UN",
      "UN",
      "UN",
      "UN",
      "UN",
      "UN",
      "UN",
      "UN",
      null,
      "UN",
      null,
      "UN",
      "KG",
      "KG",
      "KG",
      "KG",
      "UN",
    ]);
  });

  it("counts Fonseca blocks with quantity, unit and both", () => {
    const extracted = extractAll(fonsecaRegions);

    const withQuantity = extracted.filter((e) => e.quantity !== null);
    const withUnit = extracted.filter((e) => e.unit !== null);
    const withBoth = extracted.filter(
      (e) => e.quantity !== null && e.unit !== null,
    );

    expect(withQuantity).toHaveLength(19);
    expect(withUnit).toHaveLength(18);
    expect(withBoth).toHaveLength(18);
  });

  it("extracts quantity/unit on Fonseca ambiguous blocks only when explicit", () => {
    const extracted = extractAll(fonsecaRegions);
    const ambiguous = extracted.filter((e) => e.classification === "ambiguous");

    expect(ambiguous.map((e) => ({ q: e.quantity, u: e.unit }))).toEqual([
      { q: null, u: null },
      { q: 1, u: "UN" },
      { q: null, u: null },
      { q: 1, u: "UN" },
    ]);
  });
});
