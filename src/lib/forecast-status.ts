const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type ForecastTemporalStatusKind = "paid" | "due-today" | "overdue" | "due-soon" | "upcoming";

export interface ForecastTemporalStatus {
  kind: ForecastTemporalStatusKind;
  label: string | null;
  dueDate: string;
  daysUntilDue: number;
}

interface CompetencePayment {
  recurringBillId: string;
  referenceMonth: string;
}

export const getPaymentForCompetence = <T extends CompetencePayment>(
  payments: T[],
  recurringBillId: string,
  referenceMonth: string,
) => payments.find((payment) => (
  payment.recurringBillId === recurringBillId && payment.referenceMonth === referenceMonth
));

export const getCompetenceDueDate = (referenceMonth: string, dueDay: number) => {
  const [year, month] = referenceMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const validDueDay = Math.min(Math.max(1, Math.trunc(dueDay)), lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(validDueDay).padStart(2, "0")}`;
};

export const getForecastTemporalStatus = ({
  referenceMonth,
  dueDay,
  isPaid,
  today = new Date(),
}: {
  referenceMonth: string;
  dueDay: number;
  isPaid: boolean;
  today?: Date;
}): ForecastTemporalStatus => {
  const dueDate = getCompetenceDueDate(referenceMonth, dueDay);
  const [dueYear, dueMonth, validDueDay] = dueDate.split("-").map(Number);
  const dueDateNumber = Date.UTC(dueYear, dueMonth - 1, validDueDay);
  const todayNumber = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntilDue = Math.round((dueDateNumber - todayNumber) / DAY_IN_MS);

  if (isPaid) return { kind: "paid", label: "Pago", dueDate, daysUntilDue };
  if (daysUntilDue < 0) return { kind: "overdue", label: "Vencido", dueDate, daysUntilDue };
  if (daysUntilDue === 0) return { kind: "due-today", label: "Vence hoje", dueDate, daysUntilDue };
  if (daysUntilDue <= 7) {
    return {
      kind: "due-soon",
      label: `Vence em ${daysUntilDue} ${daysUntilDue === 1 ? "dia" : "dias"}`,
      dueDate,
      daysUntilDue,
    };
  }
  return { kind: "upcoming", label: null, dueDate, daysUntilDue };
};
