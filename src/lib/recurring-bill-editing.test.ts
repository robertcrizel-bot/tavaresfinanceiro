import { describe, expect, it } from "vitest";
import {
  applyRecurringBillDeletion,
  applyRecurringBillEdit,
  emptyScopedEdits,
  isRecurringBillActiveInMonth,
  normalizeScopedEdits,
  resolveRecurringBill,
  type EditableRecurringBill,
} from "@/lib/recurring-bill-editing";

const bill = (): EditableRecurringBill => ({
  id: "bill-1",
  name: "Aluguel",
  amount: 1000,
  category: "Moradia",
  dueDay: 10,
  startDate: "2026-01-01",
  durationMonths: 12,
  accountId: "account-1",
  description: "Contrato atual",
  scopedEdits: emptyScopedEdits(),
});

const editedValues = {
  name: "Aluguel reajustado",
  amount: 1100,
  category: "Moradia",
  dueDay: 12,
  durationMonths: 12,
  accountId: "account-2",
  description: "Contrato reajustado",
};

describe("recurring bill editing scopes", () => {
  it("changes only the selected month", () => {
    const edited = applyRecurringBillEdit(bill(), { ...editedValues, durationMonths: 24 }, "this", "2026-04");

    expect(resolveRecurringBill(edited, "2026-03").amount).toBe(1000);
    expect(resolveRecurringBill(edited, "2026-04").amount).toBe(1100);
    expect(resolveRecurringBill(edited, "2026-05").amount).toBe(1000);
    expect(resolveRecurringBill(edited, "2026-04").durationMonths).toBe(12);
    expect(resolveRecurringBill(edited, "2026-04")).toMatchObject({
      name: "Aluguel reajustado",
      amount: 1100,
      dueDay: 12,
      accountId: "account-2",
      description: "Contrato reajustado",
    });
    expect(resolveRecurringBill(edited, "2026-04").id).toBe("bill-1");
  });

  it("changes the selected month and all following months", () => {
    const edited = applyRecurringBillEdit(bill(), editedValues, "future", "2026-04");

    expect(resolveRecurringBill(edited, "2026-03").amount).toBe(1000);
    expect(resolveRecurringBill(edited, "2026-03").dueDay).toBe(10);
    expect(resolveRecurringBill(edited, "2026-04").amount).toBe(1100);
    expect(resolveRecurringBill(edited, "2026-04").dueDay).toBe(12);
    expect(resolveRecurringBill(edited, "2026-10").amount).toBe(1100);
    expect(resolveRecurringBill(edited, "2026-10").dueDay).toBe(12);
    expect(resolveRecurringBill(edited, "2026-10").id).toBe("bill-1");
  });

  it("changes the entire recurrence and clears previous scoped edits", () => {
    const withException = applyRecurringBillEdit(bill(), { ...editedValues, amount: 1050 }, "this", "2026-04");
    const edited = applyRecurringBillEdit(withException, editedValues, "all", "2026-04");

    expect(resolveRecurringBill(edited, "2026-02").amount).toBe(1100);
    expect(resolveRecurringBill(edited, "2026-04").amount).toBe(1100);
    expect(resolveRecurringBill(edited, "2026-10").amount).toBe(1100);
    expect(edited.scopedEdits).toEqual(emptyScopedEdits());
    expect(edited.id).toBe("bill-1");
  });

  it.each([
    { scope: "this" as const, expectedDueDays: [15, 11, 11], expectedAmounts: [1500, 1000, 1000] },
    { scope: "future" as const, expectedDueDays: [15, 15, 15], expectedAmounts: [1500, 1500, 1500] },
    { scope: "all" as const, expectedDueDays: [15, 15, 15], expectedAmounts: [1500, 1500, 1500] },
  ])("applies due day and amount uniformly with $scope scope", ({ scope, expectedDueDays, expectedAmounts }) => {
    const septemberBill = {
      ...bill(),
      startDate: "2026-09-01",
      dueDay: 11,
      durationMonths: null,
    };
    const edited = applyRecurringBillEdit(
      septemberBill,
      { ...editedValues, dueDay: 15, amount: 1500, durationMonths: null },
      scope,
      "2026-09",
    );
    const months = ["2026-09", "2026-10", "2026-11"].map((month) => resolveRecurringBill(edited, month));

    expect(months.map((month) => month.dueDay)).toEqual(expectedDueDays);
    expect(months.map((month) => month.amount)).toEqual(expectedAmounts);
  });

  it("preserves existing scoped edits when changing only the selected month", () => {
    const septemberBill = { ...bill(), startDate: "2026-09-01", dueDay: 11, durationMonths: null };
    const withFutureEdit = applyRecurringBillEdit(
      septemberBill,
      { ...editedValues, dueDay: 13, amount: 1200, durationMonths: null },
      "future",
      "2026-09",
    );
    const withOctoberEdit = applyRecurringBillEdit(
      withFutureEdit,
      { ...editedValues, dueDay: 20, amount: 1300, durationMonths: null },
      "this",
      "2026-10",
    );
    const septemberValues = resolveRecurringBill(withOctoberEdit, "2026-09");
    const edited = applyRecurringBillEdit(
      withOctoberEdit,
      { ...septemberValues, dueDay: 15, amount: 1250 },
      "this",
      "2026-09",
    );

    expect(resolveRecurringBill(edited, "2026-09")).toMatchObject({ dueDay: 15, amount: 1250 });
    expect(resolveRecurringBill(edited, "2026-10")).toMatchObject({ dueDay: 20, amount: 1300 });
  });
});

describe("recurring bill deletion scopes", () => {
  it("removes only the selected month", () => {
    const deleted = applyRecurringBillDeletion(bill(), "this", "2026-04");

    expect(isRecurringBillActiveInMonth(deleted, "2026-03")).toBe(true);
    expect(isRecurringBillActiveInMonth(deleted, "2026-04")).toBe(false);
    expect(isRecurringBillActiveInMonth(deleted, "2026-05")).toBe(true);
    expect(deleted.scopedEdits.deletedMonths).toEqual({ "2026-04": true });
  });

  it("removes the selected month and all following months", () => {
    const deleted = applyRecurringBillDeletion(bill(), "future", "2026-04");

    expect(isRecurringBillActiveInMonth(deleted, "2026-03")).toBe(true);
    expect(isRecurringBillActiveInMonth(deleted, "2026-04")).toBe(false);
    expect(isRecurringBillActiveInMonth(deleted, "2026-12")).toBe(false);
    expect(deleted.scopedEdits.deletedFrom).toBe("2026-04");
  });

  it("removes the entire recurrence", () => {
    const deleted = applyRecurringBillDeletion(bill(), "all", "2026-04");

    expect(isRecurringBillActiveInMonth(deleted, "2026-01")).toBe(false);
    expect(isRecurringBillActiveInMonth(deleted, "2026-04")).toBe(false);
    expect(isRecurringBillActiveInMonth(deleted, "2026-12")).toBe(false);
    expect(deleted.scopedEdits.deletedFrom).toBe("2026-01");
  });

  it("keeps deletions idempotent and preserves them across edits", () => {
    const deletedOnce = applyRecurringBillDeletion(bill(), "this", "2026-04");
    const deletedTwice = applyRecurringBillDeletion(deletedOnce, "this", "2026-04");
    const edited = applyRecurringBillEdit(deletedTwice, editedValues, "future", "2026-03");

    expect(deletedTwice.scopedEdits.deletedMonths).toEqual({ "2026-04": true });
    expect(isRecurringBillActiveInMonth(edited, "2026-04")).toBe(false);
    expect(resolveRecurringBill(edited, "2026-03").amount).toBe(1100);
  });

  it("normalizes records created before deletion markers existed", () => {
    expect(normalizeScopedEdits({ months: {}, future: [] })).toEqual(emptyScopedEdits());
  });
});
