import { fireEvent, render, screen } from "@testing-library/react";
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
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

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

  it("starts on Mês with the full current calendar month", () => {
    renderDashboard();

    expect(periodButton("Mês").className).toContain("bg-primary");
    expect(periodButton("30d").className).not.toContain("bg-primary");

    const monthExpense = sumExpenses(firstOfMonthStr, lastOfMonthStr);
    expect(kpiValue("Total de Saídas")).toBe(fmt(monthExpense));
    expect(kpiValue("Total de Entradas")).toBe(fmt(707));
    expect(kpiValue("Gasto Médio Diário")).toBe(fmt(monthExpense / daysInMonth));
    expect(kpiValue("Maior Categoria")).toBe("Alimentação");
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
    expect(kpiValue("Gasto Médio Diário")).toBe(fmt(sumExpenses(firstOfMonthStr, lastOfMonthStr) / daysInMonth));
  });
});
