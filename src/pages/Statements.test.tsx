import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Statements from "@/pages/Statements";
import type { Transaction } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  transactions: [] as Transaction[],
  pdfSave: vi.fn(),
  pdfTable: vi.fn(),
  csvBlobs: [] as { parts: BlobPart[] }[],
  csvFilenames: [] as string[],
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
vi.mock("@/components/ui/dropdown-menu", () => {
  const Container = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Container,
    DropdownMenuTrigger: Container,
    DropdownMenuContent: Container,
    DropdownMenuItem: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>{children}</button>
    ),
  };
});
vi.mock("exceljs", () => {
  const createCell = () => ({ value: null as unknown, font: null, fill: null, alignment: null, numFmt: "" });
  const rows = new Map<number, Map<number, ReturnType<typeof createCell>>>();
  const getCell = (row: number, col: number) => {
    if (!rows.has(row)) rows.set(row, new Map());
    const cells = rows.get(row)!;
    if (!cells.has(col)) cells.set(col, createCell());
    return cells.get(col)!;
  };
  const ws = {
    columns: [] as unknown[],
    mergeCells: vi.fn(),
    getRow: vi.fn(() => ({ height: null as number | null })),
    getCell,
    autoFilter: null as unknown,
    views: [] as unknown[],
  };
  return {
    default: {
      Workbook: vi.fn(() => ({
        addWorksheet: vi.fn(() => ws),
        xlsx: { writeBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(8))) },
      })),
    },
  };
});
vi.mock("jspdf", () => ({
  default: vi.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    setFillColor: vi.fn(),
    text: vi.fn(),
    roundedRect: vi.fn(),
    save: mocks.pdfSave,
    getNumberOfPages: vi.fn(() => 1),
  })),
}));
vi.mock("jspdf-autotable", () => ({
  default: mocks.pdfTable,
}));
vi.mock("recharts", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    Area: Empty,
    AreaChart: Empty,
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
    mocks.csvBlobs = [];
    mocks.csvFilenames = [];
    vi.stubGlobal(
      "Blob",
      vi.fn((parts: BlobPart[]) => {
        const blob = { parts };
        mocks.csvBlobs.push(blob);
        return blob;
      }),
    );
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() }),
    );
    const realCreateElement = document.createElement.bind(document);
    vi.stubGlobal(
      "document",
      Object.assign(document, {
        createElement: vi.fn((tag: string, ...args: unknown[]) => {
          if (tag !== "a") return (realCreateElement as (...a: unknown[]) => unknown)(tag, ...args);
          return {
            href: "",
            download: "",
            click: vi.fn(function (this: { download: string }) {
              mocks.csvFilenames.push(this.download);
            }),
          };
        }),
      }),
    );
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

  it("stretches the evolution graph to the height of its neighboring card", () => {
    mocks.transactions = [salary, rent];
    const { container } = render(<Statements />);
    setPeriod(container, "2026-09-01", "2026-09-30");

    const graphArea = screen.getByTestId("statements-evolution-chart-area");
    expect(graphArea).toHaveClass("flex-1", "min-h-[200px]");
    expect(graphArea.parentElement).toHaveClass("flex", "h-full", "flex-col");
    expect(graphArea.closest("section")).toHaveTextContent("Evolução no tempo");
  });

  it("keeps the origin chart informative without trapping users in drilldown", () => {
    mocks.transactions = [purchaseA, purchaseB, obligation, payment];
    const { container } = render(<Statements />);
    setPeriod(container, "2026-09-01", "2026-09-30");

    expect(screen.getByText("Movimentado por conta ou cartão")).toBeInTheDocument();
    const accountLabel = screen.getByText(/Conta Caixa · R\$/);
    const cardLabel = screen.getByText(/Caixa Master Camila \(Cartão\) · R\$/);

    expect(accountLabel.closest("button")).toBeNull();
    expect(cardLabel.closest("button")).toBeNull();
    const initialRows = table().getAllByRole("row").length;
    fireEvent.click(cardLabel);
    fireEvent.click(accountLabel);
    expect(table().getAllByRole("row")).toHaveLength(initialRows);
    expect(screen.queryByRole("button", { name: "Remover filtro de origem" })).not.toBeInTheDocument();
    expect(screen.getByText("Movimentado por conta ou cartão")).toBeInTheDocument();
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

  it("opens details from a top movement and exports exactly the filtered rows", async () => {
    mocks.transactions = [purchaseA, purchaseB];
    const { container } = render(<Statements />);
    setPeriod(container, "2026-09-01", "2026-09-30");

    fireEvent.click(within(screen.getByTestId("top-movements")).getByText("Supermercado"));
    expect(screen.getByTestId("transaction-detail")).toHaveTextContent("Supermercado");

    fireEvent.click(categoryLegend().getByRole("button", { name: /Alimentação/ }));
    fireEvent.click(screen.getByRole("button", { name: /Exportar Excel/ }));
    await vi.waitFor(() => expect(mocks.csvFilenames.length).toBe(1));
    expect(mocks.csvFilenames[0]).toBe("FinanceControl_Extrato_Todas_2026-09-01_2026-09-30.xlsx");

    fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/ }));
    await vi.waitFor(() => expect(mocks.csvFilenames.length).toBe(2));
    expect(mocks.csvFilenames[1]).toBe("FinanceControl_Extrato_Todas_2026-09-01_2026-09-30.csv");
    const csv = String(mocks.csvBlobs[1].parts[0]);
    expect(csv).toContain("Supermercado");
    expect(csv).not.toContain("Farmácia");

    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/ }));
    await vi.waitFor(() => expect(mocks.pdfSave).toHaveBeenCalledTimes(1));
    expect(mocks.pdfSave).toHaveBeenCalledWith(
      "FinanceControl_Extrato_Todas_2026-09-01_2026-09-30.pdf",
    );
    const body = mocks.pdfTable.mock.calls[0][1].body as string[][];
    expect(body).toHaveLength(1);
    expect(body[0][1]).toBe("Supermercado");
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
