import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";

export interface TesseractBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TesseractOcrWord {
  text: string;
  confidence: number;
  bbox: TesseractBBox;
}

export interface TesseractOcrLine {
  words: TesseractOcrWord[];
}

export interface TesseractOcrParagraph {
  lines: TesseractOcrLine[];
}

export interface TesseractOcrBlock {
  paragraphs: TesseractOcrParagraph[];
}

export interface TesseractOcrPage {
  blocks: TesseractOcrBlock[] | null;
}

export function adaptTesseractPageToRegions(page: TesseractOcrPage): PaddleOcrRegion[] {
  const regions: PaddleOcrRegion[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text.trim();
          if (!text) continue;
          const { x0, y0, x1, y1 } = word.bbox;
          regions.push({
            text,
            confidence: Math.round(word.confidence) / 100,
            bbox: [
              [x0, y0],
              [x1, y0],
              [x1, y1],
              [x0, y1],
            ],
          });
        }
      }
    }
  }
  return regions;
}
