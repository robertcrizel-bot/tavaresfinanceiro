import { describe, expect, it } from "vitest";
import { getCardCommittedAmount, getCardCurrentInvoiceAmount, getCardInvoiceEndDate } from "@/lib/credit-card-billing";
import type { Transaction } from "@/lib/types";

const cardExpense = (id: string, amount: number, date: string): Transaction => ({
  id,
  title: `Compra ${id}`,
  amount,
  type: "expense",
  category: "Outros",
  date,
  creditCardId: "card-1",
  isPaid: false,
});

describe("credit card billing", () => {
  it("commits every installment but charges only the current competency", () => {
    const transactions = [
      cardExpense("existing", 74.36, "2026-09-01"),
      cardExpense("installment-1", 100, "2026-09-11"),
      cardExpense("installment-2", 100, "2026-10-11"),
      cardExpense("installment-3", 100, "2026-11-11"),
    ];

    const committed = getCardCommittedAmount(transactions, "card-1");
    const currentInvoice = getCardCurrentInvoiceAmount(transactions, "card-1", "2026-09-11");

    expect(committed).toBeCloseTo(374.36);
    expect(currentInvoice).toBeCloseTo(174.36);
    expect(2500 - committed).toBeCloseTo(2125.64);
  });

  it("moves a future installment into the invoice when its month arrives", () => {
    const transactions = [cardExpense("installment-2", 100, "2026-10-11")];

    expect(getCardCurrentInvoiceAmount(transactions, "card-1", "2026-09-30")).toBe(0);
    expect(getCardCurrentInvoiceAmount(transactions, "card-1", "2026-10-01")).toBe(100);
  });

  it("calculates the last day of the current competency", () => {
    expect(getCardInvoiceEndDate("2028-02-10")).toBe("2028-02-29");
  });
});
