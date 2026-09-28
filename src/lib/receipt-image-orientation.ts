import * as ort from "onnxruntime-web";
import { configureOrtWasm } from "@/lib/ocr-runtime";

export type DocumentOrientation = 0 | 90 | 180 | 270;

export interface DocumentOrientationResult {
  scores: Record<DocumentOrientation, number>;
  first: { orientation: DocumentOrientation; score: number };
  second: { orientation: DocumentOrientation; score: number };
  margin: number;
  modelInitializationMs: number;
  inferenceMs: number;
  sourceDimensions: { width: number; height: number };
  resizedDimensions: { width: number; height: number };
  preprocessingDimensions: { width: 224; height: 224 };
  automaticRotationEnabled: true;
  decision:
    | "no-rotation"
    | "rotate-90-clockwise"
    | "rotate-270-clockwise"
    | "abstain-180"
    | "abstain-low-confidence";
}

type CachedSession = {
  session: ort.InferenceSession;
  initializationMs: number;
};

const MODEL_URL = "/models/PP-LCNet_x1_0_doc_ori/inference.onnx";
const LABELS: DocumentOrientation[] = [0, 90, 180, 270];
const RESIZE_SHORT_EDGE = 256;
const CROP_SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const ROTATED_IMAGE_QUALITY = 0.92;

export const DOCUMENT_ORIENTATION_AUTO_ROTATION_ENABLED = true;
export const DOCUMENT_ORIENTATION_CONFIDENCE_THRESHOLD = 0.90;
export const DOCUMENT_ORIENTATION_MARGIN_THRESHOLD = 0.80;
export const DOCUMENT_ORIENTATION_TIMEOUT_MS = 30_000;

let sessionPromise: Promise<CachedSession> | null = null;
let unavailableError: Error | null = null;

async function createSession(): Promise<CachedSession> {
  configureOrtWasm();
  const start = performance.now();
  const session = await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  return { session, initializationMs: performance.now() - start };
}

async function getSession(): Promise<CachedSession> {
  if (unavailableError) throw unavailableError;
  if (!sessionPromise) {
    sessionPromise = createSession().catch((error: unknown) => {
      unavailableError = error instanceof Error ? error : new Error(String(error));
      throw unavailableError;
    });
  }
  return sessionPromise;
}

function calculateResize(width: number, height: number) {
  const scale = RESIZE_SHORT_EDGE / Math.min(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function decideOrientationCorrection(
  first: DocumentOrientationResult["first"],
  margin: number,
): DocumentOrientationResult["decision"] {
  if (
    first.score < DOCUMENT_ORIENTATION_CONFIDENCE_THRESHOLD
    || margin < DOCUMENT_ORIENTATION_MARGIN_THRESHOLD
  ) {
    return "abstain-low-confidence";
  }
  if (first.orientation === 90) return "rotate-270-clockwise";
  if (first.orientation === 270) return "rotate-90-clockwise";
  if (first.orientation === 180) return "abstain-180";
  return "no-rotation";
}

async function imageToTensor(image: Blob) {
  const bitmap = await createImageBitmap(image);
  const resized = calculateResize(bitmap.width, bitmap.height);
  const resizedCanvas = document.createElement("canvas");
  const cropCanvas = document.createElement("canvas");
  resizedCanvas.width = resized.width;
  resizedCanvas.height = resized.height;
  cropCanvas.width = CROP_SIZE;
  cropCanvas.height = CROP_SIZE;

  try {
    const resizedContext = resizedCanvas.getContext("2d", { alpha: false });
    const cropContext = cropCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!resizedContext || !cropContext) throw new Error("canvas unavailable for orientation classification");

    resizedContext.drawImage(bitmap, 0, 0, resized.width, resized.height);
    const cropX = Math.floor((resized.width - CROP_SIZE) / 2);
    const cropY = Math.floor((resized.height - CROP_SIZE) / 2);
    cropContext.drawImage(
      resizedCanvas,
      cropX,
      cropY,
      CROP_SIZE,
      CROP_SIZE,
      0,
      0,
      CROP_SIZE,
      CROP_SIZE,
    );

    const rgba = cropContext.getImageData(0, 0, CROP_SIZE, CROP_SIZE).data;
    const planeSize = CROP_SIZE * CROP_SIZE;
    const chw = new Float32Array(planeSize * 3);
    for (let pixel = 0; pixel < planeSize; pixel++) {
      const rgbaOffset = pixel * 4;
      chw[pixel] = (rgba[rgbaOffset] / 255 - MEAN[0]) / STD[0];
      chw[pixel + planeSize] = (rgba[rgbaOffset + 1] / 255 - MEAN[1]) / STD[1];
      chw[pixel + planeSize * 2] = (rgba[rgbaOffset + 2] / 255 - MEAN[2]) / STD[2];
    }

    return {
      tensor: new ort.Tensor("float32", chw, [1, 3, CROP_SIZE, CROP_SIZE]),
      sourceDimensions: { width: bitmap.width, height: bitmap.height },
      resizedDimensions: resized,
    };
  } finally {
    bitmap.close?.();
    resizedCanvas.width = 0;
    resizedCanvas.height = 0;
    cropCanvas.width = 0;
    cropCanvas.height = 0;
  }
}

export async function classifyDocumentOrientation(image: Blob): Promise<DocumentOrientationResult> {
  const cached = await getSession();
  const prepared = await imageToTensor(image);
  const inputName = cached.session.inputNames[0];
  const outputName = cached.session.outputNames[0];
  if (!inputName || !outputName) throw new Error("orientation model has an invalid input/output contract");

  const start = performance.now();
  const outputs = await cached.session.run({ [inputName]: prepared.tensor });
  const inferenceMs = performance.now() - start;
  const output = outputs[outputName];
  if (!output || output.data.length !== LABELS.length) {
    throw new Error("orientation model must return exactly four scores");
  }

  const values = Array.from(output.data, Number);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("orientation model returned a non-finite score");
  }
  const ranked = LABELS.map((orientation, index) => ({ orientation, score: values[index] }))
    .sort((a, b) => b.score - a.score);
  const [first, second] = ranked;
  const margin = first.score - second.score;

  return {
    scores: { 0: values[0], 90: values[1], 180: values[2], 270: values[3] },
    first,
    second,
    margin,
    modelInitializationMs: cached.initializationMs,
    inferenceMs,
    sourceDimensions: prepared.sourceDimensions,
    resizedDimensions: prepared.resizedDimensions,
    preprocessingDimensions: { width: 224, height: 224 },
    automaticRotationEnabled: DOCUMENT_ORIENTATION_AUTO_ROTATION_ENABLED,
    decision: decideOrientationCorrection(first, margin),
  };
}

async function classifyWithTimeout(image: Blob): Promise<DocumentOrientationResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      classifyDocumentOrientation(image),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`orientation classification timed out after ${DOCUMENT_ORIENTATION_TIMEOUT_MS}ms`)),
          DOCUMENT_ORIENTATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function rotateImageClockwise(image: File, degrees: 90 | 270): Promise<File> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;

  try {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("canvas unavailable for document orientation correction");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(degrees * Math.PI / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("failed to encode corrected document image")),
        "image/jpeg",
        ROTATED_IMAGE_QUALITY,
      );
    });
    const name = image.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: image.lastModified });
  } finally {
    bitmap.close?.();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function correctDocumentOrientation(image: File): Promise<File> {
  try {
    const result = await classifyWithTimeout(image);
    if (result.decision === "rotate-90-clockwise") return rotateImageClockwise(image, 90);
    if (result.decision === "rotate-270-clockwise") return rotateImageClockwise(image, 270);
    return image;
  } catch (error) {
    console.warn("[receipt-orientation] classifier unavailable; continuing without content rotation", error);
    return image;
  }
}
