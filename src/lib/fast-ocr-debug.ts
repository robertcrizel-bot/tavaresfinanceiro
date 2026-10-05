import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import { spatialGroup } from "@/lib/ocr-paddle-test/spatialGrouper";
import type { FastOcrBox, FastOcrLineItem } from "./fast-ocr-adapter";

export interface FastOcrRawRegionDebug {
  index: number;
  text: string;
  confidence: number;
  box: FastOcrBox;
}

export interface FastOcrGroupedLineDebug {
  index: number;
  text: string;
  parts: string[];
}

/** Temporary diagnostic: flattens the exact worker output before any parser step. */
export function summarizeFastOcrRawLines(lines: FastOcrLineItem[][]): FastOcrRawRegionDebug[] {
  const summary: FastOcrRawRegionDebug[] = [];
  for (const line of lines) {
    for (const item of line) {
      summary.push({
        index: summary.length + 1,
        text: item.text,
        confidence: item.confidence,
        box: item.box,
      });
    }
  }
  return summary;
}

/** Temporary diagnostic: grouped lines exactly as `buildPaddleReceiptResult` feeds the parser. */
export function summarizeFastOcrGroupedLines(regions: PaddleOcrRegion[]): FastOcrGroupedLineDebug[] {
  return spatialGroup(regions).lines.map((line, index) => ({
    index: index + 1,
    text: line.regions.map((region) => region.text).join(" "),
    parts: line.regions.map((region) => region.text),
  }));
}
