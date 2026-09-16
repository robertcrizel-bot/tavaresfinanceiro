import React, { type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionForm } from "@/components/TransactionForm";
import type { ReceiptDetails, Transaction } from "@/lib/types";

const mockData = vi.hoisted(() => ({
  categories: [
    { id: "1", name: "Alimentação", type: "expense" as const, monthlyBudget: 1000 },
    { id: "2", name: "Transporte", type: "expense" as const, monthlyBudget: 500 },
    { id: "3", name: "Lazer", type: "expense" as const, monthlyBudget: null },
    { id: "4", name: "Salário", type: "income" as const, monthlyBudget: null },
    { id: "5", name: "Outros", type: "expense" as const, monthlyBudget: null },
  ],
  transactions: [
    {
      id: "tx-1",
      title: "Supermercado",
      amount: 250,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-10",
    },
    {
      id: "tx-2",
      title: "Padaria",
      amount: 180,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-05",
    },
    {
      id: "tx-3",
      title: "Uber",
      amount: 50,
      type: "expense",
      category: "Transporte",
      date: "2026-09-08",
    },
    {
      id: "tx-4",
      title: "Restaurante",
      amount: 300,
      type: "expense",
      category: "Alimentação",
      date: "2026-08-15",
    },
  ] as Transaction[],
}));

vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({ accounts: [], creditCards: [] }),
}));

vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({
    getCategoriesByType: (type: string) =>
      mockData.categories.filter((c) => c.type === type).map((c) => c.name),
    categories: mockData.categories,
  }),
}));

vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({ transactions: mockData.transactions }),
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
vi.mock("@/components/ui/select", () => {
  return {
    Select: ({ children, onValueChange }: any) => (
      <div data-testid="select-mock">{React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child, { __onValueChange: onValueChange }) : child
      )}</div>
    ),
    SelectContent: ({ children, __onValueChange }: any) => (
      <>{React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child, { __onValueChange }) : child
      )}</>
    ),
    SelectItem: ({ children, value, __onValueChange }: any) => (
      <button type="button" data-testid={`select-item-${value}`} onClick={() => __onValueChange?.(value)}>
        {children}
      </button>
    ),
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: () => null,
  };
});

const details: ReceiptDetails = {
  merchantName: "Mercado Central",
  taxId: "12.345.678/0001-90",
  fiscalDocumentNumber: "12345",
  cardBrand: "Visa",
  cardLastFour: "4321",
};

const initial: Transaction = {
  id: "transaction-1",
  title: "Mercado",
  amount: 120,
  type: "expense",
  category: "Outros",
  date: "2026-09-11",
};

describe("TransactionForm receipt details", () => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a manual record without receipt metadata", () => {
    render(<TransactionForm open onClose={onClose} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText("Ex: Supermercado"), { target: { value: "Padaria" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "25" } });

    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      title: "Padaria",
      receiptRef: undefined,
      receiptDetails: undefined,
    }), undefined);
  });

  it("preserves all existing receipt metadata while editing", () => {
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={{ ...initial, receiptRef: "receipt-1", receiptDetails: details }}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Ex: Supermercado"), { target: { value: "Mercado atualizado" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      title: "Mercado atualizado",
      receiptRef: "receipt-1",
      receiptDetails: details,
    }), undefined);
  });

  it("keeps receipt metadata absent while editing a manual record", () => {
    render(<TransactionForm open onClose={onClose} onSubmit={onSubmit} initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      receiptRef: undefined,
      receiptDetails: undefined,
    }), undefined);
  });
});

describe("TransactionForm budget indicator", () => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not show budget indicator when category has no monthlyBudget", () => {
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={{ ...initial, category: "Outros" }}
      />,
    );
    expect(screen.queryByText("Orçamento utilizado após este lançamento")).not.toBeInTheDocument();
  });

  it("shows budget indicator when category has monthlyBudget", () => {
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={{ ...initial, category: "Alimentação", date: "2026-09-10" }}
      />,
    );
    expect(screen.getByText("Orçamento utilizado após este lançamento")).toBeInTheDocument();
    expect(screen.getByText(/de R\$ 1\.000,00/)).toBeInTheDocument();
  });

  it("shows correct projection on creation (spent + new amount)", () => {
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={undefined}
        prefill={{ type: "expense", category: "Alimentação", date: "2026-09-10" }}
      />,
    );

    const amountInput = screen.getByPlaceholderText("0,00");
    fireEvent.change(amountInput, { target: { value: "180" } });

    expect(screen.getByText("R$ 610,00")).toBeInTheDocument();
    expect(screen.getByText(/de R\$ 1\.000,00/)).toBeInTheDocument();
    expect(screen.getByText("Orçamento utilizado após este lançamento")).toBeInTheDocument();
    expect(screen.getByText(/R\$ 390,00 disponíveis/)).toBeInTheDocument();
  });

  it("does not double-count when editing same month and same category", () => {
    const editingTx: Transaction = {
      id: "tx-1",
      title: "Supermercado",
      amount: 250,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-10",
    };
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={editingTx}
      />,
    );

    expect(screen.getByText("R$ 430,00")).toBeInTheDocument();
    expect(screen.getByText(/de R\$ 1\.000,00/)).toBeInTheDocument();
    expect(screen.getByText("Orçamento utilizado após este lançamento")).toBeInTheDocument();

    const amountInput = screen.getByDisplayValue("250");
    fireEvent.change(amountInput, { target: { value: "300" } });

    expect(screen.getByText("R$ 480,00")).toBeInTheDocument();
  });

  it("uses new month spending when date changes to different month", () => {
    const editingTx: Transaction = {
      id: "tx-1",
      title: "Supermercado",
      amount: 250,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-10",
    };
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={editingTx}
      />,
    );

    const dateInput = screen.getByDisplayValue("2026-09-10");
    fireEvent.change(dateInput, { target: { value: "2026-08-15" } });

    expect(screen.getByText("R$ 550,00")).toBeInTheDocument();
    expect(screen.getByText(/de R\$ 1\.000,00/)).toBeInTheDocument();
    expect(screen.getByText("Orçamento utilizado após este lançamento")).toBeInTheDocument();
  });

  it("uses new category spending when category changes", () => {
    const editingTx: Transaction = {
      id: "tx-1",
      title: "Supermercado",
      amount: 250,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-10",
    };
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={editingTx}
      />,
    );

    const transporteButton = screen.getByTestId("select-item-Transporte");
    fireEvent.click(transporteButton);

    expect(screen.getByText("Orçamento utilizado após este lançamento")).toBeInTheDocument();
    expect(screen.getByText("R$ 300,00")).toBeInTheDocument();
    expect(screen.getByText(/de R\$ 500,00/)).toBeInTheDocument();
  });

  it("does not show budget indicator for income type", () => {
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={{ ...initial, type: "income", category: "Salário" }}
      />,
    );
    expect(screen.queryByText("Orçamento utilizado após este lançamento")).not.toBeInTheDocument();
  });

  it("shows exceeded amount when budget is surpassed", () => {
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={undefined}
        prefill={{ type: "expense", category: "Transporte", date: "2026-09-10" }}
      />,
    );

    const amountInput = screen.getByPlaceholderText("0,00");
    fireEvent.change(amountInput, { target: { value: "600" } });

    expect(screen.getByText(/R\$ 150,00 acima do orçamento/)).toBeInTheDocument();
  });

  it("does not produce NaN when amount is empty", () => {
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={undefined}
        prefill={{ type: "expense", category: "Alimentação", date: "2026-09-10" }}
      />,
    );

    expect(screen.getByText("Orçamento utilizado após este lançamento")).toBeInTheDocument();
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
    expect(screen.getByText(/de R\$ 1\.000,00/)).toBeInTheDocument();
  });
});
