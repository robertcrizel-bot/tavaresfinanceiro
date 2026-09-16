import { describe, expect, it } from "vitest";
import {
  calculateAccountBalances,
  calculateCategoryBudgetUsage,
  calculateCurrentMonthCategorySpending,
  calculateFinancialTotals,
  calculateMonthlyCategoryBudgetProjection,
  getTransferValidationError,
  simulateForecastBudgetProjection,
  type TransferBalanceEntry,
} from "@/lib/financial-calculations";
import type { Account, Transaction } from "@/lib/types";
import type { EditableRecurringBill } from "@/lib/recurring-bill-editing";
import type { UserCategory } from "@/contexts/CategoryContext";

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

describe("monthly category budget projection", () => {
  const categories: UserCategory[] = [
    { id: "1", name: "Alimentação", type: "expense", monthlyBudget: 1000 },
    { id: "2", name: "Transporte", type: "expense", monthlyBudget: 500 },
    { id: "3", name: "Lazer", type: "expense", monthlyBudget: null },
    { id: "4", name: "Salário", type: "income", monthlyBudget: null },
  ];

  const baseBill = (overrides: Partial<EditableRecurringBill> = {}): EditableRecurringBill => ({
    id: "bill-1",
    name: "Supermercado",
    amount: 200,
    category: "Alimentação",
    dueDay: 10,
    durationMonths: null,
    accountId: null,
    description: null,
    type: "expense",
    startDate: "2026-01-01",
    scopedEdits: { months: {}, future: [], deletedMonths: {}, deletedFrom: null },
    ...overrides,
  });

  const payment = (recurringBillId: string, referenceMonth: string) => ({
    recurringBillId,
    referenceMonth,
  });

  const projection = (
    txs: Partial<Transaction>[],
    bills: EditableRecurringBill[] = [],
    pays: { recurringBillId: string; referenceMonth: string }[] = [],
    category = "Alimentação",
    refMonth = "2026-09",
  ) => calculateMonthlyCategoryBudgetProjection({
    transactions: txs.map((t) => ({
      id: "tx",
      title: "Compra",
      amount: 100,
      type: "expense" as const,
      category: "Alimentação",
      date: "2026-09-10",
      ...t,
    })),
    bills,
    payments: pays,
    categories,
    referenceMonth: refMonth,
    category,
  });

  it("returns realized from real transactions", () => {
    const result = projection([
      { amount: 250, date: "2026-09-10" },
      { amount: 180, date: "2026-09-05" },
    ]);

    expect(result).not.toBeNull();
    expect(result!.realized).toBe(430);
    expect(result!.committed).toBe(0);
    expect(result!.projected).toBe(430);
  });

  it("includes pending forecast in committed", () => {
    const bill = baseBill({ amount: 200 });
    const result = projection([], [bill], []);

    expect(result!.realized).toBe(0);
    expect(result!.committed).toBe(200);
    expect(result!.projected).toBe(200);
  });

  it("calculates projected = realized + committed", () => {
    const bill = baseBill({ amount: 150 });
    const result = projection([{ amount: 300 }], [bill], []);

    expect(result!.projected).toBe(450);
    expect(result!.realized).toBe(300);
    expect(result!.committed).toBe(150);
  });

  it("excludes paid forecast from committed", () => {
    const bill = baseBill({ id: "bill-1", amount: 200 });
    const result = projection([], [bill], [payment("bill-1", "2026-09")]);

    expect(result!.committed).toBe(0);
  });

  it("counts transaction created by payment in realized without double counting", () => {
    const bill = baseBill({ id: "bill-1", amount: 200 });
    const result = projection(
      [{ amount: 200, title: "Pagamento de Supermercado" }],
      [bill],
      [payment("bill-1", "2026-09")],
    );

    expect(result!.realized).toBe(200);
    expect(result!.committed).toBe(0);
    expect(result!.projected).toBe(200);
  });

  it("excludes income forecast from committed", () => {
    const incomeBill = baseBill({
      id: "bill-income",
      name: "Salário",
      type: "income",
      category: "Salário",
      amount: 5000,
    });
    const result = projection([], [incomeBill], [], "Salário");

    expect(result).toBeNull();
  });

  it("excludes forecast of different category from committed", () => {
    const transportBill = baseBill({
      id: "bill-transport",
      name: "Uber",
      category: "Transporte",
      amount: 100,
    });
    const result = projection([], [transportBill], [], "Alimentação");

    expect(result!.committed).toBe(0);
  });

  it("excludes inactive forecast from committed", () => {
    const bill = baseBill({
      startDate: "2026-10-01",
      amount: 200,
    });
    const result = projection([], [bill], [], "Alimentação", "2026-09");

    expect(result!.committed).toBe(0);
  });

  it("uses resolved values from scoped month edit", () => {
    const bill = baseBill({
      amount: 200,
      category: "Alimentação",
      scopedEdits: {
        months: { "2026-09": { name: "Supermercado", amount: 350, category: "Alimentação", dueDay: 10, accountId: null, description: null, type: "expense" } },
        future: [],
        deletedMonths: {},
        deletedFrom: null,
      },
    });
    const result = projection([], [bill], []);

    expect(result!.committed).toBe(350);
  });

  it("uses resolved values from future scoped edit", () => {
    const bill = baseBill({
      amount: 200,
      scopedEdits: {
        months: {},
        future: [{ from: "2026-09", values: { name: "Supermercado", amount: 300, category: "Alimentação", dueDay: 10, durationMonths: null, accountId: null, description: null, type: "expense" } }],
        deletedMonths: {},
        deletedFrom: null,
      },
    });
    const result = projection([], [bill], []);

    expect(result!.committed).toBe(300);
  });

  it("excludes forecast deleted for the month", () => {
    const bill = baseBill({
      amount: 200,
      scopedEdits: {
        months: {},
        future: [],
        deletedMonths: { "2026-09": true },
        deletedFrom: null,
      },
    });
    const result = projection([], [bill], []);

    expect(result!.committed).toBe(0);
  });

  it("excludes forecast whose recurrence ended", () => {
    const bill = baseBill({
      startDate: "2026-01-01",
      durationMonths: 6,
      amount: 200,
    });
    const result = projection([], [bill], [], "Alimentação", "2026-09");

    expect(result!.committed).toBe(0);
  });

  it("returns null for category without monthlyBudget", () => {
    const result = projection([], [], [], "Lazer");

    expect(result).toBeNull();
  });

  it("calculates correct available amount", () => {
    const bill = baseBill({ amount: 300 });
    const result = projection([{ amount: 400 }], [bill], []);

    // realized 400 + committed 300 = projected 700, budget 1000
    expect(result!.available).toBe(300);
  });

  it("calculates exceeded amount and percentage can exceed 100%", () => {
    const bill = baseBill({ amount: 800 });
    const result = projection([{ amount: 500 }], [bill], []);

    // realized 500 + committed 800 = projected 1300, budget 1000
    expect(result!.exceeded).toBe(300);
    expect(result!.percentage).toBe(130);
    expect(result!.available).toBe(0);
  });

  it("conceptually unmarks: without payment and without real transaction, forecast returns to committed", () => {
    const bill = baseBill({ id: "bill-1", amount: 200 });
    const resultWithoutPayment = projection([], [bill], []);
    expect(resultWithoutPayment!.committed).toBe(200);

    const resultWithPayment = projection([], [bill], [payment("bill-1", "2026-09")]);
    expect(resultWithPayment!.committed).toBe(0);
  });
});

describe("simulate forecast budget projection", () => {
  const categories: UserCategory[] = [
    { id: "1", name: "Alimentação", type: "expense", monthlyBudget: 1000 },
    { id: "2", name: "Transporte", type: "expense", monthlyBudget: 500 },
    { id: "3", name: "Lazer", type: "expense", monthlyBudget: null },
    { id: "4", name: "Salário", type: "income", monthlyBudget: null },
  ];

  const resolvedBill = (overrides: Partial<EditableRecurringBill> = {}): EditableRecurringBill => ({
    id: "bill-1",
    name: "Supermercado",
    amount: 200,
    category: "Alimentação",
    dueDay: 10,
    durationMonths: null,
    accountId: null,
    description: null,
    type: "expense",
    startDate: "2026-01-01",
    scopedEdits: { months: {}, future: [], deletedMonths: {}, deletedFrom: null },
    ...overrides,
  });

  const persisted = (overrides: Partial<{ realized: number; committed: number; budget: number }> = {}) => ({
    realized: overrides.realized ?? 300,
    committed: overrides.committed ?? 200,
    projected: (overrides.realized ?? 300) + (overrides.committed ?? 200),
    budget: overrides.budget ?? 1000,
    percentage: ((overrides.realized ?? 300) + (overrides.committed ?? 200)) / (overrides.budget ?? 1000) * 100,
    available: Math.max((overrides.budget ?? 1000) - (overrides.realized ?? 300) - (overrides.committed ?? 200), 0),
    exceeded: Math.max((overrides.realized ?? 300) + (overrides.committed ?? 200) - (overrides.budget ?? 1000), 0),
  });

  const simulate = (
    overrides: Partial<Parameters<typeof simulateForecastBudgetProjection>[0]> = {},
  ) => simulateForecastBudgetProjection({
    persistedProjection: persisted(),
    editingBillResolved: null,
    isBillCommitted: false,
    isBillPaid: false,
    newAmount: 150,
    newType: "expense" as const,
    newCategory: "Alimentação",
    categories,
    ...overrides,
  });

  it("new forecast adds to committed", () => {
    const result = simulate({ editingBillResolved: null, isBillCommitted: false, newAmount: 300 });

    expect(result!.committed).toBe(500);
    expect(result!.projected).toBe(800);
  });

  it("editing pending bill same category replaces amount", () => {
    const bill = resolvedBill({ amount: 200 });
    const result = simulate({
      editingBillResolved: bill,
      isBillCommitted: true,
      isBillPaid: false,
      newAmount: 400,
    });

    // committed: 200 (persisted) - 200 (old) + 400 (new) = 400
    expect(result!.committed).toBe(400);
    expect(result!.projected).toBe(700);
  });

  it("editing pending bill changing category adds to new category", () => {
    const bill = resolvedBill({ amount: 300, category: "Alimentação" });
    const result = simulate({
      editingBillResolved: bill,
      isBillCommitted: true,
      isBillPaid: false,
      newAmount: 300,
      newCategory: "Transporte",
      persistedProjection: persisted(),
    });

    // Transporte persisted: committed 200
    // bill was in Alimentação, not Transporte → no subtract
    // committed: 200 + 300 = 500
    expect(result!.committed).toBe(500);
  });

  it("paid bill keeps persisted projection unchanged", () => {
    const bill = resolvedBill({ amount: 150 });
    const result = simulate({
      editingBillResolved: bill,
      isBillCommitted: false,
      isBillPaid: true,
      newAmount: 999,
    });

    expect(result!.committed).toBe(200);
    expect(result!.projected).toBe(500);
  });

  it("paid bill with different value still keeps persisted projection", () => {
    const bill = resolvedBill({ amount: 100 });
    const result = simulate({
      editingBillResolved: bill,
      isBillCommitted: false,
      isBillPaid: true,
      newAmount: 500,
    });

    expect(result!.committed).toBe(200);
    expect(result!.projected).toBe(500);
  });

  it("expense → income returns null", () => {
    const result = simulate({ newType: "income" });

    expect(result).toBeNull();
  });

  it("income → expense adds normally when not paid", () => {
    const bill = resolvedBill({ type: "income", category: "Salário" });
    const result = simulate({
      editingBillResolved: bill,
      isBillCommitted: false,
      isBillPaid: false,
      newType: "expense",
      newCategory: "Alimentação",
      newAmount: 250,
    });

    // Alimentação persisted: committed 200
    // bill was income, not committed → no subtract
    // committed: 200 + 250 = 450
    expect(result!.committed).toBe(450);
  });

  it("category without budget returns null", () => {
    const result = simulate({ newCategory: "Lazer" });

    expect(result).toBeNull();
  });

  it("zero amount does not add to committed", () => {
    const result = simulate({ newAmount: 0, editingBillResolved: null });

    expect(result!.committed).toBe(200);
  });

  it("invalid/NaN amount does not add to committed", () => {
    const result = simulate({ newAmount: NaN, editingBillResolved: null });

    expect(result!.committed).toBe(200);
  });

  it("percentage can exceed 100%", () => {
    const result = simulate({
      persistedProjection: persisted({ realized: 800, committed: 100 }),
      newAmount: 200,
      editingBillResolved: null,
    });

    // committed: 100 + 200 = 300, projected: 800 + 300 = 1100
    expect(result!.percentage).toBe(110);
    expect(result!.exceeded).toBe(100);
  });

  it("available is correct", () => {
    const result = simulate({
      persistedProjection: persisted({ realized: 400, committed: 100 }),
      newAmount: 200,
      editingBillResolved: null,
    });

    // committed: 100 + 200 = 300, projected: 400 + 300 = 700
    expect(result!.available).toBe(300);
  });

  it("exceeded is correct", () => {
    const result = simulate({
      persistedProjection: persisted({ realized: 600, committed: 300 }),
      newAmount: 200,
      editingBillResolved: null,
    });

    // committed: 300 + 200 = 500, projected: 600 + 500 = 1100
    expect(result!.exceeded).toBe(100);
  });

  it("committed never goes negative", () => {
    const bill = resolvedBill({ amount: 500 });
    const result = simulate({
      persistedProjection: persisted({ realized: 0, committed: 100 }),
      editingBillResolved: bill,
      isBillCommitted: true,
      newAmount: 0,
    });

    // committed: 100 - 500 + 0 = -400 → clamped to 0
    expect(result!.committed).toBe(0);
  });

  it("editingBillResolved null works as new forecast", () => {
    const result = simulate({ editingBillResolved: null, isBillCommitted: false, newAmount: 250 });

    expect(result!.committed).toBe(450);
    expect(result!.projected).toBe(750);
  });

  it("pending bill same category exactly replaces oldAmount by newAmount", () => {
    const bill = resolvedBill({ amount: 200 });
    const result = simulate({
      editingBillResolved: bill,
      isBillCommitted: true,
      newAmount: 350,
    });

    // committed: 200 - 200 + 350 = 350
    expect(result!.committed).toBe(350);
  });

  it("negative amount is treated as zero", () => {
    const bill = resolvedBill({ amount: 200 });
    const result = simulate({
      editingBillResolved: bill,
      isBillCommitted: true,
      newAmount: -50,
    });

    // committed: 200 - 200 + 0 = 0
    expect(result!.committed).toBe(0);
  });

  it("Infinity amount is treated as zero", () => {
    const result = simulate({ editingBillResolved: null, newAmount: Infinity });

    expect(result!.committed).toBe(200);
  });
});
