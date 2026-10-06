import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImageFile, type ImageNormalizationReport } from "@/lib/image-compression";

const ocrOptions = { maxWidth: 1280, maxHeight: 2400, quality: 0.92 };

type DrawCall = {
  sourceWidth: number | null;
  sourceHeight: number | null;
  drawWidth: number;
  drawHeight: number;
};

type CanvasRecord = {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
};

function makeJpeg(width: number, height: number, byteSize = 500 * 1024, orientation?: number, type = "image/jpeg") {
  const bytes: number[] = [0xff, 0xd8];

  if (orientation) {
    const exif = [
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00,
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ];
    const length = exif.length + 2;
    bytes.push(0xff, 0xe1, length >> 8, length & 0xff, ...exif);
  }

  bytes.push(
    0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 0xff,
    width >> 8, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  );

  const data = new Uint8Array(Math.max(byteSize, bytes.length));
  data.set(bytes);
  const file = new File([data], "receipt.jpg", { type });
  Object.defineProperty(file, "slice", {
    value: (start = 0, end = data.length, contentType = "") => {
      const slice = data.slice(start, end);
      const blob = new Blob([slice], { type: contentType });
      Object.defineProperty(blob, "arrayBuffer", {
        value: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
      });
      return blob;
    },
  });
  return file;
}

function installRecordingCanvasMock(result: Blob | null = new Blob(["compressed"])) {
  const draws: DrawCall[] = [];
  const transforms: number[][] = [];
  const canvases: HTMLCanvasElement[] = [];
  const contexts: CanvasRecord[] = [];
  const encodedSizes: Array<{ width: number; height: number; quality: number | undefined }> = [];

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push(this as HTMLCanvasElement);
    const context: CanvasRecord & {
      drawImage: (source: { width?: number; height?: number }, dx: number, dy: number, dw?: number, dh?: number) => void;
      transform: (...args: number[]) => void;
    } = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      drawImage: (source, _dx, _dy, dw, dh) => {
        draws.push({
          sourceWidth: typeof source?.width === "number" ? source.width : null,
          sourceHeight: typeof source?.height === "number" ? source.height : null,
          drawWidth: dw ?? 0,
          drawHeight: dh ?? 0,
        });
      },
      transform: (...args) => transforms.push(args),
    };
    contexts.push(context);
    return context as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback, _type, quality) {
    encodedSizes.push({ width: this.width, height: this.height, quality });
    callback(result);
  });

  return { canvases, contexts, draws, transforms, encodedSizes };
}

function installBitmapMock(sourceWidth: number, sourceHeight: number, events: string[] = []) {
  const close = vi.fn(() => events.push("close"));
  const create = vi.fn(async (_source: Blob, options?: ImageBitmapOptions) => ({
    width: options?.resizeWidth ?? sourceWidth,
    height: options?.resizeHeight ?? sourceHeight,
    close,
  }) as unknown as ImageBitmap);
  vi.stubGlobal("createImageBitmap", create);
  return { close, create };
}

async function compressAndReport(file: File, opts: Record<string, unknown> = {}) {
  const reports: ImageNormalizationReport[] = [];
  const output = await compressImageFile(file, {
    ...ocrOptions,
    ...opts,
    onNormalization: (report: ImageNormalizationReport) => reports.push(report),
  });
  return { output, report: reports[0] ?? null, reportCount: reports.length };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("progressive OCR normalization", () => {
  it("halves a metadata-less camera photo down to the OCR bounds instead of one aggressive draw", async () => {
    const file = makeJpeg(3024, 4032, 500 * 1024, undefined, "image/heic");
    const { create, close } = installBitmapMock(3024, 4032);
    const { draws, contexts, encodedSizes, canvases } = installRecordingCanvasMock();

    const { output, report, reportCount } = await compressAndReport(file, { progressiveDownscale: true });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(file);
    expect(draws).toEqual([
      { sourceWidth: 3024, sourceHeight: 4032, drawWidth: 1512, drawHeight: 2016 },
      { sourceWidth: 1512, sourceHeight: 2016, drawWidth: 1280, drawHeight: 1707 },
    ]);
    expect(encodedSizes).toEqual([{ width: 1280, height: 1707, quality: 0.92 }]);
    expect(reportCount).toBe(1);
    expect(report).toEqual({
      strategy: "progressive-downscale",
      downscaleSteps: 2,
      decodeMode: "full-decode",
      sourceDimensions: { width: 3024, height: 4032 },
      targetDimensions: { width: 1280, height: 1707 },
    });
    expect(contexts.every((context) => context.imageSmoothingEnabled)).toBe(true);
    expect(contexts.every((context) => context.imageSmoothingQuality === "high")).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(canvases.map((canvas) => canvas.width)).toEqual([0, 0]);
    expect(output.type).toBe("image/jpeg");
    expect(output).not.toBe(file);
  });

  it("uses a single high-quality step for a photo that is only moderately larger than the bounds", async () => {
    const file = makeJpeg(1500, 2000, 500 * 1024, undefined, "image/heic");
    installBitmapMock(1500, 2000);
    const { draws, encodedSizes, contexts } = installRecordingCanvasMock();

    const { report } = await compressAndReport(file, { progressiveDownscale: true });

    expect(draws).toEqual([
      { sourceWidth: 1500, sourceHeight: 2000, drawWidth: 1280, drawHeight: 1707 },
    ]);
    expect(encodedSizes).toEqual([{ width: 1280, height: 1707, quality: 0.92 }]);
    expect(report).toEqual({
      strategy: "single-downscale",
      downscaleSteps: 1,
      decodeMode: "full-decode",
      sourceDimensions: { width: 1500, height: 2000 },
      targetDimensions: { width: 1280, height: 1707 },
    });
    expect(contexts.every((context) => context.imageSmoothingQuality === "high")).toBe(true);
  });

  it("never upscales an image that already fits the OCR bounds", async () => {
    const file = makeJpeg(1000, 1400, 500 * 1024, undefined, "image/heic");
    installBitmapMock(1000, 1400);
    const { draws, encodedSizes } = installRecordingCanvasMock();

    const { report } = await compressAndReport(file, { progressiveDownscale: true });

    expect(draws).toEqual([
      { sourceWidth: 1000, sourceHeight: 1400, drawWidth: 1000, drawHeight: 1400 },
    ]);
    expect(encodedSizes).toEqual([{ width: 1000, height: 1400, quality: 0.92 }]);
    expect(report).toEqual({
      strategy: "original",
      downscaleSteps: 0,
      decodeMode: "full-decode",
      sourceDimensions: { width: 1000, height: 1400 },
      targetDimensions: { width: 1000, height: 1400 },
    });
  });

  it("keeps the previous single-draw behavior when progressive downscale is off", async () => {
    const file = makeJpeg(3024, 4032, 500 * 1024, undefined, "image/heic");
    installBitmapMock(3024, 4032);
    const { draws, canvases, contexts } = installRecordingCanvasMock();

    const { report } = await compressAndReport(file);

    expect(canvases).toHaveLength(1);
    expect(draws).toEqual([
      { sourceWidth: 3024, sourceHeight: 4032, drawWidth: 1280, drawHeight: 1707 },
    ]);
    expect(contexts.every((context) => context.imageSmoothingQuality === "low")).toBe(true);
    expect(report).toEqual({
      strategy: "single-downscale",
      downscaleSteps: 1,
      decodeMode: "full-decode",
      sourceDimensions: { width: 3024, height: 4032 },
      targetDimensions: { width: 1280, height: 1707 },
    });
  });

  it("returns a small JPEG inside the bounds untouched and reports it as original", async () => {
    const file = makeJpeg(1000, 1400, 1000);
    const { create } = installBitmapMock(1000, 1400);
    const { encodedSizes } = installRecordingCanvasMock();

    const { output, report } = await compressAndReport(file, { progressiveDownscale: true });

    expect(output).toBe(file);
    expect(create).not.toHaveBeenCalled();
    expect(encodedSizes).toHaveLength(0);
    expect(report).toEqual({
      strategy: "original",
      downscaleSteps: 0,
      decodeMode: "skipped",
      sourceDimensions: { width: 1000, height: 1400 },
      targetDimensions: { width: 1000, height: 1400 },
    });
  });

  it("preserves the EXIF rotation while the reduction chain runs in raw pixel space", async () => {
    const file = makeJpeg(4032, 3024, 500 * 1024, 6);
    const close = vi.fn();
    const create = vi.fn()
      .mockRejectedValueOnce(new TypeError("resize options unsupported"))
      .mockImplementation(async () => ({ width: 4032, height: 3024, close }) as unknown as ImageBitmap);
    vi.stubGlobal("createImageBitmap", create);
    const { draws, transforms, encodedSizes } = installRecordingCanvasMock();

    const { report } = await compressAndReport(file, { progressiveDownscale: true });

    expect(transforms).toEqual([[0, 1, -1, 0, 1280, 0]]);
    expect(transforms).toHaveLength(1);
    expect(draws).toEqual([
      { sourceWidth: 4032, sourceHeight: 3024, drawWidth: 2016, drawHeight: 1512 },
      { sourceWidth: 2016, sourceHeight: 1512, drawWidth: 1707, drawHeight: 1280 },
    ]);
    expect(encodedSizes).toEqual([{ width: 1280, height: 1707, quality: 0.92 }]);
    expect(report).toEqual({
      strategy: "progressive-downscale",
      downscaleSteps: 2,
      decodeMode: "full-decode",
      sourceDimensions: { width: 3024, height: 4032 },
      targetDimensions: { width: 1280, height: 1707 },
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("caps the chain at three intermediate surfaces for a very large photo and releases them", async () => {
    const file = makeJpeg(12000, 16000, 500 * 1024, undefined, "image/heic");
    installBitmapMock(12000, 16000);
    const { draws, canvases, contexts, encodedSizes } = installRecordingCanvasMock();

    const { report } = await compressAndReport(file, { progressiveDownscale: true });

    expect(draws).toEqual([
      { sourceWidth: 12000, sourceHeight: 16000, drawWidth: 6000, drawHeight: 8000 },
      { sourceWidth: 6000, sourceHeight: 8000, drawWidth: 3000, drawHeight: 4000 },
      { sourceWidth: 3000, sourceHeight: 4000, drawWidth: 1500, drawHeight: 2000 },
      { sourceWidth: 1500, sourceHeight: 2000, drawWidth: 1280, drawHeight: 1707 },
    ]);
    expect(canvases).toHaveLength(contexts.length);
    expect(canvases).toHaveLength(4);
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(encodedSizes).toEqual([{ width: 1280, height: 1707, quality: 0.92 }]);
    expect(report?.strategy).toBe("progressive-downscale");
    expect(report?.downscaleSteps).toBe(4);
  });

  it("reports the same normalization for repeated runs of the same photo", async () => {
    const file = makeJpeg(3024, 4032, 500 * 1024, undefined, "image/heic");
    installBitmapMock(3024, 4032);
    installRecordingCanvasMock();

    const first = await compressAndReport(file, { progressiveDownscale: true });
    const second = await compressAndReport(file, { progressiveDownscale: true });

    expect(first.report).toEqual(second.report);
    expect(first.output.size).toBe(second.output.size);
  });
});
