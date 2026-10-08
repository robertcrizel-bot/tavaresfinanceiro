import { describe, expect, it } from "vitest";
import { padaria785Regions } from "./__fixtures__/padaria-785.fixture";
import { detectItemBlocks } from "./itemBlockDetector";
import { extractItemBlock } from "./itemBlockExtractor";
import { paddleToParsedReceipt } from "./paddleToParsedReceipt";
import { buildPaddleReceiptResult } from "./receiptResult";
import { spatialGroup } from "./spatialGrouper";

const lineText = (line: ReturnType<typeof spatialGroup>["lines"][number]) =>
  line.regions.map((region) => region.text).join(" ");

describe("padaria 7,85 multiline item regression", () => {
  it("keeps every product token returned by PaddleOCR", () => {
    const texts = padaria785Regions.map((region) => region.text);

    expect(texts).toEqual(expect.arrayContaining([
      "001 3917 PAO FRANCES",
      "0,274KG X",
      "21,99",
      "T12",
      "6,03",
      "002 3904 PAO DE QUEIJO",
      "0,052KG X",
      "35,00",
      "T18",
      "1,82",
    ]));
  });

  it("groups the description and quantity/value lines without treating fiscal markers as prices", () => {
    const { lines } = spatialGroup(padaria785Regions);
    const texts = lines.map(lineText);

    expect(texts).toContain("001 3917 PAO FRANCES");
    expect(texts).toContain("0,274KG X 21,99 T12 6,03");
    expect(texts).toContain("002 3904 PAO DE QUEIJO");
    expect(texts).toContain("0,052KG X 35,00 T18 1,82");
  });

  it("delimits the product area across a fragmented item-count footer", () => {
    const { lines } = spatialGroup(padaria785Regions);
    const detection = detectItemBlocks(lines);

    expect(detection.areaStart).not.toBeNull();
    expect(detection.areaEnd).not.toBeNull();
    expect(detection.blocks).toHaveLength(2);
    expect(detection.blocks.map((block) => block.lineIndices.map((index) => lineText(lines[index])))).toEqual([
      ["001 3917 PAO FRANCES", "0,274KG X 21,99 T12 6,03"],
      ["002 3904 PAO DE QUEIJO", "0,052KG X 35,00 T18 1,82"],
    ]);
  });

  it("extracts both item blocks with quantity, unit price and total", () => {
    const { lines } = spatialGroup(padaria785Regions);
    const { blocks } = detectItemBlocks(lines);
    const extracted = blocks.map((block) => extractItemBlock(lines, block));

    expect(extracted.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.originalTotal,
    }))).toEqual([
      { description: "PAO FRANCES", quantity: 0.274, unitPrice: 21.99, total: 6.03 },
      { description: "PAO DE QUEIJO", quantity: 0.052, unitPrice: 35, total: 1.82 },
    ]);
  });

  it("produces the final merchant, amount and purchased_items", () => {
    const result = buildPaddleReceiptResult(padaria785Regions);
    const parsed = paddleToParsedReceipt(result);

    expect(result.merchant).toBe("PADARIA CONFEITARIA LUIZ ANTONIO RIBEIRO");
    expect(parsed.amount).toBe(7.85);
    expect(parsed.date).toBe("2026-10-07");
    expect(parsed.purchased_items).toEqual([
      { name: "PAO FRANCES", quantity: 0.274, unit_price: 21.99, total: 6.03 },
      { name: "PAO DE QUEIJO", quantity: 0.052, unit_price: 35, total: 1.82 },
    ]);
    expect(parsed.purchased_items).not.toEqual([]);
  });
});
