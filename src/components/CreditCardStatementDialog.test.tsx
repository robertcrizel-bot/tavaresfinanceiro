import React, { type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import CreditCardStatementDialog from "@/components/CreditCardStatementDialog";
import type { CardStatementTransaction } from "@/lib/credit-card-statement";

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
  ArrowUpRight: (p: any) => <svg data-testid="icon-charge" {...p} />,
  ArrowDownLeft: (p: any) => <svg data-testid="icon-credit" {...p} />,
  RotateCcw: (p: any) => <svg data-testid="icon-reversal" {...p} />,
  Download: (p: any) => <svg data-testid="icon-download" {...p} />,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("@/lib/credit-card-statement-export", () => ({
  exportCreditCardStatementToExcel: vi.fn(),
  exportCreditCardStatementToPdf: vi.fn(),
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
    if (fmt === "MMMM 'de' yyyy") {
      return `${months[date.getMonth()]} de ${date.getFullYear()}`;
    }
    return "";
  },
  addMonths: (date: Date, n: number) => { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; },
  subMonths: (date: Date, n: number) => { const d = new Date(date); d.setMonth(d.getMonth() - n); return d; },
}));

vi.mock("date-fns/locale", () => ({ ptBR: {} }));

vi.mock("@/lib/credit-card-billing", () => ({
  getCardCommittedAmount: () => 1200,
  getCardCurrentInvoiceAmount: () => 450,
}));

const card = { id: "cc-1", name: "Nubank Platinum", limit: 5000, closingDay: 20, dueDay: 27 };

const currentMonth = new Date().toISOString().slice(0, 7);

const makeTx = (overrides: Partial<CardStatementTransaction> = {}): CardStatementTransaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 8)}`,
  title: "Compra",
  amount: 100,
  type: "expense",
  category: "Alimentação",
  date: `${currentMonth}-15`,
  creditCardId: "cc-1",
  ...overrides,
});

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  card,
  transactions: [] as CardStatementTransaction[],
};

describe("CreditCardStatementDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows card name in dialog title", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    expect(screen.getByText("Extrato — Nubank Platinum")).toBeTruthy();
  });

  it("shows current month initially", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    const now = new Date();
    const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    expect(screen.getByText(`${months[now.getMonth()]} ${now.getFullYear()}`)).toBeTruthy();
  });

  it("shows situação atual section", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    expect(screen.getByText("Situação atual")).toBeTruthy();
    expect(screen.getByText("Fatura atual")).toBeTruthy();
    expect(screen.getByText("Comprometido")).toBeTruthy();
    expect(screen.getByText("Disponível")).toBeTruthy();
  });

  it("shows current invoice from helper", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    expect(screen.getByText("R$ 450,00")).toBeTruthy();
  });

  it("shows purchases entry", () => {
    const transactions = [makeTx({ id: "tx-buy", title: "Supermercado", amount: 200, category: "Alimentação" })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Supermercado")).toBeTruthy();
    const matches = screen.getAllByText(/\+.*200,00/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows payment entry with - sign", () => {
    const transactions = [makeTx({
      id: "tx-pay",
      title: "Pagamento de Fatura",
      category: "Pagamento Fatura",
      type: "expense",
      accountId: "acc-1",
      amount: 500,
    })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Pagamento de Fatura")).toBeTruthy();
    const matches = screen.getAllByText(/-.*500,00/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows reversal entry with - sign", () => {
    const transactions = [makeTx({
      id: "tx-rev",
      title: "Estorno Loja",
      type: "income",
      amount: 50,
      category: "Outros",
    })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Estorno Loja")).toBeTruthy();
    const matches = screen.getAllByText(/-.*50,00/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows installment info when present", () => {
    const transactions = [makeTx({ id: "tx-inst", title: "TV 4K (2/5)", amount: 300 })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText(/Parcela 2\/5/)).toBeTruthy();
  });

  it("does NOT show partial_record entries", () => {
    const transactions = [
      makeTx({ id: "tx-buy", title: "Notebook", amount: 200 }),
      makeTx({
        id: "tx-partial",
        title: "Parcial fatura",
        amount: 80,
        category: "Fatura Cartão",
        isPaid: true,
      }),
    ];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Notebook")).toBeTruthy();
    expect(screen.queryByText("Parcial fatura")).toBeNull();
  });

  it("shows empty state when no entries in month", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    expect(screen.getByText("Nenhuma movimentação neste período.")).toBeTruthy();
  });

  it("shows summary with Compras, Pagamentos and Estornos", () => {
    const transactions = [
      makeTx({ id: "tx-1", amount: 300 }),
      makeTx({ id: "tx-2", title: "Pagamento de Fatura", category: "Pagamento Fatura", type: "expense", accountId: "acc-1", amount: 200 }),
    ];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Compras")).toBeTruthy();
    expect(screen.getByText("Pagamentos")).toBeTruthy();
    expect(screen.getByText("Estornos")).toBeTruthy();
  });

  it("shows period label with month name", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    const now = new Date();
    const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    expect(screen.getByText(new RegExp(`Movimentações de ${months[now.getMonth()]}`))).toBeTruthy();
  });

  it("navigating to previous month works without crashing", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const prevBtn = buttons.find((btn) => btn.querySelector("svg")?.classList.contains("h-4"));
    if (prevBtn) {
      fireEvent.click(prevBtn);
    }
    expect(screen.getByText(/Extrato/)).toBeTruthy();
  });

  it("renders charge icons for purchase entries", () => {
    const transactions = [makeTx({ id: "tx-buy", title: "Supermercado" })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getAllByTestId("icon-charge").length).toBeGreaterThanOrEqual(1);
  });

  it("renders credit icons for payment entries", () => {
    const transactions = [makeTx({
      id: "tx-pay",
      title: "Pagamento de Fatura",
      category: "Pagamento Fatura",
      type: "expense",
      accountId: "acc-1",
    })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getAllByTestId("icon-credit").length).toBeGreaterThanOrEqual(1);
  });

  it("renders reversal icons for reversal entries", () => {
    const transactions = [makeTx({
      id: "tx-rev",
      title: "Estorno",
      type: "income",
      amount: 30,
    })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getAllByTestId("icon-reversal").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Export button", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    expect(screen.getByText("Exportar")).toBeTruthy();
  });

  it("shows Excel and PDF options in dropdown", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    expect(screen.getByText("Excel (.xlsx)")).toBeTruthy();
    expect(screen.getByText("PDF (.pdf)")).toBeTruthy();
  });

  it("export button is disabled when no entries", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    const exportBtn = screen.getByText("Exportar").closest("button");
    expect(exportBtn).toHaveProperty("disabled", true);
  });

  it("export button is enabled when there are entries", () => {
    const transactions = [makeTx({ id: "tx-buy", title: "Supermercado" })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    const exportBtn = screen.getByText("Exportar").closest("button");
    expect(exportBtn).toHaveProperty("disabled", false);
  });

  it("clicking Excel calls export function", async () => {
    const { exportCreditCardStatementToExcel } = await import("@/lib/credit-card-statement-export");
    const transactions = [makeTx({ id: "tx-buy", title: "Supermercado" })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    fireEvent.click(screen.getByText("Excel (.xlsx)"));
    expect(exportCreditCardStatementToExcel).toHaveBeenCalledTimes(1);
  });

  it("clicking PDF calls export function", async () => {
    const { exportCreditCardStatementToPdf } = await import("@/lib/credit-card-statement-export");
    const transactions = [makeTx({ id: "tx-buy", title: "Supermercado" })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    fireEvent.click(screen.getByText("PDF (.pdf)"));
    expect(exportCreditCardStatementToPdf).toHaveBeenCalledTimes(1);
  });
});
