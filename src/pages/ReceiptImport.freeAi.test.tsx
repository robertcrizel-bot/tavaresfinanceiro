import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReceiptImport from "@/pages/ReceiptImport";

const mocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  navigate: vi.fn(),
  parseReceipt: vi.fn(),
  parseReceiptFree: vi.fn(),
  getFreeAiStatus: vi.fn(),
  takeSharedReceiptWithDiagnostics: vi.fn(),
  duplicateLimit: vi.fn(),
  toast: vi.fn(),
  paddleRecognizeWorker: vi.fn(),
  releaseDocumentOrientationSession: vi.fn(),
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
  isShareWorkerOutdated: () => false,
}));
vi.mock("@/lib/receipt", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/receipt")>(),
  parseReceipt: mocks.parseReceipt,
  parseReceiptFree: mocks.parseReceiptFree,
  getFreeAiStatus: mocks.getFreeAiStatus,
  prepareReceiptForLocalOcr: mocks.prepareReceiptForLocalOcr,
}));
vi.mock("@/lib/paddle-ocr-worker", () => ({
  PaddleOcrError: class PaddleOcrError extends Error {},
  formatOcrDiagnostic: () => "",
  paddleRecognizeWorker: mocks.paddleRecognizeWorker,
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
  TransactionForm: ({ open, prefill }: { open: boolean; prefill: Record<string, unknown> }) => open ? (
    <div data-testid="review-form">
      <span data-testid="prefill-title">{String(prefill.title ?? "")}</span>
    </div>
  ) : null,
}));

const FREE_BUTTON = /Ler com IA grátis \(teste\)/;
const PAID_BUTTON = /Ler com IA$/;

function freeParsedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    is_receipt: true,
    type: "expense",
    amount: 92.58,
    date: "2026-10-12",
    time: "19:42:11",
    counterparty: null,
    institution: null,
    payment_method: "Pix",
    category_hint: "Alimentação",
    receipt_id: "E12345678901234567890",
    merchant_name: "MERCADO TRADICAO LTDA",
    tax_id: "12.345.678/0001-90",
    fiscal_document_number: "55111",
    card_brand: null,
    card_last_four: null,
    title: "Mercado Tradição",
    notes: "Item cancelado conforme cupom.",
    purchased_items: [
      { name: "PAO FRANCES Kg", quantity: 0.274, unit_price: 21.99, total: 6.03 },
      { name: "REFRIGERANTE 2L (CANCELADO)", quantity: 1, unit_price: 8.99, total: -8.99 },
    ],
    low_confidence_fields: [],
    ...overrides,
  };
}

function selectFile() {
  const { container } = render(<ReceiptImport />);
  const input = container.querySelector('input[type="file"]');
  const file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" });
  fireEvent.change(input!, { target: { files: [file] } });
  return file;
}

describe("ReceiptImport free external AI reader (test)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/receipt");
    mocks.takeSharedReceiptWithDiagnostics.mockResolvedValue({ file: null, diag: null });
    mocks.duplicateLimit.mockResolvedValue({ data: [], error: null });
    mocks.getFreeAiStatus.mockResolvedValue(false);
    mocks.parseReceiptFree.mockResolvedValue(freeParsedReceipt());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not show the free AI button while the integration is not configured", async () => {
    mocks.getFreeAiStatus.mockResolvedValue(false);
    selectFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Ler gratuitamente" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: FREE_BUTTON })).not.toBeInTheDocument();
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();
  });

  it("shows the free AI button when the backend reports it configured", async () => {
    mocks.getFreeAiStatus.mockResolvedValue(true);
    selectFile();
    expect(await screen.findByRole("button", { name: FREE_BUTTON })).toBeInTheDocument();
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
  });

  it("requires explicit consent mentioning the external free service before reading", async () => {
    mocks.getFreeAiStatus.mockResolvedValue(true);
    selectFile();
    fireEvent.click(await screen.findByRole("button", { name: FREE_BUTTON }));
    expect(
      await screen.findByText(/envia a foto do comprovante para o Google Gemini no modo gratuito/),
    ).toBeInTheDocument();
    expect(screen.getByText(/cota limitada/)).toBeInTheDocument();
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText(/Google Gemini/)).not.toBeInTheDocument());
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();
  });

  it("reads with the free provider and never with paid AI or the local OCR", async () => {
    mocks.getFreeAiStatus.mockResolvedValue(true);
    const file = selectFile();
    fireEvent.click(await screen.findByRole("button", { name: FREE_BUTTON }));
    fireEvent.click(await screen.findByRole("button", { name: "Continuar grátis" }));

    await waitFor(() => expect(mocks.parseReceiptFree).toHaveBeenCalledTimes(1));
    expect(mocks.parseReceiptFree).toHaveBeenCalledWith(file, {
      categories: ["Alimentação", "Outros"],
      accounts: [],
    });
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();

    expect(await screen.findByTestId("review-form")).toBeInTheDocument();
    expect(await screen.findByTestId("prefill-title")).toHaveTextContent("Mercado Tradição");
  });

  it("keeps the paid Lovable flow untouched when the free reader is enabled", async () => {
    mocks.getFreeAiStatus.mockResolvedValue(true);
    selectFile();
    fireEvent.click(await screen.findByRole("button", { name: PAID_BUTTON }));
    expect(
      await screen.findByText("Esta leitura utiliza a IA do Lovable e pode consumir seus créditos. Deseja continuar?"),
    ).toBeInTheDocument();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();
  });

  it("warns about possible duplicates coming from the free reader", async () => {
    mocks.getFreeAiStatus.mockResolvedValue(true);
    mocks.parseReceiptFree.mockResolvedValue(freeParsedReceipt({ receipt_id: "E999" }));
    mocks.duplicateLimit.mockResolvedValue({ data: [{ id: "existing-transaction" }], error: null });
    selectFile();
    fireEvent.click(await screen.findByRole("button", { name: FREE_BUTTON }));
    fireEvent.click(await screen.findByRole("button", { name: "Continuar grátis" }));

    expect(
      await screen.findByText("Esse comprovante já parece ter sido lançado antes. Confira antes de salvar de novo."),
    ).toBeInTheDocument();
    expect(mocks.addTransaction).not.toHaveBeenCalled();
  });

  it("surfaces free-reader errors (quota, auth, config) without any paid fallback", async () => {
    mocks.getFreeAiStatus.mockResolvedValue(true);
    mocks.parseReceiptFree.mockRejectedValue(new Error("A cota gratuita de IA foi atingida no momento."));
    selectFile();
    fireEvent.click(await screen.findByRole("button", { name: FREE_BUTTON }));
    fireEvent.click(await screen.findByRole("button", { name: "Continuar grátis" }));

    expect(await screen.findByText("A cota gratuita de IA foi atingida no momento.")).toBeInTheDocument();
    expect(screen.queryByTestId("review-form")).not.toBeInTheDocument();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
  });

  it("shows the non-receipt message when the free reader says the image is not a receipt", async () => {
    mocks.getFreeAiStatus.mockResolvedValue(true);
    mocks.parseReceiptFree.mockResolvedValue(freeParsedReceipt({ is_receipt: false }));
    selectFile();
    fireEvent.click(await screen.findByRole("button", { name: FREE_BUTTON }));
    fireEvent.click(await screen.findByRole("button", { name: "Continuar grátis" }));

    expect(
      await screen.findByText("Essa imagem não parece ser um comprovante. Tente outra foto mais nítida."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("review-form")).not.toBeInTheDocument();
  });
});
