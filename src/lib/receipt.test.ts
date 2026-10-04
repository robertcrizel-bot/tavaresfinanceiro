import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compressImageFile: vi.fn(),
  inspectJpegOrientation: vi.fn(),
  correctDocumentOrientation: vi.fn(),
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

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

beforeEach(() => {
  mocks.compressImageFile.mockReset();
  mocks.inspectJpegOrientation.mockReset();
  mocks.correctDocumentOrientation.mockReset();
  mocks.correctDocumentOrientation.mockImplementation(async (image: File) => image);
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
    }));
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
