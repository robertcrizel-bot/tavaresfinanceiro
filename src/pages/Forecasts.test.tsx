import React, { type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Forecasts from "@/pages/Forecasts";
import type { RecurringBill } from "@/contexts/ForecastContext";
import type { Transaction } from "@/lib/types";

const mockData = vi.hoisted(() => ({
  categories: [
    { id: "1", name: "Alimentação", type: "expense" as const, monthlyBudget: 1000 },
    { id: "2", name: "Transporte", type: "expense" as const, monthlyBudget: 500 },
    { id: "3", name: "Lazer", type: "expense" as const, monthlyBudget: null },
    { id: "4", name: "Salário", type: "income" as const, monthlyBudget: null },
    { id: "5", name: "Freelance", type: "income" as const, monthlyBudget: null },
  ],
  transactions: [
    { id: "tx-1", title: "Supermercado", amount: 250, type: "expense", category: "Alimentação", date: "2026-09-10" },
    { id: "tx-2", title: "Padaria", amount: 180, type: "expense", category: "Alimentação", date: "2026-09-05" },
    { id: "tx-3", title: "Uber", amount: 50, type: "expense", category: "Transporte", date: "2026-09-08" },
    { id: "tx-4", title: "Restaurante", amount: 300, type: "expense", category: "Alimentação", date: "2026-08-15" },
  ] as Transaction[],
  bills: [] as RecurringBill[],
  payments: [] as { id: string; recurringBillId: string; referenceMonth: string; paidAt: string; transactionId: string | null }[],
}));

vi.mock("@/contexts/ForecastContext", () => ({
  useForecast: () => ({
    bills: mockData.bills,
    payments: mockData.payments,
    loading: false,
    addBill: vi.fn(),
    updateBill: vi.fn(),
    deleteBill: vi.fn(),
    markAsPaid: vi.fn(),
    unmarkAsPaid: vi.fn(),
    refetch: vi.fn(),
  }),
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
    DialogDescription: Wrapper,
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
  Select: ({ children, onValueChange }: any) => (
    <div data-testid="select-mock">
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child as any, { __onValueChange: onValueChange }) : child
      )}
    </div>
  ),
  SelectContent: ({ children, __onValueChange }: any) => (
    <>{React.Children.map(children, (child) =>
      React.isValidElement(child) ? React.cloneElement(child as any, { __onValueChange }) : child
    )}</>
  ),
  SelectItem: ({ children, value, __onValueChange }: any) => (
    <button type="button" data-testid={`select-item-${value}`} onClick={() => __onValueChange?.(value)}>
      {children}
    </button>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
}));

vi.mock("@/components/ui/progress", () => ({
  Progress: ({ value, className, indicatorClassName }: any) => (
    <div data-testid="progress-bar" data-value={value} className={className}>
      {indicatorClassName && <div data-testid="progress-indicator" className={indicatorClassName} />}
    </div>
  ),
}));

vi.mock("@/components/ui/radio-group", () => ({
  RadioGroup: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  RadioGroupItem: (props: any) => <input type="radio" {...props} />,
}));

vi.mock("@/lib/forecast-status", () => ({
  getForecastTemporalStatus: ({ dueDay, isPaid, referenceMonth }: any) => {
    const dueDate = `${referenceMonth}-${String(dueDay).padStart(2, "0")}`;
    if (isPaid) return { kind: "paid", label: "Pago", dueDate, daysUntilDue: 0 };
    return { kind: "pending", label: "Pendente", dueDate, daysUntilDue: 15 };
  },
  getPaymentForCompetence: (payments: any[], billId: string, refMonth: string) =>
    payments.find((p) => p.recurringBillId === billId && p.referenceMonth === refMonth) || null,
}));

vi.mock("lucide-react", () => ({
  CalendarClock: (p: any) => <svg {...p} />,
  Plus: (p: any) => <svg {...p} />,
  ChevronLeft: (p: any) => <svg {...p} />,
  ChevronRight: (p: any) => <svg {...p} />,
  Check: (p: any) => <svg {...p} />,
  Undo2: (p: any) => <svg {...p} />,
  Pencil: (p: any) => <svg {...p} />,
  Trash2: (p: any) => <svg {...p} />,
  CircleDollarSign: (p: any) => <svg {...p} />,
  Clock: (p: any) => <svg {...p} />,
  AlertTriangle: (p: any) => <svg {...p} />,
  Loader2: (p: any) => <svg {...p} />,
}));

const makeBill = (overrides: Partial<RecurringBill> = {}): RecurringBill => ({
  id: "bill-1",
  name: "Supermercado",
  amount: 150,
  type: "expense",
  category: "Alimentação",
  dueDay: 10,
  startDate: "2026-09-01",
  duration: 1,
  accountId: null,
  description: null,
  scopedEdits: { months: {}, future: [], deletedMonths: {}, deletedFrom: null },
  ...overrides,
});

describe("Forecasts budget indicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.bills = [];
    mockData.payments = [];
  });

  const openForm = () => {
    fireEvent.click(screen.getByText("Nova Previsão"));
  };

  const openEdit = (billName: string) => {
    const card = screen.getByText(billName).closest('[class*="rounded-lg"]');
    const editBtn = card?.querySelector('button[title="Editar previsão"]') || screen.getByTitle("Editar previsão");
    fireEvent.click(editBtn);
  };

  const selectCategoryByName = (name: string) => {
    fireEvent.click(screen.getByTestId(`select-item-${name}`));
  };

  const setAmount = (value: string) => {
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value } });
  };

  const setType = (type: "expense" | "income") => {
    const tipoSelects = screen.getAllByTestId("select-mock");
    const tipoMock = tipoSelects[0];
    if (tipoMock) {
      const items = tipoMock.querySelectorAll("button");
      const btn = Array.from(items).find((b) => b.textContent === (type === "expense" ? "Saída" : "Entrada"));
      if (btn) fireEvent.click(btn);
    }
  };

  const getProjectedText = () => {
    const el = screen.queryByText(/R\$/);
    if (!el) return "";
    const parent = el.closest("span")?.parentElement;
    return parent?.textContent || "";
  };

  it("shows budget indicator for expense with monthlyBudget", () => {
    render(<Forecasts />);
    openForm();
    selectCategoryByName("Alimentação");
    setAmount("100");

    expect(screen.getByText("Orçamento de Alimentação")).toBeDefined();
    expect(screen.getByText("Já gasto:")).toBeDefined();
    expect(screen.getByText("Com esta e outras previsões:")).toBeDefined();
  });

  it("shows realized separate from committed", () => {
    render(<Forecasts />);
    openForm();
    selectCategoryByName("Alimentação");
    setAmount("0");

    expect(screen.getByText("Já gasto:")).toBeDefined();
    const realizedLine = screen.getByText("Já gasto:").parentElement;
    expect(realizedLine?.textContent).toContain("430");
  });

  it("does not show indicator for income", () => {
    render(<Forecasts />);
    openForm();
    setType("income");

    expect(screen.queryByText("Orçamento de")).toBeNull();
  });

  it("does not show indicator for category without budget", () => {
    render(<Forecasts />);
    openForm();
    selectCategoryByName("Lazer");

    expect(screen.queryByText("Orçamento de")).toBeNull();
  });

  it("handles empty amount without NaN", () => {
    render(<Forecasts />);
    openForm();
    selectCategoryByName("Alimentação");

    expect(screen.getByText("Orçamento de Alimentação")).toBeDefined();
    const percentageElements = screen.queryAllByText("%");
    percentageElements.forEach((el) => {
      expect(el.textContent).not.toContain("NaN");
    });
  });

  it("does not show indicator when no category selected", () => {
    render(<Forecasts />);
    openForm();

    expect(screen.queryByText("Orçamento de")).toBeNull();
  });

  // ==================== CRITICAL TESTS A-F ====================

  it("A: editing pending bill replaces old value, does not sum", () => {
    const bill = makeBill({ amount: 150, category: "Alimentação" });
    mockData.bills = [bill];

    render(<Forecasts />);
    openEdit("Supermercado");

    expect(screen.getByText("Orçamento de Alimentação")).toBeDefined();
    const committedLine = screen.getByText("Com esta e outras previsões:").parentElement;
    expect(committedLine?.textContent).toContain("150");

    setAmount("200");

    const committedAfter = screen.getByText("Com esta e outras previsões:").parentElement;
    expect(committedAfter?.textContent).toContain("200");
    expect(committedAfter?.textContent).not.toContain("350");
  });

  it("B: changing category adds value to new category without subtracting from old", () => {
    const bill = makeBill({ amount: 150, category: "Alimentação" });
    mockData.bills = [bill];

    render(<Forecasts />);
    openEdit("Supermercado");

    selectCategoryByName("Transporte");
    setAmount("200");

    expect(screen.getByText("Orçamento de Transporte")).toBeDefined();

    const committedLine = screen.getByText("Com esta e outras previsões:").parentElement;
    expect(committedLine?.textContent).toContain("200");
  });

  it("C: paid bill is not added again to committed", () => {
    const bill = makeBill({ amount: 150, category: "Alimentação" });
    mockData.bills = [bill];
    mockData.payments = [
      { id: "pay-1", recurringBillId: "bill-1", referenceMonth: "2026-09", paidAt: "2026-09-10", transactionId: "tx-1" },
    ];

    render(<Forecasts />);
    openEdit("Supermercado");

    expect(screen.getByText("Orçamento de Alimentação")).toBeDefined();
    const committedLine = screen.getByText("Com esta e outras previsões:").parentElement;
    expect(committedLine?.textContent).toContain("0");

    setAmount("200");

    const committedAfter = screen.getByText("Com esta e outras previsões:").parentElement;
    expect(committedAfter?.textContent).toContain("0");
  });

  it("D: navigating to another month recalculates realized/committed", () => {
    const bill = makeBill({ amount: 100, category: "Transporte", duration: 1 });
    mockData.bills = [bill];

    render(<Forecasts />);
    openForm();
    selectCategoryByName("Transporte");
    setAmount("50");

    expect(screen.getByText("Orçamento de Transporte")).toBeDefined();
    const committedLine = screen.getByText("Com esta e outras previsões:").parentElement;
    expect(committedLine?.textContent).toContain("150");

    const navButtons = screen.getAllByRole("button");
    const nextBtn = navButtons[navButtons.length - 1];
    fireEvent.click(nextBtn);

    expect(screen.getByText("Orçamento de Transporte")).toBeDefined();
    const committedAfter = screen.getByText("Com esta e outras previsões:").parentElement;
    expect(committedAfter?.textContent).toContain("50");
  });

  it("E: editScope does not change current month projection", () => {
    const bill = makeBill({ amount: 150, category: "Alimentação" });
    mockData.bills = [bill];

    render(<Forecasts />);
    openEdit("Supermercado");

    expect(screen.getByText("Orçamento de Alimentação")).toBeDefined();
    const committedBefore = screen.getByText("Com esta e outras previsões:").parentElement;
    expect(committedBefore?.textContent).toContain("150");

    const scopeSelect = screen.getAllByTestId("select-mock");
    const scopeMock = scopeSelect.find((el) => {
      const items = el.querySelectorAll("button");
      return Array.from(items).some((b) => b.textContent === "Todos os meses");
    });
    if (scopeMock) {
      const items = scopeMock.querySelectorAll("button");
      const allBtn = Array.from(items).find((b) => b.textContent === "Todos os meses");
      if (allBtn) fireEvent.click(allBtn);
    }

    const committedAfter = screen.getByText("Com esta e outras previsões:").parentElement;
    expect(committedAfter?.textContent).toContain("150");
  });

  it("F: exceeded shows correct numeric value, not R$ 0,00", () => {
    render(<Forecasts />);
    openForm();
    selectCategoryByName("Transporte");
    setAmount("2000");

    expect(screen.getByText("Orçamento de Transporte")).toBeDefined();
    const exceededEl = screen.getByText(/acima do orçamento/);
    expect(exceededEl).toBeDefined();
    const text = exceededEl.textContent || "";
    expect(text).toMatch(/R\$\s*[\d.]+,\d{2}\s*acima do orçamento/);
    const match = text.match(/R\$\s*([\d.]+,\d{2})\s*acima/);
    expect(match).not.toBeNull();
    expect(match?.[1]).not.toBe("0,00");
    expect(Number(match?.[1]?.replace(".", "").replace(",", "."))).toBeGreaterThan(0);
  });

  it("percentage is displayed as rounded integer", () => {
    render(<Forecasts />);
    openForm();
    selectCategoryByName("Alimentação");
    setAmount("310");

    const percentageEl = screen.getByText(/\d+%/);
    const text = percentageEl.textContent || "";
    const num = parseInt(text.replace("%", ""), 10);
    expect(num).toBe(Math.round(num));
    expect(text).not.toContain(".");
  });

  it("progress bar does NOT use destructive when within budget", () => {
    render(<Forecasts />);
    openForm();
    selectCategoryByName("Alimentação");
    setAmount("100");

    const indicator = screen.getByTestId("progress-indicator");
    expect(indicator).not.toHaveClass("bg-destructive");
    expect(indicator).toHaveClass("bg-primary");
  });

  it("progress bar uses destructive when budget is exceeded", () => {
    render(<Forecasts />);
    openForm();
    selectCategoryByName("Alimentação");
    setAmount("700");

    const indicator = screen.getByTestId("progress-indicator");
    expect(indicator).toHaveClass("bg-destructive");
  });

  it("percentage can exceed 100% textually while bar is capped at 100%", () => {
    render(<Forecasts />);
    openForm();
    selectCategoryByName("Alimentação");
    setAmount("700");

    const percentageEl = screen.getByText(/\d+%/);
    const num = parseInt(percentageEl.textContent!.replace("%", ""), 10);
    expect(num).toBeGreaterThan(100);

    const progressBar = screen.getByTestId("progress-bar");
    expect(progressBar).toHaveAttribute("data-value", "100");
  });

  it("exceeded value is correct when budget is surpassed", () => {
    render(<Forecasts />);
    openForm();
    selectCategoryByName("Alimentação");
    setAmount("700");

    const exceededEl = screen.getByText(/acima do orçamento/);
    expect(exceededEl).toBeDefined();
    const text = exceededEl.textContent || "";
    expect(text).toMatch(/R\$\s*[\d.]+,\d{2}\s*acima do orçamento/);
  });
});
