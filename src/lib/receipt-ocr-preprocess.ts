export interface PreprocessOptions {
  maxDimension?: number;
  jpegQuality?: number;
  enableCrop?: boolean;
  enableSharpen?: boolean;
  _loadImage?: (src: string) => Promise<HTMLImageElement>;
}

export interface CropInfo {
  applied: boolean;
  originalWidth: number;
  croppedWidth: number;
  sideRemovalPct: number;
  confidence: number;
}

export interface PreprocessResult {
  imageDataUrl: string;
  width: number;
  height: number;
  durationMs: number;
  applied: boolean;
  originalWidth: number;
  originalHeight: number;
  cropInfo?: CropInfo;
}

const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 0.92;
const CROP_SAFETY_MARGIN = 0.02;
const UPSCALE_MIN_DIMENSION = 1500;
const UPSCALE_TARGET_DIMENSION = 2200;

const CROP_REDUCE_MAX = 300;
const CROP_MIN_PAPER_RATIO = 0.1;
const CROP_MAX_PAPER_RATIO = 0.95;
const CROP_MIN_BRIGHTNESS_DIFF = 15;
const CROP_MIN_BRIGHTNESS_RATIO = 1.3;
const CROP_MIN_CONFIDENCE = 0.3;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("falha ao carregar imagem para pré-processamento"));
    img.src = src;
  });
}

function drawToCanvas(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("canvas indisponível para pré-processamento");
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return { canvas, ctx };
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", quality);
}

function zeroCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function detectCropBox(
  imageData: ImageData,
): {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  originalWidth: number;
  croppedWidth: number;
  sideRemovalPct: number;
} {
  const { width, height, data } = imageData;

  const reduceW = Math.min(width, CROP_REDUCE_MAX);
  const reduceH = Math.min(height, CROP_REDUCE_MAX);
  const scaleX = width / reduceW;
  const scaleY = height / reduceH;

  const reduced = new Uint8ClampedArray(reduceW * reduceH * 4);
  for (let ry = 0; ry < reduceH; ry++) {
    const srcY = Math.floor(ry * scaleY);
    for (let rx = 0; rx < reduceW; rx++) {
      const srcX = Math.floor(rx * scaleX);
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (ry * reduceW + rx) * 4;
      reduced[dstIdx] = data[srcIdx];
      reduced[dstIdx + 1] = data[srcIdx + 1];
      reduced[dstIdx + 2] = data[srcIdx + 2];
      reduced[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  const yStart = Math.floor(reduceH * 0.1);
  const yEnd = Math.ceil(reduceH * 0.9);
  const colBrightness = new Array(reduceW);
  for (let x = 0; x < reduceW; x++) {
    let sum = 0;
    let count = 0;
    for (let y = yStart; y < yEnd; y++) {
      const idx = (y * reduceW + x) * 4;
      sum += (reduced[idx] + reduced[idx + 1] + reduced[idx + 2]) / 3;
      count++;
    }
    colBrightness[x] = count > 0 ? sum / count : 0;
  }

  let maxBright = 0;
  for (let x = 0; x < reduceW; x++) {
    if (colBrightness[x] > maxBright) maxBright = colBrightness[x];
  }

  if (maxBright < 50) {
    return {
      x: 0, y: 0, w: width, h: height, confidence: 0,
      originalWidth: width, croppedWidth: width, sideRemovalPct: 0,
    };
  }

  const threshold = maxBright * 0.4;

  let left = -1;
  for (let x = 0; x < reduceW; x++) {
    if (colBrightness[x] >= threshold) {
      left = x;
      break;
    }
  }

  let right = -1;
  for (let x = reduceW - 1; x >= 0; x--) {
    if (colBrightness[x] >= threshold) {
      right = x;
      break;
    }
  }

  if (left === -1 || right === -1 || left >= right) {
    return {
      x: 0, y: 0, w: width, h: height, confidence: 0,
      originalWidth: width, croppedWidth: width, sideRemovalPct: 0,
    };
  }

  const paperWidthReduced = right - left + 1;
  const paperRatio = paperWidthReduced / reduceW;

  if (paperRatio < CROP_MIN_PAPER_RATIO || paperRatio > CROP_MAX_PAPER_RATIO) {
    return {
      x: 0, y: 0, w: width, h: height, confidence: 0,
      originalWidth: width, croppedWidth: width, sideRemovalPct: 0,
    };
  }

  let paperSum = 0;
  for (let x = left; x <= right; x++) paperSum += colBrightness[x];
  const paperMean = paperSum / paperWidthReduced;

  const sideLeftCount = left;
  const sideRightCount = reduceW - 1 - right;
  let sideSum = 0;
  let sideCount = 0;
  for (let x = 0; x < left; x++) { sideSum += colBrightness[x]; sideCount++; }
  for (let x = right + 1; x < reduceW; x++) { sideSum += colBrightness[x]; sideCount++; }
  const sideMean = sideCount > 0 ? sideSum / sideCount : 0;

  const brightnessDiff = paperMean - sideMean;
  const brightnessRatio = sideMean > 0 ? paperMean / sideMean : paperMean > 0 ? 2 : 1;

  if (brightnessDiff < CROP_MIN_BRIGHTNESS_DIFF || brightnessRatio < CROP_MIN_BRIGHTNESS_RATIO) {
    return {
      x: 0, y: 0, w: width, h: height, confidence: 0,
      originalWidth: width, croppedWidth: width, sideRemovalPct: 0,
    };
  }

  const leftPx = Math.round(left * scaleX);
  const rightPx = Math.round(right * scaleX);

  let confidence = 0;
  if (brightnessDiff >= 30 && brightnessRatio >= 1.5) confidence = 0.9;
  else if (brightnessDiff >= 20 && brightnessRatio >= 1.4) confidence = 0.7;
  else confidence = 0.5;

  if (paperRatio > 0.7 && paperRatio < 0.95) confidence *= 0.8;

  const marginX = Math.round((rightPx - leftPx) * CROP_SAFETY_MARGIN);

  const cropX = Math.max(0, leftPx - marginX);
  const cropRight = Math.min(width, rightPx + marginX + 1);
  const cropW = cropRight - cropX;

  const cropMarginY = Math.round(height * CROP_SAFETY_MARGIN);
  const cropY = cropMarginY;
  const cropH = height - cropMarginY * 2;

  return {
    x: cropX,
    y: Math.max(0, cropY),
    w: cropW,
    h: Math.max(1, cropH),
    confidence,
    originalWidth: width,
    croppedWidth: cropW,
    sideRemovalPct: Math.round(((width - cropW) / width) * 100),
  };
}

function enhanceContrast(imageData: ImageData): void {
  const { data } = imageData;
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  const range = max - min;
  if (range < 30) return;

  const stretchMin = min + range * 0.02;
  const stretchMax = max - range * 0.02;
  const stretchRange = stretchMax - stretchMin;
  if (stretchRange < 10) return;

  const scale = 255 / stretchRange;
  const offset = -stretchMin * scale;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i] * scale + offset));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * scale + offset));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * scale + offset));
  }
}

function applySharpen(
  source: ImageData,
  target: ImageData,
  amount: number,
): void {
  const { width, height } = source;
  const s = source.data;
  const t = target.data;

  const k = [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625];
  const offsets = [-width - 1, -width, -width + 1, -1, 0, 1, width - 1, width, width + 1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let blurredR = 0;
      let blurredG = 0;
      let blurredB = 0;

      for (let kIdx = 0; kIdx < 9; kIdx++) {
        const neighborIdx = idx + offsets[kIdx] * 4;
        const neighborY = y + Math.floor(kIdx / 3) - 1;
        const neighborX = x + (kIdx % 3) - 1;

        if (neighborY >= 0 && neighborY < height && neighborX >= 0 && neighborX < width) {
          blurredR += s[neighborIdx] * k[kIdx];
          blurredG += s[neighborIdx + 1] * k[kIdx];
          blurredB += s[neighborIdx + 2] * k[kIdx];
        } else {
          blurredR += s[idx] * k[kIdx];
          blurredG += s[idx + 1] * k[kIdx];
          blurredB += s[idx + 2] * k[kIdx];
        }
      }

      t[idx] = Math.max(0, Math.min(255, s[idx] + (s[idx] - blurredR) * amount));
      t[idx + 1] = Math.max(0, Math.min(255, s[idx + 1] + (s[idx + 1] - blurredG) * amount));
      t[idx + 2] = Math.max(0, Math.min(255, s[idx + 2] + (s[idx + 2] - blurredB) * amount));
      t[idx + 3] = s[idx + 3];
    }
  }
}

export async function preprocessReceiptImage(
  imageDataUrl: string,
  options: PreprocessOptions = {},
): Promise<PreprocessResult> {
  const {
    maxDimension = MAX_DIMENSION,
    jpegQuality = JPEG_QUALITY,
    enableCrop = true,
    enableSharpen = true,
    _loadImage,
  } = options;

  const startTime = performance.now();

  try {
    const img = await (_loadImage || loadImage)(imageDataUrl);
    const originalWidth = img.naturalWidth;
    const originalHeight = img.naturalHeight;

    let { canvas: workingCanvas, ctx: workingCtx } = drawToCanvas(img, originalWidth, originalHeight);
    let currentWidth = originalWidth;
    let currentHeight = originalHeight;

    let cropInfo: CropInfo | undefined;

    if (enableCrop) {
      const imageData = workingCtx.getImageData(0, 0, currentWidth, currentHeight);
      const cropBox = detectCropBox(imageData);

      if (
        cropBox.confidence >= CROP_MIN_CONFIDENCE &&
        cropBox.w < currentWidth - 4 &&
        cropBox.h < currentHeight - 4
      ) {
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropBox.w;
        cropCanvas.height = cropBox.h;
        const cropCtx = cropCanvas.getContext("2d", { alpha: false });
        if (cropCtx) {
          cropCtx.drawImage(
            workingCanvas,
            cropBox.x,
            cropBox.y,
            cropBox.w,
            cropBox.h,
            0,
            0,
            cropBox.w,
            cropBox.h,
          );
          zeroCanvas(workingCanvas);
          workingCanvas = cropCanvas;
          workingCtx = cropCtx;
          currentWidth = cropBox.w;
          currentHeight = cropBox.h;
          cropInfo = {
            applied: true,
            originalWidth: cropBox.originalWidth,
            croppedWidth: cropBox.croppedWidth,
            sideRemovalPct: cropBox.sideRemovalPct,
            confidence: cropBox.confidence,
          };
        }
      }

      if (!cropInfo) {
        cropInfo = {
          applied: false,
          originalWidth: currentWidth,
          croppedWidth: currentWidth,
          sideRemovalPct: 0,
          confidence: 0,
        };
      }
    }

    const imageData = workingCtx.getImageData(0, 0, currentWidth, currentHeight);
    enhanceContrast(imageData);

    for (let i = 0; i < imageData.data.length; i += 4) {
      const gray = Math.round(
        0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2],
      );
      imageData.data[i] = gray;
      imageData.data[i + 1] = gray;
      imageData.data[i + 2] = gray;
    }

    workingCtx.putImageData(imageData, 0, 0);

    const largestDim = Math.max(currentWidth, currentHeight);
    if (largestDim < UPSCALE_MIN_DIMENSION) {
      const scale = Math.min(
        maxDimension / largestDim,
        UPSCALE_TARGET_DIMENSION / largestDim,
      );
      if (scale > 1.1) {
        const newW = Math.min(Math.round(currentWidth * scale), maxDimension);
        const newH = Math.min(Math.round(currentHeight * scale), maxDimension);
        const upscaleCanvas = document.createElement("canvas");
        upscaleCanvas.width = newW;
        upscaleCanvas.height = newH;
        const upscaleCtx = upscaleCanvas.getContext("2d", { alpha: false });
        if (upscaleCtx) {
          upscaleCtx.imageSmoothingEnabled = true;
          upscaleCtx.imageSmoothingQuality = "high";
          upscaleCtx.drawImage(workingCanvas, 0, 0, newW, newH);
          zeroCanvas(workingCanvas);
          workingCanvas = upscaleCanvas;
          workingCtx = upscaleCtx;
          currentWidth = newW;
          currentHeight = newH;
        }
      }
    }

    if (enableSharpen && currentWidth > 50 && currentHeight > 50) {
      const srcData = workingCtx.getImageData(0, 0, currentWidth, currentHeight);
      const dstData = new ImageData(currentWidth, currentHeight);
      applySharpen(srcData, dstData, 0.3);
      workingCtx.putImageData(dstData, 0, 0);
    }

    if (currentWidth > maxDimension || currentHeight > maxDimension) {
      const scale = maxDimension / Math.max(currentWidth, currentHeight);
      const finalW = Math.round(currentWidth * scale);
      const finalH = Math.round(currentHeight * scale);
      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = finalW;
      finalCanvas.height = finalH;
      const finalCtx = finalCanvas.getContext("2d", { alpha: false });
      if (finalCtx) {
        finalCtx.imageSmoothingEnabled = true;
        finalCtx.imageSmoothingQuality = "high";
        finalCtx.drawImage(workingCanvas, 0, 0, finalW, finalH);
        zeroCanvas(workingCanvas);
        workingCanvas = finalCanvas;
        workingCtx = finalCtx;
        currentWidth = finalW;
        currentHeight = finalH;
      }
    }

    const resultUrl = canvasToDataUrl(workingCanvas, jpegQuality);
    zeroCanvas(workingCanvas);

    const durationMs = Math.round(performance.now() - startTime);

    return {
      imageDataUrl: resultUrl,
      width: currentWidth,
      height: currentHeight,
      durationMs,
      applied: true,
      originalWidth,
      originalHeight,
      cropInfo,
    };
  } catch {
    const durationMs = Math.round(performance.now() - startTime);
    return {
      imageDataUrl,
      width: 0,
      height: 0,
      durationMs,
      applied: false,
      originalWidth: 0,
      originalHeight: 0,
    };
  }
}
