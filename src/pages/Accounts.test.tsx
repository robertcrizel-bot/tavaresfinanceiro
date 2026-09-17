import React, { type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Accounts from "@/pages/Accounts";

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
    transactions: [],
    loading: false,
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    payCardBill: vi.fn(),
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

vi.mock("@/lib/credit-card-billing", () => ({
  getCardCommittedAmount: () => 0,
  getCardCurrentInvoiceAmount: () => 0,
}));

vi.mock("@/lib/financial-calculations", () => ({
  calculateAccountBalances: () => ({ "acc-1": 1000 }),
}));

vi.mock("@/components/AccountStatementDialog", () => ({
  default: ({ open, onClose, account }: any) => open ? <div data-testid="statement-dialog">{account?.name}</div> : null,
}));

vi.mock("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) => open ? <>{children}</> : null,
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
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

vi.mock("lucide-react", () => ({
  Plus: (p: any) => <svg {...p} />,
  Pencil: (p: any) => <svg {...p} />,
  Trash2: (p: any) => <svg {...p} />,
  Landmark: (p: any) => <svg {...p} />,
  CreditCard: (p: any) => <svg {...p} />,
  Receipt: (p: any) => <svg {...p} />,
  ArrowLeftRight: (p: any) => <svg {...p} />,
  FileText: (p: any) => <svg data-testid="file-text-icon" {...p} />,
}));

describe("Accounts page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("clicking 'Ver extrato' opens dialog with correct account", () => {
    render(<Accounts />);
    fireEvent.click(screen.getByText("Ver extrato"));
    expect(screen.getByTestId("statement-dialog")).toBeTruthy();
    expect(screen.getByTestId("statement-dialog").textContent).toBe("Inter Robert");
  });

  it("'Ver extrato' button is not inside cards tab panel", () => {
    render(<Accounts />);
    const cardsPanel = document.querySelector('[role="tabpanel"]:not([data-state="active"])');
    if (cardsPanel) {
      expect(cardsPanel.textContent).not.toContain("Ver extrato");
    }
    expect(screen.getByText("Ver extrato")).toBeTruthy();
  });
});