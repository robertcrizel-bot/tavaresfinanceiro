import { isFinancialNeutralTransaction } from "@/lib/transaction-classification";
import { isRecurringBillActiveInMonth, resolveRecurringBill, type EditableRecurringBill } from "@/lib/recurring-bill-editing";
import { getPaymentForCompetence } from "@/lib/forecast-status";
import type { Account, Transaction } from "@/lib/types";
import type { UserCategory } from "@/contexts/CategoryContext";

export interface TransferBalanceEntry {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
}

type CategorySpendTransaction = Pick<
  Transaction,
  "amount" | "type" | "category" | "date" | "title" | "description" | "accountId" | "creditCardId"
>;

export interface CategoryBudgetUsage {
  percentage: number;
  available: number;
  exceeded: number;
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

export const calculateCurrentMonthCategorySpending = (
  transactions: CategorySpendTransaction[],
  referenceDate = new Date(),
) => {
  const monthKey = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`;

  return transactions.reduce<Record<string, number>>((spending, transaction) => {
    if (transaction.type !== "expense") return spending;
    if (transaction.date.slice(0, 7) !== monthKey) return spending;
    if (isFinancialNeutralTransaction(transaction)) return spending;
    spending[transaction.category] = (spending[transaction.category] || 0) + transaction.amount;
    return spending;
  }, {});
};

export const calculateCategoryBudgetUsage = (spent: number, budget: number): CategoryBudgetUsage => ({
  percentage: budget > 0 ? (spent * 100) / budget : 0,
  available: Math.max(budget - spent, 0),
  exceeded: Math.max(spent - budget, 0),
});

interface CompetencePayment {
  recurringBillId: string;
  referenceMonth: string;
}

export interface CategoryBudgetProjection {
  realized: number;
  committed: number;
  projected: number;
  budget: number;
  percentage: number;
  available: number;
  exceeded: number;
}

export const calculateMonthlyCategoryBudgetProjection = ({
  transactions,
  bills,
  payments,
  categories,
  referenceMonth,
  category,
}: {
  transactions: CategorySpendTransaction[];
  bills: EditableRecurringBill[];
  payments: CompetencePayment[];
  categories: UserCategory[];
  referenceMonth: string;
  category: string;
}): CategoryBudgetProjection | null => {
  const categoryObj = categories.find((c) => c.name === category);
  if (!categoryObj || categoryObj.monthlyBudget == null) return null;

  const spendingMonth = new Date(referenceMonth + "-15T00:00:00");
  const monthlySpending = calculateCurrentMonthCategorySpending(transactions, spendingMonth);
  const realized = monthlySpending[category] || 0;

  const committed = bills
    .filter((bill) => {
      if (!isRecurringBillActiveInMonth(bill, referenceMonth)) return false;
      const resolved = resolveRecurringBill(bill, referenceMonth);
      if (resolved.type !== "expense") return false;
      if (resolved.category !== category) return false;
      if (getPaymentForCompetence(payments, bill.id, referenceMonth)) return false;
      return true;
    })
    .reduce((sum, bill) => {
      const resolved = resolveRecurringBill(bill, referenceMonth);
      return sum + resolved.amount;
    }, 0);

  const projected = realized + committed;
  const budget = categoryObj.monthlyBudget;
  const usage = calculateCategoryBudgetUsage(projected, budget);

  return {
    realized,
    committed,
    projected,
    budget,
    ...usage,
  };
};

export const simulateForecastBudgetProjection = ({
  persistedProjection,
  editingBillResolved,
  isBillCommitted,
  isBillPaid,
  newAmount,
  newType,
  newCategory,
  categories,
}: {
  persistedProjection: CategoryBudgetProjection | null;
  editingBillResolved: EditableRecurringBill | null;
  isBillCommitted: boolean;
  isBillPaid: boolean;
  newAmount: number;
  newType: "expense" | "income";
  newCategory: string;
  categories: UserCategory[];
}): CategoryBudgetProjection | null => {
  if (isBillPaid) return persistedProjection;

  if (newType !== "expense") return null;

  const categoryObj = categories.find((c) => c.name === newCategory);
  if (!categoryObj || categoryObj.monthlyBudget == null) return null;

  const safeNewAmount = Number.isFinite(newAmount) && newAmount > 0 ? newAmount : 0;

  const base = persistedProjection ?? {
    realized: 0,
    committed: 0,
    projected: 0,
    budget: categoryObj.monthlyBudget,
    percentage: 0,
    available: categoryObj.monthlyBudget,
    exceeded: 0,
  };

  const subtract = (editingBillResolved && isBillCommitted && editingBillResolved.category === newCategory)
    ? editingBillResolved.amount
    : 0;

  const committed = Math.max(base.committed - subtract + safeNewAmount, 0);
  const projected = base.realized + committed;
  const budget = categoryObj.monthlyBudget;
  const usage = calculateCategoryBudgetUsage(projected, budget);

  return {
    realized: base.realized,
    committed,
    projected,
    budget,
    ...usage,
  };
};
