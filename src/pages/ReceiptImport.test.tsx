import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
