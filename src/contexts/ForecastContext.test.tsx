import { installIntentEnvironment } from "@/test/financial-intent-environment";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForecastProvider, useForecast, type RecurringBill } from "@/contexts/ForecastContext";
import { refreshCategoryReferences } from "@/lib/category-refresh";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" },
  from: vi.fn(),
  rpc: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  recurringOrder: vi.fn(),
  paymentsOrder: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, rpc:mocks.rpc, auth:{getSession:async()=>({data:{session:{user:mocks.user}},error:null})} },
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
    installIntentEnvironment();
    mocks.rpc.mockResolvedValue({data:{payment_id:"p",transaction_id:"t"},error:null});
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

  it("reloads recurring categories and scoped overrides after a category mutation", async () => {
    let context: ReturnType<typeof useForecast> | null = null;
    const Consumer = () => { context = useForecast(); return null; };
    render(<ForecastProvider><Consumer /></ForecastProvider>);
    await waitFor(() => expect(context?.loading).toBe(false));
    mocks.recurringOrder.mockResolvedValueOnce({ data: [{ ...recurringBillRow, category: "Casa", scoped_edits: { months: { "2026-10": { category: "Casa" } }, future: [] } }] });
    await act(async () => { await refreshCategoryReferences(); });
    expect(context?.bills[0].category).toBe("Casa");
    expect(context?.bills[0].scopedEdits.months["2026-10"].category).toBe("Casa");
    expect(context?.payments[0].transactionId).toBe("transaction-1");
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

describe("Forecast RPC payment overrides",()=>{
 beforeEach(()=>{
  vi.clearAllMocks();installIntentEnvironment();
  mocks.recurringOrder.mockResolvedValue({data:[recurringBillRow]});mocks.paymentsOrder.mockResolvedValue({data:[]});
  mocks.rpc.mockResolvedValue({data:{payment_id:"p",transaction_id:"t"},error:null});
  mocks.from.mockImplementation((table:string)=>{
   if(table==="recurring_bills")return{select:()=>({order:mocks.recurringOrder})};
   if(table==="bill_payments")return{select:()=>({order:mocks.paymentsOrder})};
   throw Error("Separate writes forbidden");
  });
 });
 it.each([{accountId:null,creditCardId:"card-1"},{accountId:"account-1",creditCardId:null}])("passes account/card choices to server without a separate transaction",async overrides=>{
  let context:ReturnType<typeof useForecast>;function C(){context=useForecast();return null;}
  render(<ForecastProvider><C/></ForecastProvider>);await waitFor(()=>expect(context.loading).toBe(false));
  await act(async()=>{await context.markAsPaid(context.bills[0],"2026-09",overrides);});
  expect(mocks.rpc).toHaveBeenCalledWith("mark_forecast_payment",{p_operation_id:expect.any(String),p_bill_id:"bill-1",p_reference_month:"2026-09",p_overrides:overrides});
 });
});
