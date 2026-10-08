import { isBillPaymentTransaction } from "@/lib/transaction-classification";
import type { Transaction } from "@/lib/types";

type CardTransaction = Pick<
  Transaction,
  "accountId" | "amount" | "category" | "creditCardId" | "date" | "isPaid" | "title" | "type"
>;

const currentDate = () => new Date().toISOString().split("T")[0];

const isOpenCardTransaction = (transaction: CardTransaction, creditCardId: string) =>
  transaction.creditCardId === creditCardId &&
  !transaction.isPaid &&
  !isBillPaymentTransaction(transaction);

const signedAmount = (transaction: CardTransaction) =>
  transaction.type === "income" ? -transaction.amount : transaction.amount;

export const getCardCommittedAmount = (transactions: CardTransaction[], creditCardId: string) =>
  transactions.reduce(
    (total, transaction) => total + (isOpenCardTransaction(transaction, creditCardId) ? signedAmount(transaction) : 0),
    0,
  );

export const getCardInvoiceEndDate = (referenceDate = currentDate()) => {
  const [year, month] = referenceDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

export const getCardCurrentInvoiceAmount = (
  transactions: CardTransaction[],
  creditCardId: string,
  referenceDate = currentDate(),
) => {
  const invoiceEndDate = getCardInvoiceEndDate(referenceDate);
  return transactions.reduce(
    (total, transaction) => total + (
      isOpenCardTransaction(transaction, creditCardId) && transaction.date <= invoiceEndDate
        ? signedAmount(transaction)
        : 0
    ),
    0,
  );
};
