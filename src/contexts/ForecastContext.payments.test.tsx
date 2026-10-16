import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForecastProvider, useForecast } from "./ForecastContext";

type Row = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({
  from: vi.fn(), toast: vi.fn(), refetch: vi.fn(),
  user: { id: "user-1" } as { id: string } | null,
  transactions: new Map<string, Row>(), payments: new Map<string, Row>(),
  events: [] as string[], sequence: 0,
  beforeTransaction: undefined as (() => Promise<void>) | undefined,
  beforeLink: undefined as (() => Promise<void>) | undefined,
  beforeDelete: undefined as (() => Promise<void>) | undefined,
  transactionError: false, transactionNoId: false, linkError: false,
  transactionDeleteError: false, paymentDeleteError: false,
  transactionDeleteEmpty: false, paymentDeleteEmpty: false,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: db.user }) }));
vi.mock("@/contexts/FinanceContext", () => ({ useFinance: () => ({ refetch: db.refetch, addTransaction: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: db.toast }));

const bill = { id: "bill-1", name: "Conta", amount: 100, category: "Outros", type: "expense",
  due_day: 10, start_date: "2026-01-01", duration_months: null, account_id: "account-1", description: null, scoped_edits: {} };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Forecast payment local containment (not database atomicity)", () => {
  let context: ReturnType<typeof useForecast>;
  beforeEach(() => {
    vi.clearAllMocks();
    db.user = { id: "user-1" };
    db.transactions.clear(); db.payments.clear(); db.events = []; db.sequence = 0;
    db.beforeTransaction = db.beforeLink = db.beforeDelete = undefined;
    db.transactionError = db.transactionNoId = db.linkError = false;
    db.transactionDeleteError = db.paymentDeleteError = db.transactionDeleteEmpty = db.paymentDeleteEmpty = false;
    db.refetch.mockResolvedValue(undefined);
    db.from.mockImplementation((table: string) => {
      if (table === "recurring_bills") return { select: () => ({ order: async () => ({ data: [bill] }) }) };
      if (table === "transactions") return {
        insert: (payload: Record<string, unknown>) => ({ select: () => ({ single: async () => {
          db.events.push("insert transaction");
          await db.beforeTransaction?.();
          if (db.transactionError) return { data: null, error: { message: "insert denied" } };
          if (db.transactionNoId) return { data: null, error: null };
          const id = `tx-${++db.sequence}`;
          db.transactions.set(id, { ...payload, id });
          return { data: { id }, error: null };
        } }) }),
        delete: () => ({ eq: (_column: string, id: string) => ({ select: async () => {
          db.events.push("delete transaction");
          await db.beforeDelete?.();
          if (db.transactionDeleteError) return { data: null, error: { message: "protected transaction" } };
          if (db.transactionDeleteEmpty || !db.transactions.has(id)) return { data: [], error: null };
          db.transactions.delete(id);
          for (const payment of db.payments.values()) if (payment.transaction_id === id) payment.transaction_id = null;
          return { data: [{ id }], error: null };
        } }) }),
      };
      if (table === "bill_payments") return {
        select: () => ({ order: async () => ({ data: [...db.payments.values()].map(row => ({ ...row })) }) }),
        insert: async (payload: Record<string, unknown>) => {
          db.events.push("insert link");
          await db.beforeLink?.();
          if (db.linkError) return { error: { message: "link failed" } };
          if ([...db.payments.values()].some(p => p.recurring_bill_id === payload.recurring_bill_id && p.reference_month === payload.reference_month)) {
            return { error: { code: "23505", message: "duplicate bill/month" } };
          }
          const id = `payment-${String(payload.transaction_id)}`;
          db.payments.set(id, { ...payload, id, paid_at: "2026-10-10T12:00:00Z" });
          return { error: null };
        },
        delete: () => ({ eq: (_column: string, id: string) => ({ select: async () => {
          db.events.push("delete link");
          if (db.paymentDeleteError) return { data: null, error: { message: "delete link failed" } };
          if (db.paymentDeleteEmpty || !db.payments.has(id)) return { data: [], error: null };
          db.payments.delete(id);
          return { data: [{ id }], error: null };
        } }) }),
      };
      throw new Error(`Unexpected table ${table}`);
    });
  });
  async function mount() {
    function Consumer() { context = useForecast(); return null; }
    render(<ForecastProvider><Consumer /></ForecastProvider>);
    await waitFor(() => expect(context.loading).toBe(false));
  }
  async function pay(month = "2026-10") {
    await act(async () => { await context.markAsPaid(context.bills[0], month); });
  }
  async function unpay() {
    const id = context.payments[0].id;
    await act(async () => { await context.unmarkAsPaid(id); });
  }
  const expectError = () => expect(db.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  const expectNoSuccess = () => expect(db.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Pagamento desmarcado" }));

  it("serializes ten simultaneous marks for the same bill/month", async () => {
    await mount();
    const gate = deferred(); db.beforeTransaction = () => gate.promise;
    let pending!: Promise<void[]>;
    act(() => { pending = Promise.all(Array.from({ length: 10 }, () => context.markAsPaid(context.bills[0], "2026-10"))); });
    expect(db.events).toEqual(["insert transaction"]);
    await act(async () => { gate.resolve(); await pending; });
    expect(db.transactions.size).toBe(1); expect(db.payments.size).toBe(1);
  });
  it("does not mark a payment already loaded, including through an old callback", async () => {
    await mount(); const mark = context.markAsPaid; const currentBill = context.bills[0];
    await pay(); db.events = [];
    await act(async () => { await mark(currentBill, "2026-10"); });
    expect(db.events).toEqual([]); expect(db.transactions.size).toBe(1);
  });
  it("keeps independent months usable", async () => {
    await mount();
    await act(async () => { await Promise.all([context.markAsPaid(context.bills[0], "2026-10"), context.markAsPaid(context.bills[0], "2026-11")]); });
    expect(db.transactions.size).toBe(2); expect(db.payments.size).toBe(2);
  });
  it.each(["error", "no id", "exception"])("does not insert a null link after transaction %s and releases the local lock", async mode => {
    await mount();
    db.transactionError = mode === "error"; db.transactionNoId = mode === "no id";
    if (mode === "exception") db.beforeTransaction = async () => { throw new Error("network"); };
    await pay(); expect(db.events).toEqual(["insert transaction"]); expectError();
    expect(db.refetch).toHaveBeenCalled();
    db.transactionError = db.transactionNoId = false; db.beforeTransaction = undefined;
    await pay(); expect(db.payments.size).toBe(1);
  });
  it("refreshes and warns on link failure without guessing a compensating deletion", async () => {
    await mount(); db.linkError = true; await pay();
    expect(db.events).toEqual(["insert transaction", "insert link"]);
    expect(db.refetch).toHaveBeenCalled(); expectError();
    expect(db.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("pode ter sido criado") }));
    expect(db.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Conta paga!" }));
  });
  it("handles a lost link response without deleting a committed payment or retrying automatically", async () => {
    await mount();
    db.beforeLink = async () => {
      db.payments.set("external", { id: "external", recurring_bill_id: "bill-1", reference_month: "2026-10", transaction_id: "tx-1" });
      throw new Error("response lost");
    };
    await pay(); db.beforeLink = undefined; await pay();
    expect(db.events).toEqual(["insert transaction", "insert link"]);
    expect(db.transactions.has("tx-1")).toBe(true); expectError();
  });
  it("treats a UNIQUE conflict from another client as an error and refreshes", async () => {
    await mount();
    db.beforeLink = async () => { db.payments.set("external", { id: "external", recurring_bill_id: "bill-1", reference_month: "2026-10", transaction_id: "external-tx" }); };
    await pay(); expectError(); expect(db.refetch).toHaveBeenCalled();
    expect(db.events).not.toContain("delete transaction");
    expect(context.payments[0].id).toBe("external");
  });
  it.each(["error", "no rows", "exception"])("preserves the link when transaction deletion returns %s", async mode => {
    await mount(); await pay(); db.toast.mockClear(); db.events = [];
    db.transactionDeleteError = mode === "error"; db.transactionDeleteEmpty = mode === "no rows";
    if (mode === "exception") db.beforeDelete = async () => { throw new Error("network"); };
    await unpay();
    expect(db.events).toEqual(["delete transaction"]); expect(db.payments.size).toBe(1);
    expect(db.transactions.size).toBe(1); expectError(); expectNoSuccess();
  });
  it.each(["error", "no rows"])("reports an incomplete unmark after link deletion %s and reloads the actual state", async mode => {
    await mount(); await pay(); db.toast.mockClear(); db.refetch.mockClear();
    db.paymentDeleteError = mode === "error"; db.paymentDeleteEmpty = mode === "no rows";
    await unpay(); expectError(); expectNoSuccess(); expect(db.refetch).toHaveBeenCalled();
    expect(context.payments[0].transactionId).toBeNull();
  });
  it("does not delete unknown or unlinked payments", async () => {
    db.payments.set("legacy", { id: "legacy", recurring_bill_id: "bill-1", reference_month: "2026-10", transaction_id: null });
    await mount();
    await act(async () => { await context.unmarkAsPaid("unknown"); await context.unmarkAsPaid("legacy"); });
    expect(db.events).toEqual([]); expect(db.payments.has("legacy")).toBe(true); expectError();
  });
  it("blocks simultaneous unmark and mark for the same competence, then permits a new payment", async () => {
    await mount(); await pay(); db.events = [];
    const gate = deferred(); db.beforeDelete = () => gate.promise;
    const payment = context.payments[0];
    let first!: Promise<void>;
    act(() => { first = context.unmarkAsPaid(payment.id); });
    await act(async () => {
      await Promise.all([context.unmarkAsPaid(payment.id), context.markAsPaid(context.bills[0], "2026-10")]);
      gate.resolve(); await first;
    });
    expect(db.events).toEqual(["delete transaction", "delete link"]);
    expect(db.transactions.size).toBe(0); expect(db.payments.size).toBe(0);
    await pay(); expect(db.payments.size).toBe(1);
  });
  it("refresh failure releases the lock without pretending rollback", async () => {
    await mount(); db.refetch.mockRejectedValueOnce(new Error("refresh failed"));
    await pay(); expectError(); await pay("2026-11"); expect(db.payments.size).toBe(2);
  });
  it("does not write without an authenticated user", async () => {
    db.user = null; await mount();
    await act(async () => { await context.markAsPaid({ ...bill, dueDay: 10 } as never, "2026-10"); await context.unmarkAsPaid("payment"); });
    expect(db.events).toEqual([]);
  });
});
