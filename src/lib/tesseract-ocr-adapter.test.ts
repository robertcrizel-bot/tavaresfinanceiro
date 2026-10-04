import { describe, expect, it } from "vitest";
import { adaptTesseractPageToRegions, type TesseractOcrPage } from "./tesseract-ocr-adapter";

function makeWord(text: string, confidence: number, bbox: { x0: number; y0: number; x1: number; y1: number }) {
  return { text, confidence, bbox };
}

describe("adaptTesseractPageToRegions", () => {
  it("converts tesseract words into 4-point regions preserving reading order", () => {
    const page: TesseractOcrPage = {
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    makeWord("CREME", 92, { x0: 10, y0: 20, x1: 60, y1: 40 }),
                    makeWord("2,75", 88, { x0: 300, y0: 21, x1: 340, y1: 41 }),
                  ],
                },
                {
                  words: [
                    makeWord("TOTAL", 95, { x0: 12, y0: 60, x1: 62, y1: 80 }),
                    makeWord("65,67", 97, { x0: 290, y0: 61, x1: 335, y1: 82 }),
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const regions = adaptTesseractPageToRegions(page);

    expect(regions.map((region) => region.text)).toEqual(["CREME", "2,75", "TOTAL", "65,67"]);
    expect(regions[0].bbox).toEqual([
      [10, 20],
      [60, 20],
      [60, 40],
      [10, 40],
    ]);
    expect(regions[1].bbox).toEqual([
      [300, 21],
      [340, 21],
      [340, 41],
      [300, 41],
    ]);
  });

  it("normalizes tesseract 0..100 confidence to the 0..1 scale the parser expects", () => {
    const page: TesseractOcrPage = {
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [makeWord("65,67", 87.6, { x0: 0, y0: 0, x1: 10, y1: 10 })],
                },
              ],
            },
          ],
        },
      ],
    };

    const [region] = adaptTesseractPageToRegions(page);
    expect(region.confidence).toBe(0.88);
  });

  it("drops empty words and tolerates null blocks", () => {
    const page: TesseractOcrPage = {
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    makeWord("   ", 90, { x0: 0, y0: 0, x1: 5, y1: 5 }),
                    makeWord("FONSECA", 93, { x0: 6, y0: 0, x1: 80, y1: 12 }),
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const regions = adaptTesseractPageToRegions(page);
    expect(regions).toHaveLength(1);
    expect(regions[0].text).toBe("FONSECA");
    expect(adaptTesseractPageToRegions({ blocks: null })).toEqual([]);
  });
});
