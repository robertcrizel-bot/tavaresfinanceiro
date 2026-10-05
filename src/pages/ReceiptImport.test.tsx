import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReceiptImport from "@/pages/ReceiptImport";
import { fonsecaRegions } from "@/lib/ocr-paddle-test/__fixtures__/fonseca.fixture";

const mocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  navigate: vi.fn(),
  parseReceipt: vi.fn(),
  takeSharedReceiptWithDiagnostics: vi.fn(),
  duplicateLimit: vi.fn(),
  toast: vi.fn(),
  paddleRecognize: vi.fn(),
  fastOcrRecognize: vi.fn(),
  hybridOcrRecognize: vi.fn(),
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
}));
vi.mock("@/lib/receipt", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/receipt")>(),
  parseReceipt: mocks.parseReceipt,
  receiptToImageDataUrl: mocks.receiptToImageDataUrl,
  prepareReceiptForLocalOcr: mocks.prepareReceiptForLocalOcr,
}));
vi.mock("@/lib/ocr-paddle-test/recognize", () => ({
  paddleRecognize: mocks.paddleRecognize,
  disposePaddleRecognizer: mocks.disposePaddleRecognizer,
}));
vi.mock("@/lib/fast-ocr", () => ({
  fastOcrRecognize: mocks.fastOcrRecognize,
}));
vi.mock("@/lib/hybrid-ocr", () => ({
  hybridOcrRecognize: mocks.hybridOcrRecognize,
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
  mocks.fastOcrRecognize.mockResolvedValue({
    regions: [{ text: "MERCADO CENTRAL", confidence: 0.9, bbox: [[0, 0], [10, 0], [10, 5], [0, 5]] }],
    initializationMs: 1500,
    ocrMs: 8000,
  });
  mocks.hybridOcrRecognize.mockResolvedValue({
    regions: [{ text: "MERCADO CENTRAL", confidence: 0.9, bbox: [[0, 0], [10, 0], [10, 5], [0, 5]] }],
    initializationMs: 1200,
    firstPassMs: 21000,
    suspiciousCount: 2,
    smallInitializationMs: 3400,
    smallCropsMs: 1600,
    cropsProcessed: 2,
    mergeMs: 120,
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
    await waitFor(() => expect(screen.getByRole("button", { name: "Ler gratuitamente" })).toBeInTheDocument());
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));
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

  it("keeps Escolher arquivo on the normal file input and requires 'Ler gratuitamente' to trigger PaddleOCR", async () => {
    const { container } = render(<ReceiptImport />);
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const input = inputs[0];
    const file = new File(["receipt"], "gallery-receipt.jpg", { type: "image/jpeg" });

    expect(inputs).toHaveLength(1);
    expect(input).toBeDefined();
    expect(input.accept).toBe("image/*,application/pdf");
    expect(input).not.toHaveAttribute("capture");

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Ler gratuitamente" })).toBeInTheDocument());
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));

    await waitFor(() =>
      expect(mocks.paddleRecognize).toHaveBeenCalledWith(file, expect.any(Function)),
    );
    expect(mocks.buildPaddleReceiptResult).toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    const diagnostics = await screen.findByTestId("free-ocr-diagnostics");
    expect(diagnostics).toHaveTextContent("Diagnóstico OCR");
    expect(diagnostics).toHaveTextContent("Preparação:1.2 s");
    expect(diagnostics).toHaveTextContent("Orientação:2.3 s");
    expect(diagnostics).toHaveTextContent("Inicialização Paddle:5.0 s");
    expect(diagnostics).toHaveTextContent("Inferência total:110.0 s");
    expect(diagnostics).toHaveTextContent("Detecção (SDK):40.0 s");
    expect(diagnostics).toHaveTextContent("Reconhecimento (SDK):65.0 s");
    expect(diagnostics).toHaveTextContent("Parser:");
    expect(diagnostics).toHaveTextContent("Liberação de recursos:");
    expect(diagnostics).toHaveTextContent("TOTAL:");
    expect(diagnostics).toHaveTextContent("Imagem original:3000 × 4000");
    expect(diagnostics).toHaveTextContent("Imagem OCR:1000 × 1600");
  });

  it("runs the experimental fast OCR on the same prepared image and shows its diagnostics", async () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "receipt-fast.jpg", { type: "image/jpeg" });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("button", { name: "⚡ Testar OCR rápido" })).toBeInTheDocument());
    expect(mocks.fastOcrRecognize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "⚡ Testar OCR rápido" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    expect(mocks.prepareReceiptForLocalOcr).toHaveBeenCalledWith(file);
    expect(mocks.fastOcrRecognize).toHaveBeenCalledWith(file, expect.any(Function));
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.disposePaddleRecognizer).not.toHaveBeenCalled();
    expect(mocks.buildPaddleReceiptResult).toHaveBeenCalledWith([
      expect.objectContaining({ text: "MERCADO CENTRAL" }),
    ]);

    const diagnostics = await screen.findByTestId("fast-ocr-diagnostics");
    expect(diagnostics).toHaveTextContent("DIAGNÓSTICO OCR RÁPIDO");
    expect(diagnostics).toHaveTextContent("Inicialização:1.5 s");
    expect(diagnostics).toHaveTextContent("OCR:8.0 s");
    expect(diagnostics).toHaveTextContent("Parser:");
    expect(diagnostics).toHaveTextContent("TOTAL:");
    expect(diagnostics).toHaveTextContent("Imagem OCR:1200 × 1600");
    expect(screen.queryByTestId("free-ocr-diagnostics")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));
    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 120, title: "Mercado Central" }),
      expect.objectContaining({ attachments: [file] }),
    );
  });

  it("runs the experimental hybrid OCR on the prepared image and shows its diagnostics", async () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "receipt-hybrid.jpg", { type: "image/jpeg" });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("button", { name: "🚀 Testar OCR híbrido" })).toBeInTheDocument());
    expect(mocks.hybridOcrRecognize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "🚀 Testar OCR híbrido" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    expect(mocks.prepareReceiptForLocalOcr).toHaveBeenCalledWith(file);
    expect(mocks.hybridOcrRecognize).toHaveBeenCalledWith(file, 1200, 1600, expect.any(Function));
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.fastOcrRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    const diagnostics = await screen.findByTestId("hybrid-ocr-diagnostics");
    expect(diagnostics).toHaveTextContent("DIAGNÓSTICO OCR HÍBRIDO");
    expect(diagnostics).toHaveTextContent("Tiny - inicialização:1.2 s");
    expect(diagnostics).toHaveTextContent("Tiny - primeira passagem:21.0 s");
    expect(diagnostics).toHaveTextContent("Regiões suspeitas:2");
    expect(diagnostics).toHaveTextContent("Small - inicialização:3.4 s");
    expect(diagnostics).toHaveTextContent("Small - OCR dos crops:1.6 s");
    expect(diagnostics).toHaveTextContent("Crops processados:2");
    expect(diagnostics).toHaveTextContent("Média por crop (Small):0.8 s");
    expect(diagnostics).toHaveTextContent("Parser/merge:");
    expect(diagnostics).toHaveTextContent("TOTAL:");
    expect(diagnostics).toHaveTextContent("Imagem principal:1200 × 1600");
    expect(screen.queryByTestId("fast-ocr-diagnostics")).not.toBeInTheDocument();
    expect(screen.queryByTestId("free-ocr-diagnostics")).not.toBeInTheDocument();
  });

  it("does not show the removed local OCR development controls after file selection", async () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Ler gratuitamente" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Testar OCR local" })).not.toBeInTheDocument();
    expect(screen.queryByText("Resultado do OCR Local")).not.toBeInTheDocument();
  });

  it("opens the internal rear camera without a capture input", async () => {
    const { getUserMedia } = installCamera();
    const { container } = render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    }));
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("captures a bounded JPEG, stops the camera and requires 'Ler gratuitamente' to read with PaddleOCR", async () => {
    const { cameraStream, track } = installCamera();
    const { canvases, drawImage, toBlob } = installCameraCanvas();
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 3840 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 2160 });
    fireEvent.canPlay(video);
    fireEvent.click(screen.getByRole("button", { name: "Fotografar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Ler gratuitamente" })).toBeInTheDocument());
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1920, 1080);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.9);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));
    await waitFor(() => expect(mocks.paddleRecognize).toHaveBeenCalled());
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });

  it("preserves portrait proportions within the capture limit", async () => {
    const { cameraStream, track } = installCamera();
    const { drawImage } = installCameraCanvas();
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 2160 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 3840 });
    fireEvent.canPlay(video);
    fireEvent.click(screen.getByRole("button", { name: "Fotografar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Ler gratuitamente" })).toBeInTheDocument());
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1080, 1920);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("stops the camera without creating a file when cancelled", async () => {
    const { cameraStream, track } = installCamera();
    const { unmount } = render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    unmount();

    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(tracks[1].stop).toHaveBeenCalledTimes(1);
  });

  it("shows a friendly error when camera permission is denied", async () => {
    const { getUserMedia } = installCamera();
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));

    expect(await screen.findByText("A permissão da câmera foi negada. Autorize o acesso ou use Escolher arquivo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher arquivo" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps file selection available when getUserMedia is unsupported", async () => {
    const mockedNavigator = Object.create(window.navigator);
    Object.defineProperty(mockedNavigator, "mediaDevices", { value: undefined });
    vi.stubGlobal("navigator", mockedNavigator);
    render(<ReceiptImport />);

    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));

    expect(await screen.findByText("A câmera não está disponível neste navegador. Use Escolher arquivo para enviar a foto.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher arquivo" })).toBeInTheDocument();
  });
});

describe("Lovable AI receipt flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(screen.getByRole("button", { name: "Ler gratuitamente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ler com IA/ })).toBeInTheDocument();
    expect(screen.getByText("A leitura gratuita usa o OCR local e tem custo R$ 0,00.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ler com IA/ }));
    expect(screen.getByText("Esta leitura utiliza a IA do Lovable e pode consumir seus créditos. Deseja continuar?")).toBeInTheDocument();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Ler com IA/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar com IA" }));

    await waitFor(() => expect(mocks.parseReceipt).toHaveBeenCalledWith(file, {
      categories: ["Alimentação", "Outros"],
      accounts: [],
    }));
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(screen.queryByTestId("free-ocr-diagnostics")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar importação" }));

    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Café Central",
        amount: 40,
        type: "expense",
        date: "2026-10-03",
        paymentMethod: "Pix",
        description: expect.stringContaining("2x Café — R$ 20,00"),
      }),
      expect.objectContaining({ receiptRef: "AI-123", attachments: [file] }),
    );
  });

  it("keeps the selected image and both reading options after an AI failure", async () => {
    mocks.parseReceipt.mockRejectedValueOnce(new Error("A leitura com IA falhou. Tente novamente."));
    selectFile();

    fireEvent.click(screen.getByRole("button", { name: /Ler com IA/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar com IA" }));

    expect(await screen.findByText("A leitura com IA falhou. Tente novamente.")).toBeInTheDocument();
    expect(screen.getByText("comprovante-ia.jpg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ler gratuitamente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ler com IA/ })).toBeInTheDocument();
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
  });
});

describe("PaddleOCR main flow (no paid AI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("clicking 'Ler gratuitamente' uses PaddleOCR and never parseReceipt, passing the original file as attachment", async () => {
    const { file } = selectFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Ler gratuitamente" })).toBeInTheDocument());
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    expect(mocks.prepareReceiptForLocalOcr).toHaveBeenCalledWith(file);
    expect(mocks.paddleRecognize).toHaveBeenCalledWith(file, expect.any(Function));
    expect(mocks.paddleRecognize).toHaveBeenCalledTimes(1);
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

  it("extracts the receipt result and awaits both runtime cleanups before opening the form", async () => {
    let finishPaddleDispose: (() => void) | undefined;
    let finishOrientationRelease: (() => void) | undefined;
    mocks.disposePaddleRecognizer.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishPaddleDispose = resolve;
    }));
    mocks.releaseDocumentOrientationSession.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishOrientationRelease = resolve;
    }));
    selectFile();

    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));

    await waitFor(() => expect(mocks.buildPaddleReceiptResult).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.disposePaddleRecognizer).toHaveBeenCalledTimes(1));
    expect(mocks.buildPaddleReceiptResult.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.disposePaddleRecognizer.mock.invocationCallOrder[0]);
    expect(screen.queryByRole("button", { name: "Confirmar importação" })).not.toBeInTheDocument();

    finishPaddleDispose!();
    await waitFor(() => expect(mocks.releaseDocumentOrientationSession).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Confirmar importação" })).not.toBeInTheDocument();

    finishOrientationRelease!();
    expect(await screen.findByRole("button", { name: "Confirmar importação" })).toBeInTheDocument();
  });

  it("saves known Fonseca item values without inventing missing values", async () => {
    const receiptResultModule = await vi.importActual<typeof import("@/lib/ocr-paddle-test/receiptResult")>(
      "@/lib/ocr-paddle-test/receiptResult",
    );
    stubPaddleSuccess(receiptResultModule.buildPaddleReceiptResult(fonsecaRegions));

    selectFile();
    fireEvent.click(await screen.findByRole("button", { name: "Ler gratuitamente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar importação" }));

    const transaction = mocks.addTransaction.mock.calls[0][0];
    expect(transaction.amount).toBe(88.38);
    expect(transaction.description).toContain("1.246x BANANA NANICA Kg — R$ 8,70");
    expect(transaction.description).toContain("0.464x CEBOLA Kg");
    expect(transaction.description).not.toContain("0.464x CEBOLA Kg —");
    expect(transaction.description).not.toContain("R$ 3,15");
  });

  it("PaddleOCR failure shows an error and never calls parseReceipt/Lovable (no paid fallback)", async () => {
    mocks.paddleRecognize.mockResolvedValue({
      text: "",
      confidence: null,
      regions: [],
      spatialItems: [],
      spatialHeaderColumns: null,
      timeMs: 0,
      detectedBoxes: 0,
      recognizedCount: 0,
      backend: "unknown",
      error: "model download failed",
    });

    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));

    expect(
      await screen.findByText("Não foi possível ler o comprovante agora. Verifique a foto e tente novamente."),
    ).toBeInTheDocument();
    expect(mocks.paddleRecognize).toHaveBeenCalled();
    expect(mocks.disposePaddleRecognizer).toHaveBeenCalledTimes(1);
    expect(mocks.releaseDocumentOrientationSession).toHaveBeenCalledTimes(1);
    expect(mocks.buildPaddleReceiptResult).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.addTransaction).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirmar importação" })).not.toBeInTheDocument();
  });

  it("cleans both runtimes when image preparation or orientation fails", async () => {
    mocks.prepareReceiptForLocalOcr.mockRejectedValueOnce(new Error("orientation failed"));

    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));

    expect(await screen.findByText("orientation failed")).toBeInTheDocument();
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.disposePaddleRecognizer).toHaveBeenCalledTimes(1);
    expect(mocks.releaseDocumentOrientationSession).toHaveBeenCalledTimes(1);
  });

  it("shared receipt is processed automatically through PaddleOCR", async () => {
    const sharedFile = new File(["shared"], "shared.jpg", { type: "image/jpeg" });
    mocks.takeSharedReceiptWithDiagnostics.mockResolvedValue({ file: sharedFile, diag: null });

    render(<ReceiptImport />);

    await waitFor(() => expect(mocks.takeSharedReceiptWithDiagnostics).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.paddleRecognize).toHaveBeenCalledWith(sharedFile, expect.any(Function)),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument(),
    );
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));

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
