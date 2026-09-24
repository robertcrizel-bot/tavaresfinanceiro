import { loadImage } from "@/lib/receipt-ocr-preprocess";
import type { StrategyConfig } from "./types";

function zeroCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function computeOtsuThreshold(grayData: Uint8ClampedArray): number {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < grayData.length; i += 4) {
    histogram[grayData[i]]++;
  }

  const totalPixels = grayData.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

function applyOtsuThreshold(imageData: ImageData): void {
  const { data } = imageData;
  const threshold = computeOtsuThreshold(data);
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i] >= threshold ? 255 : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
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

function applySharpen(source: ImageData, target: ImageData, amount: number): void {
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

async function fullPreprocess(
  imageDataUrl: string,
  maxDimension: number,
  applyThreshold: boolean,
): Promise<{ imageDataUrl: string; width: number; height: number }> {
  const img = await loadImage(imageDataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("canvas indisponível");
  ctx.drawImage(img, 0, 0, w, h);

  let currentW = w;
  let currentH = h;

  const imageData = ctx.getImageData(0, 0, currentW, currentH);
  enhanceContrast(imageData);

  for (let i = 0; i < imageData.data.length; i += 4) {
    const gray = Math.round(
      0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2],
    );
    imageData.data[i] = gray;
    imageData.data[i + 1] = gray;
    imageData.data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);

  if (currentW < 1500 || currentH < 1500) {
    const largest = Math.max(currentW, currentH);
    const scale = Math.min(maxDimension / largest, 3000 / largest);
    if (scale > 1.1) {
      const newW = Math.min(Math.round(currentW * scale), maxDimension);
      const newH = Math.min(Math.round(currentH * scale), maxDimension);
      const upCanvas = document.createElement("canvas");
      upCanvas.width = newW;
      upCanvas.height = newH;
      const upCtx = upCanvas.getContext("2d", { alpha: false });
      if (upCtx) {
        upCtx.imageSmoothingEnabled = true;
        upCtx.imageSmoothingQuality = "high";
        upCtx.drawImage(canvas, 0, 0, newW, newH);
        zeroCanvas(canvas);
        canvas.width = newW;
        canvas.height = newH;
        const newCtx = canvas.getContext("2d", { alpha: false });
        if (newCtx) {
          newCtx.drawImage(upCanvas, 0, 0);
          currentW = newW;
          currentH = newH;
        }
        zeroCanvas(upCanvas);
      }
    }
  }

  if (currentW > 50 && currentH > 50) {
    const srcData = ctx.getImageData(0, 0, currentW, currentH);
    const dstData = new ImageData(currentW, currentH);
    applySharpen(srcData, dstData, 0.3);
    ctx.putImageData(dstData, 0, 0);
  }

  if (currentW > maxDimension || currentH > maxDimension) {
    const scale = maxDimension / Math.max(currentW, currentH);
    const finalW = Math.round(currentW * scale);
    const finalH = Math.round(currentH * scale);
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = finalW;
    finalCanvas.height = finalH;
    const finalCtx = finalCanvas.getContext("2d", { alpha: false });
    if (finalCtx) {
      finalCtx.imageSmoothingEnabled = true;
      finalCtx.imageSmoothingQuality = "high";
      finalCtx.drawImage(canvas, 0, 0, finalW, finalH);
      zeroCanvas(canvas);
      const result = finalCanvas.toDataURL("image/jpeg", 0.92);
      zeroCanvas(finalCanvas);
      return { imageDataUrl: result, width: finalW, height: finalH };
    }
  }

  const result = canvas.toDataURL("image/jpeg", 0.92);
  zeroCanvas(canvas);
  return { imageDataUrl: result, width: currentW, height: currentH };
}

export async function preprocessForStrategy(
  imageDataUrl: string,
  variant: StrategyConfig["preprocessVariant"],
): Promise<{ imageDataUrl: string; width: number; height: number }> {
  if (variant === "default") {
    const img = await loadImage(imageDataUrl);
    return { imageDataUrl, width: img.naturalWidth, height: img.naturalHeight };
  }

  if (variant === "threshold") {
    const img = await loadImage(imageDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas indisponível");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyOtsuThreshold(imageData);
    ctx.putImageData(imageData, 0, 0);
    const result = canvas.toDataURL("image/jpeg", 0.92);
    const w = canvas.width;
    const h = canvas.height;
    zeroCanvas(canvas);
    return { imageDataUrl: result, width: w, height: h };
  }

  if (variant === "upscale3x") {
    return fullPreprocess(imageDataUrl, 3200, false);
  }

  if (variant === "threshold+upscale3x") {
    const prepped = await fullPreprocess(imageDataUrl, 3200, false);
    const img = await loadImage(prepped.imageDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas indisponível");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyOtsuThreshold(imageData);
    ctx.putImageData(imageData, 0, 0);
    const result = canvas.toDataURL("image/jpeg", 0.92);
    const w = canvas.width;
    const h = canvas.height;
    zeroCanvas(canvas);
    return { imageDataUrl: result, width: w, height: h };
  }

  const img = await loadImage(imageDataUrl);
  return { imageDataUrl, width: img.naturalWidth, height: img.naturalHeight };
}
