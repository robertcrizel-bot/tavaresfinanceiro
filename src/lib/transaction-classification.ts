import { Transaction } from "@/lib/types";

type ClassifiableTransaction = Pick<Transaction, "title" | "category" | "accountId" | "creditCardId"> &
  Partial<Pick<Transaction, "description" | "financialKind">>;

const normalize = (value?: string) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const isBillPaymentTransaction = (transaction: ClassifiableTransaction) => {
  if (transaction.financialKind === "card_invoice_payment") return true;
  const title = normalize(transaction.title);
  const category = normalize(transaction.category);

  return (
    category === "pagamento fatura" ||
    category === "pagamento de fatura" ||
    title.includes("pagamento de fatura") ||
    title.includes("pagar fatura") ||
    Boolean(transaction.accountId && transaction.creditCardId)
  );
};

export const isAdjustmentTransaction = (transaction: ClassifiableTransaction) => {
  if (transaction.financialKind === "manual_adjustment") return true;
  const title = normalize(transaction.title);
  const category = normalize(transaction.category);
  const description = normalize(transaction.description);

  return (
    category === "ajuste" ||
    title.includes("ajuste de saldo") ||
    title.includes("ajuste de fatura") ||
    description.includes("ajuste manual")
  );
};

export const isFinancialNeutralTransaction = (
  transaction: ClassifiableTransaction,
) => transaction.financialKind === "card_invoice_obligation" ||
  isBillPaymentTransaction(transaction) ||
  isAdjustmentTransaction(transaction);

export const isCardInvoiceObligation = (transaction: Pick<Transaction, "financialKind">) =>
  transaction.financialKind === "card_invoice_obligation";

export const isSystemInvoiceTransaction = (transaction: Pick<Transaction, "financialKind">) =>
  transaction.financialKind === "card_invoice_obligation" ||
  transaction.financialKind === "card_invoice_payment";
