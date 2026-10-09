export interface PaddleMat {
  delete(): void;
}

export interface PaddleOpenCv {
  CV_8UC4: number;
  matFromArray(
    rows: number,
    cols: number,
    type: number,
    data: ArrayLike<number>,
  ): PaddleMat;
}

export interface RgbaImage {
  pixels: ArrayBuffer;
  width: number;
  height: number;
}

/**
 * Worker side: builds a cv.Mat straight from RGBA pixels.
 * No document, canvas, OffscreenCanvas or createImageBitmap involved.
 */
export function rgbaToPaddleMat(image: RgbaImage, cv: PaddleOpenCv): PaddleMat {
  const expected = image.width * image.height * 4;
  if (!image.width || !image.height || image.pixels.byteLength !== expected) {
    throw new Error(
      `Pixels RGBA inválidos (${image.width}x${image.height}, ${image.pixels.byteLength} bytes).`,
    );
  }
  return cv.matFromArray(image.height, image.width, cv.CV_8UC4, new Uint8Array(image.pixels));
}

async function loadViaImageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Não foi possível decodificar a imagem."));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Main thread side: decodes the image with stable DOM APIs and returns
 * transferable RGBA pixels. Releases the bitmap and shrinks the canvas after use.
 */
export async function decodeImageToRgba(blob: Blob): Promise<RgbaImage> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let bitmap: ImageBitmap | null = null;
  if (typeof createImageBitmap === "function") {
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      bitmap = null;
    }
  }
  if (bitmap) {
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } else {
    const img = await loadViaImageElement(blob);
    source = img;
    width = img.naturalWidth;
    height = img.naturalHeight;
  }
  const canvas = document.createElement("canvas");
  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Não foi possível criar o canvas 2D do OCR.");
    context.drawImage(source, 0, 0);
    const data = context.getImageData(0, 0, width, height).data;
    return { pixels: data.buffer as ArrayBuffer, width, height };
  } finally {
    bitmap?.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
