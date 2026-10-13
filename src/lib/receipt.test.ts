import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compressImageFile: vi.fn(),
  inspectJpegOrientation: vi.fn(),
  correctDocumentOrientation: vi.fn(),
  functionsInvoke: vi.fn(),
}));

vi.mock("@/lib/image-compression", () => ({
  compressImageFile: mocks.compressImageFile,
  inspectJpegOrientation: mocks.inspectJpegOrientation,
  isDocumentOrientationClassificationEligible: (inspection: { status: string; orientation?: number }) =>
    inspection.status === "absent" || (inspection.status === "present" && inspection.orientation === 1),
}));

vi.mock("@/lib/receipt-image-orientation", () => ({
  correctDocumentOrientation: mocks.correctDocumentOrientation,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.functionsInvoke } },
}));

beforeEach(() => {
  mocks.compressImageFile.mockReset();
  mocks.inspectJpegOrientation.mockReset();
  mocks.correctDocumentOrientation.mockReset();
  mocks.correctDocumentOrientation.mockImplementation(async (image: File) => image);
  mocks.functionsInvoke.mockReset();
});

describe("receiptToImageDataUrl orientation correction", () => {
  it.each([
    { status: "absent", width: 1536, height: 1157 },
    { status: "present", orientation: 1, width: 1536, height: 1157 },
  ])("classifies an eligible JPEG after compression and uses the corrected working image", async (inspection) => {
    const original = new File(["original"], "receipt.jpg", { type: "image/jpeg" });
    const compressed = new File(["compressed"], "receipt.jpg", { type: "image/jpeg" });
    const corrected = new File(["corrected"], "receipt.jpg", { type: "image/jpeg" });
    mocks.inspectJpegOrientation.mockResolvedValue(inspection);
    mocks.compressImageFile.mockResolvedValue(compressed);
    mocks.correctDocumentOrientation.mockResolvedValue(corrected);
    const { receiptToImageDataUrl } = await import("@/lib/receipt");

    const dataUrl = await receiptToImageDataUrl(original);

    expect(mocks.correctDocumentOrientation).toHaveBeenCalledTimes(1);
    expect(mocks.correctDocumentOrientation).toHaveBeenCalledWith(compressed);
    expect(dataUrl).toBe("data:image/jpeg;base64,Y29ycmVjdGVk");
  });

  it.each([2, 3, 4, 5, 6, 7, 8])("does not classify EXIF orientation %i", async (orientation) => {
    const original = new File(["original"], "receipt.jpg", { type: "image/jpeg" });
    const compressed = new File(["compressed"], "receipt.jpg", { type: "image/jpeg" });
    mocks.inspectJpegOrientation.mockResolvedValue({ status: "present", orientation, width: 1200, height: 800 });
    mocks.compressImageFile.mockResolvedValue(compressed);
    const { receiptToImageDataUrl } = await import("@/lib/receipt");

    await receiptToImageDataUrl(original);

    expect(mocks.correctDocumentOrientation).not.toHaveBeenCalled();
  });

  it("does not classify an inconclusive JPEG", async () => {
    const original = new File(["original"], "receipt.jpg", { type: "image/jpeg" });
    mocks.inspectJpegOrientation.mockResolvedValue({ status: "unknown", reason: "malformed-exif" });
    mocks.compressImageFile.mockResolvedValue(original);
    const { receiptToImageDataUrl } = await import("@/lib/receipt");

    await receiptToImageDataUrl(original);

    expect(mocks.correctDocumentOrientation).not.toHaveBeenCalled();
  });
});

describe("prepareReceiptForLocalOcr", () => {
  it("caps the free OCR image and reports decoded-memory estimates without creating a data URL", async () => {
    const original = new File(["original"], "receipt.jpg", { type: "image/jpeg" });
    const compressed = new File(["compressed"], "receipt.jpg", { type: "image/jpeg" });
    mocks.inspectJpegOrientation
      .mockResolvedValueOnce({ status: "absent", width: 3000, height: 12000 })
      .mockResolvedValueOnce({ status: "absent", width: 600, height: 2400 });
    mocks.compressImageFile.mockResolvedValue(compressed);

    const { prepareReceiptForLocalOcr } = await import("@/lib/receipt");
    const prepared = await prepareReceiptForLocalOcr(original);

    expect(mocks.compressImageFile).toHaveBeenCalledWith(original, {
      maxWidth: 1280,
      maxHeight: 2400,
      quality: 0.92,
      requireDecodeResize: true,
      preferBoundedOutput: true,
      progressiveDownscale: true,
      onNormalization: expect.any(Function),
    });
    expect(mocks.correctDocumentOrientation).toHaveBeenCalledWith(compressed);
    expect(prepared.image).toBe(compressed);
    expect(prepared.metrics).toEqual(expect.objectContaining({
      originalDimensions: { width: 3000, height: 12000 },
      outputDimensions: { width: 600, height: 2400 },
      originalPixels: 36_000_000,
      outputPixels: 1_440_000,
      largestRgbaSurfaceBytes: 5_760_000,
      estimatedOrientationPeakRgbaBytes: 17_280_000,
      normalization: null,
    }));
  });

  it("exposes the normalization strategy reported by the compressor", async () => {
    const original = new File(["original"], "receipt.jpg", { type: "image/jpeg" });
    const compressed = new File(["compressed"], "receipt.jpg", { type: "image/jpeg" });
    mocks.inspectJpegOrientation
      .mockResolvedValueOnce({ status: "absent", width: 3024, height: 4032 })
      .mockResolvedValueOnce({ status: "absent", width: 1280, height: 1707 });
    mocks.compressImageFile.mockImplementation(async (_file: File, opts: {
      onNormalization?: (report: unknown) => void;
    }) => {
      opts.onNormalization?.({
        strategy: "progressive-downscale",
        downscaleSteps: 2,
        decodeMode: "full-decode",
        sourceDimensions: { width: 3024, height: 4032 },
        targetDimensions: { width: 1280, height: 1707 },
      });
      return compressed;
    });

    const { prepareReceiptForLocalOcr } = await import("@/lib/receipt");
    const prepared = await prepareReceiptForLocalOcr(original);

    expect(prepared.metrics.normalization).toEqual({
      strategy: "progressive-downscale",
      downscaleSteps: 2,
      decodeMode: "full-decode",
      sourceDimensions: { width: 3024, height: 4032 },
      targetDimensions: { width: 1280, height: 1707 },
    });
  });

  it("returns the safe-device message when bounded decoding is unavailable", async () => {
    const original = new File(["original"], "receipt.jpg", { type: "image/jpeg" });
    mocks.inspectJpegOrientation.mockResolvedValue({ status: "absent", width: 3000, height: 12000 });
    mocks.compressImageFile.mockRejectedValue(new TypeError("resize options unsupported"));
    const { prepareReceiptForLocalOcr } = await import("@/lib/receipt");

    await expect(prepareReceiptForLocalOcr(original)).rejects.toThrow(
      "Não foi possível concluir a leitura gratuita neste aparelho. Você pode tentar novamente ou usar a leitura com IA.",
    );
    expect(mocks.correctDocumentOrientation).not.toHaveBeenCalled();
  });
});

function stubImagePipeline() {
  mocks.inspectJpegOrientation.mockResolvedValue({ status: "absent", width: 100, height: 100 });
  mocks.compressImageFile.mockImplementation(async (file: File) => file);
}

describe("parseReceiptFree", () => {
  it("sends the image to the free edge function and returns the parsed receipt", async () => {
    stubImagePipeline();
    const receipt = { is_receipt: true, type: "expense", amount: 42.5 };
    mocks.functionsInvoke.mockResolvedValue({ data: receipt, error: null });
    const { parseReceiptFree } = await import("@/lib/receipt");

    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    const result = await parseReceiptFree(file, { categories: ["Alimenta��o"], accounts: ["Nubank (Banco)"] });

    expect(result).toEqual(receipt);
    expect(mocks.functionsInvoke).toHaveBeenCalledTimes(1);
    const [fn, options] = mocks.functionsInvoke.mock.calls[0];
    expect(fn).toBe("parse-receipt-free");
    expect(options.body.imageDataUrl).toMatch(/^data:image\//);
    expect(options.body.categories).toEqual(["Alimenta��o"]);
    expect(options.body.accounts).toEqual(["Nubank (Banco)"]);
  });

  it("surfaces the backend error message (quota, auth, config)", async () => {
    stubImagePipeline();
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ error: "A cota gratuita de IA foi atingida no momento." }) } },
    });
    const { parseReceiptFree } = await import("@/lib/receipt");

    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    await expect(parseReceiptFree(file, { categories: [], accounts: [] })).rejects.toThrow(
      "A cota gratuita de IA foi atingida no momento.",
    );
  });

  it("throws error payloads returned inside a 2xx body", async () => {
    stubImagePipeline();
    mocks.functionsInvoke.mockResolvedValue({ data: { error: "Imagem inv�lida." }, error: null });
    const { parseReceiptFree } = await import("@/lib/receipt");

    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    await expect(parseReceiptFree(file, { categories: [], accounts: [] })).rejects.toThrow("Imagem inv�lida.");
  });
});

describe("getFreeAiStatus", () => {
  it("reports available only when the backend confirms the integration", async () => {
    mocks.functionsInvoke.mockResolvedValue({ data: { available: true }, error: null });
    const { getFreeAiStatus } = await import("@/lib/receipt");
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "available" });
    expect(mocks.functionsInvoke).toHaveBeenCalledWith("parse-receipt-free", { method: "GET" });
  });

  it("reports unavailable when the backend says the integration is not configured", async () => {
    const { getFreeAiStatus } = await import("@/lib/receipt");
    mocks.functionsInvoke.mockResolvedValue({ data: { available: false }, error: null });
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "unavailable" });
  });

  it("reports unavailable when the function is not deployed (404)", async () => {
    const { getFreeAiStatus } = await import("@/lib/receipt");
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("not found"), { context: { status: 404 } }),
    });
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "unavailable" });
  });

  it("reports an unauthorized error for 401 and 403 responses", async () => {
    const { getFreeAiStatus } = await import("@/lib/receipt");
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("unauthorized"), { context: { status: 401 } }),
    });
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "error", reason: "unauthorized" });
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("forbidden"), { context: { status: 403 } }),
    });
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "error", reason: "unauthorized" });
  });

  it("reports a server error for 5xx responses", async () => {
    const { getFreeAiStatus } = await import("@/lib/receipt");
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("upstream"), { context: { status: 503 } }),
    });
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "error", reason: "server" });
  });

  it("fails closed as a network error when the invocation fails without a response", async () => {
    const { getFreeAiStatus } = await import("@/lib/receipt");
    mocks.functionsInvoke.mockResolvedValue({ data: null, error: new Error("offline") });
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "error", reason: "network" });
    mocks.functionsInvoke.mockRejectedValue(new Error("no session"));
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "error", reason: "network" });
  });
});
