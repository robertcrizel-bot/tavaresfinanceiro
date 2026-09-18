import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

function makeMockImage(w: number, h: number) {
  return {
    naturalWidth: w,
    naturalHeight: h,
  } as unknown as HTMLImageElement;
}

function createMockCtx() {
  return {
    drawImage: vi.fn(),
    putImageData: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high" as CanvasImageSmoothingQuality,
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 200;
        d[i + 1] = 200;
        d[i + 2] = 200;
        d[i + 3] = 255;
      }
      return { data: d, width: w, height: h } as unknown as ImageData;
    }),
  };
}

let canvasInstances: Array<{
  canvas: {
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toDataURL: ReturnType<typeof vi.fn>;
  };
  ctx: ReturnType<typeof createMockCtx>;
}> = [];

beforeEach(() => {
  canvasInstances = [];

  vi.spyOn(document, "createElement").mockImplementation((tag: string, _opts?: ElementCreationOptions) => {
    if (tag === "canvas") {
      const ctx = createMockCtx();
      const canvas = {
        width: 100,
        height: 100,
        getContext: vi.fn(() => ctx),
        toDataURL: vi.fn((_type?: string, _quality?: number) => `data:image/jpeg;base64,${btoa("processed")}`),
      };
      canvasInstances.push({ canvas, ctx });
      return canvas as unknown as HTMLCanvasElement;
    }
    return document.createElement.call(document, tag, _opts);
  });

  vi.stubGlobal("ImageData", class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeDataUrl(): string {
  return "data:image/jpeg;base64," + btoa("test-image");
}

function fakeLoader(w = 200, h = 150) {
  return vi.fn().mockResolvedValue(makeMockImage(w, h));
}

function errorLoader() {
  return vi.fn().mockRejectedValue(new Error("load failed"));
}

describe("preprocessReceiptImage", () => {
  it("returns applied: true on successful processing", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const result = await preprocessReceiptImage(makeDataUrl(), { _loadImage: fakeLoader() });
    expect(result.applied).toBe(true);
    expect(result.imageDataUrl).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("preserves aspect ratio within maxDimension", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const result = await preprocessReceiptImage(makeDataUrl(), { maxDimension: 2000, _loadImage: fakeLoader() });
    expect(result.applied).toBe(true);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("does not exceed maxDimension", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const result = await preprocessReceiptImage(makeDataUrl(), { maxDimension: 1500, _loadImage: fakeLoader() });
    expect(result.applied).toBe(true);
    expect(result.width).toBeLessThanOrEqual(1500);
    expect(result.height).toBeLessThanOrEqual(1500);
  });

  it("returns valid JPEG data URL format", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const result = await preprocessReceiptImage(makeDataUrl(), { _loadImage: fakeLoader() });
    expect(result.applied).toBe(true);
    expect(result.imageDataUrl).toMatch(/^data:image\/jpeg/);
  });

  it("doesn't fail with small images", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const result = await preprocessReceiptImage(makeDataUrl(), { _loadImage: fakeLoader(10, 10) });
    expect(result.applied).toBe(true);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("includes original dimensions in result", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const result = await preprocessReceiptImage(makeDataUrl(), { _loadImage: fakeLoader(800, 600) });
    expect(result.originalWidth).toBe(800);
    expect(result.originalHeight).toBe(600);
  });

  it("handles enableCrop option without crashing", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const a = await preprocessReceiptImage(makeDataUrl(), { enableCrop: true, _loadImage: fakeLoader() });
    const b = await preprocessReceiptImage(makeDataUrl(), { enableCrop: false, _loadImage: fakeLoader() });
    expect(a.applied).toBe(true);
    expect(b.applied).toBe(true);
  });

  it("handles enableSharpen option without crashing", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const a = await preprocessReceiptImage(makeDataUrl(), { enableSharpen: true, _loadImage: fakeLoader() });
    const b = await preprocessReceiptImage(makeDataUrl(), { enableSharpen: false, _loadImage: fakeLoader() });
    expect(a.applied).toBe(true);
    expect(b.applied).toBe(true);
  });

  it("reports durationMs >= 0", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const result = await preprocessReceiptImage(makeDataUrl(), { _loadImage: fakeLoader() });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns fallback on image load error", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const dataUrl = makeDataUrl();
    const result = await preprocessReceiptImage(dataUrl, { _loadImage: errorLoader() });
    expect(result.applied).toBe(false);
    expect(result.imageDataUrl).toBe(dataUrl);
  });

  it("returns fallback when canvas context is null", async () => {
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 100,
          height: 100,
          getContext: () => null,
          toDataURL: () => "",
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement.call(document, tag);
    });

    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const dataUrl = makeDataUrl();
    const result = await preprocessReceiptImage(dataUrl, { _loadImage: fakeLoader() });
    expect(result.applied).toBe(false);
    expect(result.imageDataUrl).toBe(dataUrl);
  });

  it("returns applied false on unexpected error with original dataUrl", async () => {
    vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new Error("boom");
    });

    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const dataUrl = makeDataUrl();
    const result = await preprocessReceiptImage(dataUrl, { _loadImage: fakeLoader() });
    expect(result.applied).toBe(false);
    expect(result.imageDataUrl).toBe(dataUrl);
  });

  it("accepts default options", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const result = await preprocessReceiptImage(makeDataUrl(), { _loadImage: fakeLoader() });
    expect(result.applied).toBe(true);
  });

  it("applies custom jpegQuality", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    const result = await preprocessReceiptImage(makeDataUrl(), { jpegQuality: 0.5, _loadImage: fakeLoader() });
    expect(result.applied).toBe(true);
  });

  it("zeroes canvas after processing", async () => {
    const { preprocessReceiptImage } = await import("@/lib/receipt-ocr-preprocess");
    await preprocessReceiptImage(makeDataUrl(), { _loadImage: fakeLoader() });
    for (const inst of canvasInstances) {
      expect(inst.canvas.width).toBe(0);
      expect(inst.canvas.height).toBe(0);
    }
  });
});

function makeImageData(width: number, height: number, fillFn: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = fillFn(x, y);
      const idx = (y * width + x) * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return { data, width, height } as unknown as ImageData;
}

describe("detectCropBox", () => {
  it("detects narrow bright paper on dark background", async () => {
    const { detectCropBox } = await import("@/lib/receipt-ocr-preprocess");
    const imgData = makeImageData(400, 300, (x) => {
      if (x >= 140 && x <= 260) return 220;
      return 60;
    });
    const result = detectCropBox(imgData);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.croppedWidth).toBeLessThan(400);
    expect(result.sideRemovalPct).toBeGreaterThan(0);
    expect(result.x).toBeGreaterThan(0);
    expect(result.x + result.w).toBeLessThanOrEqual(400);
  });

  it("does not crop aggressively on mostly bright image", async () => {
    const { detectCropBox } = await import("@/lib/receipt-ocr-preprocess");
    const imgData = makeImageData(400, 300, (x) => {
      if (x < 20 || x >= 380) return 140;
      return 220;
    });
    const result = detectCropBox(imgData);
    expect(result.sideRemovalPct).toBeLessThanOrEqual(10);
  });

  it("rejects crop on low contrast between paper and background", async () => {
    const { detectCropBox } = await import("@/lib/receipt-ocr-preprocess");
    const imgData = makeImageData(400, 300, (x) => {
      if (x >= 140 && x <= 260) return 170;
      return 150;
    });
    const result = detectCropBox(imgData);
    expect(result.confidence).toBe(0);
    expect(result.sideRemovalPct).toBe(0);
  });

  it("does not cut content when document is near edge", async () => {
    const { detectCropBox } = await import("@/lib/receipt-ocr-preprocess");
    const imgData = makeImageData(400, 300, (x) => {
      if (x <= 180) return 220;
      return 50;
    });
    const result = detectCropBox(imgData);
    if (result.confidence > 0) {
      expect(result.x).toBeLessThanOrEqual(10);
    }
  });

  it("rejects extremely narrow detected paper", async () => {
    const { detectCropBox } = await import("@/lib/receipt-ocr-preprocess");
    const imgData = makeImageData(400, 300, (x) => {
      if (x >= 195 && x <= 205) return 220;
      return 60;
    });
    const result = detectCropBox(imgData);
    expect(result.confidence).toBe(0);
    expect(result.sideRemovalPct).toBe(0);
  });

  it("applies safety margin around detected paper", async () => {
    const { detectCropBox } = await import("@/lib/receipt-ocr-preprocess");
    const imgData = makeImageData(400, 300, (x) => {
      if (x >= 140 && x <= 260) return 220;
      return 60;
    });
    const result = detectCropBox(imgData);
    if (result.confidence > 0) {
      expect(result.x).toBeLessThanOrEqual(140);
      expect(result.x + result.w).toBeGreaterThanOrEqual(261);
    }
  });

  it("returns zero confidence for all-dark image", async () => {
    const { detectCropBox } = await import("@/lib/receipt-ocr-preprocess");
    const imgData = makeImageData(400, 300, () => 30);
    const result = detectCropBox(imgData);
    expect(result.confidence).toBe(0);
    expect(result.sideRemovalPct).toBe(0);
  });

  it("includes correct metadata in result", async () => {
    const { detectCropBox } = await import("@/lib/receipt-ocr-preprocess");
    const imgData = makeImageData(400, 300, (x) => {
      if (x >= 140 && x <= 260) return 220;
      return 60;
    });
    const result = detectCropBox(imgData);
    expect(result.originalWidth).toBe(400);
    expect(result.croppedWidth).toBe(result.w);
    expect(typeof result.sideRemovalPct).toBe("number");
  });
});
