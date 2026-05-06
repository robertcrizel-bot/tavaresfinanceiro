import { Transaction } from "@/lib/types";

const normalize = (value?: string) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const isBillPaymentTransaction = (transaction: Pick<Transaction, "title" | "category" | "accountId" | "creditCardId">) => {
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

export const isAdjustmentTransaction = (transaction: Pick<Transaction, "title" | "category" | "description">) => {
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
  transaction: Pick<Transaction, "title" | "category" | "description" | "accountId" | "creditCardId">,
) => isBillPaymentTransaction(transaction) || isAdjustmentTransaction(transaction);
