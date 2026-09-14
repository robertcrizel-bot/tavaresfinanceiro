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
  TransactionForm: ({ prefill, prefillAttachments, onSubmit }: {
    prefill: Record<string, unknown>;
    prefillAttachments?: File[];
    onSubmit: (data: Record<string, unknown>, options?: { attachments?: File[] }) => void;
  }) => (
    <button type="button" onClick={() => onSubmit(prefill, { attachments: prefillAttachments })}>
      Confirmar importação
    </button>
  ),
}));

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
    mocks.parseReceipt.mockResolvedValue({
      is_receipt: true,
      type: "expense",
      amount: 120,
      date: "2026-09-11",
      time: "12:00",
      counterparty: "Mercado",
      institution: null,
      payment_method: "Cartão de Débito",
      category_hint: "Alimentação",
      receipt_id: "receipt-1",
      merchant_name: "  Mercado Central  ",
      tax_id: "  12.345.678/0001-90  ",
      fiscal_document_number: "  12345  ",
      card_brand: "  Visa  ",
      card_last_four: "  4321  ",
      title: "Mercado",
      notes: null,
      purchased_items: [],
      low_confidence_fields: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps AI metadata and submits it with the receipt reference and attachment", async () => {
    const { container } = render(<ReceiptImport />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));

    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptDetails: {
          merchantName: "Mercado Central",
          taxId: "12.345.678/0001-90",
          fiscalDocumentNumber: "12345",
          cardBrand: "Visa",
          cardLastFour: "4321",
        },
      }),
      expect.objectContaining({ receiptRef: "receipt-1", attachments: [file] }),
    );
  });

  it("keeps Escolher arquivo on the normal file input and receipt parser", async () => {
    const { container } = render(<ReceiptImport />);
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const input = inputs[0];
    const file = new File(["receipt"], "gallery-receipt.jpg", { type: "image/jpeg" });

    expect(inputs).toHaveLength(1);
    expect(input).toBeDefined();
    expect(input.accept).toBe("image/*,application/pdf");
    expect(input).not.toHaveAttribute("capture");

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mocks.parseReceipt).toHaveBeenCalledWith(file, {
      categories: ["Alimentação", "Outros"],
      accounts: [],
    }));
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

  it("captures a bounded JPEG, stops the camera and sends the File to the receipt parser", async () => {
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

    await waitFor(() => expect(mocks.parseReceipt).toHaveBeenCalled());
    const capturedFile = mocks.parseReceipt.mock.calls[0][0] as File;
    expect(capturedFile).toBeInstanceOf(File);
    expect(capturedFile.type).toBe("image/jpeg");
    expect(capturedFile.name).toMatch(/^comprovante-.*\.jpg$/);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1920, 1080);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.9);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);
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

    await waitFor(() => expect(mocks.parseReceipt).toHaveBeenCalled());
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
