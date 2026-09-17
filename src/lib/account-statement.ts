import { isAdjustmentTransaction } from "@/lib/transaction-classification";

export interface StatementTransaction {
  id: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  accountId?: string;
  creditCardId?: string;
  createdAt?: string;
}

export interface StatementTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description?: string;
  createdAt: string;
}

export interface StatementAccount {
  id: string;
  name: string;
  initialBalance: number;
}

export interface AccountStatementEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: "in" | "out";
  sourceType: "transaction" | "transfer";
  sourceId: string;
  category?: string;
  linkedAccountName?: string;
  installmentInfo?: string;
  createdAt?: string;
  balanceAfter?: number;
}

export interface AccountStatement {
  entries: AccountStatementEntry[];
  summary: {
    totalIn: number;
    totalOut: number;
    netMovement: number;
  };
}

const belongsToMonth = (dateStr: string, referenceMonth: string): boolean =>
  dateStr.slice(0, 7) === referenceMonth;

const isCardOnly = (tx: Pick<StatementTransaction, "accountId" | "creditCardId">): boolean =>
  Boolean(tx.creditCardId && !tx.accountId);

const formatInstallment = (tx: StatementTransaction): string | undefined => {
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

const sortByDateAsc = (a: { date: string; createdAt?: string; id: string }, b: { date: string; createdAt?: string; id: string }): number => {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
  if (a.createdAt) return -1;
  if (b.createdAt) return 1;
  return a.id.localeCompare(b.id);
};

type MovementForBalance = {
  date: string;
  createdAt?: string;
  id: string;
  signedAmount: number;
  isAdjustment: boolean;
};

export const buildAccountStatement = ({
  accountId,
  transactions,
  transfers,
  accounts,
  referenceMonth,
}: {
  accountId: string;
  transactions: StatementTransaction[];
  transfers: StatementTransfer[];
  accounts: StatementAccount[];
  referenceMonth: string;
}): AccountStatement => {
  const account = accounts.find((a) => a.id === accountId);
  const accountNameMap = new Map(accounts.map((a) => [a.id, a.name]));

  const collectAllMovements = (): MovementForBalance[] => {
    const movements: MovementForBalance[] = [];

    for (const tx of transactions) {
      if (tx.accountId !== accountId) continue;
      if (isCardOnly(tx)) continue;

      const signedAmount = tx.type === "income" ? tx.amount : -tx.amount;
      movements.push({
        date: tx.date,
        createdAt: tx.createdAt,
        id: tx.id,
        signedAmount,
        isAdjustment: isAdjustmentTransaction(tx),
      });
    }

    for (const tr of transfers) {
      if (tr.fromAccountId !== accountId && tr.toAccountId !== accountId) continue;

      const isSender = tr.fromAccountId === accountId;
      movements.push({
        date: tr.date,
        createdAt: tr.createdAt,
        id: tr.id,
        signedAmount: isSender ? -tr.amount : tr.amount,
        isAdjustment: false,
      });
    }

    movements.sort(sortByDateAsc);
    return movements;
  };

  const allMovements = collectAllMovements();
  const balanceAfterByMovementId = new Map<string, number>();

  if (account) {
    let runningBalance = account.initialBalance;
    for (const movement of allMovements) {
      runningBalance += movement.signedAmount;
      balanceAfterByMovementId.set(movement.id, runningBalance);
    }
  }

  const entries: AccountStatementEntry[] = [];

  for (const tx of transactions) {
    if (tx.accountId !== accountId) continue;
    if (!belongsToMonth(tx.date, referenceMonth)) continue;
    if (isAdjustmentTransaction(tx)) continue;
    if (isCardOnly(tx)) continue;

    entries.push({
      id: tx.id,
      date: tx.date,
      description: tx.title,
      amount: Math.abs(tx.amount),
      direction: tx.type === "income" ? "in" : "out",
      sourceType: "transaction",
      sourceId: tx.id,
      category: tx.category,
      installmentInfo: formatInstallment(tx),
      createdAt: tx.createdAt,
      balanceAfter: balanceAfterByMovementId.get(tx.id),
    });
  }

  for (const tr of transfers) {
    const isSender = tr.fromAccountId === accountId;
    const isReceiver = tr.toAccountId === accountId;
    if (!isSender && !isReceiver) continue;
    if (!belongsToMonth(tr.date, referenceMonth)) continue;

    const linkedId = isSender ? tr.toAccountId : tr.fromAccountId;
    const linkedName = accountNameMap.get(linkedId);
    const direction = isSender ? "out" : "in";
    const prefix = isSender ? "Transferência para" : "Transferência de";

    entries.push({
      id: tr.id,
      date: tr.date,
      description: linkedName ? `${prefix} ${linkedName}` : tr.description || prefix,
      amount: Math.abs(tr.amount),
      direction,
      sourceType: "transfer",
      sourceId: tr.id,
      linkedAccountName: linkedName,
      createdAt: tr.createdAt,
      balanceAfter: balanceAfterByMovementId.get(tr.id),
    });
  }

  entries.sort(sortByDateDesc);

  let totalIn = 0;
  let totalOut = 0;
  for (const entry of entries) {
    if (entry.direction === "in") totalIn += entry.amount;
    else totalOut += entry.amount;
  }

  return {
    entries,
    summary: {
      totalIn,
      totalOut,
      netMovement: totalIn - totalOut,
    },
  };
};
