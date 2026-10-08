import type { CreditCard, CreditCardInvoice, Transaction } from "@/lib/types";

export const getInvoiceRecordTitle = (
  transaction: Transaction,
  invoices: CreditCardInvoice[],
  creditCards: CreditCard[],
) => {
  if (transaction.financialKind !== "card_invoice_obligation" && transaction.financialKind !== "card_invoice_payment") {
    return transaction.title;
  }

  const invoice = invoices.find((candidate) => candidate.id === transaction.creditCardInvoiceId);
  const card = creditCards.find((candidate) => candidate.id === (invoice?.creditCardId || transaction.creditCardId));
  if (!invoice || !card) return transaction.title;

  const [year, month] = invoice.competence.split("-");
  if (!year || !month) return transaction.title;
  return `${card.name} - ${month}/${year}`;
};

export const getInvoiceRecordTypeLabel = (transaction: Transaction) => {
  if (transaction.financialKind === "card_invoice_payment") return "Pagamento";
  if (transaction.financialKind === "card_invoice_obligation") {
    return `Fatura · ${transaction.isPaid ? "Paga" : "A pagar"}`;
  }
  return undefined;
};

export const shouldHideSettledInvoiceObligation = (
  transaction: Transaction,
  transactions: Transaction[],
  invoices: CreditCardInvoice[],
) => {
  if (transaction.financialKind !== "card_invoice_obligation" || !transaction.isPaid || !transaction.creditCardInvoiceId) {
    return false;
  }

  const invoice = invoices.find((candidate) => candidate.id === transaction.creditCardInvoiceId);
  if (!invoice?.paymentTransactionId || invoice.obligationTransactionId !== transaction.id) return false;

  return transactions.some((candidate) =>
    candidate.id === invoice.paymentTransactionId &&
    candidate.financialKind === "card_invoice_payment" &&
    candidate.creditCardInvoiceId === invoice.id &&
    candidate.creditCardId === invoice.creditCardId
  );
};
