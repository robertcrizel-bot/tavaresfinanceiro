import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compressImageFile: vi.fn(),
  inspectJpegOrientation: vi.fn(),
  correctDocumentOrientation: vi.fn(),
  functionsInvoke: vi.fn(),
  getSession: vi.fn(),
  fetch: vi.fn(),
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
  supabase: {
    functions: { invoke: mocks.functionsInvoke },
    auth: { getSession: mocks.getSession },
  },
}));

const SESSION_TOKEN = "supabase-access-token-123";

beforeEach(() => {
  mocks.compressImageFile.mockReset();
  mocks.inspectJpegOrientation.mockReset();
  mocks.correctDocumentOrientation.mockReset();
  mocks.correctDocumentOrientation.mockImplementation(async (image: File) => image);
  mocks.functionsInvoke.mockReset();
  mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: SESSION_TOKEN } }, error: null });
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
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

/** Public URL of the free-reader Worker (also asserted so both flows stay in sync). */
const FREE_AI_WORKER_URL = "https://financecontrol-workers-ai-poc.financecontrol-gemini-free.workers.dev";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastFetchCall(): { url: string; init: RequestInit } {
  const calls = mocks.fetch.mock.calls;
  const [url, init] = calls[calls.length - 1] as unknown as [string, RequestInit];
  return { url, init };
}

describe("parseReceiptFree", () => {
  it("posts the image to the Cloudflare Worker with the session token and returns the parsed receipt", async () => {
    stubImagePipeline();
    const receipt = { is_receipt: true, type: "expense", amount: 42.5 };
    mocks.fetch.mockResolvedValue(jsonResponse(200, receipt));
    const { parseReceiptFree } = await import("@/lib/receipt");

    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    const result = await parseReceiptFree(file, { categories: ["Alimentação"], accounts: ["Nubank (Banco)"] });

    expect(result).toEqual(receipt);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const { url, init } = lastFetchCall();
    expect(url).toBe(`${FREE_AI_WORKER_URL}/`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SESSION_TOKEN}`);
    const body = JSON.parse(String(init.body));
    expect(body.imageDataUrl).toMatch(/^data:image\//);
    expect(body.categories).toEqual(["Alimentação"]);
    expect(body.accounts).toEqual(["Nubank (Banco)"]);
    // The session token only travels in the header, never in the body.
    expect(String(init.body)).not.toContain(SESSION_TOKEN);
  });

  it("refuses to call the worker when there is no Supabase session", async () => {
    stubImagePipeline();
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { parseReceiptFree } = await import("@/lib/receipt");

    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    await expect(parseReceiptFree(file, { categories: [], accounts: [] })).rejects.toThrow(
      "Sessão inválida ou ausente para usar a leitura com IA grátis.",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("surfaces the backend error message (quota, auth, config)", async () => {
    stubImagePipeline();
    mocks.fetch.mockResolvedValue(jsonResponse(429, { error: "A cota gratuita de IA foi atingida no momento." }));
    const { parseReceiptFree } = await import("@/lib/receipt");

    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    await expect(parseReceiptFree(file, { categories: [], accounts: [] })).rejects.toThrow(
      "A cota gratuita de IA foi atingida no momento.",
    );
  });

  it("appends the backend request id (ref) so the failure can be matched to server logs", async () => {
    stubImagePipeline();
    mocks.fetch.mockResolvedValue(
      jsonResponse(503, {
        error: "O serviço gratuito de IA está temporariamente indisponível. Tente novamente.",
        requestId: "ab12cd34",
      }),
    );
    const { parseReceiptFree } = await import("@/lib/receipt");

    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    await expect(parseReceiptFree(file, { categories: [], accounts: [] })).rejects.toThrow(
      "Tente novamente. (ref: ab12cd34)",
    );
  });

  it("throws error payloads returned inside a 2xx body", async () => {
    stubImagePipeline();
    mocks.fetch.mockResolvedValue(jsonResponse(200, { error: "Imagem inválida." }));
    const { parseReceiptFree } = await import("@/lib/receipt");

    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    await expect(parseReceiptFree(file, { categories: [], accounts: [] })).rejects.toThrow("Imagem inválida.");
  });

  it("reports a network failure without leaking anything", async () => {
    stubImagePipeline();
    mocks.fetch.mockRejectedValue(new TypeError("fetch failed"));
    const { parseReceiptFree } = await import("@/lib/receipt");

    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    await expect(parseReceiptFree(file, { categories: [], accounts: [] })).rejects.toThrow(
      "Não foi possível ler o comprovante com IA grátis agora.",
    );
  });

  it("keeps the paid reader on the Supabase Edge Function (free reading never falls back to it)", async () => {
    stubImagePipeline();
    mocks.functionsInvoke.mockResolvedValue({ data: { is_receipt: true }, error: null });
    const { parseReceipt } = await import("@/lib/receipt");

    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    await parseReceipt(file, { categories: [], accounts: [] });

    expect(mocks.functionsInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.functionsInvoke.mock.calls[0][0]).toBe("parse-receipt");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("getFreeAiStatus", () => {
  it("checks availability on the same Worker used for reading, with the session token", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(200, { available: true }));
    const { getFreeAiStatus } = await import("@/lib/receipt");

    await expect(getFreeAiStatus()).resolves.toEqual({ state: "available" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const { url, init } = lastFetchCall();
    expect(url).toBe(`${FREE_AI_WORKER_URL}/`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SESSION_TOKEN}`);
  });

  it("reports unavailable when the worker says the key is not configured", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(200, { available: false }));
    const { getFreeAiStatus } = await import("@/lib/receipt");
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "unavailable" });
  });

  it("reports unavailable when the worker is not deployed (404)", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(404, { error: "not found" }));
    const { getFreeAiStatus } = await import("@/lib/receipt");
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "unavailable" });
  });

  it("reports an unauthorized error for 401 and 403 responses", async () => {
    const { getFreeAiStatus } = await import("@/lib/receipt");
    mocks.fetch.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "error", reason: "unauthorized" });
    mocks.fetch.mockResolvedValue(jsonResponse(403, { error: "forbidden" }));
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "error", reason: "unauthorized" });
  });

  it("reports a server error for 5xx responses", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(503, { error: "upstream" }));
    const { getFreeAiStatus } = await import("@/lib/receipt");
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "error", reason: "server" });
  });

  it("fails closed as a network error when the request never reaches the worker", async () => {
    const { getFreeAiStatus } = await import("@/lib/receipt");
    mocks.fetch.mockRejectedValue(new TypeError("offline"));
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "error", reason: "network" });
  });

  it("fails closed as unauthorized when there is no session, without touching the network", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { getFreeAiStatus } = await import("@/lib/receipt");
    await expect(getFreeAiStatus()).resolves.toEqual({ state: "error", reason: "unauthorized" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("FREE_AI_WORKER_URL", () => {
  it("is pinned to the deployed production Worker so availability and reading stay in sync", async () => {
    const mod = await import("@/lib/receipt");
    expect(mod.FREE_AI_WORKER_URL).toBe(FREE_AI_WORKER_URL);
    expect(mod.FREE_AI_WORKER_URL).toBe(
      "https://financecontrol-workers-ai-poc.financecontrol-gemini-free.workers.dev",
    );
    expect(mod.FREE_AI_WORKER_URL.startsWith("https://")).toBe(true);
  });
});
