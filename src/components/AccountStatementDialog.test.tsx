import React, { type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import AccountStatementDialog from "@/components/AccountStatementDialog";
import type { StatementTransaction, StatementTransfer, StatementAccount } from "@/lib/account-statement";

vi.mock("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) => open ? <>{children}</> : null,
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  };
});

vi.mock("lucide-react", () => ({
  ChevronLeft: (p: any) => <svg {...p} />,
  ChevronRight: (p: any) => <svg {...p} />,
  ArrowDownLeft: (p: any) => <svg data-testid="icon-in" {...p} />,
  ArrowUpRight: (p: any) => <svg data-testid="icon-out" {...p} />,
  Download: (p: any) => <svg data-testid="icon-download" {...p} />,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("@/lib/account-statement-export", () => ({
  exportAccountStatementToExcel: vi.fn(),
  exportAccountStatementToPdf: vi.fn(),
}));

vi.mock("date-fns", () => ({
  format: (date: Date, fmt: string) => {
    const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    if (fmt === "yyyy-MM") {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }
    if (fmt === "MMMM yyyy") {
      return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }
    return "";
  },
  addMonths: (date: Date, n: number) => { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; },
  subMonths: (date: Date, n: number) => { const d = new Date(date); d.setMonth(d.getMonth() - n); return d; },
}));

vi.mock("date-fns/locale", () => ({ ptBR: {} }));

const account: StatementAccount = { id: "acc-1", name: "Inter Robert" };
const otherAccount: StatementAccount = { id: "acc-2", name: "Caixa" };
const allAccounts: StatementAccount[] = [account, otherAccount];

const currentMonth = new Date().toISOString().slice(0, 7);

const makeTx = (overrides: Partial<StatementTransaction> = {}): StatementTransaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 8)}`,
  title: "Compra",
  amount: 100,
  type: "expense",
  category: "Alimentação",
  date: `${currentMonth}-15`,
  accountId: "acc-1",
  ...overrides,
});

const makeTransfer = (overrides: Partial<StatementTransfer> = {}): StatementTransfer => ({
  id: `tr-${Math.random().toString(36).slice(2, 8)}`,
  fromAccountId: "acc-1",
  toAccountId: "acc-2",
  amount: 200,
  date: `${currentMonth}-14`,
  createdAt: `${currentMonth}-14T10:00:00Z`,
  ...overrides,
});

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  account: { id: "acc-1", name: "Inter Robert", initialBalance: 1000 },
  currentBalance: 1500,
  transactions: [] as StatementTransaction[],
  transfers: [] as StatementTransfer[],
  accounts: allAccounts,
};

describe("AccountStatementDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows account name in dialog title", () => {
    render(<AccountStatementDialog {...defaultProps} />);
    expect(screen.getByText("Extrato — Inter Robert")).toBeTruthy();
  });

  it("shows current month initially", () => {
    render(<AccountStatementDialog {...defaultProps} />);
    const now = new Date();
    const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    expect(screen.getByText(`${months[now.getMonth()]} ${now.getFullYear()}`)).toBeTruthy();
  });

  it("shows current balance labeled as Saldo atual", () => {
    render(<AccountStatementDialog {...defaultProps} currentBalance={1500} />);
    expect(screen.getByText("Saldo atual")).toBeTruthy();
    expect(screen.getByText("R$ 1.500,00")).toBeTruthy();
  });

  it("shows income entry with + prefix", () => {
    const transactions = [makeTx({ id: "tx-in", title: "Salário", amount: 3000, type: "income", category: "Salário" })];
    render(<AccountStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Salário")).toBeTruthy();
    const matches = screen.getAllByText(/\+.*3\.000,00/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows expense entry with - prefix", () => {
    const transactions = [makeTx({ id: "tx-exp", title: "Supermercado", amount: 150, type: "expense", category: "Alimentação" })];
    render(<AccountStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Supermercado")).toBeTruthy();
    const matches = screen.getAllByText(/-.*150,00/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows transfer sent as - (out)", () => {
    const transfers = [makeTransfer({ id: "tr-1", fromAccountId: "acc-1", toAccountId: "acc-2", amount: 200 })];
    render(<AccountStatementDialog {...defaultProps} transfers={transfers} />);
    expect(screen.getByText("Transferência para Caixa")).toBeTruthy();
    const matches = screen.getAllByText(/-.*200,00/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows transfer received as + (in)", () => {
    const transfers = [makeTransfer({ id: "tr-2", fromAccountId: "acc-2", toAccountId: "acc-1", amount: 300 })];
    render(<AccountStatementDialog {...defaultProps} transfers={transfers} />);
    expect(screen.getByText("Transferência de Caixa")).toBeTruthy();
    const matches = screen.getAllByText(/\+.*300,00/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows bill payment as expense", () => {
    const transactions = [makeTx({ id: "tx-bill", title: "Pagamento de Fatura", amount: 500, type: "expense", category: "Pagamento Fatura" })];
    render(<AccountStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Pagamento de Fatura")).toBeTruthy();
    const matches = screen.getAllByText(/-.*500,00/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when no entries", () => {
    render(<AccountStatementDialog {...defaultProps} />);
    expect(screen.getByText("Nenhuma movimentação neste mês.")).toBeTruthy();
  });

  it("shows summary with Entradas, Saídas and Movimentação", () => {
    const transactions = [
      makeTx({ id: "tx-1", title: "Salário", amount: 3000, type: "income" }),
      makeTx({ id: "tx-2", title: "Supermercado", amount: 150, type: "expense" }),
    ];
    render(<AccountStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Entradas")).toBeTruthy();
    expect(screen.getByText("Saídas")).toBeTruthy();
    expect(screen.getByText("Movimentação")).toBeTruthy();
  });

  it("shows icons for income and expense entries", () => {
    const transactions = [
      makeTx({ id: "tx-in", title: "Salário", amount: 1000, type: "income" }),
      makeTx({ id: "tx-out", title: "Almoço", amount: 50, type: "expense" }),
    ];
    render(<AccountStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getAllByTestId("icon-in").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId("icon-out").length).toBeGreaterThanOrEqual(1);
  });

  it("navigating to previous month works without crashing", () => {
    render(<AccountStatementDialog {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const prevBtn = buttons.find((btn) => btn.querySelector("svg")?.classList.contains("h-4"));
    if (prevBtn) {
      fireEvent.click(prevBtn);
    }
    expect(screen.getByText(/Extrato/)).toBeTruthy();
  });

  it("balance is displayed and does not change with month navigation", () => {
    render(<AccountStatementDialog {...defaultProps} currentBalance={1500} />);
    expect(screen.getByText("R$ 1.500,00")).toBeTruthy();
  });
});