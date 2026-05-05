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
