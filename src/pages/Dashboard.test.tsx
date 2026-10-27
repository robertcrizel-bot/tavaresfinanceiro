import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/Dashboard";
import type { Transaction } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  transactions: [] as Transaction[],
  addTransaction: vi.fn(),
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
    addTransaction: mocks.addTransaction,
    loading: false,
  }),
}));
vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({ accounts: [], creditCards: [], loading: false }),
}));
vi.mock("@/contexts/TransferContext", () => ({
  useTransfers: () => ({ transfers: [], loading: false }),
}));
vi.mock("@/components/TransactionForm", () => ({
  TransactionForm: () => null,
}));

const pad = (value: number) => String(value).padStart(2, "0");
const toLocalDateStr = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fmt = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const now = new Date();
const todayStr = toLocalDateStr(now);
const firstOfMonthStr = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
const lastOfMonthStr = toLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
const previousMonthEndStr = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 0));
const daysAgoStr = (days: number) =>
  toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
const daysElapsedThisMonth = now.getDate();

const expense = (id: string, date: string, amount: number): Transaction => ({
  id,
  title: `Compra ${id}`,
  amount,
  type: "expense",
  category: "Alimentação",
  date,
  isPaid: true,
});

const transactions: Transaction[] = [
  expense("today", todayStr, 101),
  expense("previous-month-end", previousMonthEndStr, 202),
  expense("ten-days-ago", daysAgoStr(10), 303),
  expense("month-end", lastOfMonthStr, 404),
  expense("sixty-days-ago", daysAgoStr(60), 606),
  { id: "salary", title: "Salário", amount: 707, type: "income", category: "Salário", date: todayStr, isPaid: true },
];

// Mirrors the day-window cutoffs used by the Dashboard for 7/15/30 day periods.
const cutoffStr = (days: number) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString().split("T")[0];
};

const sumExpenses = (from: string, to: string) =>
  transactions
    .filter((t) => t.type === "expense" && t.date >= from && t.date <= to)
    .reduce((total, t) => total + t.amount, 0);

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );

const periodButton = (label: string) =>
  screen.getAllByText(label)[0].closest("button") as HTMLButtonElement;
const clickPeriod = (label: string) => fireEvent.click(periodButton(label));
const kpiValue = (title: string) =>
  screen.getByText(title).closest(".dashboard-card")?.querySelector("p")?.textContent ?? "";

describe("Dashboard default period", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactions = transactions;
  });

  it("shows descriptive mobile-safe receipt action and bold standardized registration buttons", () => {
    renderDashboard();
    const readReceipt = screen.getByRole("link", { name: "Ler Comprovante" });
    const addRecord = screen.getByRole("button", { name: "Novo Registro" });
    expect(readReceipt).toHaveAttribute("href", "/receipt");
    expect(readReceipt).toHaveClass("font-bold");
    expect(addRecord).toHaveClass("font-extrabold");
    expect(readReceipt).toHaveClass("h-11", "rounded-xl");
    expect(addRecord).toHaveClass("h-11", "rounded-xl");
    expect(screen.queryByRole("link", { name: "Comprovante" })).not.toBeInTheDocument();
  });

  it("starts on Mês with the full current calendar month", () => {
    renderDashboard();

    expect(periodButton("Mês").className).toContain("bg-primary");
    expect(periodButton("30d").className).not.toContain("bg-primary");

    const monthExpense = sumExpenses(firstOfMonthStr, lastOfMonthStr);
    expect(kpiValue("Total de Saídas")).toBe(fmt(monthExpense));
    expect(kpiValue("Total de Entradas")).toBe(fmt(707));
    expect(kpiValue("Gasto Médio Diário")).toBe(fmt(monthExpense / daysElapsedThisMonth));
    expect(kpiValue("Maior Categoria")).toBe("Alimentação");
    const summary = screen.getByLabelText("Resumo do período");
    expect(within(summary).getByText("Dias no período").closest("div")).toHaveTextContent(String(daysElapsedThisMonth));
    expect(within(summary).getByText("Maior entrada").parentElement).toHaveTextContent(/R\$\s*707,00/);
    expect(within(summary).getByText("Maior entrada").parentElement).toHaveTextContent("Salário");
    expect(within(summary).getByText("Maior saída").parentElement).toHaveTextContent(/R\$\s*404,00/);
    expect(within(summary).getByText("Maior saída").parentElement).toHaveTextContent("Compra month-end");
    expect(within(summary).queryByText("Lançamentos")).not.toBeInTheDocument();
    expect(screen.queryByText("Contas/cartões")).not.toBeInTheDocument();
  });

  it("keeps the selected month totals while dividing daily averages by elapsed days", () => {
    renderDashboard();
    const monthExpense = sumExpenses(firstOfMonthStr, lastOfMonthStr);
    expect(kpiValue("Total de Saídas")).toBe(fmt(monthExpense));
    expect(kpiValue("Gasto Médio Diário")).toBe(fmt(monthExpense / new Date().getDate()));
  });

  it("uses the largest genuine expense, excluding neutral card settlements", () => {
    mocks.transactions = [
      expense("small", todayStr, 35),
      expense("large", todayStr, 420.30),
      { ...expense("settlement", todayStr, 9999), financialKind: "card_invoice_payment" },
    ];
    renderDashboard();
    expect(screen.getByText("Maior saída").parentElement).toHaveTextContent(/R\$\s*420,30/);
    expect(screen.getByText("Maior saída").parentElement).toHaveTextContent("Compra large");
    expect(screen.getByText("Maior entrada").parentElement).toHaveTextContent("Nenhuma entrada no período");
  });

  it("uses recent transactions to break ties and shows a useful fallback title", () => {
    mocks.transactions = [
      { ...expense("old", daysAgoStr(2), 500), title: "Compra antiga" },
      { ...expense("new", todayStr, 500), title: "Compra mais recente" },
      { id: "income-a", title: "", description: "Pagamento recebido\\nDetalhes adicionais", amount: 200, type: "income", category: "Outros", date: todayStr, isPaid: true },
    ];
    renderDashboard();
    expect(screen.getByText("Maior saída").parentElement).toHaveTextContent("Compra mais recente");
    expect(screen.getByText("Maior entrada").parentElement).toHaveTextContent("Pagamento recebido");
  });

  it("covers the whole month, including transactions after today and excluding the previous month", () => {
    renderDashboard();

    const monthExpense = sumExpenses(firstOfMonthStr, lastOfMonthStr);
    expect(monthExpense).toBe(101 + 404 + (daysAgoStr(10) >= firstOfMonthStr ? 303 : 0));
    expect(monthExpense).not.toBe(sumExpenses(cutoffStr(0), cutoffStr(0)));
    expect(kpiValue("Total de Saídas")).toBe(fmt(monthExpense));
    expect(kpiValue("Total de Saídas")).not.toBe(fmt(sumExpenses(previousMonthEndStr, lastOfMonthStr)));
  });

  it("keeps switching between 30d, 15d, 7d and Total working", () => {
    renderDashboard();

    clickPeriod("30d");
    expect(periodButton("30d").className).toContain("bg-primary");
    expect(periodButton("Mês").className).not.toContain("bg-primary");
    expect(kpiValue("Total de Saídas")).toBe(fmt(sumExpenses(cutoffStr(30), cutoffStr(0))));

    clickPeriod("15d");
    expect(periodButton("15d").className).toContain("bg-primary");
    expect(kpiValue("Total de Saídas")).toBe(fmt(sumExpenses(cutoffStr(15), cutoffStr(0))));

    clickPeriod("7d");
    expect(periodButton("7d").className).toContain("bg-primary");
    expect(kpiValue("Total de Saídas")).toBe(fmt(sumExpenses(cutoffStr(7), cutoffStr(0))));

    clickPeriod("Total");
    expect(periodButton("Mês").className).not.toContain("bg-primary");
    expect(kpiValue("Total de Saídas")).toBe(fmt(sumExpenses("0000-01-01", "9999-12-31")));
  });

  it("returns to the full current calendar month after selecting Total", () => {
    renderDashboard();

    clickPeriod("Total");
    clickPeriod("Mês");

    expect(periodButton("Mês").className).toContain("bg-primary");
    expect(kpiValue("Total de Saídas")).toBe(fmt(sumExpenses(firstOfMonthStr, lastOfMonthStr)));
    expect(kpiValue("Gasto Médio Diário")).toBe(fmt(sumExpenses(firstOfMonthStr, lastOfMonthStr) / daysElapsedThisMonth));
  });
});
