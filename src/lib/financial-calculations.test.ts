import { describe, expect, it } from "vitest";
import {
  calculateAccountBalances,
  calculateCategoryBudgetUsage,
  calculateCurrentMonthCategorySpending,
  calculateFinancialTotals,
  getTransferValidationError,
  type TransferBalanceEntry,
} from "@/lib/financial-calculations";
import type { Account, Transaction } from "@/lib/types";

const accounts: Account[] = [
  { id: "A", name: "A", bank: "Banco", type: "checking", initialBalance: 1000, color: "blue" },
  { id: "B", name: "B", bank: "Banco", type: "checking", initialBalance: 500, color: "green" },
  { id: "C", name: "C", bank: "Banco", type: "checking", initialBalance: 700, color: "orange" },
  { id: "D", name: "D", bank: "Banco", type: "checking", initialBalance: 300, color: "purple" },
];

const transfer = (fromAccountId: string, toAccountId: string, amount: number): TransferBalanceEntry => ({
  fromAccountId,
  toAccountId,
  amount,
});

const balancesFor = (transfers: TransferBalanceEntry[]) => calculateAccountBalances(accounts, [], transfers);
const totalBalance = (balances: Record<string, number>) => Object.values(balances).reduce((sum, value) => sum + value, 0);

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "transaction",
  title: "Compra",
  amount: 100,
  type: "expense",
  category: "Alimentação",
  date: "2026-09-10",
  ...overrides,
});

describe("transfer balance calculations", () => {
  it("debits the source and credits the destination on creation", () => {
    expect(balancesFor([transfer("A", "B", 200)])).toMatchObject({ A: 800, B: 700 });
  });

  it("replaces the original effect when editing the amount", () => {
    const updated = balancesFor([transfer("A", "B", 300)]);

    expect(updated).toMatchObject({ A: 700, B: 800 });
  });

  it("restores the old source when changing only the source", () => {
    expect(balancesFor([transfer("C", "B", 200)])).toMatchObject({ A: 1000, B: 700, C: 500 });
  });

  it("removes the old credit when changing only the destination", () => {
    expect(balancesFor([transfer("A", "C", 200)])).toMatchObject({ A: 800, B: 500, C: 900 });
  });

  it("replaces source, destination and amount together", () => {
    expect(balancesFor([transfer("C", "D", 350)])).toMatchObject({ A: 1000, B: 500, C: 350, D: 650 });
  });

  it("restores all balances after deletion", () => {
    expect(balancesFor([])).toEqual({ A: 1000, B: 500, C: 700, D: 300 });
  });

  it.each([
    transfer("A", "B", 200),
    transfer("A", "B", 300),
    transfer("C", "B", 200),
    transfer("A", "C", 200),
    transfer("C", "D", 350),
  ])("keeps the total balance unchanged for $fromAccountId -> $toAccountId", (item) => {
    expect(totalBalance(balancesFor([item]))).toBe(2500);
  });

  it("does not count transfers as income or expense", () => {
    const transactions: Transaction[] = [
      { id: "income", title: "Salário", amount: 100, type: "income", category: "Salário", date: "2026-09-01" },
      { id: "expense", title: "Mercado", amount: 40, type: "expense", category: "Alimentação", date: "2026-09-02" },
    ];

    const totalsBefore = calculateFinancialTotals(transactions);
    calculateAccountBalances(accounts, transactions, [transfer("A", "B", 200)]);

    expect(calculateFinancialTotals(transactions)).toEqual(totalsBefore);
    expect(totalsBefore).toEqual({ income: 100, expense: 40 });
  });

  it("blocks and neutralizes a transfer to the same account", () => {
    const invalidTransfer = transfer("A", "A", 200);

    expect(getTransferValidationError(invalidTransfer)).toBe("As contas de origem e destino devem ser diferentes.");
    expect(balancesFor([invalidTransfer])).toEqual({ A: 1000, B: 500, C: 700, D: 300 });
  });

  it("ignores an orphan transfer instead of applying a one-sided effect", () => {
    expect(balancesFor([transfer("A", "missing", 200)])).toEqual({ A: 1000, B: 500, C: 700, D: 300 });
  });
});

describe("current month category spending", () => {
  const referenceDate = new Date(2026, 8, 14);

  it("counts a regular expense in the current civil month", () => {
    expect(calculateCurrentMonthCategorySpending([transaction()], referenceDate)).toEqual({ Alimentação: 100 });
  });

  it("counts a credit card purchase", () => {
    const spending = calculateCurrentMonthCategorySpending([
      transaction({ amount: 250, creditCardId: "card-1" }),
    ], referenceDate);

    expect(spending.Alimentação).toBe(250);
  });

  it("does not count a card bill payment", () => {
    const spending = calculateCurrentMonthCategorySpending([
      transaction({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura" as Transaction["category"],
        accountId: "account-1",
        creditCardId: "card-1",
      }),
    ], referenceDate);

    expect(spending).toEqual({});
  });

  it("does not count financially neutral adjustments", () => {
    const spending = calculateCurrentMonthCategorySpending([
      transaction({ title: "Ajuste de saldo", category: "Outros", description: "Ajuste manual" }),
    ], referenceDate);

    expect(spending).toEqual({});
  });

  it("does not receive separate transfers and keeps normal transfer-method expenses", () => {
    const separateTransfers = [transfer("A", "B", 500)];
    const spending = calculateCurrentMonthCategorySpending([
      transaction({ paymentMethod: "Transferência" }),
    ], referenceDate);

    expect(separateTransfers).toHaveLength(1);
    expect(spending.Alimentação).toBe(100);
  });

  it("counts only the installment dated in the current month", () => {
    const spending = calculateCurrentMonthCategorySpending([
      transaction({ id: "installment-current", amount: 80, date: "2026-09-20", creditCardId: "card-1" }),
      transaction({ id: "installment-future", amount: 80, date: "2026-10-20", creditCardId: "card-1" }),
    ], referenceDate);

    expect(spending.Alimentação).toBe(80);
  });

  it("ignores income and expenses outside the current month", () => {
    const spending = calculateCurrentMonthCategorySpending([
      transaction({ type: "income", amount: 500 }),
      transaction({ date: "2026-08-31", amount: 40 }),
      transaction({ date: "2026-10-01", amount: 60 }),
    ], referenceDate);

    expect(spending).toEqual({});
  });
});

describe("category budget usage", () => {
  it("calculates percentage and available amount", () => {
    expect(calculateCategoryBudgetUsage(740, 1000)).toEqual({
      percentage: 74,
      available: 260,
      exceeded: 0,
    });
  });

  it("calculates the exceeded amount", () => {
    expect(calculateCategoryBudgetUsage(1150, 1000)).toEqual({
      percentage: 115,
      available: 0,
      exceeded: 150,
    });
  });
});
