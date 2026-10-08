import React, { type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionForm } from "@/components/TransactionForm";
import type { Transaction } from "@/lib/types";

vi.mock("@/contexts/AccountContext", () => ({
  useAccounts: () => ({ accounts: [], creditCards: [] }),
}));

vi.mock("@/contexts/CategoryContext", () => ({
  useCategories: () => ({
    getCategoriesByType: () => ["Alimentação", "Outros"],
    categories: [],
  }),
}));

vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({ transactions: [] }),
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
    Select: () => null,
    SelectContent: () => null,
    SelectItem: () => null,
    SelectTrigger: () => null,
    SelectValue: () => null,
  };
});

const prefill = {
  title: "Mercado Central",
  amount: 120,
  type: "expense",
  category: "Outros",
  date: "2026-09-11",
} as Partial<Omit<Transaction, "id">>;

const action = {
  running: false,
  status: "",
  metricsText: null as string | null,
  fallbackMessage: null as string | null,
  onImprove: vi.fn(),
};

describe("TransactionForm local AI action", () => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides the local action when it is not provided", () => {
    render(<TransactionForm open onClose={onClose} onSubmit={onSubmit} prefill={prefill} />);
    expect(screen.queryByRole("button", { name: /Melhorar leitura localmente/ })).not.toBeInTheDocument();
  });

  it("hides the local action while editing an existing record", () => {
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        initial={{ id: "tx-1", title: "Mercado", amount: 120, type: "expense", category: "Outros", date: "2026-09-11" }}
        localAiAction={{ ...action }}
      />,
    );
    expect(screen.queryByRole("button", { name: /Melhorar leitura localmente/ })).not.toBeInTheDocument();
  });

  it("shows the action and calls back without submitting the form", () => {
    render(
      <TransactionForm open onClose={onClose} onSubmit={onSubmit} prefill={prefill} localAiAction={{ ...action }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Melhorar leitura localmente/ }));
    expect(action.onImprove).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables the action and shows progress while running", () => {
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        prefill={prefill}
        localAiAction={{ ...action, running: true, status: "Baixando modelo local... 42%" }}
      />,
    );
    expect(screen.getByRole("button", { name: /Melhorar leitura localmente/ })).toBeDisabled();
    expect(screen.getByText("Baixando modelo local... 42%")).toBeInTheDocument();
  });

  it("shows metrics and the fallback notice after a run", () => {
    render(
      <TransactionForm
        open
        onClose={onClose}
        onSubmit={onSubmit}
        prefill={prefill}
        localAiAction={{
          ...action,
          metricsText: "Modelo local: test-model · wasm · inicialização 10ms · inferência 20ms · total 30ms",
          fallbackMessage: "Interpretação local demorou demais; mantido resultado original.",
        }}
      />,
    );
    expect(screen.getByText(/Modelo local: test-model/)).toBeInTheDocument();
    expect(
      screen.getByText("Interpretação local demorou demais; mantido resultado original."),
    ).toBeInTheDocument();
  });
});
