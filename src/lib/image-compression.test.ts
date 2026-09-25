import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateImageDimensions, compressImageFile } from "@/lib/image-compression";

const receiptOptions = { maxWidth: 2000, maxHeight: 6000, quality: 0.92 };
type TransformMatrix = [number, number, number, number, number, number];
type OrientationCase = [number, TransformMatrix | null, number, number, number, number];

const orientationCases: OrientationCase[] = [
  [1, null, 2000, 1500, 2000, 1500],
  [2, [-1, 0, 0, 1, 2000, 0], 2000, 1500, 2000, 1500],
  [3, [-1, 0, 0, -1, 2000, 1500], 2000, 1500, 2000, 1500],
  [4, [1, 0, 0, -1, 0, 1500], 2000, 1500, 2000, 1500],
  [5, [0, 1, 1, 0, 0, 0], 2000, 2667, 2667, 2000],
  [6, [0, 1, -1, 0, 2000, 0], 2000, 2667, 2667, 2000],
  [7, [0, -1, -1, 0, 2000, 2667], 2000, 2667, 2667, 2000],
  [8, [0, -1, 1, 0, 0, 2667], 2000, 2667, 2667, 2000],
];

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function makeJpeg(
  width: number,
  height: number,
  byteSize = 500 * 1024,
  orientation?: number,
  appendXmp = false,
  type = "image/jpeg",
  duplicateOrientation = false,
) {
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
    const segment = [0xff, 0xe1, length >> 8, length & 0xff, ...exif];
    bytes.push(...segment);
    if (duplicateOrientation) bytes.push(...segment);
  }

  if (appendXmp) {
    const xmp = Array.from(new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0<xmp/>"));
    const length = xmp.length + 2;
    bytes.push(0xff, 0xe1, length >> 8, length & 0xff, ...xmp);
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

function installCanvasMock(result: Blob | null = new Blob(["compressed"]), events: string[] = []) {
  const drawImage = vi.fn();
  const transform = vi.fn();
  const canvases: HTMLCanvasElement[] = [];
  const encodedSizes: Array<{ width: number; height: number; quality: number | undefined }> = [];

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    canvases.push(this as HTMLCanvasElement);
    return { drawImage, transform } as unknown as CanvasRenderingContext2D;
  });
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback, _type, quality) {
    events.push("toBlob");
    encodedSizes.push({ width: this.width, height: this.height, quality });
    callback(result);
  });

  return { canvases, drawImage, transform, encodedSizes, toBlob };
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("calculateImageDimensions", () => {
  it("keeps long receipts wide enough for text recognition", () => {
    expect(calculateImageDimensions(3000, 12000, receiptOptions)).toEqual({
      width: 1500,
      height: 6000,
    });
  });

  it("uses the available width for a 3000x4000 camera photo", () => {
    expect(calculateImageDimensions(3000, 4000, receiptOptions)).toEqual({
      width: 2000,
      height: 2667,
    });
  });

  it("preserves the same ratio for a 6000x8000 camera photo", () => {
    expect(calculateImageDimensions(6000, 8000, receiptOptions)).toEqual({
      width: 2000,
      height: 2667,
    });
  });

  it("preserves the default attachment limit", () => {
    expect(calculateImageDimensions(3000, 4000)).toEqual({ width: 768, height: 1024 });
  });
});

describe("compressImageFile", () => {
  it.each([
    [3000, 4000, 2000, 2667],
    [6000, 8000, 2000, 2667],
    [3000, 12000, 1500, 6000],
  ])("requests decode-time resize for a %ix%i JPEG", async (width, height, targetWidth, targetHeight) => {
    const file = makeJpeg(width, height);
    const { create, close } = installBitmapMock(width, height);
    const { drawImage, encodedSizes } = installCanvasMock();

    const output = await compressImageFile(file, receiptOptions);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(file, {
      imageOrientation: "from-image",
      resizeWidth: targetWidth,
      resizeHeight: targetHeight,
      resizeQuality: "high",
    });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, targetWidth, targetHeight);
    expect(encodedSizes).toEqual([{ width: targetWidth, height: targetHeight, quality: 0.92 }]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(output).not.toBe(file);
  });

  it("inspects and resizes a high-resolution JPEG even when it has few bytes", async () => {
    const file = makeJpeg(6000, 8000, 1000);
    const { create } = installBitmapMock(6000, 8000);
    installCanvasMock();

    await compressImageFile(file, receiptOptions);

    expect(create).toHaveBeenCalledWith(file, expect.objectContaining({ resizeWidth: 2000, resizeHeight: 2667 }));
  });

  it("normalizes EXIF orientation when later APP1 metadata is present", async () => {
    const file = makeJpeg(4000, 3000, 500 * 1024, 6, true);
    const { create } = installBitmapMock(4000, 3000);
    const { drawImage, transform } = installCanvasMock();

    await compressImageFile(file, receiptOptions);

    expect(create).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({
      imageOrientation: "none",
      resizeWidth: 2667,
      resizeHeight: 2000,
    }));
    expect(transform).toHaveBeenCalledWith(0, 1, -1, 0, 2000, 0);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2667, 2000);
  });

  it.each(orientationCases)("normalizes EXIF orientation %i exactly once", async (
    orientation,
    matrix,
    canvasWidth,
    canvasHeight,
    drawWidth,
    drawHeight,
  ) => {
    const file = makeJpeg(4000, 3000, 500 * 1024, orientation);
    const { create } = installBitmapMock(4000, 3000);
    const { drawImage, transform, encodedSizes } = installCanvasMock();

    await compressImageFile(file, receiptOptions);

    const [decodeSource, options] = create.mock.calls[0];
    if (orientation === 1) {
      expect(decodeSource).toBe(file);
      expect(options).toEqual({
        imageOrientation: "from-image",
        resizeWidth: 2000,
        resizeHeight: 1500,
        resizeQuality: "high",
      });
      expect(transform).not.toHaveBeenCalled();
    } else {
      expect(decodeSource).not.toBe(file);
      expect(options).toEqual({
        imageOrientation: "none",
        resizeWidth: drawWidth,
        resizeHeight: drawHeight,
        resizeQuality: "high",
      });
      expect(transform).toHaveBeenCalledTimes(1);
      expect(transform).toHaveBeenCalledWith(...matrix);
    }
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, drawWidth, drawHeight);
    expect(encodedSizes).toEqual([{ width: canvasWidth, height: canvasHeight, quality: 0.92 }]);
  });

  it("normalizes a small JPEG with EXIF even when the encoded result is larger", async () => {
    const file = makeJpeg(1200, 800, 1000, 6);
    const { create } = installBitmapMock(1200, 800);
    const largerBlob = new Blob([new Uint8Array(2000)], { type: "image/jpeg" });
    const { transform, encodedSizes } = installCanvasMock(largerBlob);

    const output = await compressImageFile(file, receiptOptions);

    expect(create).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: "none" });
    expect(transform).toHaveBeenCalledWith(0, 1, -1, 0, 800, 0);
    expect(encodedSizes).toEqual([{ width: 800, height: 1200, quality: 0.92 }]);
    expect(output).not.toBe(file);
    expect(output.type).toBe("image/jpeg");
  });

  it.each(["", "application/octet-stream"])(
    "detects and normalizes JPEG bytes declared as %j",
    async (type) => {
      const file = makeJpeg(4000, 3000, 500 * 1024, 8, false, type);
      const { create } = installBitmapMock(4000, 3000);
      const { transform } = installCanvasMock();

      const output = await compressImageFile(file, receiptOptions);

      expect(create).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({
        imageOrientation: "none",
        resizeWidth: 2667,
        resizeHeight: 2000,
      }));
      expect(transform).toHaveBeenCalledWith(0, -1, 1, 0, 0, 2667);
      expect(output).not.toBe(file);
      expect(output.type).toBe("image/jpeg");
    },
  );

  it("detects an undeclared JPEG by signature even when metadata is outside the inspected header", async () => {
    const data = new Uint8Array(600 * 1024);
    data.set([0xff, 0xd8, 0xff, 0xd9]);
    const file = new File([data], "unusual-upload", { type: "application/octet-stream" });
    Object.defineProperty(file, "slice", {
      value: () => ({
        arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      }),
    });
    const { create } = installBitmapMock(1600, 2400);
    installCanvasMock();

    const output = await compressImageFile(file, receiptOptions);

    expect(create).toHaveBeenCalledWith(file);
    expect(output).not.toBe(file);
    expect(output.type).toBe("image/jpeg");
  });

  it("removes every EXIF orientation before decoding to prevent the decoder from rotating twice", async () => {
    const file = makeJpeg(4000, 3000, 500 * 1024, 6, false, "image/jpeg", true);
    const { create } = installBitmapMock(4000, 3000);
    const { transform } = installCanvasMock();

    await compressImageFile(file, receiptOptions);

    const [decodeSource, options] = create.mock.calls[0] as [Blob, ImageBitmapOptions];
    const decodedBytes = new Uint8Array(await readBlob(decodeSource));
    const decodedText = new TextDecoder().decode(decodedBytes);
    expect(decodedText).not.toContain("Exif");
    expect(options.imageOrientation).toBe("none");
    expect(transform).toHaveBeenCalledTimes(1);
  });

  it("closes the bitmap before encoding and always releases the canvas", async () => {
    const events: string[] = [];
    const file = makeJpeg(3000, 4000);
    installBitmapMock(3000, 4000, events);
    const { canvases } = installCanvasMock(new Blob(["compressed"]), events);

    await compressImageFile(file, receiptOptions);

    expect(events).toEqual(["close", "toBlob"]);
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);
  });

  it("falls back to an unbounded bitmap when resize options are unsupported", async () => {
    const file = makeJpeg(3000, 4000);
    const close = vi.fn();
    const create = vi.fn()
      .mockRejectedValueOnce(new TypeError("resize options unsupported"))
      .mockResolvedValueOnce({ width: 3000, height: 4000, close } as unknown as ImageBitmap);
    vi.stubGlobal("createImageBitmap", create);
    const { drawImage } = installCanvasMock();

    await compressImageFile(file, receiptOptions);

    expect(create).toHaveBeenNthCalledWith(1, file, expect.objectContaining({ resizeWidth: 2000, resizeHeight: 2667 }));
    expect(create).toHaveBeenNthCalledWith(2, file);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 2667);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not retry a full-resolution decode after a decoder failure", async () => {
    const file = makeJpeg(6000, 8000);
    const create = vi.fn().mockRejectedValue(new DOMException("decode failed", "EncodingError"));
    vi.stubGlobal("createImageBitmap", create);

    const output = await compressImageFile(file, receiptOptions);

    expect(output).toBe(file);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(file, expect.objectContaining({ resizeWidth: 2000, resizeHeight: 2667 }));
  });

  it("uses Image and revokes its object URL when createImageBitmap is unavailable", async () => {
    const events: string[] = [];
    const file = makeJpeg(3000, 4000);
    vi.stubGlobal("createImageBitmap", undefined);
    const createObjectURL = vi.fn(() => "blob:receipt");
    const revokeObjectURL = vi.fn(() => events.push("revoke"));
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    class MockImage {
      naturalWidth = 3000;
      naturalHeight = 4000;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private source = "";

      set src(value: string) {
        this.source = value;
        if (value) queueMicrotask(() => this.onload?.());
      }

      get src() {
        return this.source;
      }

      removeAttribute(name: string) {
        if (name === "src") {
          this.source = "";
          events.push("clear");
        }
      }
    }
    vi.stubGlobal("Image", MockImage);
    const { drawImage } = installCanvasMock(new Blob(["compressed"]), events);

    await compressImageFile(file, receiptOptions);

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 2667);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:receipt");
    expect(events).toEqual(["clear", "revoke", "toBlob"]);
  });

  it("returns the original file and cleans resources when toBlob returns null", async () => {
    const file = makeJpeg(3000, 4000);
    const { close } = installBitmapMock(3000, 4000);
    const { canvases } = installCanvasMock(null);

    const output = await compressImageFile(file, receiptOptions);

    expect(output).toBe(file);
    expect(close).toHaveBeenCalledTimes(1);
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);
  });

  it("cleans the bitmap and canvas when drawing throws", async () => {
    const file = makeJpeg(3000, 4000);
    const { close } = installBitmapMock(3000, 4000);
    const { canvases, drawImage, toBlob } = installCanvasMock();
    drawImage.mockImplementation(() => {
      throw new Error("draw failed");
    });

    const output = await compressImageFile(file, receiptOptions);

    expect(output).toBe(file);
    expect(close).toHaveBeenCalledTimes(1);
    expect(toBlob).not.toHaveBeenCalled();
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);
  });

  it("does not decode a genuinely small JPEG already within the limits", async () => {
    const file = makeJpeg(1200, 1600, 1000);
    const { create } = installBitmapMock(1200, 1600);

    const output = await compressImageFile(file, receiptOptions);

    expect(output).toBe(file);
    expect(create).not.toHaveBeenCalled();
  });
});
