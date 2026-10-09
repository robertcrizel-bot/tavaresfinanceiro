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

export async function imageBufferToPaddleMat(
  image: ArrayBuffer,
  cv: PaddleOpenCv,
): Promise<PaddleMat> {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") {
    throw new Error("PaddleOCR no worker requer createImageBitmap e OffscreenCanvas.");
  }

  const bitmap = await createImageBitmap(new Blob([image], { type: "image/jpeg" }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Não foi possível criar o canvas 2D do OCR.");

    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return cv.matFromArray(imageData.height, imageData.width, cv.CV_8UC4, imageData.data);
  } finally {
    bitmap.close();
  }
}
