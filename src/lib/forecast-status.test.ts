import { describe, expect, it } from "vitest";
import {
  getCompetenceDueDate,
  getForecastTemporalStatus,
  getPaymentForCompetence,
} from "@/lib/forecast-status";

const statusFor = (dueDay: number, today: Date, isPaid = false, referenceMonth = "2026-09") => (
  getForecastTemporalStatus({ referenceMonth, dueDay, isPaid, today })
);

describe("forecast temporal status", () => {
  it("shows paid before any temporal status", () => {
    expect(statusFor(10, new Date(2026, 8, 11, 23, 59), true)).toMatchObject({
      kind: "paid",
      label: "Pago",
    });
  });

  it("shows due today throughout the local day", () => {
    expect(statusFor(11, new Date(2026, 8, 11, 23, 59))).toMatchObject({
      kind: "due-today",
      label: "Vence hoje",
    });
  });

  it("shows overdue when it was due yesterday", () => {
    expect(statusFor(10, new Date(2026, 8, 11))).toMatchObject({
      kind: "overdue",
      label: "Vencido",
    });
  });

  it("uses the singular label when it is due in one day", () => {
    expect(statusFor(12, new Date(2026, 8, 11))).toMatchObject({
      kind: "due-soon",
      label: "Vence em 1 dia",
    });
  });

  it("shows the remaining days when it is due in five days", () => {
    expect(statusFor(16, new Date(2026, 8, 11))).toMatchObject({
      kind: "due-soon",
      label: "Vence em 5 dias",
    });
  });

  it("does not add a proximity label above seven days", () => {
    expect(statusFor(19, new Date(2026, 8, 11))).toMatchObject({
      kind: "upcoming",
      label: null,
    });
  });

  it("does not reuse a payment from another competence", () => {
    const payments = [{ recurringBillId: "bill-1", referenceMonth: "2026-09" }];
    const octoberPayment = getPaymentForCompetence(payments, "bill-1", "2026-10");
    const status = getForecastTemporalStatus({
      referenceMonth: "2026-10",
      dueDay: 10,
      isPaid: Boolean(octoberPayment),
      today: new Date(2026, 8, 11),
    });

    expect(octoberPayment).toBeUndefined();
    expect(status.kind).toBe("upcoming");
  });

  it("clamps day 31 to the last day of February", () => {
    expect(getCompetenceDueDate("2026-02", 31)).toBe("2026-02-28");
    expect(statusFor(31, new Date(2026, 1, 28, 23, 59), false, "2026-02")).toMatchObject({
      kind: "due-today",
      dueDate: "2026-02-28",
    });
  });
});
