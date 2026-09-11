import { isFinancialNeutralTransaction } from "@/lib/transaction-classification";
import type { Account, Transaction } from "@/lib/types";

export interface TransferBalanceEntry {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
}

export const getTransferValidationError = (transfer: TransferBalanceEntry) => {
  if (!transfer.fromAccountId || !transfer.toAccountId) return "Selecione as contas de origem e destino.";
  if (transfer.fromAccountId === transfer.toAccountId) return "As contas de origem e destino devem ser diferentes.";
  if (!Number.isFinite(transfer.amount) || transfer.amount <= 0) return "Informe um valor maior que zero.";
  return null;
};

export const calculateAccountBalances = (
  accounts: Pick<Account, "id" | "initialBalance">[],
  transactions: Transaction[],
  transfers: TransferBalanceEntry[],
) => {
  const balances = Object.fromEntries(accounts.map((account) => [account.id, account.initialBalance]));

  transactions.forEach((transaction) => {
    if (!transaction.accountId || balances[transaction.accountId] == null) return;
    balances[transaction.accountId] += transaction.type === "income" ? transaction.amount : -transaction.amount;
  });

  transfers.forEach((transfer) => {
    if (getTransferValidationError(transfer)) return;
    if (balances[transfer.fromAccountId] == null || balances[transfer.toAccountId] == null) return;
    balances[transfer.fromAccountId] -= transfer.amount;
    balances[transfer.toAccountId] += transfer.amount;
  });

  return balances;
};

export const calculateFinancialTotals = (transactions: Transaction[]) => transactions.reduce(
  (totals, transaction) => {
    if (isFinancialNeutralTransaction(transaction)) return totals;
    if (transaction.type === "income") totals.income += transaction.amount;
    else totals.expense += transaction.amount;
    return totals;
  },
  { income: 0, expense: 0 },
);
