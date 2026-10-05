import { PaddleOcrService, V6_SMALL_MODEL, V6_TINY_MODEL } from "ppu-paddle-ocr/web";
import { configureOrtWasm } from "@/lib/ocr-runtime";
import { adaptPpuLinesToRegions } from "@/lib/fast-ocr-adapter";
import { spatialGroup } from "@/lib/ocr-paddle-test/spatialGrouper";
import type { PaddleOcrRegion } from "@/lib/ocr-paddle-test/types";
import {
  mergePassRegions,
  pickCropScale,
  planSecondPass,
  type CropLineResult,
  type Rect,
} from "@/lib/hybrid-ocr-regions";
import type { HybridCropPreviewData } from "@/lib/hybrid-ocr";

interface HybridRecognizeMessage {
  image: ArrayBuffer;
  imageWidth: number;
  imageHeight: number;
}

const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  close(): void;
  onmessage: ((event: MessageEvent<HybridRecognizeMessage>) => void) | null;
};

function toMainImageCoords(
  regions: PaddleOcrRegion[],
  crop: Rect,
  scale: number,
): PaddleOcrRegion[] {
  return regions.map((region) => ({
    ...region,
    bbox: region.bbox.map(([x, y]) => [x / scale + crop.x, y / scale + crop.y]) as [number, number][],
  }));
}

scope.onmessage = async (event: MessageEvent<HybridRecognizeMessage>) => {
  const { image, imageWidth, imageHeight } = event.data;
  let tinyService: PaddleOcrService | null = null;
  let smallService: PaddleOcrService | null = null;
  try {
    scope.postMessage({ type: "progress", message: "Carregando modelo de OCR híbrido..." });
    configureOrtWasm();

    const initializationStart = performance.now();
    tinyService = new PaddleOcrService({
      model: V6_TINY_MODEL,
      recognition: {
        charactersDictionary: [],
        strategy: "per-line",
        minimumConfidence: 0.4,
      },
    });
    await tinyService.initialize();
    const initializationMs = Math.round(performance.now() - initializationStart);

    scope.postMessage({ type: "progress", message: "Reconhecendo texto..." });
    const firstPassStart = performance.now();
    const firstResult = await tinyService.recognize(image);
    const firstPassRegions = adaptPpuLinesToRegions(firstResult.lines);
    const { lines: firstPassLines } = spatialGroup(firstPassRegions);
    const plan = planSecondPass(firstPassLines, imageWidth, imageHeight);
    const firstPassMs = Math.round(performance.now() - firstPassStart);

    // Free the Tiny session before the Small one is created so both models are never resident together.
    await tinyService.destroy();
    tinyService = null;

    let regions = firstPassRegions;
    let cropsProcessed = 0;
    let smallInitializationMs = 0;
    let smallCropsMs = 0;
    let mergeMs = 0;
    const previews: HybridCropPreviewData[] = [];
    if (plan.items.length > 0) {
      scope.postMessage({ type: "progress", message: "Carregando modelo Small do OCR híbrido..." });
      const smallInitializationStart = performance.now();
      smallService = new PaddleOcrService({
        model: V6_SMALL_MODEL,
        recognition: {
          charactersDictionary: [],
          strategy: "per-line",
          minimumConfidence: 0.4,
        },
      });
      await smallService.initialize();
      smallInitializationMs = Math.round(performance.now() - smallInitializationStart);

      const bitmap = await createImageBitmap(new Blob([image], { type: "image/jpeg" }));
      try {
        const processed: CropLineResult[] = [];
        for (let i = 0; i < plan.items.length; i++) {
          const item = plan.items[i];
          scope.postMessage({
            type: "progress",
            message: `Reprocessando região ${i + 1}/${plan.items.length}...`,
          });
          const scale = pickCropScale(item.crop.height);
          const width = Math.max(1, Math.round(item.crop.width * scale));
          const height = Math.max(1, Math.round(item.crop.height * scale));
          const canvas = new OffscreenCanvas(width, height);
          try {
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("canvas 2D indisponível no worker");
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.drawImage(
              bitmap,
              item.crop.x,
              item.crop.y,
              item.crop.width,
              item.crop.height,
              0,
              0,
              width,
              height,
            );
            const cropStart = performance.now();
            const cropResult = await smallService.recognize(canvas);
            smallCropsMs += performance.now() - cropStart;
            const cropRegions = toMainImageCoords(
              adaptPpuLinesToRegions(cropResult.lines),
              item.crop,
              scale,
            );
            const previewBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 });
            const sourceLine = firstPassLines[item.lineIndex];
            previews.push({
              index: previews.length + 1,
              reason: item.reason,
              originalText: sourceLine
                ? sourceLine.regions.map((region) => region.text).join(" | ")
                : "",
              cropWidth: item.crop.width,
              cropHeight: item.crop.height,
              sentWidth: width,
              sentHeight: height,
              scale,
              recognizedText: cropRegions.map((region) => region.text).join(" | "),
              preview: await previewBlob.arrayBuffer(),
            });
            processed.push({ item, regions: cropRegions });
            cropsProcessed++;
          } catch (cropError) {
            console.warn("[hybrid-ocr-worker] crop pass failed", cropError);
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
        if (processed.length > 0) {
          const mergeStart = performance.now();
          regions = mergePassRegions(firstPassRegions, firstPassLines, processed);
          mergeMs = Math.round(performance.now() - mergeStart);
        }
      } finally {
        bitmap.close();
        try {
          await smallService.destroy();
        } catch (disposeError) {
          console.warn("[hybrid-ocr-worker] failed to dispose small service", disposeError);
        }
        smallService = null;
      }
    }

    scope.postMessage(
      {
        type: "result",
        regions,
        initializationMs,
        firstPassMs,
        suspiciousCount: plan.suspiciousCount,
        smallInitializationMs,
        smallCropsMs: Math.round(smallCropsMs),
        cropsProcessed,
        mergeMs,
        previews,
      },
      previews.map((preview) => preview.preview),
    );
  } catch (error) {
    for (const service of [smallService, tinyService]) {
      if (!service) continue;
      try {
        await service.destroy();
      } catch (disposeError) {
        console.warn("[hybrid-ocr-worker] failed to dispose service", disposeError);
      }
    }
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  scope.close();
};
