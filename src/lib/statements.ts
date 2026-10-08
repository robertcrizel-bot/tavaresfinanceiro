import { getInvoiceRecordTitle } from "@/lib/invoice-record-presentation";
import {
  isAdjustmentTransaction,
  isBillPaymentTransaction,
} from "@/lib/transaction-classification";
import type { Account, CreditCard, CreditCardInvoice, Transaction } from "@/lib/types";

export type StatementOrigin =
  | { kind: "all" }
  | { kind: "account"; accountId: string }
  | { kind: "card"; cardId: string }
  | { kind: "cash" };

export type StatementTypeFilter = "all" | "income" | "expense";
export type StatementSort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

export interface StatementFilters {
  origin: StatementOrigin;
  start: string;
  end: string;
  type: StatementTypeFilter;
  category: string;
  paymentMethod: string;
  search: string;
  minAmount: number | null;
  maxAmount: number | null;
  sort: StatementSort;
}

export interface StatementContext {
  accounts: Account[];
  creditCards: CreditCard[];
  invoices: CreditCardInvoice[];
}

export const STATEMENT_ALL = "all";

export function originKey(origin: StatementOrigin): string {
  switch (origin.kind) {
    case "account":
      return `a:${origin.accountId}`;
    case "card":
      return `c:${origin.cardId}`;
    case "cash":
      return "cash";
    default:
      return STATEMENT_ALL;
  }
}

export function originFromKey(key: string): StatementOrigin {
  if (key.startsWith("a:")) return { kind: "account", accountId: key.slice(2) };
  if (key.startsWith("c:")) return { kind: "card", cardId: key.slice(2) };
  if (key === "cash") return { kind: "cash" };
  return { kind: "all" };
}

export function signedAmount(transaction: Transaction): number {
  return transaction.type === "income" ? transaction.amount : -transaction.amount;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Financial-statement eligibility.
 *
 * - card_invoice_obligation is NEVER a movement (not a purchase, not an outflow).
 * - card_invoice_payment (and legacy bill payments) debit the paying account
 *   EXACTLY ONCE and never count as card purchases.
 * - manual adjustments are neutral and stay out of statements.
 * - card scope only sees real card movements (purchases/refunds) by transaction.date.
 */
function originEligible(transaction: Transaction, origin: StatementOrigin): boolean {
  if (transaction.financialKind === "card_invoice_obligation") return false;
  if (transaction.financialKind === "card_invoice_payment") {
    if (!transaction.accountId) return false;
    return origin.kind === "all" || (origin.kind === "account" && transaction.accountId === origin.accountId);
  }
  if (isAdjustmentTransaction(transaction)) return false;
  if (isBillPaymentTransaction(transaction)) {
    if (!transaction.accountId) return false;
    return origin.kind === "all" || (origin.kind === "account" && transaction.accountId === origin.accountId);
  }
  switch (origin.kind) {
    case "all":
      return true;
    case "account":
      return transaction.accountId === origin.accountId;
    case "card":
      return transaction.creditCardId === origin.cardId;
    case "cash":
      return !transaction.accountId && !transaction.creditCardId && transaction.paymentMethod === "Dinheiro";
  }
}

export function filterStatementTransactions(
  transactions: Transaction[],
  filters: StatementFilters,
): Transaction[] {
  const search = filters.search.trim().toLowerCase();
  const rows = transactions.filter((transaction) => {
    if (!originEligible(transaction, filters.origin)) return false;
    if (transaction.date < filters.start || transaction.date > filters.end) return false;
    if (filters.type !== "all" && transaction.type !== filters.type) return false;
    if (filters.category !== STATEMENT_ALL && transaction.category !== filters.category) return false;
    if (filters.paymentMethod !== STATEMENT_ALL && (transaction.paymentMethod ?? "") !== filters.paymentMethod) return false;
    if (filters.minAmount !== null && transaction.amount < filters.minAmount) return false;
    if (filters.maxAmount !== null && transaction.amount > filters.maxAmount) return false;
    if (search) {
      const haystack = [
        transaction.title,
        transaction.description ?? "",
        transaction.category,
        transaction.paymentMethod ?? "",
        transaction.receiptDetails?.merchantName ?? "",
        String(transaction.amount),
      ].join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const byDate = (a: Transaction, b: Transaction) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  switch (filters.sort) {
    case "date-asc":
      return rows.sort(byDate);
    case "amount-desc":
      return rows.sort((a, b) => b.amount - a.amount || byDate(a, b));
    case "amount-asc":
      return rows.sort((a, b) => a.amount - b.amount || byDate(a, b));
    default:
      return rows.sort((a, b) => byDate(b, a));
  }
}

export interface AccountStatementSummary {
  income: number;
  expense: number;
  balance: number;
  count: number;
}

export function summarizeAccount(rows: Transaction[]): AccountStatementSummary {
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    if (row.type === "income") income += row.amount;
    else expense += row.amount;
  }
  return { income: round2(income), expense: round2(expense), balance: round2(income - expense), count: rows.length };
}

export interface CardStatementSummary {
  purchases: number;
  refunds: number;
  net: number;
  count: number;
}

export function summarizeCard(rows: Transaction[]): CardStatementSummary {
  let purchases = 0;
  let refunds = 0;
  for (const row of rows) {
    if (row.type === "income") refunds += row.amount;
    else purchases += row.amount;
  }
  return { purchases: round2(purchases), refunds: round2(refunds), net: round2(purchases - refunds), count: rows.length };
}

export interface CategorySlice {
  category: string;
  total: number;
  share: number;
  count: number;
}

export function summarizeByCategory(rows: Transaction[]): CategorySlice[] {
  const map = new Map<string, { total: number; count: number }>();
  let grand = 0;
  for (const row of rows) {
    if (row.type !== "expense") continue;
    const entry = map.get(row.category) ?? { total: 0, count: 0 };
    entry.total += row.amount;
    entry.count += 1;
    map.set(row.category, entry);
    grand += row.amount;
  }
  return [...map.entries()]
    .map(([category, entry]) => ({
      category,
      total: round2(entry.total),
      share: grand > 0 ? (entry.total / grand) * 100 : 0,
      count: entry.count,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface DayPoint {
  date: string;
  label: string;
  income: number;
  expense: number;
}

export function buildDailySeries(rows: Transaction[], start: string, end: string): DayPoint[] {
  const byDate = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const entry = byDate.get(row.date) ?? { income: 0, expense: 0 };
    if (row.type === "income") entry.income += row.amount;
    else entry.expense += row.amount;
    byDate.set(row.date, entry);
  }
  const points: DayPoint[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const entry = byDate.get(iso) ?? { income: 0, expense: 0 };
    points.push({
      date: iso,
      label: cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      income: round2(entry.income),
      expense: round2(entry.expense),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

export function topMovements(rows: Transaction[], limit = 8): Transaction[] {
  return [...rows].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export interface OriginSlice {
  key: string;
  label: string;
  volume: number;
  count: number;
}

export function originLabel(
  transaction: Transaction,
  accounts: Account[],
  creditCards: CreditCard[],
): { key: string; label: string } {
  if (transaction.accountId) {
    const account = accounts.find((candidate) => candidate.id === transaction.accountId);
    return { key: `a:${transaction.accountId}`, label: account?.name ?? "Conta" };
  }
  if (transaction.creditCardId) {
    const card = creditCards.find((candidate) => candidate.id === transaction.creditCardId);
    return { key: `c:${transaction.creditCardId}`, label: card ? `${card.name} (Cartão)` : "Cartão" };
  }
  if (transaction.paymentMethod === "Dinheiro") return { key: "cash", label: "Dinheiro" };
  return { key: "other", label: transaction.paymentMethod ?? "Outros" };
}

export function summarizeByOrigin(
  rows: Transaction[],
  accounts: Account[],
  creditCards: CreditCard[],
): OriginSlice[] {
  const map = new Map<string, OriginSlice>();
  for (const row of rows) {
    const { key, label } = originLabel(row, accounts, creditCards);
    const entry = map.get(key) ?? { key, label, volume: 0, count: 0 };
    entry.volume += Math.abs(signedAmount(row));
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()]
    .map((entry) => ({ ...entry, volume: round2(entry.volume) }))
    .sort((a, b) => b.volume - a.volume);
}

export interface PaymentMethodSlice {
  method: string;
  volume: number;
  count: number;
}

export function summarizeByPaymentMethod(rows: Transaction[]): PaymentMethodSlice[] {
  const map = new Map<string, PaymentMethodSlice>();
  for (const row of rows) {
    const method = row.paymentMethod ?? "Não informada";
    const entry = map.get(method) ?? { method, volume: 0, count: 0 };
    entry.volume += Math.abs(signedAmount(row));
    entry.count += 1;
    map.set(method, entry);
  }
  return [...map.values()]
    .map((entry) => ({ ...entry, volume: round2(entry.volume) }))
    .sort((a, b) => b.volume - a.volume);
}

export function hasCashOrigin(transactions: Transaction[]): boolean {
  return transactions.some(
    (transaction) =>
      !transaction.accountId && !transaction.creditCardId && transaction.paymentMethod === "Dinheiro",
  );
}

export function statementTypeLabel(transaction: Transaction): string {
  if (transaction.financialKind === "card_invoice_payment") return "Pagamento de Fatura";
  return transaction.type === "income" ? "Entrada" : "Saída";
}

export function buildStatementExportRows(
  rows: Transaction[],
  context: StatementContext,
): Record<string, string | number>[] {
  return rows.map((transaction) => {
    const { label } = originLabel(transaction, context.accounts, context.creditCards);
    const description = transaction.financialKind === "card_invoice_payment" ||
      transaction.financialKind === "card_invoice_obligation"
      ? getInvoiceRecordTitle(transaction, context.invoices, context.creditCards)
      : transaction.title;
    return {
      Data: new Date(`${transaction.date}T12:00:00`).toLocaleDateString("pt-BR"),
      Descrição: description,
      Categoria: transaction.category,
      Origem: label,
      Tipo: statementTypeLabel(transaction),
      "Forma de pagamento": transaction.paymentMethod ?? "—",
      Valor: signedAmount(transaction),
    };
  });
}

export function statementExportFilename(start: string, end: string): string {
  return `FinanceControl_Extrato_${start}_${end}.xlsx`;
}
