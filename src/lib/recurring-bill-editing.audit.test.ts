import { describe, expect, it } from "vitest";
import { applyRecurringBillEdit, emptyScopedEdits, resolveRecurringBill, type EditableRecurringBill } from "./recurring-bill-editing";

// Regression coverage for both directions, scope boundaries and JSON persistence.
describe("Recurring type edit regressions", () => {
  it.each(["this", "future", "all"] as const)("scope %s preserves both income/expense direction changes", scope => {
    for (const from of ["expense", "income"] as const) {
      const to = from === "expense" ? "income" : "expense";
      const bill: EditableRecurringBill = {
        id: "bill-1", name: "Audit", type: from, amount: 100, category: "Outros", dueDay: 10,
        startDate: "2026-01-01", durationMonths: null, accountId: null, description: null,
        scopedEdits: emptyScopedEdits(),
      };
      const edited = applyRecurringBillEdit(bill, { ...bill, type: to, amount: 200 }, scope, "2026-10");
      expect(resolveRecurringBill(edited, "2026-10").amount).toBe(200);
      expect(resolveRecurringBill(edited, "2026-10").type).toBe(to);
      const restored = JSON.parse(JSON.stringify(edited));
      expect(resolveRecurringBill(restored, "2026-09").type).toBe(scope === "all" ? to : from);
      expect(resolveRecurringBill(restored, "2026-10").type).toBe(to);
      expect(resolveRecurringBill(restored, "2026-11").type).toBe(scope === "this" ? from : to);
      const override = scope === "this" ? edited.scopedEdits.months["2026-10"]
        : scope === "future" ? edited.scopedEdits.future[0].values : null;
      if (override) expect(override).toHaveProperty("type", to);
    }
  });
});
