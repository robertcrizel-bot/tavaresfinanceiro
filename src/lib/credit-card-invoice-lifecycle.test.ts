import { describe, expect, it } from "vitest";
import {
  getCardCommittedAmount,
  getCreditCardCycle,
  getInvoiceAmount,
  getInvoicePreviewAmount,
  selectCardInvoice,
} from "@/lib/credit-card-billing";
import { calculateAccountBalances, calculateCurrentMonthCategorySpending, calculateFinancialTotals } from "@/lib/financial-calculations";
import { isAnalyticsExpense } from "@/lib/expense-analytics";
import { buildCreditCardStatement } from "@/lib/credit-card-statement";
import type { CreditCardInvoice, Transaction } from "@/lib/types";

const invoice = (overrides: Partial<CreditCardInvoice> = {}): CreditCardInvoice => ({
  id: "invoice-october",
  creditCardId: "card-1",
  competence: "2026-10-01",
  cycleStart: "2026-09-21",
  cycleEnd: "2026-10-20",
  dueDate: "2026-10-27",
  status: "OPEN",
  ...overrides,
});

const purchase = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "purchase-1",
  title: "Supermercado",
  amount: 500,
  type: "expense",
  category: "Alimentação",
  date: "2026-10-10",
  creditCardId: "card-1",
  creditCardInvoiceId: "invoice-october",
  financialKind: "card_purchase",
  isPaid: false,
  ...overrides,
});

describe("credit card invoice lifecycle", () => {
  it("puts a card purchase in the open invoice without losing its category", () => {
    const transaction = purchase();

    expect(getInvoiceAmount([transaction], invoice())).toBe(500);
    expect(transaction.category).toBe("Alimentação");
    expect(calculateFinancialTotals([transaction]).expense).toBe(500);
  });

  it("shows all purchases from the billing cycle instead of only one civil month", () => {
    const septemberPurchase = purchase({ id: "september", date: "2026-09-25", amount: 100 });
    const octoberPurchase = purchase({ id: "october", date: "2026-10-10", amount: 200 });
    const statement = buildCreditCardStatement({
      creditCardId: "card-1",
      transactions: [septemberPurchase, octoberPurchase],
      referenceMonth: "2026-10",
      invoiceId: "invoice-october",
    });

    expect(statement.entries.map((entry) => entry.id)).toEqual(["october", "september"]);
    expect(statement.summary.totalPurchases).toBe(300);
  });

  it("uses the closing snapshot after the invoice is closed", () => {
    const closed = invoice({ status: "CLOSED", closedTotal: 500 });
    const changedTransactions = [purchase(), purchase({ id: "late", amount: 300 })];

    expect(getInvoiceAmount(changedTransactions, closed)).toBe(500);
  });

  it("keeps a zeroed invoice selectable so it can be closed", () => {
    const refund = purchase({ id: "refund", type: "income", financialKind: "card_refund" });
    const zeroed = invoice();

    expect(getInvoiceAmount([purchase(), refund], zeroed)).toBe(0);
    expect(selectCardInvoice([invoice({ id: "invoice-september", status: "PAID", paidAt: "2026-09-20T12:00:00Z" }), zeroed], [purchase(), refund], "card-1")).toEqual(zeroed);
  });

  it("keeps a purchase after closing in the next invoice", () => {
    const closed = invoice({ status: "CLOSED", closedTotal: 500 });
    const next = invoice({
      id: "invoice-november",
      competence: "2026-11-01",
      cycleStart: "2026-10-21",
      cycleEnd: "2026-11-20",
      dueDate: "2026-11-27",
    });
    const laterPurchase = purchase({
      id: "purchase-2",
      date: "2026-10-21",
      amount: 200,
      creditCardInvoiceId: next.id,
    });

    expect(getInvoiceAmount([purchase(), laterPurchase], closed)).toBe(500);
    expect(getInvoiceAmount([purchase(), laterPurchase], next)).toBe(200);
    expect(selectCardInvoice([closed, next], [purchase(), laterPurchase], "card-1")).toEqual(closed);
  });

  it("treats the closed-invoice obligation as financially neutral everywhere", () => {
    const obligation = purchase({
      id: "obligation",
      title: "Fatura Cartão Caixa - 10/2026",
      amount: 500,
      category: "Fatura Cartão",
      date: "2026-10-27",
      financialKind: "card_invoice_obligation",
    });

    expect(calculateFinancialTotals([purchase(), obligation])).toEqual({ income: 0, expense: 500 });
    expect(calculateCurrentMonthCategorySpending([purchase(), obligation], new Date(2026, 9, 15))).toEqual({ Alimentação: 500 });
    expect(isAnalyticsExpense(obligation)).toBe(false);
  });

  it("debits the selected account on payment without duplicating expense", () => {
    const payment = purchase({
      id: "payment",
      title: "Pagamento de Fatura - Caixa",
      category: "Fatura Cartão",
      date: "2026-10-25",
      accountId: "account-1",
      financialKind: "card_invoice_payment",
      isPaid: true,
    });
    const balances = calculateAccountBalances(
      [{ id: "account-1", initialBalance: 1000 }],
      [purchase(), payment],
      [],
    );

    expect(balances["account-1"]).toBe(500);
    expect(calculateFinancialTotals([purchase(), payment]).expense).toBe(500);
    expect(isAnalyticsExpense(payment)).toBe(false);
    const statement = buildCreditCardStatement({
      creditCardId: "card-1",
      transactions: [purchase(), payment],
      referenceMonth: "2026-10",
      invoiceId: "invoice-october",
    });
    expect(statement.summary.totalPayments).toBe(500);
  });

  it("marks the obligation paid independently from the original categorized purchase", () => {
    const original = purchase();
    const paidObligation = purchase({
      id: "obligation",
      title: "Fatura Cartão Caixa - 10/2026",
      category: "Fatura Cartão",
      financialKind: "card_invoice_obligation",
      isPaid: true,
    });

    expect(paidObligation.isPaid).toBe(true);
    expect(original.category).toBe("Alimentação");
    expect(original.amount).toBe(500);
  });

  it("includes neutral card adjustments in the invoice but not in expenses", () => {
    const adjustment = purchase({
      id: "adjustment",
      title: "Ajuste de Fatura",
      amount: 50,
      category: "Outros",
      financialKind: "manual_adjustment",
    });

    expect(getInvoiceAmount([purchase(), adjustment], invoice())).toBe(550);
    expect(getCardCommittedAmount([purchase(), adjustment], "card-1", [invoice()])).toBe(550);
    expect(calculateFinancialTotals([purchase(), adjustment]).expense).toBe(500);
    const statement = buildCreditCardStatement({
      creditCardId: "card-1",
      transactions: [purchase(), adjustment],
      referenceMonth: "2026-10",
      invoiceId: "invoice-october",
    });
    expect(statement.summary.totalPurchases).toBe(550);
  });

  it("keeps installments in their assigned cycles and commits all unpaid cycles", () => {
    const november = invoice({ id: "invoice-november", competence: "2026-11-01", cycleStart: "2026-10-21", cycleEnd: "2026-11-20", dueDate: "2026-11-27" });
    const installments = [
      purchase({ id: "1-of-2", title: "Notebook (1/2)", amount: 300 }),
      purchase({ id: "2-of-2", title: "Notebook (2/2)", amount: 300, date: "2026-11-10", creditCardInvoiceId: november.id }),
    ];

    expect(getInvoiceAmount(installments, invoice())).toBe(300);
    expect(getInvoiceAmount(installments, november)).toBe(300);
    expect(getCardCommittedAmount(installments, "card-1", [invoice(), november])).toBe(600);
  });

  it("calculates competence, closing and due dates across months and short months", () => {
    expect(getCreditCardCycle(20, 27, "2026-10-20")).toEqual({
      competence: "2026-10-01",
      cycleStart: "2026-09-21",
      cycleEnd: "2026-10-20",
      dueDate: "2026-10-27",
    });
    expect(getCreditCardCycle(20, 10, "2026-10-21")).toEqual({
      competence: "2026-11-01",
      cycleStart: "2026-10-21",
      cycleEnd: "2026-11-20",
      dueDate: "2026-12-10",
    });
    expect(getCreditCardCycle(31, 5, "2028-02-29").cycleEnd).toBe("2028-02-29");
  });

  it("keeps legacy card data working until it is backfilled", () => {
    const legacyOpen = purchase({ creditCardInvoiceId: undefined, financialKind: undefined, isPaid: false });
    const legacyPaid = purchase({ id: "legacy-paid", creditCardInvoiceId: undefined, financialKind: undefined, isPaid: true });

    expect(getCardCommittedAmount([legacyOpen, legacyPaid], "card-1")).toBe(500);
  });

  it("releases the card limit only when the invoice is paid", () => {
    const closed = invoice({ status: "CLOSED", closedTotal: 500 });
    const paid = invoice({ status: "PAID", closedTotal: 500, paidAt: "2026-10-25T12:00:00Z" });

    expect(getCardCommittedAmount([purchase()], "card-1", [closed])).toBe(500);
    expect(getCardCommittedAmount([purchase()], "card-1", [paid])).toBe(0);
  });

  describe("getInvoicePreviewAmount", () => {
    const baseInvoice = invoice();
    const nextInvoice = invoice({
      id: "invoice-november",
      competence: "2026-11-01",
      cycleStart: "2026-10-21",
      cycleEnd: "2026-11-20",
      dueDate: "2026-11-27",
      status: "OPEN",
    });

    it("returns current amount when actual date equals predicted cycle end", () => {
      const p = purchase({ date: "2026-10-10", amount: 500 });
      const preview = getInvoicePreviewAmount([p], baseInvoice, [baseInvoice, nextInvoice], "2026-10-20");
      expect(preview).toBe(500);
    });

    it("includes eligible movements from next OPEN invoice when actual date is after predicted cycle end", () => {
      const p1 = purchase({ id: "p1", date: "2026-10-10", amount: 500 });
      const p2 = purchase({ id: "p2", date: "2026-10-25", amount: 200, creditCardInvoiceId: nextInvoice.id });
      const p3 = purchase({ id: "p3", date: "2026-10-30", amount: 300, creditCardInvoiceId: nextInvoice.id });
      const preview = getInvoicePreviewAmount([p1, p2, p3], baseInvoice, [baseInvoice, nextInvoice], "2026-10-30");
      expect(preview).toBe(1000);
    });

    it("excludes movements after actual date when actual date is before predicted cycle end", () => {
      const p1 = purchase({ id: "p1", date: "2026-10-10", amount: 500 });
      const p2 = purchase({ id: "p2", date: "2026-10-25", amount: 200 });
      const preview = getInvoicePreviewAmount([p1, p2], baseInvoice, [baseInvoice, nextInvoice], "2026-10-15");
      expect(preview).toBe(500);
    });

    it("excludes movements after actual date from next invoice", () => {
      const p1 = purchase({ id: "p1", date: "2026-10-10", amount: 500 });
      const p2 = purchase({ id: "p2", date: "2026-10-25", amount: 200, creditCardInvoiceId: nextInvoice.id });
      const p3 = purchase({ id: "p3", date: "2026-11-05", amount: 300, creditCardInvoiceId: nextInvoice.id });
      const preview = getInvoicePreviewAmount([p1, p2, p3], baseInvoice, [baseInvoice, nextInvoice], "2026-10-30");
      expect(preview).toBe(700);
    });

    it("excludes CLOSED and PAID invoices from preview", () => {
      const closedInvoice = invoice({ id: "invoice-september", status: "CLOSED", closedTotal: 500, cycleEnd: "2026-09-20" });
      const paidInvoice = invoice({ id: "invoice-august", status: "PAID", closedTotal: 300, cycleEnd: "2026-08-20" });
      const p1 = purchase({ id: "p1", date: "2026-10-10", amount: 500 });
      const p2 = purchase({ id: "p2", date: "2026-09-15", amount: 200, creditCardInvoiceId: closedInvoice.id });
      const p3 = purchase({ id: "p3", date: "2026-08-15", amount: 300, creditCardInvoiceId: paidInvoice.id });
      const preview = getInvoicePreviewAmount([p1, p2, p3], baseInvoice, [baseInvoice, nextInvoice, closedInvoice, paidInvoice], "2026-10-30");
      expect(preview).toBe(500);
    });

    it("reduces total correctly for refunds (income)", () => {
      const p1 = purchase({ id: "p1", date: "2026-10-10", amount: 500 });
      const refund = purchase({ id: "r1", date: "2026-10-15", amount: 100, type: "income", financialKind: "card_refund" });
      const preview = getInvoicePreviewAmount([p1, refund], baseInvoice, [baseInvoice, nextInvoice], "2026-10-20");
      expect(preview).toBe(400);
    });

    it("changing the date does not modify any transaction", () => {
      const p1 = purchase({ id: "p1", date: "2026-10-10", amount: 500 });
      const p2 = purchase({ id: "p2", date: "2026-10-25", amount: 200, creditCardInvoiceId: nextInvoice.id });
      const transactions = [p1, p2];
      const preview1 = getInvoicePreviewAmount(transactions, baseInvoice, [baseInvoice, nextInvoice], "2026-10-20");
      const preview2 = getInvoicePreviewAmount(transactions, baseInvoice, [baseInvoice, nextInvoice], "2026-10-30");
      expect(preview1).toBe(500);
      expect(preview2).toBe(700);
      expect(transactions[0].creditCardInvoiceId).toBe("invoice-october");
      expect(transactions[1].creditCardInvoiceId).toBe("invoice-november");
    });

    it("preview matches the closing rule for postponed closing", () => {
      const p1 = purchase({ id: "p1", date: "2026-10-10", amount: 500 });
      const p2 = purchase({ id: "p2", date: "2026-10-25", amount: 200, creditCardInvoiceId: nextInvoice.id });
      const p3 = purchase({ id: "p3", date: "2026-10-30", amount: 300, creditCardInvoiceId: nextInvoice.id });
      const preview = getInvoicePreviewAmount([p1, p2, p3], baseInvoice, [baseInvoice, nextInvoice], "2026-10-30");
      expect(preview).toBe(1000);
    });
  });
});
