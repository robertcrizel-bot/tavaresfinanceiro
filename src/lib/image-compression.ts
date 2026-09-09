// Compresses an image File by downscaling to a max dimension and re-encoding as JPEG.
// Helps avoid out-of-memory crashes on mobile when attaching large camera photos.
type CompressionBounds = { maxDimension?: number; maxWidth?: number; maxHeight?: number };

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
  // Don't bother compressing tiny files.
  if (file.size < 400 * 1024) return file;

  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  let imgEl: HTMLImageElement | null = null;
  let width = 0;
  let height = 0;

  try {
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file);
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

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return file;
    if (bitmap) ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    else if (imgEl) ctx.drawImage(imgEl, 0, 0, targetW, targetH);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return file;
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.(heic|heif|png|webp|bmp|tiff?|jpe?g)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    if (bitmap) bitmap.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
