import { isBillPaymentTransaction } from "@/lib/transaction-classification";
import type { CreditCardInvoice, Transaction } from "@/lib/types";

type CardTransaction = Pick<
  Transaction,
  "accountId" | "amount" | "category" | "creditCardId" | "creditCardInvoiceId" | "date" | "id" |
  "financialKind" | "isPaid" | "title" | "type"
>;

export type InvoiceClosingCandidate = {
  transaction: CardTransaction;
  isFromNextInvoice: boolean;
  isManuallyExcluded: boolean;
};

type CardCycle = Pick<CreditCardInvoice, "competence" | "cycleStart" | "cycleEnd" | "dueDate">;

const currentDate = () => new Date().toISOString().split("T")[0];
const pad = (value: number) => String(value).padStart(2, "0");
const isoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const addMonths = (year: number, month: number, amount: number) => {
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
};

const dateAtDay = (year: number, month: number, day: number) =>
  isoDate(year, month, Math.min(day, lastDay(year, month)));

export const getCreditCardCycle = (
  closingDay: number,
  dueDay: number,
  referenceDate = currentDate(),
): CardCycle => {
  const [referenceYear, referenceMonth] = referenceDate.split("-").map(Number);
  let cycleMonth = { year: referenceYear, month: referenceMonth };
  let cycleEnd = dateAtDay(cycleMonth.year, cycleMonth.month, closingDay);

  if (referenceDate > cycleEnd) {
    cycleMonth = addMonths(cycleMonth.year, cycleMonth.month, 1);
    cycleEnd = dateAtDay(cycleMonth.year, cycleMonth.month, closingDay);
  }

  const previousMonth = addMonths(cycleMonth.year, cycleMonth.month, -1);
  const previousEnd = dateAtDay(previousMonth.year, previousMonth.month, closingDay);
  const nextDay = new Date(`${previousEnd}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const cycleStart = nextDay.toISOString().split("T")[0];

  let dueMonth = cycleMonth;
  let dueDate = dateAtDay(dueMonth.year, dueMonth.month, dueDay);
  if (dueDate <= cycleEnd) {
    dueMonth = addMonths(cycleMonth.year, cycleMonth.month, 1);
    dueDate = dateAtDay(dueMonth.year, dueMonth.month, dueDay);
  }

  return {
    competence: `${cycleMonth.year}-${pad(cycleMonth.month)}-01`,
    cycleStart,
    cycleEnd,
    dueDate,
  };
};

const signedAmount = (transaction: CardTransaction) =>
  transaction.type === "income" ? -transaction.amount : transaction.amount;

const addDays = (dateStr: string, days: number): string => {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
};

const isCardMovement = (transaction: CardTransaction, creditCardId: string) =>
  transaction.creditCardId === creditCardId &&
  transaction.financialKind !== "card_invoice_obligation" &&
  transaction.financialKind !== "card_invoice_payment" &&
  !isBillPaymentTransaction(transaction);

export const getInvoiceAmount = (
  transactions: CardTransaction[],
  invoice: CreditCardInvoice,
) => {
  if (invoice.status === "CLOSED" || invoice.status === "PAID") return invoice.closedTotal ?? 0;
  return transactions.reduce(
    (total, transaction) => total + (
      transaction.creditCardInvoiceId === invoice.id && isCardMovement(transaction, invoice.creditCardId)
        ? signedAmount(transaction)
        : 0
    ),
    0,
  );
};

export const getCardCommittedAmount = (
  transactions: CardTransaction[],
  creditCardId: string,
  invoices: CreditCardInvoice[] = [],
) => {
  const cardInvoices = invoices.filter((invoice) => invoice.creditCardId === creditCardId);
  const invoiceStatus = new Map(cardInvoices.map((invoice) => [invoice.id, invoice.status]));
  const movementTotal = transactions.reduce((total, transaction) => {
    if (!isCardMovement(transaction, creditCardId)) return total;
    if (transaction.creditCardInvoiceId) {
      const status = invoiceStatus.get(transaction.creditCardInvoiceId);
      return status === "PAID" || status === "CLOSED" ? total : total + signedAmount(transaction);
    }
    return transaction.isPaid ? total : total + signedAmount(transaction);
  }, 0);

  return cardInvoices.reduce(
    (total, invoice) => total + (invoice.status === "CLOSED" ? invoice.closedTotal ?? 0 : 0),
    movementTotal,
  );
};

export const selectCardInvoice = (
  invoices: CreditCardInvoice[],
  transactions: CardTransaction[],
  creditCardId: string,
) => {
  const cardInvoices = invoices.filter((invoice) => invoice.creditCardId === creditCardId);
  const closed = cardInvoices.filter((invoice) => invoice.status === "CLOSED").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (closed[0]) return closed[0];

  const open = cardInvoices.filter((invoice) => invoice.status === "OPEN").sort((a, b) => a.cycleEnd.localeCompare(b.cycleEnd));
  const activeOpen = open.find((invoice) => transactions.some((transaction) =>
    transaction.creditCardInvoiceId === invoice.id && isCardMovement(transaction, creditCardId)));
  if (activeOpen) return activeOpen;

  const paid = cardInvoices.filter((invoice) => invoice.status === "PAID").sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
  return paid[0] || open[0];
};

// Kept for the monthly statement while it is migrated to persisted invoice navigation.
export const getCardInvoiceEndDate = (referenceDate = currentDate()) => {
  const [year, month] = referenceDate.split("-").map(Number);
  return isoDate(year, month, lastDay(year, month));
};

export const getCardCurrentInvoiceAmount = (
  transactions: CardTransaction[],
  creditCardId: string,
  referenceDate = currentDate(),
) => {
  const invoiceEndDate = getCardInvoiceEndDate(referenceDate);
  return transactions.reduce(
    (total, transaction) => total + (
      isCardMovement(transaction, creditCardId) && !transaction.isPaid && transaction.date <= invoiceEndDate
        ? signedAmount(transaction)
        : 0
    ),
    0,
  );
};

export const formatInvoiceCompetence = (competence: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${competence}T12:00:00Z`));

export const getInvoiceClosingCandidates = (
  transactions: CardTransaction[],
  invoice: CreditCardInvoice,
  creditCardInvoices: CreditCardInvoice[],
  actualClosedDate: string,
): InvoiceClosingCandidate[] => {
  if (invoice.status !== "OPEN") return [];

  const nextCycleStart = addDays(invoice.cycleEnd, 1);
  const nextInvoice = creditCardInvoices.find((candidate) =>
    candidate.creditCardId === invoice.creditCardId &&
    candidate.status === "OPEN" &&
    candidate.cycleStart === nextCycleStart
  );

  return transactions.flatMap((transaction): InvoiceClosingCandidate[] => {
    if (!isCardMovement(transaction, invoice.creditCardId) || transaction.date > actualClosedDate) return [];

    if (transaction.creditCardInvoiceId === invoice.id) {
      return [{ transaction, isFromNextInvoice: false, isManuallyExcluded: false }];
    }

    if (!nextInvoice || transaction.creditCardInvoiceId !== nextInvoice.id) return [];

    const isManuallyExcluded = transaction.date >= invoice.cycleStart && transaction.date <= invoice.cycleEnd;
    const entersByPostponedClosing = actualClosedDate > invoice.cycleEnd && transaction.date > invoice.cycleEnd;
    return isManuallyExcluded || entersByPostponedClosing
      ? [{ transaction, isFromNextInvoice: true, isManuallyExcluded }]
      : [];
  });
};

export const getInvoiceClosingPreviewAmount = (
  candidates: InvoiceClosingCandidate[],
  excludedTransactionIds: string[],
) => {
  const excludedIds = new Set(excludedTransactionIds);
  return candidates.reduce(
    (total, candidate) => total + (excludedIds.has(candidate.transaction.id) ? 0 : signedAmount(candidate.transaction)),
    0,
  );
};

export const getInvoicePreviewAmount = (
  transactions: CardTransaction[],
  invoice: CreditCardInvoice,
  creditCardInvoices: CreditCardInvoice[],
  actualClosedDate: string,
): number => {
  if (invoice.status === "CLOSED" || invoice.status === "PAID") return invoice.closedTotal ?? 0;
  const candidates = getInvoiceClosingCandidates(transactions, invoice, creditCardInvoices, actualClosedDate);
  const excludedIds = candidates
    .filter((candidate) => candidate.isManuallyExcluded)
    .map((candidate) => candidate.transaction.id);
  return getInvoiceClosingPreviewAmount(candidates, excludedIds);
};
