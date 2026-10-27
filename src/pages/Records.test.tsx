import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Records, { summarizeFilteredRecords } from "@/pages/Records";
import type { Transaction } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  transactions: [] as Record<string, unknown>[],
  invoices: [] as Record<string, unknown>[],
  categories: ["Alimentação", "Transporte", "Saúde", "Renda", "Fatura Cartão", "Ajuste"],
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
  useCategories: () => ({ allCategoryNames: mocks.categories }),
}));

vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({
    accounts: [{ id: "account-1", name: "Inter", bank: "Inter" }],
    creditCards: [{ id: "card-1", name: "Caixa Master Camila", bank: "Caixa", limit: 5000, closingDay: 25, dueDay: 7, color: "blue" }],
  }),
}));

vi.mock("@/components/TransactionForm", () => ({ TransactionForm: () => null }));
vi.mock("@/components/TransactionDetail", () => ({ TransactionDetail: () => null }));
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const SelectContext = React.createContext<(value: string) => void>(() => {});
  const Select = ({
    children,
    onValueChange,
  }: {
    children?: ReactNode;
    onValueChange?: (value: string) => void;
  }) => <SelectContext.Provider value={onValueChange ?? (() => {})}>{children}</SelectContext.Provider>;
  const SelectItem = ({ value, children }: { value: string; children?: ReactNode }) => {
    const onChange = React.useContext(SelectContext);
    return (
      <button type="button" onClick={() => onChange(value)}>
        {children}
      </button>
    );
  };
  const SelectTrigger = ({ children }: { children?: ReactNode }) => <div role="combobox">{children}</div>;
  const SelectValue = () => null;
  const SelectContent = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
});
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

  it("matches the dashboard actions, with full names and bold text on narrow screens", () => {
    renderRecords();
    const readReceipt = screen.getByRole("link", { name: "Ler Comprovante" });
    const addRecord = screen.getByRole("button", { name: "Novo Registro" });
    expect(readReceipt).toHaveAttribute("href", "/receipt");
    expect(readReceipt).toHaveClass("font-bold", "h-11", "rounded-xl");
    expect(addRecord).toHaveClass("font-extrabold", "h-11", "rounded-xl");
    expect(screen.queryByRole("link", { name: "Comprovante" })).not.toBeInTheDocument();
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

describe("summarizeFilteredRecords", () => {
  const base = { isPaid: true } as Partial<Transaction>;

  it("sums only valid incomes and expenses, excluding neutrals, with exact cents", () => {
    const records: Transaction[] = [
      { ...base, id: "1", title: "A", amount: 0.1, type: "expense", category: "Alimentação", date: "2026-10-01" },
      { ...base, id: "2", title: "B", amount: 0.2, type: "expense", category: "Alimentação", date: "2026-10-02" },
      { ...base, id: "3", title: "Salário", amount: 1000, type: "income", category: "Renda", date: "2026-10-03" },
      { ...base, id: "4", title: "Pagamento de Fatura", amount: 500, type: "expense", category: "Fatura Cartão", date: "2026-10-04", financialKind: "card_invoice_payment" },
      { ...base, id: "5", title: "Ajuste de saldo", amount: 25, type: "expense", category: "Ajuste", date: "2026-10-05", financialKind: "manual_adjustment" },
    ] as Transaction[];

    const summary = summarizeFilteredRecords(records);
    expect(summary.expense).toBe(0.3); // 0.10 + 0.20, no float drift
    expect(summary.income).toBe(1000);
    expect(summary.balance).toBe(999.7);
    expect(summary.count).toBe(5);
    expect(summary.neutral).toBe(2);
  });

  it("returns zeros for an empty selection", () => {
    expect(summarizeFilteredRecords([])).toEqual({
      income: 0,
      expense: 0,
      neutral: 0,
      count: 0,
      balance: 0,
    });
  });
});

describe("Records dynamic filtered total", () => {
  const record = (overrides: Record<string, unknown>) => ({
    isPaid: true,
    paymentMethod: "Pix",
    accountId: "account-1",
    ...overrides,
  });

  const dataset: Transaction[] = [
    record({ id: "p1", title: "Padaria Alvorada", amount: 120.3, type: "expense", category: "Alimentação", date: "2026-10-01" }),
    record({ id: "p2", title: "Padaria Alvorada Pães", amount: 150.2, type: "expense", category: "Alimentação", date: "2026-10-02" }),
    record({ id: "p3", title: "Padaria Alvorada", amount: 117, type: "expense", category: "Alimentação", date: "2026-10-03", accountId: "account-2", paymentMethod: "Dinheiro" }),
    record({ id: "o1", title: "Posto Avenida", amount: 200, type: "expense", category: "Transporte", date: "2026-10-04", accountId: "account-2" }),
    record({ id: "o2", title: "Farmácia Saúde", amount: 80.5, type: "expense", category: "Saúde", date: "2026-10-05", accountId: "account-2" }),
    record({ id: "i1", title: "Salário", amount: 3000, type: "income", category: "Renda", date: "2026-10-06" }),
    record({ id: "b1", title: "Pagamento de Fatura", amount: 500, type: "expense", category: "Fatura Cartão", date: "2026-10-07", financialKind: "card_invoice_payment" }),
    record({ id: "j1", title: "Ajuste de saldo", amount: 25, type: "expense", category: "Ajuste", date: "2026-10-08", financialKind: "manual_adjustment" }),
  ] as unknown as Transaction[];

  beforeEach(() => {
    mocks.transactions = dataset as unknown as Record<string, unknown>[];
    mocks.invoices = [];
  });

  const summaries = () => screen.getAllByTestId("records-filtered-summary");
  const typeSearch = (value: string) => {
    const input = screen.getByPlaceholderText("Buscar em todas as colunas...");
    fireEvent.change(input, { target: { value } });
  };

  it("totals only the three Padaria Alvorada expenses when searching by establishment", () => {
    renderRecords();
    typeSearch("Padaria Alvorada");

    const summary = summaries()[0];
    expect(summary).toHaveTextContent("Total de despesas filtradas:");
    expect(summary).toHaveTextContent("R$ 387,50");
    expect(summary).toHaveTextContent("Quantidade de registros: 3");
    // Desktop copy stays in sync with the mobile copy.
    expect(summaries()).toHaveLength(2);
    expect(summaries()[1]).toHaveTextContent("R$ 387,50");
  });

  it("shows entradas, saídas and saldo do recorte for mixed results without counting neutrals", () => {
    renderRecords();

    const summary = summaries()[0];
    expect(summary).toHaveTextContent("Total de entradas:");
    expect(summary).toHaveTextContent("R$ 3.000,00");
    expect(summary).toHaveTextContent("Total de saídas:");
    expect(summary).toHaveTextContent("R$ 668,00");
    expect(summary).toHaveTextContent("Saldo do recorte:");
    expect(summary).toHaveTextContent("R$ 2.332,00");
    expect(summary).toHaveTextContent("Quantidade de registros: 8");
    expect(summary).toHaveTextContent("neutra(s)");
  });

  it("recomputes immediately when combining search, type, category and account filters", () => {
    renderRecords();
    typeSearch("Padaria");

    fireEvent.click(screen.getByRole("button", { name: "Alimentação" }));
    fireEvent.click(screen.getByRole("button", { name: "Saída" }));
    fireEvent.click(screen.getByRole("button", { name: "Inter" }));

    // Inter holds p1 + p2 only (p3 lives on account-2).
    expect(summaries()[0]).toHaveTextContent("R$ 270,50");
    expect(summaries()[0]).toHaveTextContent("Quantidade de registros: 2");

    // Clearing the search keeps the other filters: same two records.
    typeSearch("");
    expect(summaries()[0]).toHaveTextContent("R$ 270,50");

    // Searching all padarias without the account filter: back to 387,50.
    fireEvent.click(screen.getByRole("button", { name: "Todas as contas" }));
    typeSearch("padaria alvorada");
    expect(summaries()[0]).toHaveTextContent("R$ 387,50");
  }, 20000);

  it("highlights the income total when only incomes remain", () => {
    renderRecords();
    typeSearch("Salário");

    const summary = summaries()[0];
    expect(summary).toHaveTextContent("Total de entradas filtradas:");
    expect(summary).toHaveTextContent("R$ 3.000,00");
    expect(summary).toHaveTextContent("Quantidade de registros: 1");
  });

  it("keeps bill payments and adjustments visible but never inside the subtotals", () => {
    mocks.transactions = [
      record({ id: "x1", title: "Padaria Alvorada", amount: 100, type: "expense", category: "Alimentação", date: "2026-10-01" }),
      record({ id: "x2", title: "Pagamento de Fatura", amount: 999.99, type: "expense", category: "Fatura Cartão", date: "2026-10-02", financialKind: "card_invoice_payment" }),
      record({ id: "x3", title: "Ajuste de saldo", amount: 55.55, type: "expense", category: "Ajuste", date: "2026-10-03", financialKind: "manual_adjustment" }),
    ] as unknown as Record<string, unknown>[];

    renderRecords();

    expect(screen.getAllByText("Pagamento de Fatura").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ajuste de saldo").length).toBeGreaterThan(0);
    const summary = summaries()[0];
    expect(summary).toHaveTextContent("Total de despesas filtradas:");
    expect(summary).toHaveTextContent("R$ 100,00");
    expect(summary).toHaveTextContent("Quantidade de registros: 3");
    expect(summary).toHaveTextContent("neutra(s)");
  });
});
