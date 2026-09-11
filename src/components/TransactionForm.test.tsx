import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionForm } from "@/components/TransactionForm";
import type { ReceiptDetails, Transaction } from "@/lib/types";

vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({ accounts: [], creditCards: [] }),
}));
vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({ getCategoriesByType: () => ["Outros"] }),
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
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Select: Wrapper,
    SelectContent: Wrapper,
    SelectItem: Wrapper,
    SelectTrigger: Wrapper,
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
