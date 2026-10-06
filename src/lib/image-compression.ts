// Compresses an image File by downscaling to a max dimension and re-encoding as JPEG.
// Helps avoid out-of-memory crashes on mobile when attaching large camera photos.
type CompressionBounds = { maxDimension?: number; maxWidth?: number; maxHeight?: number };

type JpegMetadata = {
  width: number;
  height: number;
  orientation: number;
  orientationSegments: Array<{ start: number; end: number }>;
};

type JpegHeader = { hasJpegSignature: boolean; metadata: JpegMetadata | null };

export type JpegOrientationInspection =
  | { status: "absent"; width: number; height: number }
  | { status: "present"; orientation: number; width: number; height: number }
  | { status: "unknown"; reason: string };

type ExifOrientationInspection =
  | { status: "not-exif" }
  | { status: "absent" }
  | { status: "present"; orientation: number }
  | { status: "malformed" };

const JPEG_HEADER_LIMIT = 512 * 1024;
const SMALL_FILE_LIMIT = 400 * 1024;
const MAX_PROGRESSIVE_DOWNSCALE_STEPS = 3;

export type ImageNormalizationStrategy =
  | "unknown"
  | "original"
  | "single-downscale"
  | "progressive-downscale";

export type ImageDecodeMode = "skipped" | "decode-time-resize" | "full-decode";

export interface ImageNormalizationReport {
  strategy: ImageNormalizationStrategy;
  downscaleSteps: number;
  decodeMode: ImageDecodeMode;
  sourceDimensions: { width: number; height: number } | null;
  targetDimensions: { width: number; height: number } | null;
}

export type CompressionOptions = CompressionBounds & {
  quality?: number;
  requireDecodeResize?: boolean;
  preferBoundedOutput?: boolean;
  progressiveDownscale?: boolean;
  onNormalization?: (report: ImageNormalizationReport) => void;
};

function inspectExifOrientation(view: DataView, start: number, end: number): ExifOrientationInspection {
  const signature = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  if (end - start < signature.length) {
    const isTruncatedExif = end > start
      && signature.slice(0, end - start).every((byte, index) => view.getUint8(start + index) === byte);
    return isTruncatedExif ? { status: "malformed" } : { status: "not-exif" };
  }
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) {
    return { status: "not-exif" };
  }
  if (end - start < 14) return { status: "malformed" };

  const tiffStart = start + 6;
  const byteOrder = view.getUint16(tiffStart);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return { status: "malformed" };
  const littleEndian = byteOrder === 0x4949;
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return { status: "malformed" };

  const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart < tiffStart || ifdStart + 2 > end) return { status: "malformed" };
  const entryCount = view.getUint16(ifdStart, littleEndian);
  for (let i = 0; i < entryCount; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > end) return { status: "malformed" };
    if (view.getUint16(entry, littleEndian) !== 0x0112) continue;
    if (view.getUint16(entry + 2, littleEndian) !== 3 || view.getUint32(entry + 4, littleEndian) !== 1) {
      return { status: "malformed" };
    }
    const orientation = view.getUint16(entry + 8, littleEndian);
    return orientation >= 1 && orientation <= 8
      ? { status: "present", orientation }
      : { status: "malformed" };
  }
  return { status: "absent" };
}

function parseExifOrientation(view: DataView, start: number, end: number): number | null {
  if (end - start < 14) return null;
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return null;

  const tiffStart = start + 6;
  const byteOrder = view.getUint16(tiffStart);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
  const littleEndian = byteOrder === 0x4949;
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return null;

  const ifdStart = tiffStart + view.getUint32(tiffStart + 4, littleEndian);
  if (ifdStart + 2 > end) return null;
  const entryCount = view.getUint16(ifdStart, littleEndian);
  for (let i = 0; i < entryCount; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > end) break;
    if (view.getUint16(entry, littleEndian) !== 0x0112) continue;
    if (view.getUint16(entry + 2, littleEndian) !== 3 || view.getUint32(entry + 4, littleEndian) < 1) return null;
    const orientation = view.getUint16(entry + 8, littleEndian);
    return orientation >= 1 && orientation <= 8 ? orientation : null;
  }
  return null;
}

function parseJpegMetadata(buffer: ArrayBuffer): JpegMetadata | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  let width = 0;
  let height = 0;
  let orientation: number | null = null;
  const orientationSegments: JpegMetadata["orientationSegments"] = [];
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

  while (offset + 3 < view.byteLength) {
    const markerStart = offset;
    if (view.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset++;
    if (offset >= view.byteLength) break;
    const marker = view.getUint8(offset++);
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > view.byteLength) break;

    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;
    const segmentStart = offset + 2;
    const segmentEnd = offset + segmentLength;

    if (marker === 0xe1) {
      const segmentOrientation = parseExifOrientation(view, segmentStart, segmentEnd);
      if (segmentOrientation !== null) {
        orientation ??= segmentOrientation;
        orientationSegments.push({ start: markerStart, end: segmentEnd });
      }
    }
    if (sofMarkers.has(marker) && segmentEnd - segmentStart >= 5) {
      height = view.getUint16(segmentStart + 1);
      width = view.getUint16(segmentStart + 3);
    }
    offset = segmentEnd;
  }

  return width > 0 && height > 0
    ? { width, height, orientation: orientation ?? 1, orientationSegments }
    : null;
}

async function readJpegHeader(file: File): Promise<JpegHeader> {
  const header = await file.slice(0, Math.min(file.size, JPEG_HEADER_LIMIT)).arrayBuffer();
  const view = new DataView(header);
  return {
    hasJpegSignature: view.byteLength >= 2 && view.getUint16(0) === 0xffd8,
    metadata: parseJpegMetadata(header),
  };
}

export async function inspectJpegOrientation(file: Blob): Promise<JpegOrientationInspection> {
  try {
    const header = await file.slice(0, Math.min(file.size, JPEG_HEADER_LIMIT)).arrayBuffer();
    const view = new DataView(header);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
      return { status: "unknown", reason: "not-jpeg" };
    }

    let offset = 2;
    let width = 0;
    let height = 0;
    let orientation: number | null = null;
    let malformedExif = false;
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

    while (offset + 1 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) {
        return { status: "unknown", reason: "malformed-jpeg-header" };
      }
      while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset++;
      if (offset >= view.byteLength) break;
      const marker = view.getUint8(offset++);

      if (marker === 0xd9 || marker === 0xda) {
        if (width === 0 || height === 0 || malformedExif) {
          return { status: "unknown", reason: malformedExif ? "malformed-exif" : "missing-dimensions" };
        }
        return orientation === null
          ? { status: "absent", width, height }
          : { status: "present", orientation, width, height };
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > view.byteLength) break;

      const segmentLength = view.getUint16(offset);
      if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;
      const segmentStart = offset + 2;
      const segmentEnd = offset + segmentLength;

      if (marker === 0xe1) {
        const result = inspectExifOrientation(view, segmentStart, segmentEnd);
        if (result.status === "malformed") malformedExif = true;
        if (result.status === "present") {
          if (orientation !== null && orientation !== result.orientation) {
            return { status: "unknown", reason: "conflicting-orientation" };
          }
          orientation = result.orientation;
        }
      }
      if (sofMarkers.has(marker) && segmentEnd - segmentStart >= 5) {
        height = view.getUint16(segmentStart + 1);
        width = view.getUint16(segmentStart + 3);
      }
      offset = segmentEnd;
    }

    return { status: "unknown", reason: file.size > header.byteLength ? "truncated-header" : "incomplete-jpeg" };
  } catch {
    return { status: "unknown", reason: "read-failed" };
  }
}

export function isDocumentOrientationClassificationEligible(inspection: JpegOrientationInspection): boolean {
  return inspection.status === "absent"
    || (inspection.status === "present" && inspection.orientation === 1);
}

function withoutExifOrientation(file: File, metadata: JpegMetadata): Blob {
  if (metadata.orientationSegments.length === 0) return file;
  const parts: BlobPart[] = [];
  let offset = 0;
  for (const segment of metadata.orientationSegments) {
    parts.push(file.slice(offset, segment.start));
    offset = segment.end;
  }
  parts.push(file.slice(offset));
  return new Blob(parts, { type: "image/jpeg" });
}

function applyExifOrientation(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number,
) {
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, width, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, width, height);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, height);
      break;
  }
}

export function calculateImageDimensions(width: number, height: number, opts: CompressionBounds = {}) {
  const maxDimension = opts.maxDimension ?? 1024;
  const maxWidth = opts.maxWidth ?? maxDimension;
  const maxHeight = opts.maxHeight ?? maxDimension;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressImageFile(
  file: File,
  opts: CompressionOptions = {},
): Promise<File> {
  const quality = opts.quality ?? 0.7;
  const mimeType = file.type.toLowerCase();
  const report: ImageNormalizationReport = {
    strategy: "unknown",
    downscaleSteps: 0,
    decodeMode: "skipped",
    sourceDimensions: null,
    targetDimensions: null,
  };
  const keepOriginal = () => {
    report.strategy = "original";
    report.downscaleSteps = 0;
  };
  const emitNormalization = () => opts.onNormalization?.(report);

  // Skip GIFs (would lose animation) and SVGs.
  if (mimeType === "image/gif" || mimeType === "image/svg+xml") {
    keepOriginal();
    emitNormalization();
    return file;
  }

  const declaredJpeg = /^image\/jpe?g$/i.test(mimeType);
  const canBeUndeclaredJpeg = mimeType === "" || mimeType === "application/octet-stream";
  let jpegMetadata: JpegMetadata | null = null;
  let hasJpegSignature = false;
  if (declaredJpeg || canBeUndeclaredJpeg) {
    try {
      const header = await readJpegHeader(file);
      hasJpegSignature = header.hasJpegSignature;
      jpegMetadata = header.metadata;
    } catch {
      // Decoding below remains the compatibility fallback for unusual JPEGs.
    }
  }
  const isJpeg = declaredJpeg || hasJpegSignature;
  if (!mimeType.startsWith("image/") && !isJpeg) {
    keepOriginal();
    emitNormalization();
    return file;
  }
  const needsOrientationNormalization = Boolean(jpegMetadata && jpegMetadata.orientation !== 1);

  if (file.size < SMALL_FILE_LIMIT) {
    if (!jpegMetadata) {
      keepOriginal();
      emitNormalization();
      return file;
    }
    const swapsAxes = jpegMetadata.orientation >= 5 && jpegMetadata.orientation <= 8;
    const displayWidth = swapsAxes ? jpegMetadata.height : jpegMetadata.width;
    const displayHeight = swapsAxes ? jpegMetadata.width : jpegMetadata.height;
    const target = calculateImageDimensions(displayWidth, displayHeight, opts);
    if (!needsOrientationNormalization && target.width === displayWidth && target.height === displayHeight) {
      report.sourceDimensions = { width: displayWidth, height: displayHeight };
      report.targetDimensions = target;
      keepOriginal();
      emitNormalization();
      return file;
    }
  }

  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  let imgEl: HTMLImageElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let width = 0;
  let height = 0;
  let decodeSource: Blob = file;

  try {
    if (needsOrientationNormalization && jpegMetadata) {
      decodeSource = withoutExifOrientation(file, jpegMetadata);
    }

    if (typeof createImageBitmap === "function") {
      if (jpegMetadata && needsOrientationNormalization) {
        const swapsAxes = jpegMetadata.orientation >= 5 && jpegMetadata.orientation <= 8;
        const displayWidth = swapsAxes ? jpegMetadata.height : jpegMetadata.width;
        const displayHeight = swapsAxes ? jpegMetadata.width : jpegMetadata.height;
        const target = calculateImageDimensions(displayWidth, displayHeight, opts);
        const decodeWidth = swapsAxes ? target.height : target.width;
        const decodeHeight = swapsAxes ? target.width : target.height;
        const options: ImageBitmapOptions = { imageOrientation: "none" };
        if (decodeWidth !== jpegMetadata.width || decodeHeight !== jpegMetadata.height) {
          options.resizeWidth = decodeWidth;
          options.resizeHeight = decodeHeight;
          options.resizeQuality = "high";
        }
        try {
          bitmap = await createImageBitmap(decodeSource, options);
          report.decodeMode = options.resizeWidth === undefined ? "full-decode" : "decode-time-resize";
        } catch (error) {
          if (opts.requireDecodeResize) throw error;
          if (!(error instanceof TypeError)) {
            keepOriginal();
            return file;
          }
        }
      } else if (jpegMetadata) {
        const swapsAxes = jpegMetadata.orientation >= 5 && jpegMetadata.orientation <= 8;
        const displayWidth = swapsAxes ? jpegMetadata.height : jpegMetadata.width;
        const displayHeight = swapsAxes ? jpegMetadata.width : jpegMetadata.height;
        const target = calculateImageDimensions(displayWidth, displayHeight, opts);
        const needsResize = target.width !== displayWidth || target.height !== displayHeight;
        if (needsResize) {
          try {
            bitmap = await createImageBitmap(decodeSource, {
              imageOrientation: "from-image",
              resizeWidth: target.width,
              resizeHeight: target.height,
              resizeQuality: "high",
            });
            report.decodeMode = "decode-time-resize";
          } catch (error) {
            if (opts.requireDecodeResize) throw error;
            // Retry only when the options themselves are unsupported, not after a decoder failure.
            if (!(error instanceof TypeError)) {
              keepOriginal();
              return file;
            }
          }
        }
      }
      if (!bitmap) {
        bitmap = await createImageBitmap(decodeSource);
        report.decodeMode = "full-decode";
      }
      width = bitmap.width;
      height = bitmap.height;
    } else {
      if (opts.requireDecodeResize && jpegMetadata) {
        const target = calculateImageDimensions(jpegMetadata.width, jpegMetadata.height, opts);
        if (target.width !== jpegMetadata.width || target.height !== jpegMetadata.height) {
          throw new Error("decode-time image resizing is unavailable");
        }
      }
      objectUrl = URL.createObjectURL(decodeSource);
      imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = objectUrl!;
      });
      width = imgEl.naturalWidth;
      height = imgEl.naturalHeight;
      report.decodeMode = "full-decode";
    }

    const swapsAxes = Boolean(jpegMetadata && needsOrientationNormalization
      && jpegMetadata.orientation >= 5 && jpegMetadata.orientation <= 8);
    const displayWidth = swapsAxes ? height : width;
    const displayHeight = swapsAxes ? width : height;
    const { width: targetW, height: targetH } = calculateImageDimensions(displayWidth, displayHeight, opts);
    const drawWidth = swapsAxes ? targetH : targetW;
    const drawHeight = swapsAxes ? targetW : targetH;
    const sourceDisplayWidth = jpegMetadata
      ? (swapsAxes ? jpegMetadata.height : jpegMetadata.width)
      : displayWidth;
    const sourceDisplayHeight = jpegMetadata
      ? (swapsAxes ? jpegMetadata.width : jpegMetadata.height)
      : displayHeight;
    const wasResized = targetW !== sourceDisplayWidth || targetH !== sourceDisplayHeight;
    const needsCanvasScale = drawWidth !== width || drawHeight !== height;

    report.sourceDimensions = { width: sourceDisplayWidth, height: sourceDisplayHeight };
    report.targetDimensions = { width: targetW, height: targetH };

    const progressiveSizes: Array<{ width: number; height: number }> = [];
    if (opts.progressiveDownscale && needsCanvasScale) {
      let stepWidth = width;
      let stepHeight = height;
      while (
        progressiveSizes.length < MAX_PROGRESSIVE_DOWNSCALE_STEPS
        && stepWidth >= drawWidth * 2
        && stepHeight >= drawHeight * 2
      ) {
        stepWidth = Math.round(stepWidth / 2);
        stepHeight = Math.round(stepHeight / 2);
        progressiveSizes.push({ width: stepWidth, height: stepHeight });
      }
    }

    const downscaleSteps = !wasResized
      ? 0
      : report.decodeMode === "decode-time-resize"
        ? 1
        : needsCanvasScale ? progressiveSizes.length + 1 : 1;
    report.downscaleSteps = downscaleSteps;
    report.strategy = downscaleSteps === 0
      ? "original"
      : downscaleSteps === 1 ? "single-downscale" : "progressive-downscale";

    const highQualityScale = opts.progressiveDownscale === true;
    const configureContext = (context: CanvasRenderingContext2D | null): CanvasRenderingContext2D | null => {
      if (!context) return null;
      if (highQualityScale) {
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
      }
      return context;
    };
    const drawSource = (context: CanvasRenderingContext2D, toWidth: number, toHeight: number) => {
      if (bitmap) context.drawImage(bitmap, 0, 0, toWidth, toHeight);
      else if (imgEl) context.drawImage(imgEl, 0, 0, toWidth, toHeight);
    };
    const releaseSource = () => {
      if (bitmap) {
        bitmap.close?.();
        bitmap = null;
      }
      if (imgEl) {
        imgEl.removeAttribute("src");
        imgEl = null;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    const intermediates: HTMLCanvasElement[] = [];
    try {
      for (const size of progressiveSizes) {
        const step = document.createElement("canvas");
        step.width = size.width;
        step.height = size.height;
        const stepContext = configureContext(step.getContext("2d", { alpha: false }));
        if (!stepContext) {
          keepOriginal();
          return file;
        }
        const previous = intermediates[intermediates.length - 1];
        if (previous) {
          stepContext.drawImage(previous, 0, 0, size.width, size.height);
          previous.width = 0;
          previous.height = 0;
        } else {
          drawSource(stepContext, size.width, size.height);
          releaseSource();
        }
        intermediates.push(step);
      }

      canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = configureContext(canvas.getContext("2d", { alpha: false }));
      if (!ctx) {
        keepOriginal();
        return file;
      }
      if (needsOrientationNormalization && jpegMetadata) {
        applyExifOrientation(ctx, jpegMetadata.orientation, targetW, targetH);
      }
      const last = intermediates[intermediates.length - 1];
      if (last) {
        ctx.drawImage(last, 0, 0, drawWidth, drawHeight);
      } else if (bitmap) {
        try {
          ctx.drawImage(bitmap, 0, 0, drawWidth, drawHeight);
        } finally {
          bitmap.close?.();
          bitmap = null;
        }
      } else if (imgEl) {
        try {
          ctx.drawImage(imgEl, 0, 0, drawWidth, drawHeight);
        } finally {
          releaseSource();
        }
      }
    } finally {
      for (const step of intermediates) {
        step.width = 0;
        step.height = 0;
      }
    }

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) {
      keepOriginal();
      return file;
    }
    if (!needsOrientationNormalization && blob.size >= file.size && !(opts.preferBoundedOutput && wasResized)) {
      keepOriginal();
      return file;
    }

    const newName = file.name.replace(/\.(heic|heif|png|webp|bmp|tiff?|jpe?g)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (error) {
    if (opts.requireDecodeResize) throw error;
    keepOriginal();
    return file;
  } finally {
    if (bitmap) bitmap.close?.();
    if (imgEl) imgEl.removeAttribute("src");
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    emitNormalization();
  }
}
