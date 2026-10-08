import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Records from "@/pages/Records";

const mocks = vi.hoisted(() => ({
  transactions: [] as Record<string, unknown>[],
  invoices: [] as Record<string, unknown>[],
}));

vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({
    transactions: mocks.transactions,
    creditCardInvoices: mocks.invoices,
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  }),
}));

vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({ allCategoryNames: ["Fatura Cartão"] }),
}));

vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({
    accounts: [{ id: "account-1", name: "Inter", bank: "Inter" }],
    creditCards: [{ id: "card-1", name: "Caixa Master Camila", bank: "Caixa", limit: 5000, closingDay: 25, dueDay: 7, color: "blue" }],
  }),
}));

vi.mock("@/components/TransactionForm", () => ({ TransactionForm: () => null }));
vi.mock("@/components/TransactionDetail", () => ({ TransactionDetail: () => null }));
vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
    decode_range: vi.fn(() => ({})),
    encode_range: vi.fn(() => "A1"),
  },
  writeFile: vi.fn(),
}));

const obligation = {
  id: "obligation-1",
  title: "Fatura Cartão Caixa Master Camila - 09/2026",
  amount: 1174.33,
  type: "expense",
  category: "Fatura Cartão",
  date: "2026-10-07",
  creditCardId: "card-1",
  creditCardInvoiceId: "invoice-september",
  financialKind: "card_invoice_obligation",
  isPaid: true,
};

const payment = {
  ...obligation,
  id: "payment-1",
  title: "Pagamento de Fatura - Caixa Master Camila",
  date: "2026-10-08",
  accountId: "account-1",
  financialKind: "card_invoice_payment",
};

const invoice = {
  id: "invoice-september",
  creditCardId: "card-1",
  competence: "2026-09-01",
  cycleStart: "2026-08-26",
  cycleEnd: "2026-09-25",
  dueDate: "2026-10-07",
  status: "PAID",
  closedTotal: 1174.33,
  obligationTransactionId: "obligation-1",
  paymentTransactionId: "payment-1",
};

const renderRecords = () => render(<MemoryRouter><Records /></MemoryRouter>);

describe("Records invoice presentation", () => {
  beforeEach(() => {
    mocks.transactions = [];
    mocks.invoices = [];
  });

  it("collapses a paid obligation into the payment row with friendly labels", () => {
    mocks.transactions = [obligation, payment];
    mocks.invoices = [invoice];

    renderRecords();

    expect(screen.getAllByText("Caixa Master Camila - 09/2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pagamento").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pagamento de Fatura - Caixa Master Camila")).toBeNull();
    expect(screen.queryByText("Fatura Cartão Caixa Master Camila - 09/2026")).toBeNull();
    expect(screen.getAllByText("08/10/2026").length).toBeGreaterThan(0);
  });

  it("shows the unpaid obligation again after reversal", () => {
    mocks.transactions = [{ ...obligation, isPaid: false }];
    mocks.invoices = [{ ...invoice, status: "CLOSED", paymentTransactionId: undefined }];

    renderRecords();

    expect(screen.getAllByText("Caixa Master Camila - 09/2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fatura · A pagar").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pagamento de Fatura - Caixa Master Camila")).toBeNull();
  });
});
