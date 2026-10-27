import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReceiptImport from "@/pages/ReceiptImport";

// Legacy OCR/Lovable reader regression tests intentionally opt in to the
// internal-only UI; the production interface hides those obsolete options.
beforeEach(() => vi.stubEnv("VITE_ENABLE_LEGACY_RECEIPT_READERS", "true"));
afterEach(() => vi.unstubAllEnvs());
import { isAppBusy } from "@/lib/app-update";
import { fonsecaRegions } from "@/lib/ocr-paddle-test/__fixtures__/fonseca.fixture";

const mocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  navigate: vi.fn(),
  parseReceipt: vi.fn(),
  takeSharedReceiptWithDiagnostics: vi.fn(),
  duplicateLimit: vi.fn(),
  toast: vi.fn(),
  paddleRecognize: vi.fn(),
  paddleRecognizeWorker: vi.fn(),
  disposePaddleRecognizer: vi.fn(),
  releaseDocumentOrientationSession: vi.fn(),
  buildPaddleReceiptResult: vi.fn(),
  receiptToImageDataUrl: vi.fn(),
  prepareReceiptForLocalOcr: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({ addTransaction: mocks.addTransaction }),
}));
vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({ accounts: [], creditCards: [] }),
}));
vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({ allCategoryNames: ["Alimentação", "Outros"] }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/shared-receipt", () => ({
  takeSharedReceiptWithDiagnostics: mocks.takeSharedReceiptWithDiagnostics,
  isShareWorkerOutdated: (version: unknown) => typeof version === "string" && version !== "share-v5",
}));
vi.mock("@/lib/receipt", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/receipt")>(),
  parseReceipt: mocks.parseReceipt,
  receiptToImageDataUrl: mocks.receiptToImageDataUrl,
  prepareReceiptForLocalOcr: mocks.prepareReceiptForLocalOcr,
  // The free reader lives on a Cloudflare Worker: never hit the network here.
  getFreeAiStatus: vi.fn(async () => ({ state: "unavailable" as const })),
}));
vi.mock("@/lib/ocr-paddle-test/recognize", () => ({
  paddleRecognize: mocks.paddleRecognize,
  disposePaddleRecognizer: mocks.disposePaddleRecognizer,
}));
vi.mock("@/lib/paddle-ocr-worker", () => ({
  PaddleOcrError: class PaddleOcrError extends Error {},
  formatOcrDiagnostic: () => "",
  paddleRecognizeWorker: mocks.paddleRecognizeWorker,
}));
vi.mock("@/lib/ocr-paddle-test/receiptResult", () => ({
  buildPaddleReceiptResult: mocks.buildPaddleReceiptResult,
}));
vi.mock("@/lib/receipt-image-orientation", () => ({
  correctDocumentOrientation: vi.fn(async (image: File) => image),
  releaseDocumentOrientationSession: mocks.releaseDocumentOrientationSession,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ limit: mocks.duplicateLimit }),
      }),
    }),
  },
}));
vi.mock("@/components/TransactionForm", () => ({
  TransactionForm: ({ open, prefill, prefillAttachments, lowConfidence, onSubmit }: {
    open: boolean;
    prefill: Record<string, unknown>;
    prefillAttachments?: File[];
    lowConfidence?: string[];
    onSubmit: (data: Record<string, unknown>, options?: { attachments?: File[] }) => void;
  }) => open ? (
    <div>
      <button type="button" onClick={() => onSubmit(prefill, { attachments: prefillAttachments })}>
        Confirmar importação
      </button>
      {lowConfidence && lowConfidence.length > 0 && (
        <div>
          {lowConfidence.includes("counterparty") || lowConfidence.includes("merchant_name") || lowConfidence.includes("merchant_name_extracted")
            ? <span>Confira este campo</span>
            : null}
        </div>
      )}
      <input aria-label="Título" defaultValue={String(prefill.title ?? "")} readOnly />
    </div>
  ) : null,
}));

function makePaddleResult(overrides: Record<string, unknown> = {}) {
  return {
    merchant: "Mercado Central",
    cnpj: "12.345.678/0001-90",
    date: "2026-09-11",
    time: "12:00:00",
    receiptTotal: 120,
    items: [],
    warnings: [],
    sumKnownItemValues: 0,
    differenceFromReceiptTotal: null,
    ...overrides,
  };
}

function stubPaddleSuccess(result: Record<string, unknown> = makePaddleResult()) {
  mocks.receiptToImageDataUrl.mockResolvedValue("data:image/jpeg;base64,TEST");
  mocks.prepareReceiptForLocalOcr.mockImplementation(async (file: File) => ({
    image: file,
    metrics: {
      originalDimensions: { width: 3000, height: 4000 },
      outputDimensions: { width: 1200, height: 1600 },
      originalPixels: 1_920_000,
      outputPixels: 1_920_000,
      largestRgbaSurfaceBytes: 7_680_000,
      estimatedOrientationPeakRgbaBytes: 23_040_000,
      inputFileBytes: file.size,
      outputFileBytes: file.size,
      preparationMs: 1200,
      orientationMs: 2300,
      totalMs: 3500,
      normalization: {
        strategy: "progressive-downscale",
        downscaleSteps: 2,
        decodeMode: "decode-time-resize+canvas",
        sourceDimensions: { width: 3000, height: 4000 },
        intermediateDimensions: { width: 1500, height: 2000 },
        targetDimensions: { width: 1200, height: 1600 },
      },
    },
  }));
  mocks.paddleRecognize.mockResolvedValue({
    text: "MERCADO CENTRAL\nTOTAL 120,00",
    confidence: 90,
    regions: [{ text: "MERCADO CENTRAL", confidence: 0.9, bbox: [[0, 0], [10, 0], [10, 5], [0, 5]] }],
    spatialItems: [],
    spatialHeaderColumns: null,
    timeMs: 10,
    detectedBoxes: 1,
    recognizedCount: 1,
    backend: "wasm",
    initializationMs: 5000,
    inferenceMs: 110000,
    detectionMs: 40000,
    recognitionMs: 65000,
    inputDimensions: { width: 1000, height: 1600 },
  });
  mocks.buildPaddleReceiptResult.mockReturnValue(result);
  mocks.paddleRecognizeWorker.mockResolvedValue({
    regions: [
      { text: "MERCADO CENTRAL", confidence: 0.9, bbox: [[0, 0], [10, 0], [10, 5], [0, 5]] },
      { text: "CREME LEITE UHT ITALAC 200G TP", confidence: 0.8, bbox: [[0, 10], [60, 10], [60, 15], [0, 15]] },
      { text: "2,75", confidence: 0.95, bbox: [[80, 10], [90, 10], [90, 15], [80, 15]] },
    ],
    rawLines: [
      [{ text: "MERCADO CENTRAL", box: { x: 0, y: 0, width: 10, height: 5 }, confidence: 0.9123 }],
      [
        { text: "CREME LEITE UHT ITALAC 200G TP", box: { x: 0, y: 10, width: 60, height: 5 }, confidence: 0.8123 },
        { text: "2,75", box: { x: 80, y: 10, width: 10, height: 5 }, confidence: 0.9512 },
      ],
    ],
    initializationMs: 1500,
    ocrMs: 8000,
  });
}

function installCamera(stream?: MediaStream) {
  const track = { stop: vi.fn() };
  const cameraStream = stream ?? ({ getTracks: () => [track] } as unknown as MediaStream);
  const getUserMedia = vi.fn().mockResolvedValue(cameraStream);
  const mockedNavigator = Object.create(window.navigator);
  Object.defineProperty(mockedNavigator, "mediaDevices", { value: { getUserMedia } });
  vi.stubGlobal("navigator", mockedNavigator);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  return { cameraStream, getUserMedia, track };
}

function installCameraCanvas() {
  const drawImage = vi.fn();
  const canvases: HTMLCanvasElement[] = [];
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    canvases.push(this as HTMLCanvasElement);
    return { drawImage } as unknown as CanvasRenderingContext2D;
  });
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback) {
    callback(new Blob(["camera photo"], { type: "image/jpeg" }));
  });
  return { canvases, drawImage, getContext, toBlob };
}

describe("ReceiptImport metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/receipt");
    mocks.disposePaddleRecognizer.mockReset().mockResolvedValue(undefined);
    mocks.releaseDocumentOrientationSession.mockReset().mockResolvedValue(undefined);
    mocks.takeSharedReceiptWithDiagnostics.mockResolvedValue({ file: null, diag: null });
    mocks.duplicateLimit.mockResolvedValue({ data: [], error: null });
    stubPaddleSuccess();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not read on file selection and requires explicit 'Ler gratuitamente' click", async () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { files: [file] } });
    await waitFor(() => expect(alternativeButton("OCR local")).toBeInTheDocument());
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    fireEvent.click(alternativeButton("OCR local"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));

    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 120,
        title: "Mercado Central",
        receiptDetails: {
          merchantName: "Mercado Central",
          taxId: "12.345.678/0001-90",
          fiscalDocumentNumber: undefined,
          cardBrand: undefined,
          cardLastFour: undefined,
        },
      }),
      expect.objectContaining({ receiptRef: undefined, attachments: [file] }),
    );
  });

  it("keeps Galeria/arquivo on the normal file input and requires 'Ler gratuitamente' to trigger the PaddleOCR worker", async () => {
    const { container } = render(<ReceiptImport />);
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const input = inputs[0];
    const file = new File(["receipt"], "gallery-receipt.jpg", { type: "image/jpeg" });

    expect(inputs).toHaveLength(1);
    expect(input).toBeDefined();
    expect(input.accept.split(",")).toEqual(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    expect(input).not.toHaveAttribute("capture");

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(alternativeButton("OCR local")).toBeInTheDocument());
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    fireEvent.click(alternativeButton("OCR local"));

    await waitFor(() =>
      expect(mocks.paddleRecognizeWorker).toHaveBeenCalledWith(file, expect.any(Function)),
    );
    expect(mocks.buildPaddleReceiptResult).toHaveBeenCalled();
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });

  it("uses the validated full PaddleOCR worker pipeline without development controls or diagnostics", async () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "receipt-fast.jpg", { type: "image/jpeg" });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(alternativeButton("OCR local")).toBeInTheDocument());
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "⚡ Testar OCR rápido" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "📋 Copiar diagnóstico" })).not.toBeInTheDocument();

    fireEvent.click(alternativeButton("OCR local"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    expect(mocks.prepareReceiptForLocalOcr).toHaveBeenCalledWith(file);
    expect(mocks.paddleRecognizeWorker).toHaveBeenCalledWith(file, expect.any(Function));
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.disposePaddleRecognizer).not.toHaveBeenCalled();
    expect(mocks.buildPaddleReceiptResult).toHaveBeenCalledWith([
      expect.objectContaining({ text: "MERCADO CENTRAL" }),
      expect.objectContaining({ text: "CREME LEITE UHT ITALAC 200G TP" }),
      expect.objectContaining({ text: "2,75" }),
    ]);

    expect(screen.queryByTestId("free-ocr-diagnostics")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fast-ocr-diagnostics")).not.toBeInTheDocument();
    expect(screen.queryByText("SAÍDA BRUTA DO V6 TINY")).not.toBeInTheDocument();
    expect(screen.queryByText("APÓS AGRUPAMENTO")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));
    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 120, title: "Mercado Central" }),
      expect.objectContaining({ attachments: [file] }),
    );
  });

  it("does not show the removed local OCR development controls after file selection", async () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(alternativeButton("OCR local")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Testar OCR local" })).not.toBeInTheDocument();
    expect(screen.queryByText("Resultado do OCR Local")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "🚀 Testar OCR híbrido" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("hybrid-ocr-diagnostics")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hybrid-ocr-crop-previews")).not.toBeInTheDocument();
  });

  it("shows short file and camera instructions", async () => {
    render(<ReceiptImport />);
    const hint = screen.getByTestId("receipt-picker-hint");
    expect(hint).toHaveTextContent(/Tirar foto/);
    expect(hint).toHaveTextContent(/imagem ou PDF/);
    expect(hint).not.toHaveTextContent(/Android/);
  });

  it("releases the picker lock on native cancel without reading or losing the selected file", async () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.click(screen.getByRole("button", { name: /Galeria\/arquivo|Trocar arquivo/ }));
    expect(isAppBusy()).toBe(true);
    fireEvent(input, new Event("cancel", { bubbles: true }));
    expect(isAppBusy()).toBe(false);
    const file = new File(["synthetic"], "keep.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Galeria\/arquivo|Trocar arquivo/ }));
    fireEvent(input, new Event("cancel", { bubbles: true }));
    expect(screen.getByText("keep.jpg")).toBeInTheDocument();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });

  it("handles focus/pageshow without a change event and never starts a read on return", async () => {
    render(<ReceiptImport />);
    fireEvent.click(screen.getByRole("button", { name: /Galeria\/arquivo|Trocar arquivo/ }));
    expect(isAppBusy()).toBe(true);
    fireEvent.focus(window);
    fireEvent(window, new Event("pageshow"));
    await waitFor(() => expect(isAppBusy()).toBe(false));
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });

  it("stops the internal camera when the page is hidden", async () => {
    const { track } = installCamera();
    render(<ReceiptImport />);
    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    await waitFor(() => expect(screen.getByTestId("receipt-camera-video")).toBeInTheDocument());
    fireEvent(window, new Event("pagehide"));
    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByTestId("receipt-camera-video")).not.toBeInTheDocument();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
  });

  it("opens the internal rear camera without a capture input", async () => {
    const { getUserMedia } = installCamera();
    const { container } = render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 960, max: 1280 },
        height: { ideal: 1280, max: 1280 },
        frameRate: { ideal: 15, max: 15 },
        aspectRatio: { ideal: 3 / 4 },
      },
      audio: false,
    }));
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a fixed 3:4 portrait preview frame with cover-fitted video (no stretching)", async () => {
    installCamera();
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));

    const frame = await screen.findByTestId("receipt-camera-frame");
    expect(frame.className).toContain("aspect-[3/4]");
    expect(frame.className).not.toContain("aspect-video");
    const video = screen.getByTestId("receipt-camera-video");
    expect(video.className).toContain("object-cover");
    expect(video.className).toContain("object-center");
    expect(video.className).not.toContain("object-contain");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fotografar" })).toBeInTheDocument();
  });

  it("captures a bounded JPEG, stops the camera and requires 'Ler gratuitamente' to read with the PaddleOCR worker", async () => {
    const { cameraStream, track } = installCamera();
    const { canvases, drawImage, toBlob } = installCameraCanvas();
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 3840 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 2160 });
    fireEvent.canPlay(video);
    fireEvent.click(screen.getByRole("button", { name: "Fotografar" }));

    await waitFor(() => expect(alternativeButton("OCR local")).toBeInTheDocument());
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    // Landscape 3840x2160 cropped to the framed 3:4 window: 1620x2160 at x=1110,
    // downscaled to 960x1280 (longest edge 1280).
    expect(drawImage).toHaveBeenCalledWith(video, 1110, 0, 1620, 2160, 0, 0, 960, 1280);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);

    fireEvent.click(alternativeButton("OCR local"));
    await waitFor(() => expect(mocks.paddleRecognizeWorker).toHaveBeenCalled());
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });

  it("preserves portrait proportions within the capture limit via a top/bottom crop", async () => {
    const { cameraStream, track } = installCamera();
    const { drawImage } = installCameraCanvas();
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 2160 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 3840 });
    fireEvent.canPlay(video);
    fireEvent.click(screen.getByRole("button", { name: "Fotografar" }));

    await waitFor(() => expect(alternativeButton("OCR local")).toBeInTheDocument());
    // Portrait 2160x3840 cropped to 3:4: keeps width, trims top/bottom by 480px,
    // then downscales to 960x1280.
    expect(drawImage).toHaveBeenCalledWith(video, 0, 480, 2160, 2880, 0, 0, 960, 1280);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("captures a source already at the 3:4 frame ratio without cropping", async () => {
    const { cameraStream } = installCamera();
    const { drawImage } = installCameraCanvas();
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1200 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 1600 });
    fireEvent.canPlay(video);
    fireEvent.click(screen.getByRole("button", { name: "Fotografar" }));

    await waitFor(() => expect(alternativeButton("OCR local")).toBeInTheDocument());
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1200, 1600, 0, 0, 960, 1280);
  });

  it("stops the camera without creating a file when cancelled", async () => {
    const { cameraStream, track } = installCamera();
    const { unmount } = render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("stops a stream that arrives after the camera modal was cancelled", async () => {
    const { cameraStream, getUserMedia, track } = installCamera();
    let resolveStream: (stream: MediaStream) => void;
    const pendingStream = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    getUserMedia.mockReturnValueOnce(pendingStream);
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    resolveStream!(cameraStream);

    await waitFor(() => expect(track.stop).toHaveBeenCalledTimes(1));
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });

  it("stops every active camera track when unmounted", async () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    const stream = { getTracks: () => tracks } as unknown as MediaStream;
    const { cameraStream } = installCamera(stream);
    const { unmount } = render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    unmount();

    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(tracks[1].stop).toHaveBeenCalledTimes(1);
  });

  it("preserves a selected PDF on picker cancellation without decoding or reading", () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]')!;
    const file = new File(["%PDF-1.4"], "saved.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [] } });
    expect(screen.getByText("saved.pdf")).toBeInTheDocument();
    expect(mocks.prepareReceiptForLocalOcr).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });

  it("retains a PDF for retry when explicit processing fails", async () => {
    const file = new File(["%PDF-1.4"], "retry.pdf", { type: "application/pdf" });
    mocks.prepareReceiptForLocalOcr.mockRejectedValueOnce(new Error("PDF indisponível"));
    const { container } = render(<ReceiptImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.click(alternativeButton("OCR local"));
    expect(await screen.findByText("PDF indisponível")).toBeInTheDocument();
    expect(screen.getByText("retry.pdf")).toBeInTheDocument();
    expect(mocks.prepareReceiptForLocalOcr).toHaveBeenCalledWith(file);
    expect(alternativeButton("OCR local")).toBeEnabled();
  });

  it("invalidates a pending permission request when the document becomes hidden", async () => {
    const { cameraStream, getUserMedia, track } = installCamera();
    let finish!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValueOnce(new Promise<MediaStream>((resolve) => { finish = resolve; }));
    render(<ReceiptImport />);
    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => finish(cameraStream));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    visibility.mockRestore();
  });

  it("stops the camera on app switching and preserves the selected image", async () => {
    const { cameraStream, track } = installCamera();
    const { container } = render(<ReceiptImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["old"], "saved.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    fireEvent(window, new Event("pagehide"));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("saved.jpg")).toBeInTheDocument();
    expect(screen.getByText(/Câmera interrompida/)).toBeInTheDocument();
  });

  it("encodes once on repeated taps and ignores a JPEG arriving after cancellation and remount", async () => {
    const { cameraStream, getUserMedia } = installCamera();
    installCameraCanvas();
    let finish!: BlobCallback;
    const encode = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => { finish = callback; });
    const { unmount } = render(<ReceiptImport />);
    const open = screen.getByRole("button", { name: /Tirar (?:nova )?foto/ });
    fireEvent.click(open);
    fireEvent.click(open);
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1280 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 960 });
    fireEvent.canPlay(video);
    const capture = screen.getByRole("button", { name: "Fotografar" });
    fireEvent.click(capture);
    fireEvent.click(capture);
    expect(encode).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    unmount();
    render(<ReceiptImport />);
    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Blob(["late"], { type: "image/jpeg" })));
    expect(screen.queryByRole("button", { name: "OCR local" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  });

  it("keeps the prior file when JPEG encoding fails and frees the canvas", async () => {
    const { cameraStream, track } = installCamera();
    const { canvases } = installCameraCanvas();
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
    const { container } = render(<ReceiptImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["old"], "previous.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1280 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 960 });
    fireEvent.canPlay(video);
    fireEvent.click(screen.getByRole("button", { name: "Fotografar" }));
    expect(await screen.findByText(/Não foi possível fotografar/)).toBeInTheDocument();
    expect(screen.getByText("previous.pdf")).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);
  });

  it("shows a friendly error when camera permission is denied", async () => {
    const { getUserMedia } = installCamera();
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));

    expect(await screen.findByText("A permissão da câmera foi negada. Autorize o acesso ou use Galeria/arquivo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Galeria\/arquivo|Trocar arquivo/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps file selection available when getUserMedia is unsupported", async () => {
    const mockedNavigator = Object.create(window.navigator);
    Object.defineProperty(mockedNavigator, "mediaDevices", { value: undefined });
    vi.stubGlobal("navigator", mockedNavigator);
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: /Tirar (?:nova )?foto/ }));

    expect(await screen.findByText("A câmera não está disponível neste navegador. Use Galeria/arquivo para enviar a foto.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Galeria\/arquivo|Trocar arquivo/ })).toBeInTheDocument();
  });
});

describe("Lovable AI receipt flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/receipt");
    mocks.parseReceipt.mockReset();
    mocks.disposePaddleRecognizer.mockReset().mockResolvedValue(undefined);
    mocks.releaseDocumentOrientationSession.mockReset().mockResolvedValue(undefined);
    mocks.takeSharedReceiptWithDiagnostics.mockResolvedValue({ file: null, diag: null });
    mocks.duplicateLimit.mockResolvedValue({ data: [], error: null });
    stubPaddleSuccess();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function selectFile() {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "comprovante-ia.jpg", { type: "image/jpeg" });
    fireEvent.change(input!, { target: { files: [file] } });
    return file;
  }

  it("only calls Lovable AI after explicit confirmation and sends the result to the existing form", async () => {
    mocks.parseReceipt.mockResolvedValue({
      is_receipt: true,
      type: "expense",
      amount: 40,
      date: "2026-10-03",
      time: "14:30:00",
      counterparty: "Café Central",
      institution: null,
      payment_method: "Pix",
      category_hint: "Alimentação",
      receipt_id: "AI-123",
      merchant_name: "Café Central Ltda",
      tax_id: "12.345.678/0001-90",
      fiscal_document_number: "456",
      card_brand: null,
      card_last_four: null,
      title: "Café Central",
      notes: "Pagamento confirmado",
      purchased_items: [{ name: "Café", quantity: 2, unit_price: 10, total: 20 }],
      low_confidence_fields: [],
    });
    const file = selectFile();

    expect(alternativeButton("OCR local")).toBeInTheDocument();
    expect(alternativeButton("IA do Lovable")).toBeInTheDocument();
    expect(screen.queryByText(/custo R\$/)).not.toBeInTheDocument();

    fireEvent.click(alternativeButton("IA do Lovable"));
    expect(screen.getByText("Esta leitura utiliza a IA do Lovable e pode consumir seus créditos. Deseja continuar?")).toBeInTheDocument();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    fireEvent.click(alternativeButton("IA do Lovable"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar com IA" }));

    await waitFor(() => expect(mocks.parseReceipt).toHaveBeenCalledWith(file, {
      categories: ["Alimentação", "Outros"],
      accounts: [],
    }));
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
    expect(screen.queryByTestId("free-ocr-diagnostics")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar importação" }));

    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Café Central",
        amount: 40,
        type: "expense",
        date: "2026-10-03",
        paymentMethod: "Pix",
        description: expect.stringContaining("Café — 2 un · R$ 10,00/un · Total R$ 20,00"),
      }),
      expect.objectContaining({ receiptRef: "AI-123", attachments: [file] }),
    );
  });

  it("keeps the selected image and both reading options after an AI failure", async () => {
    mocks.parseReceipt.mockRejectedValueOnce(new Error("A leitura com IA falhou. Tente novamente."));
    selectFile();

    fireEvent.click(alternativeButton("IA do Lovable"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar com IA" }));

    expect(await screen.findByText("A leitura com IA falhou. Tente novamente.")).toBeInTheDocument();
    expect(screen.getByText("comprovante-ia.jpg")).toBeInTheDocument();
    expect(alternativeButton("OCR local")).toBeInTheDocument();
    expect(alternativeButton("IA do Lovable")).toBeInTheDocument();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
  });
});

describe("PaddleOCR worker main flow (no paid AI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/receipt");
    mocks.disposePaddleRecognizer.mockReset().mockResolvedValue(undefined);
    mocks.releaseDocumentOrientationSession.mockReset().mockResolvedValue(undefined);
    mocks.takeSharedReceiptWithDiagnostics.mockResolvedValue({ file: null, diag: null });
    mocks.duplicateLimit.mockResolvedValue({ data: [], error: null });
    stubPaddleSuccess();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function selectFile() {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "comprovante.jpg", { type: "image/jpeg" });
    fireEvent.change(input!, { target: { files: [file] } });
    return { container, file };
  }

  it("clicking 'Ler gratuitamente' uses the PaddleOCR worker and never parseReceipt, passing the original file as attachment", async () => {
    const { file } = selectFile();
    await waitFor(() => expect(alternativeButton("OCR local")).toBeInTheDocument());
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();

    fireEvent.click(alternativeButton("OCR local"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    expect(mocks.prepareReceiptForLocalOcr).toHaveBeenCalledWith(file);
    expect(mocks.paddleRecognizeWorker).toHaveBeenCalledWith(file, expect.any(Function));
    expect(mocks.paddleRecognizeWorker).toHaveBeenCalledTimes(1);
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.buildPaddleReceiptResult).toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));
    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 120,
        type: "expense",
        date: "2026-09-11",
        title: "Mercado Central",
      }),
      expect.objectContaining({ attachments: [file] }),
    );
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });

  it("repeated rapid taps on 'Ler gratuitamente' never start a second concurrent read", async () => {
    let finishRead: ((payload: Record<string, unknown>) => void) | undefined;
    mocks.paddleRecognizeWorker.mockImplementation(
      () => new Promise((resolve) => { finishRead = resolve; }),
    );

    selectFile();
    const button = await findAlternativeButton("OCR local");
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.paddleRecognizeWorker).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.paddleRecognizeWorker).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishRead!({
        regions: [{ text: "MERCADO CENTRAL", confidence: 0.9, bbox: [[0, 0], [10, 0], [10, 5], [0, 5]] }],
        rawLines: [],
        initializationMs: 1500,
        ocrMs: 8000,
        mode: "tiled",
        tiles: 3,
        tileTimingsMs: [2800, 2600, 2700],
        consolidationMs: 5,
        totalMs: 95000,
      });
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    expect(mocks.paddleRecognizeWorker).toHaveBeenCalledTimes(1);
  });

  it("opens the parsed form before orientation cleanup finishes", async () => {
    let finishOrientationRelease: (() => void) | undefined;
    mocks.releaseDocumentOrientationSession.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishOrientationRelease = resolve;
    }));
    selectFile();

    fireEvent.click(alternativeButton("OCR local"));

    await waitFor(() => expect(mocks.buildPaddleReceiptResult).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.releaseDocumentOrientationSession).toHaveBeenCalledTimes(1));
    expect(mocks.buildPaddleReceiptResult.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.releaseDocumentOrientationSession.mock.invocationCallOrder[0]);
    expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument();

    finishOrientationRelease!();
    expect(await findAlternativeButton("OCR local")).toBeInTheDocument();
  });

  it("saves known Fonseca item values without inventing missing values", async () => {
    const receiptResultModule = await vi.importActual<typeof import("@/lib/ocr-paddle-test/receiptResult")>(
      "@/lib/ocr-paddle-test/receiptResult",
    );
    stubPaddleSuccess(receiptResultModule.buildPaddleReceiptResult(fonsecaRegions));

    selectFile();
    fireEvent.click(await findAlternativeButton("OCR local"));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar importação" }));

    const transaction = mocks.addTransaction.mock.calls[0][0];
    expect(transaction.amount).toBe(88.38);
    expect(transaction.description).toContain("BANANA NANICA — 1,246 kg · R$ 6,98/kg · Valor informado R$ 8,70");
    expect(transaction.description).toContain("CEBOLA — 0,464 kg");
    expect(transaction.description).not.toContain("CEBOLA — 0,464 kg · Valor informado");
    expect(transaction.description).not.toContain("R$ 3,15");
  });

  it("PaddleOCR worker failure shows an error and never calls parseReceipt/Lovable (no paid fallback)", async () => {
    mocks.paddleRecognizeWorker.mockRejectedValue(new Error("Falha simulada no worker."));

    selectFile();
    fireEvent.click(alternativeButton("OCR local"));

    expect(
      await screen.findByText("Falha simulada no worker."),
    ).toBeInTheDocument();
    expect(mocks.paddleRecognizeWorker).toHaveBeenCalled();
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.releaseDocumentOrientationSession).toHaveBeenCalledTimes(1);
    expect(mocks.buildPaddleReceiptResult).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.addTransaction).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirmar importação" })).not.toBeInTheDocument();
  });

  it("cleans the orientation runtime when image preparation or orientation fails", async () => {
    mocks.prepareReceiptForLocalOcr.mockRejectedValueOnce(new Error("orientation failed"));

    selectFile();
    fireEvent.click(alternativeButton("OCR local"));

    expect(await screen.findByText("orientation failed")).toBeInTheDocument();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
    expect(mocks.releaseDocumentOrientationSession).toHaveBeenCalledTimes(1);
  });

  it("shared receipt is processed automatically through the PaddleOCR worker", async () => {
    const sharedFile = new File(["shared"], "shared.jpg", { type: "image/jpeg" });
    const diag = {
      sw: { stored: true },
      page: {
        hasCacheApi: true,
        swControlled: true,
        attempts: 2,
        found: true,
        fileName: "shared.jpg",
        fileType: "image/jpeg",
        fileSize: sharedFile.size,
      },
    };
    window.history.replaceState({}, "", "/receipt?shared=1");
    mocks.takeSharedReceiptWithDiagnostics.mockResolvedValue({ file: sharedFile, diag });

    render(<ReceiptImport />);

    await waitFor(() => expect(mocks.takeSharedReceiptWithDiagnostics).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Diagnóstico do compartilhamento: arquivo recebido")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.paddleRecognizeWorker).toHaveBeenCalledWith(sharedFile, expect.any(Function)),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument(),
    );
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });

  it("shows open diagnostics when the shared file cannot be recovered", async () => {
    const diag = {
      sw: {
        swVersion: "share-v3",
        contentType: "multipart/form-data; boundary=android-share",
        rawBodyLength: 483221,
        formDataEntryCount: 0,
        fields: [],
        stored: false,
        error: null,
      },
      page: {
        hasCacheApi: true,
        swControlled: true,
        attempts: 10,
        found: false,
      },
    };
    window.history.replaceState({}, "", "/receipt?shared=1");
    mocks.takeSharedReceiptWithDiagnostics.mockResolvedValue({ file: null, diag });

    render(<ReceiptImport />);

    const summary = await screen.findByText("Diagnóstico do compartilhamento: arquivo não encontrado");
    expect(screen.getByText("Não foi possível receber a imagem compartilhada neste aparelho. Use 'Galeria/arquivo' abaixo.")).toBeInTheDocument();
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("swVersion: share-v3")).toBeInTheDocument();
    expect(screen.getByText("Service Worker desatualizado")).toBeInTheDocument();
    expect(screen.getByText(/"rawBodyLength": 483221/)).toBeInTheDocument();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
  });

  it("preserves parser nulls in the form (amount is never fabricated)", async () => {
    stubPaddleSuccess(
      makePaddleResult({
        receiptTotal: null,
        sumKnownItemValues: 67.54,
        differenceFromReceiptTotal: null,
        date: null,
      }),
    );

    selectFile();
    fireEvent.click(alternativeButton("OCR local"));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Confira com atenção/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));
    const call = mocks.addTransaction.mock.calls[0][0];
    expect(call.amount).toBeUndefined();
    expect(call.amount).not.toBe(67.54);
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });
});

// Alternatives are manual: open the presentation disclosure before choosing one.
function alternativeButton(name: string) {
  const summary = screen.getByText(/Outros m\u00e9todos de leitura/);
  if (!summary.closest("details")!.open) fireEvent.click(summary);
  return screen.getByRole("button", { name });
}
async function findAlternativeButton(name: string) {
  await screen.findByText(/Outros m\u00e9todos de leitura/);
  return alternativeButton(name);
}
