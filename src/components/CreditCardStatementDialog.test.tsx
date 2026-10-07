import React, { type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import CreditCardStatementDialog from "@/components/CreditCardStatementDialog";
import type { CardStatementTransaction } from "@/lib/credit-card-statement";

const makeTx = (overrides: Partial<CardStatementTransaction> = {}): CardStatementTransaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 8)}`,
  title: "Compra",
  amount: 100,
  type: "expense",
  category: "Alimentação",
  date: "2026-10-15",
  creditCardId: "cc-1",
  ...overrides,
});

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
  ChevronLeft: (p: any) => <svg {...p} />,
  ChevronRight: (p: any) => <svg {...p} />,
  ArrowUpRight: (p: any) => <svg data-testid="icon-charge" {...p} />,
  ArrowDownLeft: (p: any) => <svg data-testid="icon-credit" {...p} />,
  RotateCcw: (p: any) => <svg data-testid="icon-reversal" {...p} />,
  Download: (p: any) => <svg data-testid="icon-download" {...p} />,
  Calendar: (p: any) => <svg {...p} />,
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
    if (fmt === "yyyy-MM-dd") {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
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
  startOfMonth: (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1),
  endOfMonth: (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59),
  subDays: (date: Date, n: number) => { const d = new Date(date); d.setDate(d.getDate() - n); return d; },
}));

vi.mock("date-fns/locale", () => ({ ptBR: {} }));

vi.mock("@/lib/credit-card-billing", () => ({
  getCardCommittedAmount: () => 1200,
  getCardCurrentInvoiceAmount: () => 450,
}));

const card = { id: "cc-1", name: "Nubank Platinum", limit: 5000, closingDay: 20, dueDay: 27 };

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
    expect(screen.getByText("Compras — Nubank Platinum")).toBeTruthy();
  });

  it("shows period selector with Data inicial and Data final", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    expect(screen.getByLabelText("Data inicial")).toBeTruthy();
    expect(screen.getByLabelText("Data final")).toBeTruthy();
  });

  it("shows period preset buttons", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    const buttons = screen.getAllByRole("button", { name: /este m.s|m.s anterior|30 dias/i });
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("shows month navigation with prev/next buttons", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    const prevBtn = screen.getAllByRole("button").find((btn) => btn.querySelector("svg"));
    expect(prevBtn).toBeTruthy();
  });

  it("shows summary with Compras, Estornos and Total líquido", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    expect(screen.getByText("Compras")).toBeTruthy();
    expect(screen.getByText("Estornos")).toBeTruthy();
    expect(screen.getByText("Total líquido")).toBeTruthy();
  });

  it("shows purchases entry", () => {
    const transactions = [makeTx({ id: "tx-buy", title: "Supermercado", amount: 200, category: "Alimentação" })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Supermercado")).toBeTruthy();
    const matches = screen.getAllByText(/R\$ 200,00/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows reversal entry with negative sign", () => {
    const transactions = [makeTx({
      id: "tx-rev",
      title: "Estorno Loja",
      type: "income",
      amount: 50,
      category: "Outros",
    })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Estorno Loja")).toBeTruthy();
    const matches = screen.getAllByText(/-R\$ 50,00/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows installment info when present", () => {
    const transactions = [makeTx({ id: "tx-inst", title: "TV 4K (2/5)", amount: 300 })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText(/Parcela 2\/5/)).toBeTruthy();
  });

  it("filters out partial_record entries", () => {
    // The new component filters out partial_record entries by default
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
    // partial_record entries should not appear
    expect(screen.queryByText("Parcial fatura")).toBeNull();
  });

  it("shows empty state when no entries in period", () => {
    render(<CreditCardStatementDialog {...defaultProps} />);
    expect(screen.getByText("Nenhuma compra neste período.")).toBeTruthy();
  });

  it("shows summary with Compras, Estornos and Total líquido", () => {
    const transactions = [
      makeTx({ id: "tx-1", amount: 300 }),
      makeTx({ id: "tx-2", type: "income", amount: 100, category: "Outros" }),
    ];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Compras")).toBeTruthy();
    expect(screen.getByText("Estornos")).toBeTruthy();
    expect(screen.getByText("Total líquido")).toBeTruthy();
  });

  it("renders purchase entries with charge direction", () => {
    const transactions = [makeTx({ id: "tx-buy", title: "Supermercado" })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Supermercado")).toBeTruthy();
    expect(screen.getAllByText("R$ 100,00").length).toBeGreaterThanOrEqual(1);
  });

  it("renders reversal entries with credit direction", () => {
    const transactions = [makeTx({
      id: "tx-rev",
      title: "Estorno",
      type: "income",
      amount: 30,
    })];
    render(<CreditCardStatementDialog {...defaultProps} transactions={transactions} />);
    expect(screen.getByText("Estorno")).toBeTruthy();
    expect(screen.getByText("-R$ 30,00")).toBeTruthy();
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