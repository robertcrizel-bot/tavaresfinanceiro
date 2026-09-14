// Compresses an image File by downscaling to a max dimension and re-encoding as JPEG.
// Helps avoid out-of-memory crashes on mobile when attaching large camera photos.
type CompressionBounds = { maxDimension?: number; maxWidth?: number; maxHeight?: number };

type JpegMetadata = { width: number; height: number; orientation: number };

const JPEG_HEADER_LIMIT = 512 * 1024;
const SMALL_FILE_LIMIT = 400 * 1024;

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
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

  while (offset + 3 < view.byteLength) {
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

    if (marker === 0xe1 && orientation === null) {
      orientation = parseExifOrientation(view, segmentStart, segmentEnd);
    }
    if (sofMarkers.has(marker) && segmentEnd - segmentStart >= 5) {
      height = view.getUint16(segmentStart + 1);
      width = view.getUint16(segmentStart + 3);
    }
    offset = segmentEnd;
  }

  return width > 0 && height > 0 ? { width, height, orientation: orientation ?? 1 } : null;
}

async function readJpegMetadata(file: File): Promise<JpegMetadata | null> {
  const header = await file.slice(0, Math.min(file.size, JPEG_HEADER_LIMIT)).arrayBuffer();
  return parseJpegMetadata(header);
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
  opts: CompressionBounds & { quality?: number } = {},
): Promise<File> {
  const quality = opts.quality ?? 0.7;

  if (!file.type.startsWith("image/")) return file;
  // Skip GIFs (would lose animation) and SVGs.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  const isJpeg = /^image\/jpe?g$/i.test(file.type);
  let jpegMetadata: JpegMetadata | null = null;
  if (isJpeg) {
    try {
      jpegMetadata = await readJpegMetadata(file);
    } catch {
      // Decoding below remains the compatibility fallback for unusual JPEGs.
    }
  }

  if (file.size < SMALL_FILE_LIMIT) {
    if (!jpegMetadata) return file;
    const swapsAxes = jpegMetadata.orientation >= 5 && jpegMetadata.orientation <= 8;
    const displayWidth = swapsAxes ? jpegMetadata.height : jpegMetadata.width;
    const displayHeight = swapsAxes ? jpegMetadata.width : jpegMetadata.height;
    const target = calculateImageDimensions(displayWidth, displayHeight, opts);
    if (target.width === displayWidth && target.height === displayHeight) return file;
  }

  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  let imgEl: HTMLImageElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let width = 0;
  let height = 0;

  try {
    if (typeof createImageBitmap === "function") {
      if (jpegMetadata) {
        const swapsAxes = jpegMetadata.orientation >= 5 && jpegMetadata.orientation <= 8;
        const displayWidth = swapsAxes ? jpegMetadata.height : jpegMetadata.width;
        const displayHeight = swapsAxes ? jpegMetadata.width : jpegMetadata.height;
        const target = calculateImageDimensions(displayWidth, displayHeight, opts);
        const needsResize = target.width !== displayWidth || target.height !== displayHeight;
        if (needsResize) {
          try {
            bitmap = await createImageBitmap(file, {
              imageOrientation: "from-image",
              resizeWidth: target.width,
              resizeHeight: target.height,
              resizeQuality: "high",
            });
          } catch (error) {
            // Retry only when the options themselves are unsupported, not after a decoder failure.
            if (!(error instanceof TypeError)) return file;
          }
        }
      }
      if (!bitmap) bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
    } else {
      objectUrl = URL.createObjectURL(file);
      imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = objectUrl!;
      });
      width = imgEl.naturalWidth;
      height = imgEl.naturalHeight;
    }

    const { width: targetW, height: targetH } = calculateImageDimensions(width, height, opts);

    canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return file;
    if (bitmap) {
      try {
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      } finally {
        bitmap.close?.();
        bitmap = null;
      }
    } else if (imgEl) {
      try {
        ctx.drawImage(imgEl, 0, 0, targetW, targetH);
      } finally {
        imgEl.removeAttribute("src");
        imgEl = null;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    }

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.(heic|heif|png|webp|bmp|tiff?|jpe?g)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    if (bitmap) bitmap.close?.();
    if (imgEl) imgEl.removeAttribute("src");
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
