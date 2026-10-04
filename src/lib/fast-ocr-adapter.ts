import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";

export interface FastOcrBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FastOcrLineItem {
  text: string;
  box: FastOcrBox;
  confidence: number;
}

/** Minimal adapter: ppu-paddle-ocr box -> the 4-point regions our parser already consumes. */
export function adaptPpuLinesToRegions(lines: FastOcrLineItem[][]): PaddleOcrRegion[] {
  const regions: PaddleOcrRegion[] = [];
  for (const line of lines) {
    for (const item of line) {
      const { x, y, width, height } = item.box;
      regions.push({
        text: item.text,
        confidence: Math.round(item.confidence * 100) / 100,
        bbox: [
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
        ],
      });
    }
  }
  return regions;
}
