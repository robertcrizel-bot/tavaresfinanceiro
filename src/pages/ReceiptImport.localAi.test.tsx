import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReceiptImport from "@/pages/ReceiptImport";

const mocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  navigate: vi.fn(),
  parseReceipt: vi.fn(),
  takeSharedReceiptWithDiagnostics: vi.fn(),
  duplicateLimit: vi.fn(),
  toast: vi.fn(),
  paddleRecognizeWorker: vi.fn(),
  releaseDocumentOrientationSession: vi.fn(),
  buildPaddleReceiptResult: vi.fn(),
  prepareReceiptForLocalOcr: vi.fn(),
  interpretReceiptLocally: vi.fn(),
  toLocalReceiptInput: vi.fn(),
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
  isShareWorkerOutdated: () => false,
}));
vi.mock("@/lib/receipt", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/receipt")>(),
  parseReceipt: mocks.parseReceipt,
  prepareReceiptForLocalOcr: mocks.prepareReceiptForLocalOcr,
}));
vi.mock("@/lib/paddle-ocr-worker", () => ({
  PaddleOcrError: class PaddleOcrError extends Error {},
  formatOcrDiagnostic: () => "",
  paddleRecognizeWorker: mocks.paddleRecognizeWorker,
}));
vi.mock("@/lib/ocr-paddle-test/receiptResult", () => ({
  buildPaddleReceiptResult: mocks.buildPaddleReceiptResult,
}));
vi.mock("@/lib/local-receipt-ai", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/local-receipt-ai")>(),
  interpretReceiptLocally: mocks.interpretReceiptLocally,
  toLocalReceiptInput: mocks.toLocalReceiptInput,
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
  TransactionForm: ({ open, prefill, localAiAction }: {
    open: boolean;
    prefill: Record<string, unknown>;
    localAiAction?: {
      running: boolean;
      status: string;
      metricsText: string | null;
      fallbackMessage: string | null;
      onImprove: () => void;
    };
  }) => open ? (
    <div data-testid="review-form">
      <span data-testid="local-prefill-title">{String(prefill.title ?? "")}</span>
      <input aria-label="Título" defaultValue={String(prefill.title ?? "")} readOnly />
      {localAiAction && (
        <div>
          <button type="button" disabled={localAiAction.running} onClick={localAiAction.onImprove}>
            🧠 Melhorar leitura localmente
          </button>
          {localAiAction.running && localAiAction.status && <p>{localAiAction.status}</p>}
          {!localAiAction.running && localAiAction.metricsText && <p>{localAiAction.metricsText}</p>}
          {!localAiAction.running && localAiAction.fallbackMessage && (
            <p>{localAiAction.fallbackMessage}</p>
          )}
        </div>
      )}
    </div>
  ) : null,
}));

const OCR_REGIONS = [
  { text: "PADARIA CONFEITARIA", confidence: 0.99, bbox: [[0, 0], [10, 0], [10, 5], [0, 5]] },
  { text: "PAO FRANCES", confidence: 0.99, bbox: [[0, 10], [10, 10], [10, 15], [0, 15]] },
  { text: "0,274KG X 21,99 T12 6,03", confidence: 0.99, bbox: [[0, 20], [10, 20], [10, 25], [0, 25]] },
];

function stubFreeSuccess() {
  mocks.prepareReceiptForLocalOcr.mockImplementation(async (file: File) => ({ image: file, metrics: {} }));
  mocks.paddleRecognizeWorker.mockResolvedValue({ regions: OCR_REGIONS, rawLines: [], initializationMs: 1, ocrMs: 2 });
  mocks.buildPaddleReceiptResult.mockReturnValue({
    merchant: "Mercado Central",
    cnpj: null,
    date: null,
    time: null,
    receiptTotal: 120,
    items: [],
    warnings: [],
    sumKnownItemValues: 0,
    differenceFromReceiptTotal: null,
  });
}

function localParsed() {
  return {
    is_receipt: true,
    type: "expense",
    amount: 42,
    date: null,
    time: null,
    counterparty: "Interpretação Local",
    institution: null,
    payment_method: "",
    category_hint: null,
    receipt_id: null,
    merchant_name: "Interpretação Local",
    tax_id: null,
    fiscal_document_number: null,
    card_brand: null,
    card_last_four: null,
    title: "Interpretação Local",
    notes: null,
    purchased_items: [],
    low_confidence_fields: [],
  };
}

describe("ReceiptImport local AI interpretation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/receipt");
    mocks.takeSharedReceiptWithDiagnostics.mockResolvedValue({ file: null, diag: null });
    mocks.duplicateLimit.mockResolvedValue({ data: [], error: null });
    mocks.releaseDocumentOrientationSession.mockResolvedValue(undefined);
    mocks.toLocalReceiptInput.mockReturnValue({
      regions: OCR_REGIONS,
      groupedLines: [{ index: 0, text: "PADARIA CONFEITARIA PAO FRANCES", regions: OCR_REGIONS }],
      rawText: "PADARIA CONFEITARIA\nPAO FRANCES\n0,274KG X 21,99 T12 6,03",
      categories: ["Alimentação", "Outros"],
      accounts: [],
    });
    stubFreeSuccess();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function selectFile() {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
    fireEvent.change(input!, { target: { files: [file] } });
    return file;
  }

  it("improves the open review form from the computed OCR output without a second Paddle run", async () => {
    mocks.interpretReceiptLocally.mockImplementation(async (input: { regions: unknown[]; rawText: string }, options: { fallback: unknown; onMetrics?: (m: unknown) => void }) => {
      options.onMetrics?.({ modelId: "test-model", backend: "wasm", initializationMs: 10, inferenceMs: 20, totalMs: 30, fallbackUsed: false });
      return localParsed();
    });
    selectFile();

    expect(screen.queryByTestId("review-form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Melhorar leitura localmente/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));

    // The review form opens with the deterministic result and the local action visible inside it.
    expect(await screen.findByTestId("review-form")).toBeInTheDocument();
    expect(await screen.findByTestId("local-prefill-title")).toHaveTextContent("Mercado Central");
    const localButton = await screen.findByRole("button", { name: /Melhorar leitura localmente/ });
    expect(mocks.paddleRecognizeWorker).toHaveBeenCalledTimes(1);
    expect(mocks.toLocalReceiptInput).not.toHaveBeenCalled();

    // Manual paid AI button is untouched and only opens confirmation.
    fireEvent.click(screen.getByRole("button", { name: /Ler com IA/ }));
    expect(await screen.findByText("Esta leitura utiliza a IA do Lovable e pode consumir seus créditos. Deseja continuar?")).toBeInTheDocument();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.interpretReceiptLocally).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(localButton);
    await waitFor(() => expect(mocks.toLocalReceiptInput).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.interpretReceiptLocally).toHaveBeenCalledTimes(1));
    const [input, options] = mocks.interpretReceiptLocally.mock.calls[0];
    expect(input.regions).toHaveLength(3);
    expect(input.groupedLines.length).toBeGreaterThan(0);
    expect(input.rawText).toContain("PAO FRANCES");
    expect(options.fallback).toMatchObject({ title: "Mercado Central", amount: 120 });
    expect(mocks.paddleRecognizeWorker).toHaveBeenCalledTimes(1);
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    // The open form is updated in place with the local result and metrics.
    expect(await screen.findByTestId("review-form")).toBeInTheDocument();
    expect(await screen.findByTestId("local-prefill-title")).toHaveTextContent("Interpretação Local");
    expect(await screen.findByText(/test-model/)).toBeInTheDocument();
  });

  it("keeps the previous result and informs when local improvement times out", async () => {
    mocks.interpretReceiptLocally.mockImplementation(async (input: unknown, options: { fallback: unknown; onMetrics?: (m: unknown) => void }) => {
      options.onMetrics?.({ modelId: "test-model", backend: "wasm", initializationMs: 0, inferenceMs: 0, totalMs: 45000, fallbackUsed: true, error: "Interpretação local demorou demais; mantido resultado original." });
      return options.fallback;
    });
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));
    fireEvent.click(await screen.findByRole("button", { name: /Melhorar leitura localmente/ }));

    expect(await screen.findByTestId("review-form")).toBeInTheDocument();
    expect(await screen.findByTestId("local-prefill-title")).toHaveTextContent("Mercado Central");
    expect(await screen.findByText("Interpretação local demorou demais; mantido resultado original.")).toBeInTheDocument();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.paddleRecognizeWorker).toHaveBeenCalledTimes(1);
  });

  it("clears the previous receipt snapshot when a new photo is captured", async () => {
    mocks.interpretReceiptLocally.mockResolvedValue(localParsed());
    const trackStop = vi.fn();
    const cameraStream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
    const mockedNavigator = Object.create(window.navigator);
    Object.defineProperty(mockedNavigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(cameraStream) },
    });
    vi.stubGlobal("navigator", mockedNavigator);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback) {
      callback(new Blob(["camera photo"], { type: "image/jpeg" }));
    });

    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["one"], "um.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Ler gratuitamente" }));
    await screen.findByRole("button", { name: /Melhorar leitura localmente/ });

    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
    const video = await screen.findByTestId("receipt-camera-video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(cameraStream));
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 1080 });
    fireEvent.canPlay(video);
    fireEvent.click(screen.getByRole("button", { name: "Fotografar" }));

    await screen.findByText(/^comprovante-.*\.jpg$/);
    expect(screen.queryByRole("button", { name: /Melhorar leitura localmente/ })).not.toBeInTheDocument();
    expect(mocks.interpretReceiptLocally).not.toHaveBeenCalled();
  });
});
