import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExpenseAnalytics from "@/pages/ExpenseAnalytics";
import type { Transaction } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  transactions: [] as Transaction[],
  categories: [] as {
    id: string;
    name: string;
    type: "income" | "expense" | "both";
    monthlyBudget: number | null;
  }[],
  accounts: [{ id: "acc-1", name: "Nubank" }] as { id: string; name: string }[],
  creditCards: [] as { id: string; name: string }[],
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({
    transactions: mocks.transactions,
    addTransaction: vi.fn(),
    loading: false,
  }),
}));
vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({
    accounts: mocks.accounts,
    creditCards: mocks.creditCards,
    loading: false,
  }),
}));
vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({ categories: mocks.categories, loading: false }),
}));
vi.mock("@/components/TransactionDetail", () => ({
  TransactionDetail: ({ transaction }: { transaction: { title: string } | null }) =>
    transaction ? <div data-testid="transaction-detail">{transaction.title}</div> : null,
}));
vi.mock("@/components/ui/calendar", () => ({ Calendar: () => null }));
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
      <button type="button" data-select-item={value} onClick={() => onChange(value)}>
        {children}
      </button>
    );
  };
  const SelectTrigger = ({
    children,
    "aria-label": ariaLabel,
  }: {
    children?: ReactNode;
    "aria-label"?: string;
  }) => <div role="combobox" aria-label={ariaLabel}>{children}</div>;
  const SelectValue = () => null;
  const SelectContent = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
});
vi.mock("@/components/ui/popover", () => {
  const Container = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { Popover: Container, PopoverContent: Container, PopoverTrigger: Container };
});
vi.mock("lucide-react", () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    CalendarDays: Icon,
    CalendarIcon: Icon,
    Check: Icon,
    ChevronDown: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    ChevronUp: Icon,
    Lightbulb: Icon,
    Percent: Icon,
    PieChart: Icon,
    Search: Icon,
    Tag: Icon,
    Wallet: Icon,
    X: Icon,
  };
});
vi.mock("recharts", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Empty = () => null;

  return {
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

const pad = (value: number) => String(value).padStart(2, "0");
const localStr = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fmt = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const now = new Date();
const day1 = localStr(new Date(now.getFullYear(), now.getMonth(), 1));
const prevMonthDay1 = localStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const elapsedDays = now.getDate();

const expense = (
  id: string,
  date: string,
  amount: number,
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id,
  title: `Compra ${id}`,
  amount,
  type: "expense",
  category: "Alimentação",
  date,
  isPaid: true,
  ...overrides,
});

const categories = [
  { id: "c1", name: "Alimentação", type: "expense" as const, monthlyBudget: 1000 },
  { id: "c2", name: "Transporte", type: "expense" as const, monthlyBudget: 500 },
  { id: "c3", name: "Lazer", type: "expense" as const, monthlyBudget: null },
];

// Current month: Alimentação R$ 820,00 + Transporte R$ 610,00 = R$ 1.430,00
const dataset: Transaction[] = [
  expense("food", day1, 820, { category: "Alimentação", title: "Mercado" }),
  expense("ride", day1, 610, { category: "Transporte", title: "Uber" }),
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <ExpenseAnalytics />
    </MemoryRouter>,
  );

const periodButton = (label: string) =>
  screen.getAllByText(label)[0].closest("button") as HTMLButtonElement;
const clickPeriod = (label: string) => fireEvent.click(periodButton(label));
const kpiValue = (title: string) =>
  screen.getByText(title).closest(".dashboard-card")?.querySelector("p")?.textContent ?? "";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transactions = dataset;
  mocks.categories = categories;
  mocks.accounts = [{ id: "acc-1", name: "Nubank" }];
  mocks.creditCards = [];
});

describe("ExpenseAnalytics default period", () => {
  it("keeps all period and scope controls in the responsive sidebar, separate from indicators", () => {
    renderPage();
    const sidebar = screen.getByRole("complementary", { name: "Filtros de despesas" });
    for (const label of ["Mês", "3 meses", "6 meses", "Ano", "Personalizado"]) {
      expect(within(sidebar).getByRole("button", { name: label })).toBeInTheDocument();
    }
    for (const label of ["Filtrar por categoria", "Filtrar por conta ou cartão", "Filtrar por forma de pagamento"]) {
      expect(within(sidebar).getByRole("combobox", { name: label })).toBeInTheDocument();
    }
    expect(within(sidebar).getByRole("textbox")).toBeInTheDocument();
    expect(sidebar).not.toContainElement(screen.getByText("Gasto Total"));
    expect(sidebar.parentElement).toHaveClass("grid-cols-1", "lg:grid-cols-[230px_minmax(0,1fr)]");
    expect(sidebar.nextElementSibling).toHaveClass("min-w-0");
    const lowerSummary = screen.getByRole("region", { name: "Resumo detalhado do período" });
    for (const title of ["Onde meu dinheiro aumentou?", "Orçamento × Realizado", "Destaques do Período"]) {
      expect(within(lowerSummary).getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(sidebar).not.toContainElement(lowerSummary);
    const transactions = screen.getByRole("heading", { name: "Transações do Período" }).closest("section");
    expect(sidebar).not.toContainElement(transactions);
    expect(lowerSummary).not.toContainElement(transactions);
  });

  it("starts on Mês with the current-month totals, average and top category", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Análises de Despesas" })).toBeInTheDocument();
    expect(periodButton("Mês").className).toContain("bg-primary");
    expect(periodButton("3 meses").className).not.toContain("bg-primary");

    expect(kpiValue("Gasto Total")).toBe(fmt(1430));
    expect(kpiValue("Média por Dia")).toBe(fmt(1430 / elapsedDays));
    expect(kpiValue("Maior Categoria")).toBe("Alimentação");
    expect(screen.getByText("R$ 820,00 · 57%")).toBeInTheDocument();
  });

  it("compares against the equivalent previous window", () => {
    mocks.transactions = [
      expense("current", day1, 200),
      expense("previous", prevMonthDay1, 100),
    ];
    renderPage();

    expect(kpiValue("Variação")).toBe("↑ 100%");
    expect(screen.getByText("vs mês anterior")).toBeInTheDocument();
  });

  it("renders deterministic insights without AI", () => {
    renderPage();

    expect(screen.getByText("Destaques do Período")).toBeInTheDocument();
    expect(
      screen.getByText("Alimentação foi sua maior categoria, representando 57% das despesas."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Seus gastos aumentaram R$ 1.430,00 em relação ao período anterior."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Você estourou o orçamento de Transporte: R$ 610,00 de R$ 500,00 (122%)."),
    ).toBeInTheDocument();
  });
});

describe("ExpenseAnalytics anti-duplication", () => {
  it("excludes income, bill payments and adjustments from every total", () => {
    mocks.transactions = [
      expense("real", day1, 100, { title: "Mercado" }),
      expense("salary", day1, 500, { type: "income", title: "Salário" }),
      expense("ids", day1, 300, { accountId: "acc-1", creditCardId: "card-1" }),
      expense("title", day1, 400, { title: "Pagamento de fatura do cartão" }),
      expense("category", day1, 70, {
        category: "Pagamento Fatura" as unknown as Transaction["category"],
      }),
      expense("adjustment", day1, 50, { title: "Ajuste de saldo" }),
    ];
    renderPage();

    expect(kpiValue("Gasto Total")).toBe(fmt(100));
    expect(screen.getByText("1 transação")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("NaN");
  });
});
describe("ExpenseAnalytics empty states", () => {
  it("shows a friendly empty state without NaN or Infinity", () => {
    mocks.transactions = [];
    renderPage();

    expect(screen.getByText("Sem despesas no período")).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma despesa registrada entre/)).toBeInTheDocument();
    expect(kpiValue("Gasto Total")).toBe(fmt(0));
    expect(kpiValue("Média por Dia")).toBe(fmt(0));
    expect(kpiValue("Variação")).toBe("→ 0%");
    expect(screen.getByText(/Nenhuma transação no período/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("NaN");
    expect(document.body.textContent).not.toContain("Infinity");
  });

  it("asks for a budget when none is configured", () => {
    mocks.categories = [{ id: "c1", name: "Alimentação", type: "expense", monthlyBudget: null }];
    renderPage();

    expect(screen.getByText("Nenhum orçamento configurado para este período.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Definir orçamento" })).toBeInTheDocument();
  });
});

describe("ExpenseAnalytics category filter", () => {
  it("filters KPIs, budget and transactions by the selected category", () => {
    renderPage();

    const donutCard = screen
      .getByText("Gastos por Categoria")
      .closest(".dashboard-card") as HTMLElement;
    fireEvent.click(within(donutCard).getByRole("button", { name: /Alimentação/ }));

    expect(screen.getByText("Filtros ativos:")).toBeInTheDocument();
    expect(kpiValue("Gasto Total")).toBe(fmt(820));
    expect(kpiValue("Média por Dia")).toBe(fmt(820 / elapsedDays));
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.queryByText("Uber")).not.toBeInTheDocument();

    const budgetCard = screen
      .getByText("Orçamento × Realizado")
      .closest(".dashboard-card") as HTMLElement;
    expect(within(budgetCard).getByText("R$ 820,00 / R$ 1.000,00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Limpar filtro/ }));

    expect(screen.queryByText("Filtros ativos:")).not.toBeInTheDocument();
    expect(kpiValue("Gasto Total")).toBe(fmt(1430));
    expect(screen.getByText("Uber")).toBeInTheDocument();
  });

  it("explains when the selected category has no budget", () => {
    mocks.transactions = [
      expense("food", day1, 820, { category: "Alimentação", title: "Mercado" }),
      expense("fun", day1, 200, { category: "Lazer", title: "Cinema" }),
    ];
    renderPage();

    const donutCard = screen
      .getByText("Gastos por Categoria")
      .closest(".dashboard-card") as HTMLElement;
    fireEvent.click(within(donutCard).getByRole("button", { name: /Lazer/ }));

    expect(screen.getByText("Sem orçamento para Lazer neste período.")).toBeInTheDocument();
    expect(kpiValue("Gasto Total")).toBe(fmt(200));
  });
});

describe("ExpenseAnalytics budget", () => {
  it("shows budget versus actual with exceeded amounts", () => {
    renderPage();

    const budgetCard = screen
      .getByText("Orçamento × Realizado")
      .closest(".dashboard-card") as HTMLElement;

    expect(within(budgetCard).getByText("R$ 1.500,00")).toBeInTheDocument();
    expect(within(budgetCard).getByText("R$ 820,00 / R$ 1.000,00")).toBeInTheDocument();
    expect(within(budgetCard).getByText("82%")).toBeInTheDocument();
    expect(within(budgetCard).getByText("Disponível R$ 180,00")).toBeInTheDocument();
    expect(within(budgetCard).getByText("R$ 610,00 / R$ 500,00")).toBeInTheDocument();
    expect(within(budgetCard).getByText("122%")).toBeInTheDocument();
    expect(within(budgetCard).getByText("Excedido em R$ 110,00")).toBeInTheDocument();
  });
});

describe("ExpenseAnalytics period navigation", () => {
  it("moves to the previous period and back", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Período anterior" }));
    expect(kpiValue("Gasto Total")).toBe(fmt(0));
    expect(screen.getByText("Sem despesas no período")).toBeInTheDocument();
    expect(kpiValue("Variação")).toBe("→ 0%");

    const next = screen.getByRole("button", { name: "Próximo período" }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);

    expect(kpiValue("Gasto Total")).toBe(fmt(1430));
    expect(screen.queryByText("Sem despesas no período")).not.toBeInTheDocument();
  });

  it("switches to grouped evolution on longer periods", () => {
    renderPage();

    clickPeriod("3 meses");
    expect(periodButton("3 meses").className).toContain("bg-primary");
    expect(kpiValue("Gasto Total")).toBe(fmt(1430));
    expect(screen.getByText(/Agrupado por mês/)).toBeInTheDocument();
    expect(screen.getByText(/sem dados do período anterior para comparação/)).toBeInTheDocument();
  });

  it("uses a custom range defaulting to the current month", () => {
    renderPage();

    clickPeriod("Personalizado");

    expect(periodButton("Personalizado").className).toContain("bg-primary");
    expect(periodButton("Mês").className).not.toContain("bg-primary");
    expect(screen.queryByLabelText("Período anterior")).not.toBeInTheDocument();
    expect(kpiValue("Gasto Total")).toBe(fmt(1430));
  });
});

describe("ExpenseAnalytics drill-down", () => {
  it("opens the transaction detail from the period list", () => {
    renderPage();

    fireEvent.click(screen.getByText("Mercado").closest("button")!);

    expect(screen.getByTestId("transaction-detail")).toHaveTextContent("Mercado");
  });
});

describe("ExpenseAnalytics scope filters (establishment, origin, payment)", () => {
  const scopeDataset: Transaction[] = [
    expense("pad1", day1, 120.3, {
      title: "Padaria Alvorada",
      category: "Alimentação",
      paymentMethod: "Pix",
      accountId: "acc-1",
    }),
    expense("pad2", day1, 150.2, {
      title: "Padaria Alvorada Pães",
      category: "Alimentação",
      paymentMethod: "Pix",
      accountId: "acc-1",
    }),
    expense("pad3", day1, 117, {
      title: "Padaria Alvorada",
      category: "Alimentação",
      paymentMethod: "Dinheiro",
      accountId: "acc-2",
    }),
    expense("gas", day1, 200, {
      title: "Posto Avenida",
      category: "Transporte",
      paymentMethod: "Pix",
      accountId: "acc-2",
    }),
    expense("pad-prev", prevMonthDay1, 100, {
      title: "Padaria Alvorada",
      category: "Alimentação",
      paymentMethod: "Pix",
      accountId: "acc-1",
    }),
  ];

  const setupScope = () => {
    mocks.transactions = scopeDataset;
    mocks.categories = categories;
    mocks.accounts = [
      { id: "acc-1", name: "Nubank" },
      { id: "acc-2", name: "Inter" },
    ];
    renderPage();
  };

  const typeEstablishment = (value: string) => {
    const input = screen.getByLabelText("Pesquisar por estabelecimento ou descrição");
    fireEvent.change(input, { target: { value } });
  };

  const clickSelectItem = (label: string) => {
    fireEvent.click(screen.getByLabelText(label));
    // The mocked Select renders every option as a plain button.
  };

  it("narrows every indicator by the establishment search, ignoring case and accents", () => {
    setupScope();
    typeEstablishment("padaria alvorada");

    expect(kpiValue("Gasto Total")).toBe(fmt(387.5));
    expect(screen.getAllByText("Padaria Alvorada").length).toBeGreaterThan(0);
    expect(screen.getByText("Padaria Alvorada Pães")).toBeInTheDocument();
    expect(screen.queryByText("Posto Avenida")).not.toBeInTheDocument();
    expect(screen.getByText("“padaria alvorada”")).toBeInTheDocument();
  });

  it("filters by payment method and updates the active chip", () => {
    setupScope();
    clickSelectItem("Filtrar por forma de pagamento");
    fireEvent.click(screen.getByRole("button", { name: "Pix" }));

    expect(kpiValue("Gasto Total")).toBe(fmt(470.5)); // pad1 + pad2 + gas
    const banner = screen.getByText("Filtros ativos:").closest("div") as HTMLElement;
    expect(within(banner).getByText("Pix")).toBeInTheDocument();
  });

  it("filters by account origin and applies the same scope to the previous period", () => {
    setupScope();
    clickSelectItem("Filtrar por conta ou cartão");
    fireEvent.click(screen.getByRole("button", { name: "Inter" }));

    // pad3 (117) + gas (200); previous month has no Inter movement.
    expect(kpiValue("Gasto Total")).toBe(fmt(317));
    expect(kpiValue("Variação")).toContain("317,00"); // zero -> absolute delta, no percentage
  });

  it("combines establishment + account filters and clears them all at once", () => {
    setupScope();
    typeEstablishment("padaria");
    clickSelectItem("Filtrar por conta ou cartão");
    fireEvent.click(screen.getByRole("button", { name: "Nubank" }));

    // Nubank padarias: 120.30 + 150.20 = 270.50 (Inter padaria excluded).
    expect(kpiValue("Gasto Total")).toBe(fmt(270.5));

    // Previous period also Nubank + "padaria": 100 -> variation +170,5%.
    expect(kpiValue("Variação")).toContain("170,5%");

    fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/ }));

    expect(kpiValue("Gasto Total")).toBe(fmt(587.5));
    expect(screen.queryByText("Filtros ativos:")).not.toBeInTheDocument();
  });

  it("shows a clear empty state when filters exclude everything", () => {
    setupScope();
    typeEstablishment("estabelecimento inexistente");

    const emptyCard = screen
      .getByText("Nenhum resultado para os filtros")
      .closest(".dashboard-card") as HTMLElement;
    expect(emptyCard).toBeInTheDocument();

    fireEvent.click(within(emptyCard).getByRole("button", { name: /Limpar filtros/ }));
    expect(kpiValue("Gasto Total")).toBe(fmt(587.5));
  });

  it("warns in the budget card that filtered spend is a subset of the category budget", () => {
    setupScope();
    typeEstablishment("padaria");

    const budgetCard = screen
      .getByText("Orçamento × Realizado")
      .closest(".dashboard-card") as HTMLElement;
    expect(within(budgetCard).getByText(/subconjunto do gasto total da categoria/)).toBeInTheDocument();
  });

  it("keeps bill payments and adjustments out of the filtered totals", () => {
    mocks.transactions = [
      ...scopeDataset,
      expense("bill", day1, 999, {
        title: "Pagamento de Fatura",
        category: "Fatura Cartão",
        financialKind: "card_invoice_payment",
      }),
      expense("adj", day1, 55, {
        title: "Ajuste de saldo",
        category: "Ajuste",
        financialKind: "manual_adjustment",
      }),
    ];
    mocks.categories = categories;
    renderPage();

    expect(kpiValue("Gasto Total")).toBe(fmt(587.5));
  });
});

describe("payment summary in the analytics sidebar", () => {
  it("uses the same establishment filter as the charts and shows payment amounts", () => {
    mocks.transactions = [
      expense("pix", day1, 35, { title: "Padaria Alvorada", paymentMethod: "Pix" }),
      expense("card", day1, 20, { title: "Padaria Alvorada", paymentMethod: "Cartão de Crédito" }),
      expense("other", day1, 5, { title: "Outro mercado", paymentMethod: "Dinheiro" }),
    ];
    renderPage();
    const summary = screen.getByRole("region", { name: "Gastos por forma de pagamento" });
    expect(within(summary).getByText("Pix")).toBeInTheDocument();
    expect(within(summary).getByText("Cartão de Crédito")).toBeInTheDocument();
    const pixRow = within(summary).getByText("Pix").parentElement;
    const cardRow = within(summary).getByText("Cartão de Crédito").parentElement;
    expect(pixRow).toHaveTextContent(/R\$\s*35,00/);
    expect(cardRow).toHaveTextContent(/R\$\s*20,00/);

    fireEvent.change(screen.getByRole("textbox", { name: "Pesquisar por estabelecimento ou descrição" }), {
      target: { value: "padaria alvorada" },
    });
    expect(within(summary).queryByText("Dinheiro")).not.toBeInTheDocument();
    const totalRow = within(summary).getByText("Total").parentElement;
    expect(totalRow).toHaveTextContent(/R\$\s*55,00/);
    expect(kpiValue("Gasto Total")).toBe(fmt(55));
  });
});
