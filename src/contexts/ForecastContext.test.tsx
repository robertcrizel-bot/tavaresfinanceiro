import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForecastProvider, useForecast } from "@/contexts/ForecastContext";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" },
  from: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  recurringOrder: vi.fn(),
  paymentsOrder: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({ addTransaction: vi.fn(), refetch: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const recurringBillRow = {
  id: "bill-1",
  name: "Aluguel",
  amount: 1000,
  category: "Moradia",
  due_day: 10,
  start_date: "2026-01-01",
  duration_months: 12,
  account_id: "account-1",
  description: null,
  scoped_edits: { months: {}, future: [] },
};

const priorPaymentRow = {
  id: "payment-1",
  recurring_bill_id: "bill-1",
  reference_month: "2026-02",
  paid_at: "2026-02-10T12:00:00Z",
  transaction_id: "transaction-1",
};

describe("ForecastContext recurring bill deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recurringOrder.mockResolvedValue({ data: [recurringBillRow] });
    mocks.paymentsOrder.mockResolvedValue({ data: [priorPaymentRow] });
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
    mocks.from.mockImplementation((table: string) => {
      if (table === "recurring_bills") {
        return {
          select: () => ({ order: mocks.recurringOrder }),
          update: mocks.update,
        };
      }
      if (table === "bill_payments") {
        return { select: () => ({ order: mocks.paymentsOrder }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("preserves prior payments and transactions when deleting future occurrences", async () => {
    let context: ReturnType<typeof useForecast> | null = null;
    const Consumer = () => {
      context = useForecast();
      return null;
    };

    render(<ForecastProvider><Consumer /></ForecastProvider>);

    await waitFor(() => expect(context?.loading).toBe(false));
    expect(context?.payments).toEqual([{
      id: "payment-1",
      recurringBillId: "bill-1",
      referenceMonth: "2026-02",
      paidAt: "2026-02-10T12:00:00Z",
      transactionId: "transaction-1",
    }]);

    await act(async () => {
      await context?.deleteBill("bill-1", "future", "2026-04");
    });

    expect(mocks.update).toHaveBeenCalledWith({
      scoped_edits: {
        months: {},
        future: [],
        deletedMonths: {},
        deletedFrom: "2026-04",
      },
    });
    expect(mocks.updateEq).toHaveBeenCalledWith("id", "bill-1");
    expect(mocks.from).not.toHaveBeenCalledWith("transactions");
    expect(context?.payments).toHaveLength(1);
  });
});
