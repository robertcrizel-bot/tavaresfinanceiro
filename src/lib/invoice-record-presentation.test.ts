import { describe, expect, it } from "vitest";
import { calculateAccountBalances, calculateFinancialTotals } from "@/lib/financial-calculations";
import { getInvoiceRecordTitle, getInvoiceRecordTypeLabel, shouldHideSettledInvoiceObligation } from "@/lib/invoice-record-presentation";
import type { CreditCard, CreditCardInvoice, Transaction } from "@/lib/types";

const card: CreditCard = {
  id: "card-1",
  name: "Caixa Master Camila",
  bank: "Caixa",
  limit: 5000,
  closingDay: 25,
  dueDay: 7,
  color: "blue",
};

const invoice = (overrides: Partial<CreditCardInvoice> = {}): CreditCardInvoice => ({
  id: "invoice-september",
  creditCardId: card.id,
  competence: "2026-09-01",
  cycleStart: "2026-08-26",
  cycleEnd: "2026-09-25",
  dueDate: "2026-10-07",
  status: "PAID",
  closedTotal: 1174.33,
  obligationTransactionId: "obligation-1",
  paymentTransactionId: "payment-1",
  ...overrides,
});

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "obligation-1",
  title: "Fatura Cartão Caixa Master Camila - 09/2026",
  amount: 1174.33,
  type: "expense",
  category: "Fatura Cartão",
  date: "2026-10-07",
  creditCardId: card.id,
  creditCardInvoiceId: "invoice-september",
  financialKind: "card_invoice_obligation",
  isPaid: true,
  ...overrides,
});

describe("invoice record presentation", () => {
  it("shows only the payment when the paid obligation has its corresponding payment", () => {
    const obligation = transaction();
    const payment = transaction({
      id: "payment-1",
      title: "Pagamento de Fatura - Caixa Master Camila",
      date: "2026-10-08",
      accountId: "account-1",
      financialKind: "card_invoice_payment",
    });
    const transactions = [obligation, payment];

    const visible = transactions.filter((item) => !shouldHideSettledInvoiceObligation(item, transactions, [invoice()]));

    expect(visible.map((item) => item.id)).toEqual(["payment-1"]);
    expect(payment.date).toBe("2026-10-08");
  });

  it("keeps an unpaid CLOSED obligation visible", () => {
    const obligation = transaction({ isPaid: false });
    const closedInvoice = invoice({ status: "CLOSED", paymentTransactionId: undefined });

    expect(shouldHideSettledInvoiceObligation(obligation, [obligation], [closedInvoice])).toBe(false);
    expect(getInvoiceRecordTypeLabel(obligation)).toBe("Fatura · A pagar");
  });

  it("shows the obligation again after payment reversal", () => {
    const restoredObligation = transaction({ isPaid: false });
    const reversedInvoice = invoice({ status: "CLOSED", paymentTransactionId: undefined });

    expect(shouldHideSettledInvoiceObligation(restoredObligation, [restoredObligation], [reversedInvoice])).toBe(false);
  });

  it("derives friendly labels for old persisted titles without changing data", () => {
    const oldPayment = transaction({
      id: "payment-1",
      title: "Pagamento de Fatura - Caixa Master Camila",
      accountId: "account-1",
      financialKind: "card_invoice_payment",
    });

    expect(getInvoiceRecordTitle(oldPayment, [invoice()], [card])).toBe("Fatura Caixa Master Camila - 09/2026");
    expect(getInvoiceRecordTypeLabel(oldPayment)).toBe("Pagamento");
    expect(oldPayment.title).toBe("Pagamento de Fatura - Caixa Master Camila");
  });

  it("does not change balances or financial totals when applying the visual filter", () => {
    const obligation = transaction();
    const payment = transaction({
      id: "payment-1",
      accountId: "account-1",
      financialKind: "card_invoice_payment",
    });
    const transactions = [obligation, payment];
    const visible = transactions.filter((item) => !shouldHideSettledInvoiceObligation(item, transactions, [invoice()]));

    const completeBalance = calculateAccountBalances([{ id: "account-1", initialBalance: 2000 }], transactions, [])["account-1"];
    const visibleBalance = calculateAccountBalances([{ id: "account-1", initialBalance: 2000 }], visible, [])["account-1"];
    expect(completeBalance).toBeCloseTo(825.67, 2);
    expect(visibleBalance).toBeCloseTo(completeBalance, 2);
    expect(calculateFinancialTotals(transactions)).toEqual(calculateFinancialTotals(visible));
  });
});
