import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Statements from "@/pages/Statements";
import type { Transaction } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  transactions: [] as Transaction[],
  writeFile: vi.fn(),
  jsonRows: [] as Record<string, string | number>[],
}));

vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({ transactions: mocks.transactions, creditCardInvoices: [] }),
}));
vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({
    accounts: [{ id: "acc-1", name: "Conta Caixa", bank: "Caixa" }],
    creditCards: [{ id: "card-1", name: "Caixa Master Camila", bank: "Caixa" }],
  }),
}));
vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({ allCategoryNames: ["Alimentação", "Saúde", "Moradia", "Salário", "Fatura Cartão"] }),
}));
vi.mock("@/components/TransactionDetail", () => ({
  TransactionDetail: ({ transaction, open }: { transaction: Transaction | null; open: boolean }) =>
    open && transaction ? <div data-testid="transaction-detail">{transaction.title}</div> : null,
}));
vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: vi.fn((rows: Record<string, string | number>[]) => {
      mocks.jsonRows = rows;
      return {};
    }),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
    decode_range: vi.fn(() => ({})),
    encode_range: vi.fn(() => "A1"),
  },
  writeFile: (...args: unknown[]) => mocks.writeFile(...args),
}));
vi.mock("recharts", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    Bar: Empty,
    BarChart: Container,
    CartesianGrid: Empty,
    Cell: Empty,
    Line: Empty,
    LineChart: Container,
    Pie: Container,
    PieChart: Container,
    ResponsiveContainer: Container,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});

function tx(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    title: "Lançamento",
    amount: 0,
    type: "expense",
    category: "Outros",
    date: "2026-09-10",
    ...overrides,
  } as Transaction;
}

const salary = tx({ id: "s1", title: "Salário", amount: 1000, type: "income", category: "Salário", accountId: "acc-1", date: "2026-09-01" });
const rent = tx({ id: "r1", title: "Aluguel", amount: 300, category: "Moradia", accountId: "acc-1", paymentMethod: "Pix", date: "2026-09-03" });
const purchaseA = tx({ id: "p1", title: "Supermercado", amount: 100, category: "Alimentação", creditCardId: "card-1", financialKind: "card_purchase", paymentMethod: "Cartão de Crédito", date: "2026-09-29" });
const purchaseB = tx({ id: "p2", title: "Farmácia", amount: 50, category: "Saúde", creditCardId: "card-1", financialKind: "card_purchase", paymentMethod: "Cartão de Crédito", date: "2026-09-05" });
const obligation = tx({
  id: "ob1", title: "Fatura Cartão", amount: 150, category: "Fatura Cartão",
  creditCardId: "card-1", creditCardInvoiceId: "inv-1", financialKind: "card_invoice_obligation", date: "2026-09-30",
});
const payment = tx({
  id: "pay1", title: "Pagamento de Fatura", amount: 150, category: "Fatura Cartão",
  accountId: "acc-1", creditCardId: "card-1", creditCardInvoiceId: "inv-1",
  financialKind: "card_invoice_payment", paymentMethod: "Transferência", date: "2026-09-30",
});

function setPeriod(container: HTMLElement, start: string, end: string) {
  const dates = container.querySelectorAll('input[type="date"]');
  fireEvent.change(dates[0], { target: { value: start } });
  fireEvent.change(dates[1], { target: { value: end } });
}

function table() {
  return within(screen.getByTestId("statement-table"));
}

function categoryLegend() {
  return within(screen.getByTestId("category-legend"));
}

describe("Statements page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactions = [];
    mocks.jsonRows = [];
  });

  it("shows account inflow, outflow and period balance", () => {
    mocks.transactions = [salary, rent];
    const { container } = render(<Statements />);
    setPeriod(container, "2026-09-01", "2026-09-30");
    expect(screen.getByText("R$ 1.000,00")).toBeInTheDocument();
    expect(screen.getAllByText("R$ 300,00")).toHaveLength(2);
    expect(screen.getByText("R$ 700,00")).toBeInTheDocument();
    expect(table().getByText("Aluguel")).toBeInTheDocument();
  });

  it("shows card purchases without invoice records and the payment once on the account", () => {
    mocks.transactions = [purchaseA, purchaseB, obligation, payment];
    const { container } = render(<Statements />);
    setPeriod(container, "2026-09-01", "2026-09-30");

    fireEvent.click(screen.getByRole("button", { name: /Caixa Master Camila.*R\$/ }));
    expect(screen.getByText("Total líquido")).toBeInTheDocument();
    expect(screen.getByText("Qtd. compras")).toBeInTheDocument();
    expect(table().queryByText("Fatura Cartão")).not.toBeInTheDocument();
    expect(table().getByText("Supermercado")).toBeInTheDocument();
    expect(table().getByText("Farmácia")).toBeInTheDocument();
    expect(table().getByText("- R$ 100,00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remover filtro de origem" }));
    fireEvent.click(screen.getByRole("button", { name: /Conta Caixa.*R\$/ }));
    expect(table().getAllByRole("row")).toHaveLength(2);
    expect(table().getAllByText("Pagamento de Fatura")).toHaveLength(2);
  });

  it("filters the table by clicking a category and clears it", () => {
    mocks.transactions = [purchaseA, purchaseB];
    const { container } = render(<Statements />);
    setPeriod(container, "2026-09-01", "2026-09-30");
    expect(table().getByText("Farmácia")).toBeInTheDocument();

    fireEvent.click(categoryLegend().getByRole("button", { name: /Alimentação/ }));
    expect(table().getByText("Supermercado")).toBeInTheDocument();
    expect(table().queryByText("Farmácia")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remover filtro de categoria" }));
    expect(table().getByText("Farmácia")).toBeInTheDocument();
  });

  it("filters by transaction.date and shows the empty state", () => {
    mocks.transactions = [purchaseA];
    const { container } = render(<Statements />);
    setPeriod(container, "2026-09-29", "2026-09-29");
    expect(table().getByText("Supermercado")).toBeInTheDocument();

    setPeriod(container, "2026-09-30", "2026-09-30");
    expect(
      screen.getByText("Nenhuma movimentação encontrada para os filtros selecionados."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Por categoria")).not.toBeInTheDocument();
  });

  it("opens details from a top movement and exports exactly the filtered rows", () => {
    mocks.transactions = [purchaseA, purchaseB];
    const { container } = render(<Statements />);
    setPeriod(container, "2026-09-01", "2026-09-30");

    fireEvent.click(within(screen.getByTestId("top-movements")).getByText("Supermercado"));
    expect(screen.getByTestId("transaction-detail")).toHaveTextContent("Supermercado");

    fireEvent.click(categoryLegend().getByRole("button", { name: /Alimentação/ }));
    fireEvent.click(screen.getByRole("button", { name: /Exportar/ }));
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.anything(),
      "FinanceControl_Extrato_2026-09-01_2026-09-30.xlsx",
    );
    expect(mocks.jsonRows).toHaveLength(1);
    expect(mocks.jsonRows[0]).toMatchObject({ Descrição: "Supermercado", Valor: -100 });
  });

  it("searches by title and merchant", () => {
    mocks.transactions = [purchaseA, purchaseB];
    const { container } = render(<Statements />);
    setPeriod(container, "2026-09-01", "2026-09-30");
    fireEvent.change(screen.getByPlaceholderText("Buscar título, descrição..."), { target: { value: "farmácia" } });
    expect(table().queryByText("Supermercado")).not.toBeInTheDocument();
    expect(table().getByText("Farmácia")).toBeInTheDocument();
  });
});
