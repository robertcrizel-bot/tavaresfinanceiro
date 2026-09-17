import { isAdjustmentTransaction, isBillPaymentTransaction } from "@/lib/transaction-classification";

export interface CardStatementTransaction {
  id: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  accountId?: string;
  creditCardId?: string;
  isPaid?: boolean;
  createdAt?: string;
}

export interface CreditCardStatementEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: "charge" | "credit" | "neutral";
  sourceType: "purchase" | "payment" | "reversal" | "partial_record";
  sourceId: string;
  category?: string;
  isPaid: boolean;
  installmentInfo?: string;
  createdAt?: string;
}

export interface CreditCardStatement {
  entries: CreditCardStatementEntry[];
  summary: {
    totalPurchases: number;
    totalCredits: number;
    totalPayments: number;
  };
}

const belongsToMonth = (dateStr: string, referenceMonth: string): boolean =>
  dateStr.slice(0, 7) === referenceMonth;

const formatInstallment = (tx: CardStatementTransaction): string | undefined => {
  const match = tx.title.match(/\((\d+)\/(\d+)\)/);
  return match ? `${match[1]}/${match[2]}` : undefined;
};

const sortByDateDesc = (a: { date: string; createdAt?: string; id: string }, b: { date: string; createdAt?: string; id: string }): number => {
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt);
  if (a.createdAt) return -1;
  if (b.createdAt) return 1;
  return a.id.localeCompare(b.id);
};

const normalize = (value?: string) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const isPartialRecord = (tx: Pick<CardStatementTransaction, "title" | "category" | "isPaid">): boolean => {
  const title = normalize(tx.title);
  const category = normalize(tx.category);
  return (
    title.includes("parcial fatura") &&
    category === "fatura cartao" &&
    tx.isPaid === true
  );
};

export const buildCreditCardStatement = ({
  creditCardId,
  transactions,
  referenceMonth,
}: {
  creditCardId: string;
  transactions: CardStatementTransaction[];
  referenceMonth: string;
}): CreditCardStatement => {
  const entries: CreditCardStatementEntry[] = [];

  for (const tx of transactions) {
    if (tx.creditCardId !== creditCardId) continue;
    if (!belongsToMonth(tx.date, referenceMonth)) continue;
    if (isAdjustmentTransaction(tx)) continue;

    if (isBillPaymentTransaction(tx)) {
      entries.push({
        id: tx.id,
        date: tx.date,
        description: tx.title,
        amount: Math.abs(tx.amount),
        direction: "credit",
        sourceType: "payment",
        sourceId: tx.id,
        category: tx.category,
        isPaid: tx.isPaid ?? true,
        createdAt: tx.createdAt,
      });
      continue;
    }

    if (tx.type === "income") {
      entries.push({
        id: tx.id,
        date: tx.date,
        description: tx.title,
        amount: Math.abs(tx.amount),
        direction: "credit",
        sourceType: "reversal",
        sourceId: tx.id,
        category: tx.category,
        isPaid: tx.isPaid ?? false,
        createdAt: tx.createdAt,
      });
      continue;
    }

    if (tx.type === "expense") {
      if (isPartialRecord(tx)) {
        entries.push({
          id: tx.id,
          date: tx.date,
          description: tx.title,
          amount: Math.abs(tx.amount),
          direction: "neutral",
          sourceType: "partial_record",
          sourceId: tx.id,
          category: tx.category,
          isPaid: true,
          createdAt: tx.createdAt,
        });
        continue;
      }

      entries.push({
        id: tx.id,
        date: tx.date,
        description: tx.title,
        amount: Math.abs(tx.amount),
        direction: "charge",
        sourceType: "purchase",
        sourceId: tx.id,
        category: tx.category,
        isPaid: tx.isPaid ?? false,
        installmentInfo: formatInstallment(tx),
        createdAt: tx.createdAt,
      });
    }
  }

  entries.sort(sortByDateDesc);

  let totalPurchases = 0;
  let totalCredits = 0;
  let totalPayments = 0;
  for (const entry of entries) {
    if (entry.sourceType === "purchase") totalPurchases += entry.amount;
    else if (entry.sourceType === "reversal") totalCredits += entry.amount;
    else if (entry.sourceType === "payment") totalPayments += entry.amount;
  }

  return {
    entries,
    summary: {
      totalPurchases,
      totalCredits,
      totalPayments,
    },
  };
};
