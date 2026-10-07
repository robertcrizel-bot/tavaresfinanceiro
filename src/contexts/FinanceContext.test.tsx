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
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
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

  it("closes an invoice through the atomic lifecycle RPC", async () => {
    await renderProvider();

    let result = false;
    await act(async () => { result = await context!.closeCardInvoice("invoice-1"); });

    expect(result).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("close_credit_card_invoice", { p_invoice_id: "invoice-1", p_actual_closed_date: null });
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
