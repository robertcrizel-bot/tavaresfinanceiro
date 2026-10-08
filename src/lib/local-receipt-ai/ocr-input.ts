import { spatialGroup } from "@/lib/ocr-paddle-test/spatialGrouper";
import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import type { LocalReceiptInput } from "./schema";

/** Builds the local-AI input from OCR regions already produced by the free read. */
export function toLocalReceiptInput(
  regions: PaddleOcrRegion[],
  categories: string[],
  accounts: string[],
): LocalReceiptInput {
  const grouped = spatialGroup(regions);
  const groupedLines = grouped.lines.map((line, index) => {
    const lineRegions: PaddleOcrRegion[] = line.regions.map((region) => ({
      text: region.text,
      confidence: region.confidence,
      bbox: region.bbox,
    }));
    return {
      index,
      text: lineRegions.map((region) => region.text).join(" ").trim(),
      regions: lineRegions,
    };
  });
  const rawText = groupedLines
    .map((line) => line.text)
    .filter((text) => text.length > 0)
    .join("\n");

  return { regions, groupedLines, rawText, categories, accounts };
}
