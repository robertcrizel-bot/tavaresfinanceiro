import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReceiptImport from "@/pages/ReceiptImport";

const mocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  navigate: vi.fn(),
  parseReceipt: vi.fn(),
  takeSharedReceipt: vi.fn(),
  duplicateLimit: vi.fn(),
  toast: vi.fn(),
  extractReceiptText: vi.fn(),
  parseReceiptText: vi.fn(),
  paddleRecognize: vi.fn(),
  buildPaddleReceiptResult: vi.fn(),
  formatPaddleReport: vi.fn(),
  receiptToImageDataUrl: vi.fn(),
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
vi.mock("@/lib/shared-receipt", () => ({ takeSharedReceipt: mocks.takeSharedReceipt }));
vi.mock("@/lib/receipt", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/receipt")>(),
  parseReceipt: mocks.parseReceipt,
  receiptToImageDataUrl: mocks.receiptToImageDataUrl,
}));
vi.mock("@/lib/ocr-paddle-test/recognize", () => ({
  paddleRecognize: mocks.paddleRecognize,
  formatPaddleReport: mocks.formatPaddleReport,
}));
vi.mock("@/lib/ocr-paddle-test/receiptResult", () => ({
  buildPaddleReceiptResult: mocks.buildPaddleReceiptResult,
}));
vi.mock("@/lib/receipt-ocr", () => ({
  extractReceiptText: mocks.extractReceiptText,
}));
vi.mock("@/lib/receipt-parser", () => ({
  parseReceiptText: mocks.parseReceiptText,
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
  TransactionForm: ({ prefill, prefillAttachments, lowConfidence, onSubmit }: {
    prefill: Record<string, unknown>;
    prefillAttachments?: File[];
    lowConfidence?: string[];
    onSubmit: (data: Record<string, unknown>, options?: { attachments?: File[] }) => void;
  }) => (
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
  ),
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
  });
  mocks.buildPaddleReceiptResult.mockReturnValue(result);
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
    mocks.takeSharedReceipt.mockResolvedValue(null);
    mocks.duplicateLimit.mockResolvedValue({ data: [], error: null });
    stubPaddleSuccess();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not read on file selection and requires explicit 'Ler comprovante' click", async () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Ler comprovante" })).toBeInTheDocument());
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ler comprovante" }));
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

  it("keeps Escolher arquivo on the normal file input and requires 'Ler comprovante' to trigger PaddleOCR", async () => {
    const { container } = render(<ReceiptImport />);
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const input = inputs[0];
    const file = new File(["receipt"], "gallery-receipt.jpg", { type: "image/jpeg" });

    expect(inputs).toHaveLength(1);
    expect(input).toBeDefined();
    expect(input.accept).toBe("image/*,application/pdf");
    expect(input).not.toHaveAttribute("capture");

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Ler comprovante" })).toBeInTheDocument());
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ler comprovante" }));

    await waitFor(() =>
      expect(mocks.paddleRecognize).toHaveBeenCalledWith(
        "data:image/jpeg;base64,TEST",
        expect.any(Function),
      ),
    );
    expect(mocks.buildPaddleReceiptResult).toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
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

  it("captures a bounded JPEG, stops the camera and requires 'Ler comprovante' to read with PaddleOCR", async () => {
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

    await waitFor(() => expect(screen.getByRole("button", { name: "Ler comprovante" })).toBeInTheDocument());
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1920, 1080);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.9);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Ler comprovante" }));
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

    await waitFor(() => expect(screen.getByRole("button", { name: "Ler comprovante" })).toBeInTheDocument());
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

describe("OCR local → TransactionForm flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.takeSharedReceipt.mockResolvedValue(null);
    mocks.duplicateLimit.mockResolvedValue({ data: [], error: null });
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

  it("PIX Inter: preenche formulário com amount 6, expense, data 2026-09-11, Pix, favorecido sem prefixo", async () => {
    mocks.extractReceiptText.mockResolvedValue({
      text: "Comprovante de Pagamento\nPix enviado\nValor: R$ 6,00\nData: 11/09/2026\nHorário: 14:50\nQuem recebeu:\nRibeiro do Vale Alimentos LTDA\nInstituição recebedora:\nBanco Inter S.A.\nIdentificador: abc123",
      confidence: 85,
      durationMs: 1200,
    });
    mocks.parseReceiptText.mockReturnValue({
      is_receipt: true,
      type: "expense",
      amount: 6,
      date: "2026-09-11",
      time: "14:50:00",
      counterparty: "Ribeiro do Vale Alimentos LTDA",
      institution: "Banco Inter",
      payment_method: "Pix",
      category_hint: null,
      receipt_id: "abc123",
      merchant_name: null,
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: "Pagamento para Ribeiro do Vale Alimentos LTDA",
      notes: null,
      purchased_items: undefined,
      low_confidence_fields: [],
    });

    const { file } = selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Testar OCR local" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar estes dados" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Usar estes dados" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));

    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Ribeiro do Vale Alimentos LTDA",
        amount: 6,
        type: "expense",
        date: "2026-09-11",
        paymentMethod: "Pix",
      }),
      expect.objectContaining({ attachments: [file] }),
    );
  });

  it("Drogal: preenche com itens, amount 185.06, comprovante original preservado", async () => {
    mocks.extractReceiptText.mockResolvedValue({
      text: "DROGAL FARMACÊUTICA LTDA\nCNPJ: 12.345.678/0001-90\nCUPOM FISCAL\nData: 11/09/2026\nPOSTEC POMADA 200 1X R$ 152,43\nDe 152,43 Poi 114,32 desconto\nMAMADES 26CPR 1X R$ 47,46\nDe 47,46 Poi 35,60 desconto\nCAFEINA 1X R$ 31,34\nDe 31,34 Por 18,80 desconto\nME OXICAM 10CPR 1X R$ 27,24\nDe 27,24 Poi 16,34 desconto\nValor à Pagar R$: 185,06\nFORMA PAGAMENTO: Transferência Bancária\nBanco: Bradesco",
      confidence: 70,
      durationMs: 2000,
    });
    mocks.parseReceiptText.mockReturnValue({
      is_receipt: true,
      type: "expense",
      amount: 185.06,
      date: "2026-09-11",
      time: null,
      counterparty: "DROGAL FARMACÊUTICA LTDA",
      institution: "Bradesco",
      payment_method: "Transferência",
      category_hint: "Saúde",
      receipt_id: null,
      merchant_name: "DROGAL FARMACÊUTICA LTDA",
      tax_id: "12.345.678/0001-90",
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: "Pagamento para DROGAL FARMACÊUTICA LTDA",
      notes: null,
      purchased_items: [
        { name: "POSTEC POMADA 200", quantity: 1, unit_price: 114.32, total: 114.32 },
        { name: "MAMADES 26CPR", quantity: 1, unit_price: 35.60, total: 35.60 },
        { name: "CAFEINA", quantity: 1, unit_price: 18.80, total: 18.80 },
        { name: "ME OXICAM 10CPR", quantity: 1, unit_price: 16.34, total: 16.34 },
      ],
      low_confidence_fields: ["purchased_items"],
    });

    const { file } = selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Testar OCR local" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar estes dados" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Usar estes dados" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));

    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "DROGAL FARMACÊUTICA LTDA",
        amount: 185.06,
        type: "expense",
        date: "2026-09-11",
        description: expect.stringContaining("POSTEC POMADA"),
        paymentMethod: "Transferência",
      }),
      expect.objectContaining({ attachments: [file] }),
    );
  });

  it("item_values_are_final: true — descrição contém valores individuais", async () => {
    mocks.extractReceiptText.mockResolvedValue({
      text: "DROGAL\nPOSTEC 1X R$ 114,32\nValor à Pagar R$: 114,32",
      confidence: 70,
      durationMs: 1000,
    });
    mocks.parseReceiptText.mockReturnValue({
      is_receipt: true,
      type: "expense",
      amount: 114.32,
      date: "2026-09-11",
      time: null,
      counterparty: "DROGAL",
      institution: null,
      payment_method: "Transferência",
      category_hint: null,
      receipt_id: null,
      merchant_name: null,
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: "DROGAL",
      notes: null,
      purchased_items: [
        { name: "POSTEC POMADA 200", quantity: 1, unit_price: 114.32, total: 114.32 },
      ],
      item_values_are_final: true,
      low_confidence_fields: [],
    });

    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Testar OCR local" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar estes dados" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Usar estes dados" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));

    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 114.32,
        description: expect.stringContaining("R$ 114,32"),
      }),
      expect.anything(),
    );
  });

  it("item_values_are_final: false — descrição NÃO contém valores individuais", async () => {
    mocks.extractReceiptText.mockResolvedValue({
      text: "MERCADO\nARROZ 1X R$ 22,90\nVALOR TOTAL: R$ 163,82",
      confidence: 70,
      durationMs: 1000,
    });
    mocks.parseReceiptText.mockReturnValue({
      is_receipt: true,
      type: "expense",
      amount: 163.82,
      date: "2026-09-09",
      time: null,
      counterparty: "MERCADO",
      institution: null,
      payment_method: "TEF",
      category_hint: null,
      receipt_id: null,
      merchant_name: null,
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: "MERCADO",
      notes: null,
      purchased_items: [
        { name: "ARROZ TIPO 1 5KG", quantity: 1, unit_price: 22.90, total: 22.90 },
        { name: "FEIJAO CARIOCA 1KG", quantity: 2, unit_price: 8.49, total: 16.98 },
      ],
      item_values_are_final: false,
      low_confidence_fields: [],
    });

    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Testar OCR local" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar estes dados" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Usar estes dados" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));

    const call = mocks.addTransaction.mock.calls[0][0];
    expect(call.amount).toBe(163.82);
    expect(call.description).toContain("ARROZ TIPO 1 5KG");
    expect(call.description).toContain("FEIJAO CARIOCA 1KG");
    expect(call.description).not.toContain("R$");
  });

  it("sem item_values_are_final — descrição mantém valores (compatibilidade)", async () => {
    mocks.extractReceiptText.mockResolvedValue({
      text: "LOJA\nPRODUTO 1X R$ 50,00\nTotal: R$ 50,00",
      confidence: 70,
      durationMs: 1000,
    });
    mocks.parseReceiptText.mockReturnValue({
      is_receipt: true,
      type: "expense",
      amount: 50,
      date: "2026-09-10",
      time: null,
      counterparty: "LOJA",
      institution: null,
      payment_method: null,
      category_hint: null,
      receipt_id: null,
      merchant_name: null,
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: "LOJA",
      notes: null,
      purchased_items: [
        { name: "PRODUTO X", quantity: 1, unit_price: 50, total: 50 },
      ],
      low_confidence_fields: [],
    });

    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Testar OCR local" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar estes dados" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Usar estes dados" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));

    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 50,
        description: expect.stringContaining("R$ 50,00"),
      }),
      expect.anything(),
    );
  });

  it("Cupom difícil: merchant de baixa confiança NÃO vira título confiável, time 19:99:00 rejeitado", async () => {
    mocks.extractReceiptText.mockResolvedValue({
      text: "SHALES wr yp 2\nR$ 163,82\n10/09/2026 19:99:00\nTransferência",
      confidence: 35,
      durationMs: 1500,
    });
    mocks.parseReceiptText.mockReturnValue({
      is_receipt: true,
      type: "expense",
      amount: 163.82,
      date: "2026-09-10",
      time: null,
      counterparty: "SHALES wr yp 2",
      institution: null,
      payment_method: "Transferência",
      category_hint: null,
      receipt_id: null,
      merchant_name: "SHALES wr yp 2",
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: "Pagamento para SHALES wr yp 2",
      notes: null,
      purchased_items: undefined,
      low_confidence_fields: ["counterparty", "merchant_name", "merchant_name_extracted", "type", "amount"],
    });

    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Testar OCR local" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar estes dados" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Usar estes dados" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());

    const titleInput = screen.getByLabelText(/título/i) as HTMLInputElement;
    expect(titleInput.value).toBe("");
    expect(screen.getByText(/confira este campo/i)).toBeInTheDocument();
  });

  it("Clicar 'Usar estes dados' NÃO chama addTransaction imediatamente", async () => {
    mocks.extractReceiptText.mockResolvedValue({
      text: "Pix enviado\nR$ 50,00\n10/09/2026",
      confidence: 80,
      durationMs: 1000,
    });
    mocks.parseReceiptText.mockReturnValue({
      is_receipt: true,
      type: "expense",
      amount: 50,
      date: "2026-09-10",
      time: null,
      counterparty: null,
      institution: null,
      payment_method: "Pix",
      category_hint: null,
      receipt_id: null,
      merchant_name: null,
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: "Despesa",
      notes: null,
      purchased_items: undefined,
      low_confidence_fields: ["type", "counterparty"],
    });

    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Testar OCR local" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar estes dados" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Usar estes dados" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    expect(mocks.addTransaction).not.toHaveBeenCalled();
  });

  it("Somente o submit do TransactionForm salva", async () => {
    mocks.extractReceiptText.mockResolvedValue({
      text: "Pix enviado\nR$ 50,00\n10/09/2026",
      confidence: 80,
      durationMs: 1000,
    });
    mocks.parseReceiptText.mockReturnValue({
      is_receipt: true,
      type: "expense",
      amount: 50,
      date: "2026-09-10",
      time: null,
      counterparty: null,
      institution: null,
      payment_method: "Pix",
      category_hint: null,
      receipt_id: null,
      merchant_name: null,
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: "Despesa",
      notes: null,
      purchased_items: undefined,
      low_confidence_fields: [],
    });

    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Testar OCR local" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar estes dados" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Usar estes dados" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());

    expect(mocks.addTransaction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));
    expect(mocks.addTransaction).toHaveBeenCalledTimes(1);
  });

  it("Botão 'Usar estes dados' não aparece quando OCR não é comprovante", async () => {
    mocks.extractReceiptText.mockResolvedValue({
      text: "Texto qualquer sem comprovante",
      confidence: 50,
      durationMs: 800,
    });
    mocks.parseReceiptText.mockReturnValue({
      is_receipt: false,
      type: "unknown",
      amount: null,
      date: null,
      time: null,
      counterparty: null,
      institution: null,
      payment_method: null,
      category_hint: null,
      receipt_id: null,
      merchant_name: null,
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: null,
      notes: null,
      purchased_items: undefined,
      low_confidence_fields: [],
    });

    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Testar OCR local" }));
    await waitFor(() => expect(screen.getByText("Resultado do OCR Local")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "Usar estes dados" })).not.toBeInTheDocument();
  });

  it("Botão 'Usar estes dados' não aparece quando amount é null", async () => {
    mocks.extractReceiptText.mockResolvedValue({
      text: "Comprovante\nData: 10/09/2026\nPix",
      confidence: 40,
      durationMs: 800,
    });
    mocks.parseReceiptText.mockReturnValue({
      is_receipt: true,
      type: "expense",
      amount: null,
      date: "2026-09-10",
      time: null,
      counterparty: null,
      institution: null,
      payment_method: null,
      category_hint: null,
      receipt_id: null,
      merchant_name: null,
      tax_id: null,
      fiscal_document_number: null,
      card_brand: null,
      card_last_four: null,
      title: "Despesa",
      notes: null,
      purchased_items: undefined,
      low_confidence_fields: ["amount"],
    });

    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Testar OCR local" }));
    await waitFor(() => expect(screen.getByText("Resultado do OCR Local")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "Usar estes dados" })).not.toBeInTheDocument();
  });
});

describe("PaddleOCR main flow (no paid AI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.takeSharedReceipt.mockResolvedValue(null);
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

  it("clicking 'Ler comprovante' uses PaddleOCR and never parseReceipt, passing the original file as attachment", async () => {
    const { file } = selectFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Ler comprovante" })).toBeInTheDocument());
    expect(mocks.paddleRecognize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ler comprovante" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    expect(mocks.paddleRecognize).toHaveBeenCalledWith(
      "data:image/jpeg;base64,TEST",
      expect.any(Function),
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Ler comprovante" }));

    expect(
      await screen.findByText("Não foi possível ler o comprovante agora. Verifique a foto e tente novamente."),
    ).toBeInTheDocument();
    expect(mocks.paddleRecognize).toHaveBeenCalled();
    expect(mocks.buildPaddleReceiptResult).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.addTransaction).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirmar importação" })).not.toBeInTheDocument();
  });

  it("shared receipt is processed automatically through PaddleOCR", async () => {
    const sharedFile = new File(["shared"], "shared.jpg", { type: "image/jpeg" });
    mocks.takeSharedReceipt.mockResolvedValue(sharedFile);

    render(<ReceiptImport />);

    await waitFor(() => expect(mocks.takeSharedReceipt).toHaveBeenCalled());
    await waitFor(() =>
      expect(mocks.paddleRecognize).toHaveBeenCalledWith(
        "data:image/jpeg;base64,TEST",
        expect.any(Function),
      ),
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
    fireEvent.click(screen.getByRole("button", { name: "Ler comprovante" }));

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
