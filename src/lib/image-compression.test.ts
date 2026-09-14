import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateImageDimensions, compressImageFile } from "@/lib/image-compression";

const receiptOptions = { maxWidth: 2000, maxHeight: 6000, quality: 0.92 };

function makeJpeg(width: number, height: number, byteSize = 500 * 1024, orientation?: number, appendXmp = false) {
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
  const file = new File([data], "receipt.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "slice", {
    value: () => ({
      arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    }),
  });
  return file;
}

function installCanvasMock(result: Blob | null = new Blob(["compressed"]), events: string[] = []) {
  const drawImage = vi.fn();
  const canvases: HTMLCanvasElement[] = [];
  const encodedSizes: Array<{ width: number; height: number; quality: number | undefined }> = [];

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    canvases.push(this as HTMLCanvasElement);
    return { drawImage } as unknown as CanvasRenderingContext2D;
  });
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback, _type, quality) {
    events.push("toBlob");
    encodedSizes.push({ width: this.width, height: this.height, quality });
    callback(result);
  });

  return { canvases, drawImage, encodedSizes, toBlob };
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

  it("keeps EXIF orientation when later APP1 metadata is present", async () => {
    const file = makeJpeg(4000, 3000, 500 * 1024, 6, true);
    const { create } = installBitmapMock(4000, 3000);
    const { drawImage } = installCanvasMock();

    await compressImageFile(file, receiptOptions);

    expect(create).toHaveBeenCalledWith(file, expect.objectContaining({
      imageOrientation: "from-image",
      resizeWidth: 2000,
      resizeHeight: 2667,
    }));
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 2667);
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
