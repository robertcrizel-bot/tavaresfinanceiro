import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForecastProvider, useForecast, type RecurringBill } from "@/contexts/ForecastContext";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  order: vi.fn(),
  paymentsOrder: vi.fn(),
  confirmSingle: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u-one" } }) }));
vi.mock("@/contexts/FinanceContext", () => ({
  useFinance: () => ({ addTransaction: vi.fn(), refetch: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

type FormBill = Omit<RecurringBill, "id" | "scopedEdits">;
const form: FormBill = {
  name: "Unimed Joaquim", type: "expense", amount: 600, category: "Plano de Saúde",
  dueDay: 15, startDate: "2026-09-01", durationMonths: 24, accountId: null, description: null,
};

describe("ForecastContext duplicate creation defense", () => {
  let context: ReturnType<typeof useForecast> | null = null;
  beforeEach(() => {
    vi.clearAllMocks();
    context = null;
    mocks.order.mockResolvedValue({ data: [] });
    mocks.paymentsOrder.mockResolvedValue({ data: [] });
    mocks.confirmSingle.mockResolvedValue({ data: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "recurring_bills") return {
        select: (column?: string) => column === "id"
          ? { eq: () => ({ eq: () => ({ maybeSingle: mocks.confirmSingle }) }) }
          : { order: mocks.order },
        insert: mocks.insert,
      };
      if (table === "bill_payments") return { select: () => ({ order: mocks.paymentsOrder }) };
      throw new Error(`Unexpected table: ${table}`);
    });
  });
  const init = async () => {
    const Consumer = () => { context = useForecast(); return null; };
    render(<ForecastProvider><Consumer /></ForecastProvider>);
    await waitFor(() => expect(context?.loading).toBe(false));
  };

  it("accepts only one simultaneous creation with the same request UUID", async () => {
    let resolveInsert!: (result: {error: null}) => void;
    const pending = new Promise<{error: null}>((resolve) => { resolveInsert = resolve; });
    mocks.insert.mockReturnValueOnce(pending);
    await init();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = context!.addBill(form, "f0000000-0000-4000-a000-000000000001");
      second = context!.addBill(form, "f0000000-0000-4000-a000-000000000001");
    });
    expect(await second).toBe(false);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    resolveInsert({error: null});
    expect(await first).toBe(true);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: "f0000000-0000-4000-a000-000000000001", name: "Unimed Joaquim",
    }));
  });

  it("confirms a previously saved UUID instead of creating a second forecast after response loss", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    mocks.confirmSingle.mockResolvedValue({ data: { id: "f0000000-0000-4000-a000-000000000002" } });
    await init();
    let success = false;
    await act(async () => { success = await context!.addBill(form, "f0000000-0000-4000-a000-000000000002"); });
    expect(success).toBe(true);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.confirmSingle).toHaveBeenCalledTimes(1);
  });

  it("does not treat a different record's duplicate error as a success", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505", message: "duplicate identity" } });
    mocks.confirmSingle.mockResolvedValue({ data: null });
    await init();
    let success = true;
    await act(async () => { success = await context!.addBill(form, "f0000000-0000-4000-a000-000000000003"); });
    expect(success).toBe(false);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
