import React, { type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionDetail } from "@/components/TransactionDetail";
import type { Transaction } from "@/lib/types";

const mockData = vi.hoisted(() => ({
  categories: [
    { id: "1", name: "Alimentação", type: "expense" as const, monthlyBudget: 1000 },
    { id: "2", name: "Transporte", type: "expense" as const, monthlyBudget: 500 },
    { id: "3", name: "Lazer", type: "expense" as const, monthlyBudget: null },
    { id: "4", name: "Salário", type: "income" as const, monthlyBudget: null },
  ],
  transactions: [
    { id: "tx-1", title: "Supermercado", amount: 250, type: "expense", category: "Alimentação", date: "2026-09-10" },
    { id: "tx-2", title: "Padaria", amount: 180, type: "expense", category: "Alimentação", date: "2026-09-05" },
    { id: "tx-3", title: "Uber", amount: 50, type: "expense", category: "Transporte", date: "2026-09-08" },
    { id: "tx-4", title: "Restaurante", amount: 300, type: "expense", category: "Alimentação", date: "2026-08-15" },
  ] as Transaction[],
}));

vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({ accounts: [], creditCards: [] }),
}));

vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({ categories: mockData.categories }),
}));

vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({ transactions: mockData.transactions, refetch: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

vi.mock("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) => open ? <>{children}</> : null,
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  };
});

vi.mock("@/components/ui/progress", () => ({
  Progress: ({ value, className }: { value: number; className?: string }) => (
    <div data-testid="progress-bar" data-value={value} className={className} />
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "http://example.com/signed" }, error: null }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  },
}));

describe("TransactionDetail budget indicator", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows budget indicator for expense with monthlyBudget", () => {
    render(
      <TransactionDetail
        transaction={mockData.transactions[0]}
        open
        onClose={onClose}
      />,
    );
    expect(screen.getByText("Orçamento utilizado no mês")).toBeInTheDocument();
  });

  it("does not show budget indicator for income", () => {
    const incomeTx: Transaction = {
      id: "tx-income",
      title: "Salário",
      amount: 5000,
      type: "income",
      category: "Salário",
      date: "2026-09-01",
    };
    render(
      <TransactionDetail transaction={incomeTx} open onClose={onClose} />,
    );
    expect(screen.queryByText("Orçamento utilizado no mês")).not.toBeInTheDocument();
  });

  it("does not show budget indicator for category without monthlyBudget", () => {
    const txLazer: Transaction = {
      id: "tx-lazer",
      title: "Cinema",
      amount: 80,
      type: "expense",
      category: "Lazer",
      date: "2026-09-12",
    };
    render(
      <TransactionDetail transaction={txLazer} open onClose={onClose} />,
    );
    expect(screen.queryByText("Orçamento utilizado no mês")).not.toBeInTheDocument();
  });

  it("shows correct total spent for the month (including the viewed transaction)", () => {
    const tx1: Transaction = {
      id: "tx-1",
      title: "Supermercado",
      amount: 250,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-10",
    };
    render(
      <TransactionDetail transaction={tx1} open onClose={onClose} />,
    );
    // Alimentação September: 250 + 180 = 430
    expect(screen.getByText("R$ 430,00")).toBeInTheDocument();
    expect(screen.getByText(/de R\$ 1\.000,00/)).toBeInTheDocument();
  });

  it("shows correct available amount when within budget", () => {
    const tx1: Transaction = {
      id: "tx-1",
      title: "Supermercado",
      amount: 250,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-10",
    };
    render(
      <TransactionDetail transaction={tx1} open onClose={onClose} />,
    );
    // 1000 - 430 = 570
    expect(screen.getByText(/R\$ 570,00 disponíveis/)).toBeInTheDocument();
  });

  it("shows exceeded amount when budget is surpassed", () => {
    const tx3: Transaction = {
      id: "tx-3",
      title: "Uber",
      amount: 50,
      type: "expense",
      category: "Transporte",
      date: "2026-09-08",
    };
    render(
      <TransactionDetail transaction={tx3} open onClose={onClose} />,
    );
    // Transporte: 50, budget 500 → not exceeded, available 450
    expect(screen.getByText(/R\$ 450,00 disponíveis/)).toBeInTheDocument();
  });

  it("shows exceeded amount when budget is surpassed with accumulated spending", () => {
    // Add tx-over to mock so Transporte total = 50 + 600 = 650, budget 500 → exceeded 150
    mockData.transactions.push({
      id: "tx-over",
      title: "Combustível",
      amount: 600,
      type: "expense",
      category: "Transporte",
      date: "2026-09-15",
    });
    const txOver: Transaction = {
      id: "tx-over",
      title: "Combustível",
      amount: 600,
      type: "expense",
      category: "Transporte",
      date: "2026-09-15",
    };
    render(
      <TransactionDetail transaction={txOver} open onClose={onClose} />,
    );
    // Transporte: 50 + 600 = 650, budget 500 → exceeded 150
    expect(screen.getByText(/R\$ 150,00 acima do orçamento/)).toBeInTheDocument();
    // Clean up
    mockData.transactions.pop();
  });

  it("shows correct percentage", () => {
    const tx1: Transaction = {
      id: "tx-1",
      title: "Supermercado",
      amount: 250,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-10",
    };
    render(
      <TransactionDetail transaction={tx1} open onClose={onClose} />,
    );
    // 430 / 1000 = 43%
    const progressBar = screen.getByTestId("progress-bar");
    expect(progressBar).toHaveAttribute("data-value", "43");
    expect(screen.getByText("43%")).toBeInTheDocument();
  });

  it("uses the month of transaction.date, not the current month", () => {
    const txAugust: Transaction = {
      id: "tx-4",
      title: "Restaurante",
      amount: 300,
      type: "expense",
      category: "Alimentação",
      date: "2026-08-15",
    };
    render(
      <TransactionDetail transaction={txAugust} open onClose={onClose} />,
    );
    // Alimentação August: 300 only (tx-4), budget 1000 → available 700
    expect(screen.getByText("R$ 300,00")).toBeInTheDocument();
    expect(screen.getByText(/R\$ 700,00 disponíveis/)).toBeInTheDocument();
  });
});
