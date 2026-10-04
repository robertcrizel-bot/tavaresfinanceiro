import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import { isHeaderLine } from "@/lib/ocr-paddle-test/spatialGrouper";

export const MAX_SECOND_PASS_CROPS = 6;
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

const MONEY_RE = /(?:\d{1,3}(?:\.\d{3})+,\d{2}|\d+[.,]\d{2})/;
const PRODUCT_LIKE_RE = /[A-Za-zÀ-ÿ]{4,}/;
const QTY_RE = /^\d+(?:[.,]\d+)?$/;
const UNIT_RE = /^(?:kg|g|l|ml|un|und?|cx|pct|mt|sc|dz)$/i;
const QTY_UNIT_RE = /^\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|un|und?|cx|pct|mt|sc|dz)$/i;
const GARBLED_NUMBER_RE = /[.,]\d+[A-Za-zÀ-ÿ]|\d[A-Za-zÀ-ÿ][.,]|[A-Za-zÀ-ÿ][.,]\d/;

const PRICE_COLUMN_MIN_REGIONS = 3;
const CROP_LEFT_MARGIN_RATIO = 0.04;
const CROP_RIGHT_MARGIN_RATIO = 0.05;
const MAX_LINE_HEIGHT_RATIO = 0.12;
const UPSCALE_MAX_CROP_HEIGHT = 120;

export type SuspiciousReason =
  | "missing-price"
  | "quantity-without-value"
  | "garbled-number"
  | "low-confidence";

export interface LineRegionInput {
  text: string;
  confidence: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LineInput {
  regions: LineRegionInput[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SecondPassItem {
  lineIndex: number;
  reason: SuspiciousReason;
  lineBox: Rect;
  band: Rect;
  crop: Rect;
}

export interface SecondPassPlan {
  suspiciousCount: number;
  items: SecondPassItem[];
}

export interface CropLineResult {
  item: SecondPassItem;
  regions: PaddleOcrRegion[];
}

const REASON_PRIORITY: Record<SuspiciousReason, number> = {
  "missing-price": 0,
  "quantity-without-value": 1,
  "garbled-number": 2,
  "low-confidence": 3,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function computeLineBox(line: LineInput): Rect | null {
  if (line.regions.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const region of line.regions) {
    minX = Math.min(minX, region.minX);
    minY = Math.min(minY, region.minY);
    maxX = Math.max(maxX, region.maxX);
    maxY = Math.max(maxY, region.maxY);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function bboxOf(region: PaddleOcrRegion): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of region.bbox) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function centerOf(box: Rect): { cx: number; cy: number } {
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

function isInside(box: Rect, cx: number, cy: number): boolean {
  return cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height;
}

function isDeficientOriginal(region: PaddleOcrRegion): boolean {
  if (region.confidence < LOW_CONFIDENCE_THRESHOLD) return true;
  const text = region.text.trim();
  return !MONEY_RE.test(text) && GARBLED_NUMBER_RE.test(text);
}

function overlapsMuch(a: Rect, b: Rect): boolean {
  const intersectionWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const intersectionHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = intersectionWidth * intersectionHeight;
  if (intersection <= 0) return false;
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const smaller = Math.max(1, Math.min(areaA, areaB));
  return intersection / smaller > 0.4;
}

export function pickCropScale(cropHeight: number): number {
  return cropHeight <= UPSCALE_MAX_CROP_HEIGHT ? 2 : 1.5;
}

export function planSecondPass(
  lines: LineInput[],
  imageWidth: number,
  imageHeight: number,
): SecondPassPlan {
  if (!imageWidth || !imageHeight || lines.length === 0) {
    return { suspiciousCount: 0, items: [] };
  }

  const lineBoxes: Rect[] = [];
  const moneyRegions: Rect[] = [];
  for (const line of lines) {
    const box = computeLineBox(line);
    lineBoxes.push(box ?? { x: 0, y: 0, width: 0, height: 0 });
    if (!box) continue;
    for (const region of line.regions) {
      if (MONEY_RE.test(region.text.trim())) {
        moneyRegions.push({
          x: region.minX,
          y: region.minY,
          width: region.maxX - region.minX,
          height: region.maxY - region.minY,
        });
      }
    }
  }

  const priceColumn = moneyRegions.length >= PRICE_COLUMN_MIN_REGIONS
    ? {
        minX: Math.min(...moneyRegions.map((r) => r.x)),
        maxX: Math.max(...moneyRegions.map((r) => r.x + r.width)),
      }
    : null;
  const bandTop = moneyRegions.length > 0
    ? Math.min(...moneyRegions.map((r) => r.y)) - 2 * median(lineBoxes.map((b) => b.height))
    : null;
  const bandBottom = moneyRegions.length > 0
    ? Math.max(...moneyRegions.map((r) => r.y + r.height)) + 4 * median(lineBoxes.map((b) => b.height))
    : null;
  const maxLineHeight = imageHeight * MAX_LINE_HEIGHT_RATIO;

  const flagged: Array<{ lineIndex: number; reason: SuspiciousReason; box: Rect }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const box = lineBoxes[i];
    if (line.regions.length === 0 || box.width === 0) continue;
    if (box.height > maxLineHeight) continue;
    const texts = line.regions.map((region) => region.text.trim());
    if (isHeaderLine(texts)) continue;

    const hasMoney = texts.some((text) => MONEY_RE.test(text));
    const productLike = texts.some((text) => text.length >= 5 && PRODUCT_LIKE_RE.test(text));
    const qtyUnit =
      line.regions.some((region) => QTY_UNIT_RE.test(region.text.trim())) ||
      (line.regions.some((region) => QTY_RE.test(region.text.trim())) &&
        line.regions.some((region) => UNIT_RE.test(region.text.trim())));
    const garbled = !hasMoney && texts.some((text) => GARBLED_NUMBER_RE.test(text));
    const lowConfidence = line.regions.some(
      (region) => region.confidence < LOW_CONFIDENCE_THRESHOLD,
    );
    const inBand =
      bandTop === null || bandBottom === null
        ? true
        : box.y + box.height >= bandTop && box.y <= bandBottom;
    const gapTolerance = Math.max(10, box.height * 0.5);
    const missingPrice =
      priceColumn !== null &&
      !hasMoney &&
      productLike &&
      box.x + box.width < priceColumn.minX - gapTolerance &&
      inBand;
    const quantityWithoutValue = !hasMoney && qtyUnit && inBand;

    let reason: SuspiciousReason | null = null;
    if (missingPrice) reason = "missing-price";
    else if (quantityWithoutValue) reason = "quantity-without-value";
    else if (garbled && inBand) reason = "garbled-number";
    else if (lowConfidence && inBand) reason = "low-confidence";
    if (reason) flagged.push({ lineIndex: i, reason, box });
  }

  flagged.sort((a, b) => {
    const byPriority = REASON_PRIORITY[a.reason] - REASON_PRIORITY[b.reason];
    return byPriority !== 0 ? byPriority : a.box.y - b.box.y;
  });

  const items = flagged.slice(0, MAX_SECOND_PASS_CROPS).map(({ lineIndex, reason, box }) => {
    const marginY = Math.max(6, Math.round(box.height * 0.35));
    const left = clamp(Math.round(box.x - imageWidth * CROP_LEFT_MARGIN_RATIO), 0, imageWidth - 1);
    const rightEdge = priceColumn
      ? priceColumn.maxX + Math.round(imageWidth * CROP_RIGHT_MARGIN_RATIO)
      : imageWidth;
    const right = clamp(Math.round(rightEdge), left + 1, imageWidth);
    const top = clamp(Math.round(box.y - marginY), 0, imageHeight - 1);
    const bottom = clamp(Math.round(box.y + box.height + marginY), top + 1, imageHeight);
    const bandHalf = box.height * 0.5;
    return {
      lineIndex,
      reason,
      lineBox: box,
      band: { x: 0, y: box.y - bandHalf, width: imageWidth, height: box.height + bandHalf * 2 },
      crop: { x: left, y: top, width: right - left, height: bottom - top },
    };
  });

  return { suspiciousCount: flagged.length, items };
}

export function mergePassRegions(
  originals: PaddleOcrRegion[],
  allLines: LineInput[],
  processed: CropLineResult[],
): PaddleOcrRegion[] {
  if (processed.length === 0) return originals;

  const allLineBoxes = allLines.map((line) => computeLineBox(line));
  const filteredEntries = processed
    .map((entry) => ({
      entry,
      filtered: entry.regions.filter((region) => {
        const { cy } = centerOf(bboxOf(region));
        if (cy < entry.item.band.y || cy > entry.item.band.y + entry.item.band.height) return false;
        for (let i = 0; i < allLineBoxes.length; i++) {
          if (i === entry.item.lineIndex) continue;
          const other = allLineBoxes[i];
          if (!other) continue;
          if (cy >= other.y && cy <= other.y + other.height) return false;
        }
        return true;
      }),
    }))
    .filter((entry) => entry.filtered.length > 0);
  if (filteredEntries.length === 0) return originals;

  const removalSet = new Set<PaddleOcrRegion>();
  for (const { entry, filtered } of filteredEntries) {
    for (const region of originals) {
      if (removalSet.has(region) || !isDeficientOriginal(region)) continue;
      const box = bboxOf(region);
      const { cx, cy } = centerOf(box);
      if (!isInside(entry.item.lineBox, cx, cy)) continue;
      if (filtered.some((candidate) => overlapsMuch(box, bboxOf(candidate)))) {
        removalSet.add(region);
      }
    }
  }

  const kept = originals.filter((region) => !removalSet.has(region));
  const added: PaddleOcrRegion[] = [];
  for (const { filtered } of filteredEntries) {
    for (const region of filtered) {
      const box = bboxOf(region);
      const duplicate =
        kept.some((other) => overlapsMuch(box, bboxOf(other))) ||
        added.some((other) => overlapsMuch(box, bboxOf(other)));
      if (!duplicate) added.push(region);
    }
  }

  return [...kept, ...added];
}
