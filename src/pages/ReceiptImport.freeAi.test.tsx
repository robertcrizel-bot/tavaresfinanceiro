import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const FREE_BUTTON = /Ler comprovante gr\u00e1tis/;
const PAID_BUTTON = /IA do Lovable/;


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

function selectFile(file = new File(["receipt"], "cupom.jpg", { type: "image/jpeg" })) {
  const { container } = render(<ReceiptImport />);
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input!, { target: { files: [file] } });
  return file;
}

describe("ReceiptImport free external AI reader (test)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/receipt");
    mocks.takeSharedReceiptWithDiagnostics.mockResolvedValue({ file: null, diag: null });
    mocks.duplicateLimit.mockResolvedValue({ data: [], error: null });
    mocks.getFreeAiStatus.mockResolvedValue({ state: "unavailable" });
    mocks.parseReceiptFree.mockResolvedValue(freeParsedReceipt());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["image/jpeg", "application/pdf"])("keeps %s selection compact and alternatives collapsed without starting a reader", async (type) => {
    mocks.getFreeAiStatus.mockResolvedValue({ state: "available" });
    const file = new File(["receipt"], type === "application/pdf" ? "comprovante.pdf" : "foto.jpg", { type });
    selectFile(file);
    expect(screen.getByText("Arquivo selecionado")).toBeInTheDocument();
    expect(screen.getByText(file.name)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: FREE_BUTTON })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Tirar nova foto" })).toBeEnabled();
    const summary = screen.getByText("Outros métodos de leitura");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "OCR local" })).not.toBeVisible();
    expect(screen.getByRole("button", { name: PAID_BUTTON })).not.toBeVisible();
    expect(screen.queryByText(/créditos|custo R\$/)).not.toBeInTheDocument();
    expect(document.querySelector("img, iframe, embed, object, canvas")).toBeNull();
    const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(picker, "click");
    fireEvent.click(screen.getByRole("button", { name: "Trocar arquivo" }));
    expect(click).toHaveBeenCalledOnce();
    fireEvent(picker, new Event("cancel"));
    expect(screen.getByText(file.name)).toBeInTheDocument();
    fireEvent.click(summary);
    expect(screen.getByRole("button", { name: "OCR local" })).toBeEnabled();
    expect(screen.getByRole("button", { name: PAID_BUTTON })).toBeEnabled();
    fireEvent.click(summary);
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
  });

describe.each(["free", "paid"] as const)("single-flight %s receipt reading", (provider) => {
  it("sends one request for ten rapid confirmations and permits retry after failure", async () => {
    mocks.getFreeAiStatus.mockResolvedValue({ state: "available" });
    const parse = provider === "free" ? mocks.parseReceiptFree : mocks.parseReceipt;
    let reject!: (error: Error) => void;
    parse.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    selectFile();
    if (provider === "paid") alternativeButton("IA do Lovable");
    fireEvent.click(await screen.findByRole("button", { name: provider === "free" ? FREE_BUTTON : PAID_BUTTON }));
    const confirmationName = provider === "free" ? "Continuar gr\u00e1tis" : "Continuar com IA";
    const confirmation = await screen.findByRole("button", { name: confirmationName });
    act(() => { for (let i = 0; i < 10; i++) fireEvent.click(confirmation); });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Lendo o comprovante...")).toBeInTheDocument();
    await act(async () => { reject(new Error("Synthetic read failure")); });
    expect(await screen.findByText("Synthetic read failure")).toBeInTheDocument();
    expect(provider === "free" ? mocks.parseReceipt : mocks.parseReceiptFree).not.toHaveBeenCalled();
    parse.mockResolvedValueOnce(freeParsedReceipt());
    if (provider === "paid") alternativeButton("IA do Lovable");
    fireEvent.click(screen.getByRole("button", { name: provider === "free" ? FREE_BUTTON : PAID_BUTTON }));
    fireEvent.click(await screen.findByRole("button", { name: confirmationName }));
    expect(await screen.findByTestId("review-form")).toBeInTheDocument();
    expect(parse).toHaveBeenCalledTimes(2);
  });
});


  it("shows an explicit unavailable status while the integration is not configured", async () => {
    mocks.getFreeAiStatus.mockResolvedValue({ state: "unavailable" });
    selectFile();
    await waitFor(() => expect(alternativeButton("OCR local")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: FREE_BUTTON })).not.toBeInTheDocument();
    expect(await screen.findByText("IA grátis indisponível no servidor no momento.")).toBeInTheDocument();
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();
  });

  it("shows the free AI button when the backend reports it configured", async () => {
    mocks.getFreeAiStatus.mockResolvedValue({ state: "available" });
    selectFile();
    expect(await screen.findByRole("button", { name: FREE_BUTTON })).toBeInTheDocument();
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
  });

  it("requires explicit consent mentioning the external free service before reading", async () => {
    mocks.getFreeAiStatus.mockResolvedValue({ state: "available" });
    selectFile();
    fireEvent.click(await screen.findByRole("button", { name: FREE_BUTTON }));
    expect(
      await screen.findByText(/envia a foto do comprovante para a Cloudflare Workers AI/),
    ).toBeInTheDocument();
    expect(screen.getByText(/cota diária limitada/)).toBeInTheDocument();
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText(/Cloudflare Workers AI/)).not.toBeInTheDocument());
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();
  });

  it("reads with the free provider and never with paid AI or the local OCR", async () => {
    mocks.getFreeAiStatus.mockResolvedValue({ state: "available" });
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
    mocks.getFreeAiStatus.mockResolvedValue({ state: "available" });
    selectFile();
    fireEvent.click(await findAlternativeButton("IA do Lovable"));
    expect(
      await screen.findByText("Esta leitura utiliza a IA do Lovable e pode consumir seus créditos. Deseja continuar?"),
    ).toBeInTheDocument();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();
  });

  it("warns about possible duplicates coming from the free reader", async () => {
    mocks.getFreeAiStatus.mockResolvedValue({ state: "available" });
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
    mocks.getFreeAiStatus.mockResolvedValue({ state: "available" });
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
    mocks.getFreeAiStatus.mockResolvedValue({ state: "available" });
    mocks.parseReceiptFree.mockResolvedValue(freeParsedReceipt({ is_receipt: false }));
    selectFile();
    fireEvent.click(await screen.findByRole("button", { name: FREE_BUTTON }));
    fireEvent.click(await screen.findByRole("button", { name: "Continuar grátis" }));

    expect(
      await screen.findByText("Essa imagem não parece ser um comprovante. Tente outra foto mais nítida."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("review-form")).not.toBeInTheDocument();
  });

  it("shows a checking status while the backend lookup is still in flight", async () => {
    let resolveStatus!: (value: unknown) => void;
    mocks.getFreeAiStatus.mockReturnValue(new Promise((resolve) => {
      resolveStatus = resolve;
    }));
    selectFile();

    const checkingButton = await screen.findByRole("button", { name: /Verificando IA grátis/ });
    expect(checkingButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: FREE_BUTTON })).not.toBeInTheDocument();

    resolveStatus({ state: "available" });
    expect(await screen.findByRole("button", { name: FREE_BUTTON })).toBeEnabled();
  });

  it("keeps a retry path visible when the status check fails, without claiming readiness", async () => {
    mocks.getFreeAiStatus.mockResolvedValue({ state: "error", reason: "network" });
    selectFile();

    expect(
      await screen.findByText("Não foi possível confirmar a IA grátis no servidor."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FREE_BUTTON })).not.toBeInTheDocument();
    expect(mocks.parseReceiptFree).not.toHaveBeenCalled();

    mocks.getFreeAiStatus.mockResolvedValue({ state: "available" });
    fireEvent.click(screen.getByRole("button", { name: "Verificar novamente" }));

    expect(await screen.findByRole("button", { name: FREE_BUTTON })).toBeEnabled();
    expect(screen.queryByText("Não foi possível confirmar a IA grátis no servidor.")).not.toBeInTheDocument();
  });

  it("does not claim the free reader is ready when the session is not authorized yet", async () => {
    mocks.getFreeAiStatus.mockResolvedValue({ state: "error", reason: "unauthorized" });
    selectFile();

    expect(
      await screen.findByText("Não foi possível confirmar a IA grátis no servidor."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FREE_BUTTON })).not.toBeInTheDocument();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
  });

  it("never falls back to the paid reader when the free status is an error", async () => {
    mocks.getFreeAiStatus.mockResolvedValue({ state: "error", reason: "server" });
    selectFile();

    expect(
      await screen.findByText("Não foi possível confirmar a IA grátis no servidor."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FREE_BUTTON })).not.toBeInTheDocument();
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.paddleRecognizeWorker).not.toHaveBeenCalled();
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
