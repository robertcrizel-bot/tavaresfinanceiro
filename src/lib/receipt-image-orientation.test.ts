import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ortMocks = vi.hoisted(() => {
  const run = vi.fn();
  const create = vi.fn(async () => ({
    inputNames: ["x"],
    outputNames: ["output"],
    run,
  }));
  class Tensor {
    constructor(
      public type: string,
      public data: Float32Array,
      public dims: number[],
    ) {}
  }
  return { create, run, Tensor, env: { wasm: {} as Record<string, unknown> } };
});

vi.mock("onnxruntime-web", () => ({
  env: ortMocks.env,
  InferenceSession: { create: ortMocks.create },
  Tensor: ortMocks.Tensor,
}));

function installImageMocks() {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1536, height: 1157, close })));
  const drawImage = vi.fn();
  const translate = vi.fn();
  const rotate = vi.fn();
  const pixels = new Uint8ClampedArray(224 * 224 * 4).fill(255);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
    drawImage,
    translate,
    rotate,
    getImageData: () => ({ data: pixels }),
  }) as unknown as CanvasRenderingContext2D);
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["rotated"], { type: "image/jpeg" }));
  });
  return { close, drawImage, translate, rotate, toBlob };
}

beforeEach(() => {
  ortMocks.create.mockClear();
  ortMocks.run.mockReset();
  ortMocks.run.mockResolvedValue({ output: { data: new Float32Array([0.03, 0.92, 0.01, 0.04]) } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("document orientation classification", () => {
  it("returns all raw scores and the calibrated correction decision", async () => {
    const { close, drawImage } = installImageMocks();
    const {
      classifyDocumentOrientation,
      DOCUMENT_ORIENTATION_AUTO_ROTATION_ENABLED,
    } = await import("@/lib/receipt-image-orientation");

    const result = await classifyDocumentOrientation(new Blob(["jpeg"], { type: "image/jpeg" }));

    expect(DOCUMENT_ORIENTATION_AUTO_ROTATION_ENABLED).toBe(true);
    expect(result.scores[0]).toBeCloseTo(0.03);
    expect(result.scores[90]).toBeCloseTo(0.92);
    expect(result.scores[180]).toBeCloseTo(0.01);
    expect(result.scores[270]).toBeCloseTo(0.04);
    expect(result.first.orientation).toBe(90);
    expect(result.second.orientation).toBe(270);
    expect(result.margin).toBeCloseTo(0.88);
    expect(result.sourceDimensions).toEqual({ width: 1536, height: 1157 });
    expect(result.resizedDimensions).toEqual({ width: 340, height: 256 });
    expect(result.preprocessingDimensions).toEqual({ width: 224, height: 224 });
    expect(result.decision).toBe("rotate-270-clockwise");
    expect(result.automaticRotationEnabled).toBe(true);
    expect(ortMocks.create).toHaveBeenCalledTimes(1);
    expect(ortMocks.run).toHaveBeenCalledWith(expect.objectContaining({
      x: expect.objectContaining({ dims: [1, 3, 224, 224] }),
    }));
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "0 degrees with strong confidence",
      scores: [0.95, 0.02, 0.02, 0.01],
      decision: "no-rotation",
      expectedRotation: null,
    },
    {
      name: "90 degrees with strong confidence",
      scores: [0.02, 0.95, 0.01, 0.02],
      decision: "rotate-270-clockwise",
      expectedRotation: 3 * Math.PI / 2,
    },
    {
      name: "270 degrees with strong confidence",
      scores: [0.02, 0.01, 0.02, 0.95],
      decision: "rotate-90-clockwise",
      expectedRotation: Math.PI / 2,
    },
    {
      name: "180 degrees with strong confidence",
      scores: [0.01, 0.02, 0.96, 0.01],
      decision: "abstain-180",
      expectedRotation: null,
    },
    {
      name: "confidence below 0.90",
      scores: [0.04, 0.89, 0.03, 0.04],
      decision: "abstain-low-confidence",
      expectedRotation: null,
    },
    {
      name: "margin below 0.80",
      scores: [0.00, 0.91, 0.00, 0.12],
      decision: "abstain-low-confidence",
      expectedRotation: null,
    },
  ])("applies the conservative rule for $name", async ({ scores, decision, expectedRotation }) => {
    const { drawImage, translate, rotate, toBlob } = installImageMocks();
    ortMocks.run.mockResolvedValue({ output: { data: new Float32Array(scores) } });
    const {
      classifyDocumentOrientation,
      correctDocumentOrientation,
    } = await import("@/lib/receipt-image-orientation");
    const image = new File(["jpeg"], "receipt.jpg", { type: "image/jpeg" });

    const classification = await classifyDocumentOrientation(image);
    const corrected = await correctDocumentOrientation(image);

    expect(classification.decision).toBe(decision);
    if (expectedRotation === null) {
      expect(corrected).toBe(image);
      expect(rotate).not.toHaveBeenCalled();
      expect(toBlob).not.toHaveBeenCalled();
    } else {
      expect(corrected).not.toBe(image);
      expect(corrected.type).toBe("image/jpeg");
      expect(translate).toHaveBeenCalledWith(1157 / 2, 1536 / 2);
      expect(rotate).toHaveBeenCalledWith(expectedRotation);
      expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), -1536 / 2, -1157 / 2);
      expect(toBlob).toHaveBeenCalledTimes(1);
    }
  });

  it("fails open with the current working image when inference fails", async () => {
    installImageMocks();
    ortMocks.run.mockRejectedValueOnce(new Error("inference failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { correctDocumentOrientation } = await import("@/lib/receipt-image-orientation");
    const image = new File(["jpeg"], "receipt.jpg", { type: "image/jpeg" });

    await expect(correctDocumentOrientation(image)).resolves.toBe(image);
    expect(warn).toHaveBeenCalled();
  });

  it("fails open with the current working image when classification times out", async () => {
    vi.useFakeTimers();
    installImageMocks();
    ortMocks.run.mockImplementationOnce(() => new Promise(() => undefined));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const {
      correctDocumentOrientation,
      DOCUMENT_ORIENTATION_TIMEOUT_MS,
    } = await import("@/lib/receipt-image-orientation");
    const image = new File(["jpeg"], "receipt.jpg", { type: "image/jpeg" });

    const correction = correctDocumentOrientation(image);
    await vi.advanceTimersByTimeAsync(DOCUMENT_ORIENTATION_TIMEOUT_MS);

    await expect(correction).resolves.toBe(image);
    expect(warn).toHaveBeenCalled();
  });
});
