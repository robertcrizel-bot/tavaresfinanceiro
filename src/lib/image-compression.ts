// Compresses an image File by downscaling to a max dimension and re-encoding as JPEG.
// Helps avoid out-of-memory crashes on mobile when attaching large camera photos.
export async function compressImageFile(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  const maxDimension = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 0.8;

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

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    if (bitmap) ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    else if (imgEl) ctx.drawImage(imgEl, 0, 0, targetW, targetH);

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
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
