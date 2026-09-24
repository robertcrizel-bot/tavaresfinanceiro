import { describe, expect, it } from "vitest";
import { detectItemBlocks } from "./itemBlockDetector";
import { spatialGroup } from "./spatialGrouper";
import type { GridLine } from "./spatialGrouper";
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

function blockIndicesOf(regions: PaddleOcrRegion[]) {
  const result = spatialGroup(regions);
  return {
    result,
    detection: detectItemBlocks(result.lines),
  };
}

function lineText(lines: GridLine[], index: number): string {
  return lines[index].regions.map((region) => region.text).join(" | ");
}

describe("itemBlockDetector synthetic", () => {
  it("A: groups a description with its complementary numeric line", () => {
    const { detection } = blockIndicesOf([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("ARROZ TYPE LONG GRAIN", 10, 150, 200, 12),
      makeRegion("De 1,00 Por 0,90 desconto 10%", 10, 180, 250, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(detection.areaStart).toBe(1);
    expect(detection.areaEnd).toBe(2);
    expect(detection.blocks.map((b) => b.lineIndices)).toEqual([[1, 2]]);
  });

  it("B: keeps a description with its own numbers as a single-line block", () => {
    const { detection } = blockIndicesOf([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("ARROZ TYPE 1 UN 5,99", 10, 150, 200, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(detection.blocks.map((b) => b.lineIndices)).toEqual([[1]]);
  });

  it("C: groups description, values and a DESCONTO line into three lines", () => {
    const { detection } = blockIndicesOf([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO ESPECIAL QUALQUER", 10, 150, 220, 12),
      makeRegion("1 UN 10,00 10,00", 10, 180, 200, 12),
      makeRegion("DESCONTO -1,00", 10, 210, 200, 12),
      makeRegion("Qtde. Total de Itens", 10, 280, 200, 12),
    ]);

    expect(detection.blocks.map((b) => b.lineIndices)).toEqual([[1, 2, 3]]);
  });

  it("D: separates two consecutive valid descriptions", () => {
    const { detection } = blockIndicesOf([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO ALPHA XYZ", 10, 150, 200, 12),
      makeRegion("PRODUTO BETA XYZ", 10, 200, 200, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(detection.blocks.map((b) => b.lineIndices)).toEqual([[1], [2]]);
  });

  it("E: the summary line closes the area and never becomes an item", () => {
    const { detection } = blockIndicesOf([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("ARROZ TYPE", 10, 150, 200, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    const allIndices = detection.blocks.flatMap((b) => b.lineIndices);
    expect(allIndices).not.toContain(2);
    expect(detection.blocks.map((b) => b.lineIndices)).toEqual([[1]]);
  });

  it("F: a leading De/Por/desconto line does not start a block", () => {
    const { detection } = blockIndicesOf([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("Por 10,00 desconto 5%", 10, 150, 220, 12),
      makeRegion("PRODUTO GAMMA ABC", 10, 200, 200, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    const allIndices = detection.blocks.flatMap((b) => b.lineIndices);
    expect(allIndices).not.toContain(1);
    expect(detection.blocks.map((b) => b.lineIndices)).toEqual([[2]]);
  });

  it("G: classifies a complete single-line item as strong", () => {
    const { detection } = blockIndicesOf([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("ARROZ TYPE 1 UN 5,99", 10, 150, 200, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(detection.blocks[0].classification).toBe("strong");
    expect(detection.blocks[0].signals).toContain("description");
    expect(detection.blocks[0].signals).toContain("money");
  });

  it("H: classifies description with only partial digits as ambiguous", () => {
    const { detection } = blockIndicesOf([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO PARCIAL XYZ 12345", 10, 150, 200, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(detection.blocks[0].classification).toBe("ambiguous");
    expect(detection.blocks[0].signals).toContain("digits");
    expect(detection.blocks[0].signals).not.toContain("money");
  });

  it("I: classifies a description with no complementary evidence as fragment", () => {
    const { detection } = blockIndicesOf([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO SOBRA XYZ", 10, 150, 200, 12),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    expect(detection.blocks[0].classification).toBe("fragment");
    expect(detection.blocks[0].signals).toContain("description");
    expect(detection.blocks[0].signals).not.toContain("digits");
  });

  it("J: anomalous height forces ambiguous even when money is present", () => {
    const { detection } = blockIndicesOf([
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 12),
      makeRegion("PRODUTO ANOMALO XYZ", 10, 150, 200, 12),
      makeRegion("9,99", 10, 180, 50, 12),
      makeRegion("2252", 80, 180, 30, 120),
      makeRegion("Qtde. Total de Itens", 10, 250, 200, 12),
    ]);

    const blockWithAnomaly = detection.blocks.find((b) =>
      b.lineIndices.includes(2),
    );
    expect(blockWithAnomaly?.classification).toBe("ambiguous");
    expect(blockWithAnomaly?.signals).toContain("anomalous-height");
  });

  it("K: anomalous-height detection is scale invariant (1x vs 2x)", () => {
    const baseDoc = [
      makeRegion("PRODUTO QTD VALOR", 10, 100, 200, 20),
      makeRegion("PRODUTO ESCALA XYZ", 10, 150, 200, 20),
      makeRegion("9,99", 10, 180, 50, 20),
      makeRegion("2252", 80, 180, 30, 100),
      makeRegion("Qtde. Total de Itens", 10, 300, 200, 20),
    ];
    const scaledDoc = baseDoc.map((region) => ({
      ...region,
      bbox: region.bbox.map(([x, y]) => [x * 2, y * 2] as [number, number]),
    }));

    const base = blockIndicesOf(baseDoc).detection;
    const scaled = blockIndicesOf(scaledDoc).detection;

    expect(base.blocks.map((b) => b.lineIndices)).toEqual(
      scaled.blocks.map((b) => b.lineIndices),
    );
    expect(base.blocks.map((b) => b.classification)).toEqual(
      scaled.blocks.map((b) => b.classification),
    );

    const baseBlock = base.blocks.find((b) => b.lineIndices.includes(2));
    const scaledBlock = scaled.blocks.find((b) => b.lineIndices.includes(2));
    expect(baseBlock?.classification).toBe("ambiguous");
    expect(scaledBlock?.classification).toBe("ambiguous");
    expect(baseBlock?.signals).toContain("anomalous-height");
    expect(scaledBlock?.signals).toContain("anomalous-height");
  });
});

describe("itemBlockDetector real fixtures", () => {
  it("groups the four Drogal items into two-line blocks", () => {
    const { result, detection } = blockIndicesOf(drogalRegions);

    expect(detection.areaStart).toBe(8);
    expect(detection.areaEnd).toBe(15);
    expect(detection.blocks.map((b) => b.lineIndices)).toEqual([
      [8, 9],
      [10, 11],
      [12, 13],
      [14, 15],
    ]);
    expect(detection.blocks.map((b) => b.classification)).toEqual([
      "strong",
      "strong",
      "strong",
      "strong",
    ]);
    expect(result.lines).toHaveLength(33);
  });

  it("characterizes Fonseca blocks and keeps administrative lines out", () => {
    const { result, detection } = blockIndicesOf(fonsecaRegions);

    expect(detection.areaStart).toBe(7);
    expect(detection.areaEnd).toBe(34);
    expect(detection.blocks.map((b) => b.lineIndices)).toEqual([
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

    expect(detection.blocks.map((b) => b.classification)).toEqual([
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

    const textsInBlocks = detection.blocks
      .flatMap((b) => b.lineIndices)
      .map((idx) => lineText(result.lines, idx))
      .join("\n");

    expect(textsInBlocks).not.toContain("Qtde. Total de Itens");
    expect(textsInBlocks).not.toContain("Valor a Pagar");
    expect(textsInBlocks).not.toContain("CARTEIRA DIGITAL");
    expect(textsInBlocks).not.toContain("Fonseca Supermercados");
    expect(textsInBlocks).not.toContain("FONSECA SUPERMERCADOS");
    expect(textsInBlocks).not.toContain("ESTAB 057032427000199");
    expect(textsInBlocks).not.toContain("CNPJ");
    expect(textsInBlocks).not.toContain("16/09/26");
  });

  it("marks Fonseca outlier blocks as ambiguous via anomalous-height signal", () => {
    const { detection } = blockIndicesOf(fonsecaRegions);
    const outlierBlocks = detection.blocks.filter(
      (b) => b.lineIndices[0] === 28 || b.lineIndices[0] === 29,
    );
    expect(outlierBlocks).toHaveLength(2);
    for (const block of outlierBlocks) {
      expect(block.classification).toBe("ambiguous");
      expect(block.signals).toContain("anomalous-height");
    }
  });

  it("marks Fonseca blocks with partial numeric evidence as ambiguous", () => {
    const { detection } = blockIndicesOf(fonsecaRegions);
    const partialBlocks = detection.blocks.filter(
      (b) => b.lineIndices[0] === 26 || b.lineIndices[0] === 27,
    );
    expect(partialBlocks).toHaveLength(2);
    for (const block of partialBlocks) {
      expect(block.classification).toBe("ambiguous");
      expect(block.signals).toContain("description");
      expect(block.signals).not.toContain("money");
      expect(block.signals).not.toContain("anomalous-height");
    }
  });
});
