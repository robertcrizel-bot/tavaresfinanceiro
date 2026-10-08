import React, { type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Accounts from "@/pages/Accounts";

const financeMocks = vi.hoisted(() => ({
  transactions: [] as Record<string, unknown>[],
  creditCardInvoices: [] as Record<string, unknown>[],
  reopenCardInvoice: vi.fn(),
  reverseCardInvoicePayment: vi.fn(),
}));

vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({
    accounts: [
      { id: "acc-1", name: "Inter Robert", bank: "Inter", type: "checking", initialBalance: 1000, color: "blue" },
    ],
    creditCards: [
      { id: "cc-1", name: "Nubank Platinum", bank: "Nubank", limit: 5000, closingDay: 20, dueDay: 27, color: "purple" },
    ],
    loading: false,
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    addCreditCard: vi.fn(),
    updateCreditCard: vi.fn(),
    deleteCreditCard: vi.fn(),
  }),
}));

vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({
    transactions: financeMocks.transactions,
    creditCardInvoices: financeMocks.creditCardInvoices,
    loading: false,
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    closeCardInvoice: vi.fn(),
    reopenCardInvoice: financeMocks.reopenCardInvoice,
    payCardInvoice: vi.fn(),
    reverseCardInvoicePayment: financeMocks.reverseCardInvoicePayment,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/contexts/TransferContext", () => ({
  useTransfers: () => ({
    transfers: [],
    loading: false,
    addTransfer: vi.fn(),
    updateTransfer: vi.fn(),
    deleteTransfer: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock("@/lib/financial-calculations", () => ({
  calculateAccountBalances: () => ({ "acc-1": 1000 }),
}));

vi.mock("@/components/AccountStatementDialog", () => ({
  default: ({ open, onClose, account }: any) => open ? <div data-testid="statement-dialog">{account?.name}</div> : null,
}));

vi.mock("@/components/CreditCardStatementDialog", () => ({
  default: ({ open, onClose, card }: any) => open ? <div data-testid="cc-statement-dialog">{card?.name}</div> : null,
}));

vi.mock("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) => open ? <>{children}</> : null,
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
    DialogFooter: Wrapper,
  };
});

vi.mock("@/components/ui/alert-dialog", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    AlertDialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => open ? <>{children}</> : null,
    AlertDialogContent: Wrapper,
    AlertDialogHeader: Wrapper,
    AlertDialogTitle: Wrapper,
    AlertDialogDescription: Wrapper,
    AlertDialogFooter: Wrapper,
    AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    AlertDialogCancel: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  };
});

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <button>{children}</button>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
}));

vi.mock("lucide-react", () => ({
  Plus: (p: any) => <svg {...p} />,
  Pencil: (p: any) => <svg {...p} />,
  Trash2: (p: any) => <svg {...p} />,
  Landmark: (p: any) => <svg {...p} />,
  CreditCard: (p: any) => <svg {...p} />,
  Receipt: (p: any) => <svg {...p} />,
  ArrowLeftRight: (p: any) => <svg {...p} />,
  FileText: (p: any) => <svg data-testid="file-text-icon" {...p} />,
  RotateCcw: (p: any) => <svg {...p} />,
  CalendarDays: (p: any) => <svg {...p} />,
}));

describe("Accounts page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financeMocks.transactions = [];
    financeMocks.creditCardInvoices = [];
    financeMocks.reopenCardInvoice.mockResolvedValue(true);
    financeMocks.reverseCardInvoicePayment.mockResolvedValue(true);
  });

  it("shows 'Ver extrato' button on account card", () => {
    render(<Accounts />);
    expect(screen.getByText("Ver extrato")).toBeTruthy();
  });

  it("shows account name on card", () => {
    render(<Accounts />);
    expect(screen.getByText("Inter Robert")).toBeTruthy();
  });

  it("shows initial balance text on account card", () => {
    render(<Accounts />);
    expect(screen.getByText(/Saldo inicial/)).toBeTruthy();
  });

  it("clicking 'Ver extrato' opens account dialog", () => {
    render(<Accounts />);
    fireEvent.click(screen.getByText("Ver extrato"));
    expect(screen.getByTestId("statement-dialog")).toBeTruthy();
    expect(screen.getByTestId("statement-dialog").textContent).toBe("Inter Robert");
  });

  it("shows both account and cards tabs", () => {
    render(<Accounts />);
    expect(screen.getByText("Contas")).toBeTruthy();
    expect(screen.getByText("Cartões")).toBeTruthy();
  });

  it("offers reopening for a CLOSED invoice", () => {
    financeMocks.creditCardInvoices = [{
      id: "invoice-closed",
      creditCardId: "cc-1",
      competence: "2026-09-01",
      cycleStart: "2026-08-21",
      cycleEnd: "2026-09-20",
      dueDate: "2026-09-27",
      status: "CLOSED",
      closedTotal: 500,
      closedAt: "2026-09-20T12:00:00Z",
    }];
    financeMocks.transactions = [{
      id: "purchase-1",
      title: "Mercado",
      amount: 500,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-10",
      creditCardId: "cc-1",
      creditCardInvoiceId: "invoice-closed",
      financialKind: "card_purchase",
      isPaid: false,
    }];

    render(<Accounts />);
    fireEvent.click(screen.getByText("Cartões"));

    expect(screen.getByRole("button", { name: "Reabrir fatura" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Estornar pagamento" })).toBeNull();
  });

  it("does not offer reopening for a PAID invoice", () => {
    financeMocks.creditCardInvoices = [{
      id: "invoice-paid",
      creditCardId: "cc-1",
      competence: "2026-09-01",
      cycleStart: "2026-08-21",
      cycleEnd: "2026-09-20",
      dueDate: "2026-09-27",
      status: "PAID",
      closedTotal: 500,
      paidAt: "2026-09-27T12:00:00Z",
    }];

    render(<Accounts />);
    fireEvent.click(screen.getByText("Cartões"));

    expect(screen.queryByRole("button", { name: "Reabrir fatura" })).toBeNull();
    expect(screen.getByRole("button", { name: "Estornar pagamento" })).toBeTruthy();
  });

  it("does not offer payment reversal for an OPEN invoice", () => {
    financeMocks.creditCardInvoices = [{
      id: "invoice-open",
      creditCardId: "cc-1",
      competence: "2026-09-01",
      cycleStart: "2026-08-21",
      cycleEnd: "2026-09-20",
      dueDate: "2026-09-27",
      status: "OPEN",
    }];
    financeMocks.transactions = [{
      id: "purchase-1",
      title: "Mercado",
      amount: 500,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-10",
      creditCardId: "cc-1",
      creditCardInvoiceId: "invoice-open",
      financialKind: "card_purchase",
      isPaid: false,
    }];

    render(<Accounts />);
    fireEvent.click(screen.getByText("Cartões"));

    expect(screen.queryByRole("button", { name: "Estornar pagamento" })).toBeNull();
  });
});
