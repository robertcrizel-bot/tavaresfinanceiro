import { describe, expect, it } from "vitest";
import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import {
  MAX_SECOND_PASS_CROPS,
  mergePassRegions,
  pickCropScale,
  planSecondPass,
  type CropLineResult,
  type LineInput,
  type LineRegionInput,
} from "@/lib/hybrid-ocr-regions";

const IMAGE_WIDTH = 1280;
const IMAGE_HEIGHT = 1700;

function regionAt(
  text: string,
  confidence: number,
  x: number,
  y: number,
  width = 100,
  height = 30,
): LineRegionInput {
  return { text, confidence, minX: x, minY: y, maxX: x + width, maxY: y + height };
}

function makeLine(...regions: LineRegionInput[]): LineInput {
  return { regions };
}

function toPaddle(region: LineRegionInput): PaddleOcrRegion {
  return {
    text: region.text,
    confidence: region.confidence,
    bbox: [
      [region.minX, region.minY],
      [region.maxX, region.minY],
      [region.maxX, region.maxY],
      [region.minX, region.maxY],
    ],
  };
}

function priceLines(): LineInput[] {
  return [
    makeLine(regionAt("2,75", 0.97, 913, 340, 70)),
    makeLine(regionAt("8,70", 0.96, 915, 380, 70)),
    makeLine(regionAt("14,90", 0.95, 908, 420, 75)),
  ];
}

describe("planSecondPass", () => {
  it("flags a product line without a price and crops through the price column", () => {
    const productLine = makeLine(regionAt("CREME LEITE UHT ITALAC 1L", 0.9, 111, 460, 766));
    const plan = planSecondPass([...priceLines(), productLine], IMAGE_WIDTH, IMAGE_HEIGHT);

    expect(plan.suspiciousCount).toBe(1);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].reason).toBe("missing-price");

    const crop = plan.items[0].crop;
    expect(crop.x).toBeLessThan(111);
    expect(crop.y).toBeLessThanOrEqual(460);
    expect(crop.x + crop.width).toBeGreaterThanOrEqual(985);
    expect(crop.y + crop.height).toBeGreaterThanOrEqual(490);
    expect(crop.x + crop.width).toBeLessThanOrEqual(IMAGE_WIDTH);
    expect(crop.y + crop.height).toBeLessThanOrEqual(IMAGE_HEIGHT);
  });

  it("flags a quantity with unit but without any money value", () => {
    const qtyLine = makeLine(
      regionAt("2", 0.9, 111, 500, 20),
      regionAt("UN", 0.9, 140, 500, 40),
    );
    const plan = planSecondPass([...priceLines(), qtyLine], IMAGE_WIDTH, IMAGE_HEIGHT);

    expect(plan.suspiciousCount).toBe(1);
    expect(plan.items[0].reason).toBe("quantity-without-value");
  });

  it("flags a garbled number that never matches the money pattern", () => {
    const garbledLine = makeLine(regionAt("2,7S", 0.7, 880, 540, 60));
    const plan = planSecondPass([...priceLines(), garbledLine], IMAGE_WIDTH, IMAGE_HEIGHT);

    expect(plan.suspiciousCount).toBe(1);
    expect(plan.items[0].reason).toBe("garbled-number");
  });

  it("flags a low-confidence region inside the price band", () => {
    const dateLine = makeLine(regionAt("03/10/2026", 0.5, 300, 500, 120));
    const plan = planSecondPass([...priceLines(), dateLine], IMAGE_WIDTH, IMAGE_HEIGHT);

    expect(plan.suspiciousCount).toBe(1);
    expect(plan.items[0].reason).toBe("low-confidence");
  });

  it("never flags header lines", () => {
    const headerLine = makeLine(
      regionAt("PRODUTO", 0.9, 111, 500, 120),
      regionAt("QTD", 0.9, 300, 500, 60),
      regionAt("VL UNIT", 0.9, 400, 500, 100),
    );
    const plan = planSecondPass([...priceLines(), headerLine], IMAGE_WIDTH, IMAGE_HEIGHT);

    expect(plan.suspiciousCount).toBe(0);
    expect(plan.items).toHaveLength(0);
  });

  it("caps second-pass crops while reporting the full suspicious count", () => {
    const lowConfidenceLines = Array.from({ length: 8 }, (_, index) =>
      makeLine(regionAt("03/10/2026", 0.5, 300, 455 + index * 10, 120)),
    );
    const plan = planSecondPass(
      [...priceLines(), ...lowConfidenceLines],
      IMAGE_WIDTH,
      IMAGE_HEIGHT,
    );

    expect(plan.suspiciousCount).toBe(8);
    expect(plan.items).toHaveLength(MAX_SECOND_PASS_CROPS);
  });

  it("returns an empty plan without dimensions or lines", () => {
    expect(planSecondPass([], IMAGE_WIDTH, IMAGE_HEIGHT)).toEqual({ suspiciousCount: 0, items: [] });
    expect(planSecondPass(priceLines(), 0, 0)).toEqual({ suspiciousCount: 0, items: [] });
  });
});

describe("mergePassRegions", () => {
  const productRegion = regionAt("CREME LEITE 1L", 0.9, 111, 460, 766);

  function scenario() {
    const allLines = [...priceLines(), makeLine(productRegion)];
    const originals = [
      ...priceLines().map((line) => toPaddle(line.regions[0])),
      toPaddle(productRegion),
    ];
    const plan = planSecondPass(allLines, IMAGE_WIDTH, IMAGE_HEIGHT);
    return { allLines, originals, item: plan.items[0] };
  }

  it("adds the missing price from the crop without duplicating the product text", () => {
    const { allLines, originals, item } = scenario();
    const cropRegions = [
      toPaddle(productRegion),
      toPaddle(regionAt("2,75", 0.97, 913, 460, 70)),
    ];
    const processed: CropLineResult[] = [{ item, regions: cropRegions }];

    const merged = mergePassRegions(originals, allLines, processed);

    expect(merged).toHaveLength(originals.length + 1);
    expect(merged.filter((region) => region.text === "CREME LEITE 1L")).toHaveLength(1);
    const addedPrice = merged.find((region) => region.text === "2,75" && region.bbox[0][1] === 460);
    expect(addedPrice).toBeDefined();
  });

  it("replaces a deficient original only when the crop provides the same words", () => {
    const { allLines, item } = scenario();
    const weakRegion = toPaddle({ ...productRegion, confidence: 0.4 });
    const originals = [
      ...priceLines().map((line) => toPaddle(line.regions[0])),
      weakRegion,
    ];
    const strongRegion = toPaddle({ ...productRegion, confidence: 0.95 });
    const processed: CropLineResult[] = [{ item, regions: [strongRegion] }];

    const merged = mergePassRegions(originals, allLines, processed);

    const replacements = merged.filter((region) => region.text === "CREME LEITE 1L");
    expect(replacements).toHaveLength(1);
    expect(replacements[0].confidence).toBe(0.95);
  });

  it("keeps the originals when the crop recognized nothing", () => {
    const { allLines, originals, item } = scenario();

    const merged = mergePassRegions(originals, allLines, [{ item, regions: [] }]);

    expect(merged).toEqual(originals);
  });

  it("drops crop regions that fall into a neighboring line", () => {
    const { allLines, originals, item } = scenario();
    const neighborRegion = toPaddle(regionAt("8,70", 0.96, 915, 380, 70));
    const cropPrice = toPaddle(regionAt("2,75", 0.97, 913, 460, 70));
    const processed: CropLineResult[] = [{ item, regions: [neighborRegion, cropPrice] }];

    const merged = mergePassRegions(originals, allLines, processed);

    const prices = merged.filter((region) => region.text === "8,70");
    expect(prices).toHaveLength(1);
    expect(merged).toHaveLength(originals.length + 1);
  });

  it("returns the original list when nothing was processed", () => {
    const { originals } = scenario();
    expect(mergePassRegions(originals, [], [])).toEqual(originals);
  });
});

describe("pickCropScale", () => {
  it("upscales short strips more aggressively", () => {
    expect(pickCropScale(120)).toBe(2);
    expect(pickCropScale(121)).toBe(1.5);
  });
});
