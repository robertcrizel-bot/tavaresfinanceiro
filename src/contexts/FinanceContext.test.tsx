import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceProvider, useFinance } from "@/contexts/FinanceContext";
import type { ReceiptDetails, Transaction } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" },
  from: vi.fn(),
  transactionOrder: vi.fn(),
  invoiceOrder: vi.fn(),
  insert: vi.fn(),
  insertSingle: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  updateIn: vi.fn(),
  rpc: vi.fn(),
  toast: vi.fn(),
  transactionRows: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: vi.fn() },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

const details: ReceiptDetails = {
  merchantName: "Mercado Central",
  taxId: "12.345.678/0001-90",
  fiscalDocumentNumber: "12345",
  cardBrand: "Visa",
  cardLastFour: "4321",
};

const transactionInput: Omit<Transaction, "id"> = {
  title: "Mercado",
  amount: 120,
  type: "expense",
  category: "Alimentação",
  date: "2026-09-11",
};

describe("FinanceContext receipt details", () => {
  let context: ReturnType<typeof useFinance> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    context = null;
    mocks.transactionRows = [];
    mocks.transactionOrder.mockImplementation(async () => ({ data: mocks.transactionRows, error: null }));
    mocks.invoiceOrder.mockResolvedValue({ data: [], error: null });
    mocks.rpc.mockResolvedValue({ data: "operation-1", error: null });
    mocks.insertSingle.mockResolvedValue({ data: { id: "parent-1" }, error: null });
    mocks.insert.mockImplementation((payload: unknown) => {
      if (Array.isArray(payload)) return Promise.resolve({ error: null });
      return { select: () => ({ single: mocks.insertSingle }) };
    });
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.updateIn.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.updateEq, in: mocks.updateIn });
    mocks.from.mockImplementation((table: string) => {
      if (table === "transactions") {
        return {
          select: (columns: string) => {
            if (columns !== "*") throw new Error(`Unexpected select: ${columns}`);
            return { order: mocks.transactionOrder };
          },
          insert: mocks.insert,
          update: mocks.update,
        };
      }
      if (table === "transaction_attachments") {
        return { select: () => ({ data: [], error: null }), insert: vi.fn() };
      }
      if (table === "credit_card_invoices") {
        return { select: () => ({ order: mocks.invoiceOrder }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  const renderProvider = async () => {
    const Consumer = () => {
      context = useFinance();
      return null;
    };
    render(<FinanceProvider><Consumer /></FinanceProvider>);
    await waitFor(() => expect(context?.loading).toBe(false));
  };

  it("hydrates existing receipt metadata without losing information", async () => {
    mocks.transactionRows = [{
      id: "transaction-1",
      user_id: "user-1",
      title: "Mercado",
      amount: 120,
      type: "expense",
      category: "Alimentação",
      date: "2026-09-11",
      description: null,
      payment_method: null,
      account_id: null,
      credit_card_id: null,
      is_paid: false,
      receipt_ref: "receipt-1",
      receipt_details: details,
    }];

    await renderProvider();

    expect(context?.transactions[0]).toEqual(expect.objectContaining({
      receiptRef: "receipt-1",
      receiptDetails: details,
    }));
  });

  it("creates a manual record with a null receipt_details payload", async () => {
    await renderProvider();

    await act(async () => { await context?.addTransaction(transactionInput); });

    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: "Mercado",
      receipt_ref: null,
      receipt_details: null,
    }));
  });

  it("creates a record with the complete receipt_details payload", async () => {
    await renderProvider();

    await act(async () => {
      await context?.addTransaction(
        { ...transactionInput, receiptDetails: details },
        { receiptRef: "receipt-1" },
      );
    });

    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      receipt_ref: "receipt-1",
      receipt_details: details,
    }));
  });

  it("updates records while preserving metadata or explicitly keeping it absent", async () => {
    await renderProvider();

    await act(async () => {
      await context?.updateTransaction({ ...transactionInput, id: "with-details", receiptDetails: details });
      await context?.updateTransaction({ ...transactionInput, id: "without-details" });
    });

    expect(mocks.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ receipt_details: details }));
    expect(mocks.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ receipt_details: null }));
    expect(mocks.updateEq).toHaveBeenNthCalledWith(1, "id", "with-details");
    expect(mocks.updateEq).toHaveBeenNthCalledWith(2, "id", "without-details");
  });

  it("creates installments without receipt metadata when no receipt was provided", async () => {
    await renderProvider();

    await act(async () => {
      await context?.addTransaction(transactionInput, { installments: 3 });
    });

    const parent = mocks.insert.mock.calls[0][0];
    const children = mocks.insert.mock.calls[1][0] as Record<string, unknown>[];
    expect(parent).not.toHaveProperty("receipt_details");
    expect(parent).toEqual(expect.objectContaining({ receipt_ref: null, installment_number: 1 }));
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child).not.toHaveProperty("receipt_details");
      expect(child).not.toHaveProperty("receipt_ref");
      expect(child.parent_transaction_id).toBe("parent-1");
    }
  });

  it("keeps receipt metadata on the first installment without duplicating it to future ones", async () => {
    await renderProvider();

    await act(async () => {
      await context?.addTransaction(
        { ...transactionInput, receiptDetails: details },
        { installments: 3, receiptRef: "receipt-1" },
      );
    });

    const parent = mocks.insert.mock.calls[0][0];
    const children = mocks.insert.mock.calls[1][0] as Record<string, unknown>[];
    expect(parent).toEqual(expect.objectContaining({
      receipt_ref: "receipt-1",
      receipt_details: details,
      installment_number: 1,
    }));
    for (const child of children) {
      expect(child).not.toHaveProperty("receipt_details");
      expect(child).not.toHaveProperty("receipt_ref");
    }
  });

  // Regression coverage for exact installment totals and civil monthly dates.
  it.each([
    { amount: 100, installments: 3, expectedAmounts: [33.34, 33.33, 33.33] },
    { amount: 100, installments: 6, expectedAmounts: [16.67, 16.67, 16.67, 16.67, 16.66, 16.66] },
    { amount: 0.01, installments: 3, expectedAmounts: [0.01, 0, 0] },
    { amount: 1.01, installments: 2, expectedAmounts: [0.51, 0.50] },
    { amount: 120, installments: 3, expectedAmounts: [40, 40, 40] },
  ])("REGRESSION: $amount / $installments preserves every cent", async ({ amount, installments, expectedAmounts }) => {
    await renderProvider();
    let saved = false;
    await act(async () => { saved = await context!.addTransaction({ ...transactionInput, amount, creditCardId: "card-1" }, { installments }); });
    const parent = mocks.insert.mock.calls[0][0];
    const children = mocks.insert.mock.calls[1][0] as Array<{ amount: number }>;
    const total = [parent, ...children].reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
    expect(saved).toBe(true);
    expect(total).toBe(Math.round(amount * 100));
    expect([parent, ...children].map(row => row.amount)).toEqual(expectedAmounts);
  });

  it.each([
    { date: "2026-01-29", actual: "2026-02-28" },
    { date: "2026-01-30", actual: "2026-02-28" },
    { date: "2026-01-31", actual: "2026-02-28" },
    { date: "2024-01-30", actual: "2024-02-29" },
    { date: "2024-01-31", actual: "2024-02-29" },
  ])("REGRESSION: $date clamps February to $actual and restores the original day in March", async ({ date, actual }) => {
    await renderProvider();
    await act(async () => { await context!.addTransaction({ ...transactionInput, date, amount: 120, creditCardId: "card-1" }, { installments: 3 }); });
    const children = mocks.insert.mock.calls[1][0] as Array<{ date: string }>;
    expect(children[0].date).toBe(actual);
    expect(children[1].date).toBe(date.slice(0, 4) + "-03-" + date.slice(-2));
    expect(mocks.insert.mock.calls[0][0].date).toBe(date);
  });

  it("AUDIT control: leap-day installment remains in February when that day exists", async () => {
    await renderProvider();
    await act(async () => { await context!.addTransaction({ ...transactionInput, date: "2024-01-29", creditCardId: "card-1" }, { installments: 2 }); });
    expect(mocks.insert.mock.calls[1][0][0].date).toBe("2024-02-29");
  });

  it.each([
    { date: "2026-03-31", expected: ["2026-04-30", "2026-05-31"] },
    { date: "2026-12-31", expected: ["2027-01-31", "2027-02-28"] },
    { date: "2024-02-29", expected: ["2024-03-29", "2024-04-29"] },
  ])("REGRESSION: $date advances across month and year boundaries", async ({ date, expected }) => {
    await renderProvider();
    await act(async () => { await context!.addTransaction({ ...transactionInput, date, creditCardId: "card-1" }, { installments: 3 }); });
    expect(mocks.insert.mock.calls[1][0].map((row: { date: string }) => row.date)).toEqual(expected);
  });

  it("closes an invoice through the atomic lifecycle RPC", async () => {
    await renderProvider();

    let result = false;
    await act(async () => { result = await context!.closeCardInvoice("invoice-1", "2026-10-25", ["tx-1"], "2026-11-08"); });

    expect(result).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("close_credit_card_invoice", {
      p_invoice_id: "invoice-1",
      p_actual_closed_date: "2026-10-25",
      p_exclude_transaction_ids: ["tx-1"],
      p_due_date: "2026-11-08",
    });
  });

  it("restores manually moved purchases before closing the reopened invoice", async () => {
    await renderProvider();

    let result = false;
    await act(async () => {
      result = await context!.closeCardInvoice("invoice-1", "2026-09-25", [], "2026-10-07", ["tx-moved"]);
    });

    expect(result).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ credit_card_invoice_id: "invoice-1" });
    expect(mocks.updateIn).toHaveBeenCalledWith("id", ["tx-moved"]);
    expect(mocks.rpc).toHaveBeenCalledWith("close_credit_card_invoice", {
      p_invoice_id: "invoice-1",
      p_actual_closed_date: "2026-09-25",
      p_exclude_transaction_ids: [],
      p_due_date: "2026-10-07",
    });
  });

  it("aborts closing when restoration fails and refreshes instead of reporting success", async () => {
    await renderProvider();
    mocks.updateIn.mockResolvedValueOnce({ error: { message: "protected purchase" } });
    const reads = mocks.transactionOrder.mock.calls.length;
    let result = true;
    await act(async () => { result = await context!.closeCardInvoice("invoice-1", undefined, [], undefined, ["tx-1"]); });
    expect(result).toBe(false); expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.transactionOrder.mock.calls.length).toBeGreaterThan(reads);
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Fatura fechada" }));
  });

  it.each(["error", "exception"])("refreshes after restoration and RPC %s, without a compensating update", async mode => {
    await renderProvider();
    if (mode === "error") mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "invalid due date" } });
    else mocks.rpc.mockRejectedValueOnce(new Error("response lost"));
    const reads = mocks.transactionOrder.mock.calls.length;
    let result = true;
    await act(async () => { result = await context!.closeCardInvoice("invoice-1", undefined, [], undefined, ["tx-1"]); });
    expect(result).toBe(false); expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.transactionOrder.mock.calls.length).toBeGreaterThan(reads);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Fatura fechada" }));
  });

  it("blocks simultaneous closes until refresh finishes and permits retry after failure", async () => {
    await renderProvider();
    let finish!: (value: unknown) => void;
    mocks.rpc.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    let first!: Promise<boolean>;
    act(() => { first = context!.closeCardInvoice("invoice-1"); });
    let second = true;
    await act(async () => {
      second = await context!.closeCardInvoice("invoice-1");
      finish({ data: null, error: { message: "rejected" } }); await first;
    });
    expect(second).toBe(false); expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await act(async () => { expect(await context!.closeCardInvoice("invoice-1")).toBe(true); });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("refreshes after a lost restoration response and never calls the closing RPC", async () => {
    await renderProvider(); mocks.updateIn.mockRejectedValueOnce(new Error("network"));
    const reads = mocks.transactionOrder.mock.calls.length;
    await act(async () => { expect(await context!.closeCardInvoice("invoice-1", undefined, [], undefined, ["tx-1"])).toBe(false); });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.transactionOrder.mock.calls.length).toBeGreaterThan(reads);
  });

  it("reopens a closed invoice through the atomic lifecycle RPC", async () => {
    await renderProvider();

    let result = false;
    await act(async () => { result = await context!.reopenCardInvoice("invoice-1"); });

    expect(result).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("reopen_credit_card_invoice", {
      p_invoice_id: "invoice-1",
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Fatura reaberta" }));
  });

  it("does not report an invalid reopen as successful", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Fatura paga nao pode ser reaberta" } });
    await renderProvider();

    let result = true;
    await act(async () => { result = await context!.reopenCardInvoice("invoice-paid"); });

    expect(result).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Erro ao reabrir fatura",
      variant: "destructive",
    }));
  });

  it("pays the exact closed invoice from the selected account", async () => {
    await renderProvider();

    let result = false;
    await act(async () => {
      result = await context!.payCardInvoice("invoice-1", "account-1", "2026-11-08", "Pix");
    });

    expect(result).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("pay_credit_card_invoice", {
      p_invoice_id: "invoice-1",
      p_account_id: "account-1",
      p_payment_date: "2026-11-08",
      p_payment_method: "Pix",
    });
  });

  it("reverses an invoice payment through the atomic lifecycle RPC", async () => {
    await renderProvider();

    let result = false;
    await act(async () => { result = await context!.reverseCardInvoicePayment("invoice-paid"); });

    expect(result).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("reverse_credit_card_invoice_payment", {
      p_invoice_id: "invoice-paid",
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Pagamento estornado" }));
  });

  it("does not report an invalid payment reversal as successful", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Somente fatura paga pode ter o pagamento estornado" } });
    await renderProvider();

    let result = true;
    await act(async () => { result = await context!.reverseCardInvoicePayment("invoice-closed"); });

    expect(result).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Erro ao estornar pagamento",
      variant: "destructive",
    }));
  });

  it("does not report a duplicate payment as successful", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Fatura ja paga" } });
    await renderProvider();

    let result = true;
    await act(async () => { result = await context!.payCardInvoice("invoice-1", "account-1"); });

    expect(result).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Erro ao pagar fatura",
      variant: "destructive",
    }));
  });
});
