import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import { sortRegionsByPosition } from "@/lib/ocr-paddle-test/recognize";
import type { RgbaImage } from "@/lib/paddle-ocr-worker-image";

export const PADDLE_OCR_TILE_COUNT = 3;

export interface VerticalOcrTile {
  top: number;
  height: number;
}

export function buildVerticalOcrTiles(
  imageHeight: number,
  requestedCount = PADDLE_OCR_TILE_COUNT,
): VerticalOcrTile[] {
  if (!Number.isInteger(imageHeight) || imageHeight <= 0) {
    throw new Error("Dimensões inválidas para dividir o comprovante.");
  }
  const count = Math.max(1, Math.min(requestedCount, imageHeight));
  const overlap = Math.max(1, Math.round(imageHeight * 0.06));
  const overlapBefore = Math.floor(overlap / 2);
  const overlapAfter = overlap - overlapBefore;

  return Array.from({ length: count }, (_, index) => {
    const coreTop = Math.floor((index * imageHeight) / count);
    const coreBottom = Math.floor(((index + 1) * imageHeight) / count);
    const top = index === 0 ? 0 : Math.max(0, coreTop - overlapBefore);
    const bottom = index === count - 1
      ? imageHeight
      : Math.min(imageHeight, coreBottom + overlapAfter);
    return { top, height: bottom - top };
  });
}

export function extractVerticalRgbaTile(image: RgbaImage, tile: VerticalOcrTile): RgbaImage {
  const source = new Uint8Array(image.pixels);
  const rowBytes = image.width * 4;
  const expected = rowBytes * image.height;
  if (!image.width || !image.height || source.byteLength !== expected) {
    throw new Error(`Pixels RGBA inválidos (${image.width}x${image.height}, ${source.byteLength} bytes).`);
  }
  if (tile.top < 0 || tile.height <= 0 || tile.top + tile.height > image.height) {
    throw new Error("Faixa vertical inválida para o OCR.");
  }

  const pixels = new Uint8Array(rowBytes * tile.height);
  const start = tile.top * rowBytes;
  pixels.set(source.subarray(start, start + pixels.byteLength));
  return { pixels: pixels.buffer, width: image.width, height: tile.height };
}

export function remapTileRegions(
  regions: PaddleOcrRegion[],
  tile: VerticalOcrTile,
): PaddleOcrRegion[] {
  return regions.map((region) => ({
    ...region,
    bbox: region.bbox.map(([x, y]) => [x, y + tile.top] as [number, number]),
  }));
}

function regionBounds(region: PaddleOcrRegion) {
  const xs = region.bbox.map(([x]) => x);
  const ys = region.bbox.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function regionsOverlap(a: PaddleOcrRegion, b: PaddleOcrRegion): boolean {
  const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toUpperCase();
  if (normalize(a.text) !== normalize(b.text)) return false;

  const left = regionBounds(a);
  const right = regionBounds(b);
  const overlapX = Math.max(0, Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX));
  const overlapY = Math.max(0, Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY));
  const minWidth = Math.max(1, Math.min(left.maxX - left.minX, right.maxX - right.minX));
  const minHeight = Math.max(1, Math.min(left.maxY - left.minY, right.maxY - right.minY));
  return overlapX / minWidth >= 0.5 && overlapY / minHeight >= 0.5;
}

export function deduplicateOverlapRegions(regions: PaddleOcrRegion[]): PaddleOcrRegion[] {
  const deduplicated: PaddleOcrRegion[] = [];
  for (const region of sortRegionsByPosition(regions)) {
    const duplicateIndex = deduplicated.findIndex((candidate) => regionsOverlap(candidate, region));
    if (duplicateIndex < 0) {
      deduplicated.push(region);
    } else if (region.confidence > deduplicated[duplicateIndex].confidence) {
      deduplicated[duplicateIndex] = region;
    }
  }
  return sortRegionsByPosition(deduplicated);
}
