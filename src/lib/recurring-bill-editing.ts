export type RecurringBillEditScope = "this" | "future" | "all";

export interface RecurringBillValues {
  name: string;
  amount: number;
  category: string;
  dueDay: number;
  durationMonths: number | null;
  accountId: string | null;
  description: string | null;
}

type MonthlyBillValues = Omit<RecurringBillValues, "durationMonths">;

export interface RecurringBillScopedEdits {
  months: Record<string, MonthlyBillValues>;
  future: Array<{ from: string; values: RecurringBillValues }>;
}

export interface EditableRecurringBill extends RecurringBillValues {
  id: string;
  startDate: string;
  scopedEdits: RecurringBillScopedEdits;
}

export const emptyScopedEdits = (): RecurringBillScopedEdits => ({ months: {}, future: [] });

export const normalizeScopedEdits = (value: unknown): RecurringBillScopedEdits => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyScopedEdits();
  const edits = value as { months?: unknown; future?: unknown };
  const months = edits.months && typeof edits.months === "object" && !Array.isArray(edits.months)
    ? edits.months as Record<string, MonthlyBillValues>
    : {};
  const future = Array.isArray(edits.future)
    ? edits.future.filter((edit): edit is { from: string; values: RecurringBillValues } => (
        Boolean(edit) && typeof edit === "object" && typeof edit.from === "string" && Boolean(edit.values)
      ))
    : [];
  return { months, future };
};

const getValues = (bill: RecurringBillValues): RecurringBillValues => ({
  name: bill.name,
  amount: bill.amount,
  category: bill.category,
  dueDay: bill.dueDay,
  durationMonths: bill.durationMonths,
  accountId: bill.accountId,
  description: bill.description,
});

export const resolveRecurringBill = (bill: EditableRecurringBill, referenceMonth: string): EditableRecurringBill => {
  const futureEdit = bill.scopedEdits.future.reduce<{ from: string; values: RecurringBillValues } | null>(
    (latest, edit) => edit.from <= referenceMonth && (!latest || edit.from > latest.from) ? edit : latest,
    null,
  );
  const monthEdit = bill.scopedEdits.months[referenceMonth];
  return { ...bill, ...(futureEdit?.values ?? {}), ...(monthEdit ?? {}) };
};

const monthNumber = (month: string) => {
  const [year, monthOfYear] = month.split("-").map(Number);
  return year * 12 + monthOfYear - 1;
};

export const isRecurringBillActiveInMonth = (bill: EditableRecurringBill, referenceMonth: string) => {
  const startMonth = bill.startDate.slice(0, 7);
  if (referenceMonth < startMonth) return false;
  const resolved = resolveRecurringBill(bill, referenceMonth);
  if (resolved.durationMonths == null) return true;
  return monthNumber(referenceMonth) - monthNumber(startMonth) < resolved.durationMonths;
};

export const getMinimumDurationMonths = (startDate: string, protectedMonths: string[]) => {
  const startMonth = startDate.slice(0, 7);
  return Math.max(1, ...protectedMonths.map((month) => monthNumber(month) - monthNumber(startMonth) + 1));
};

export const applyRecurringBillEdit = (
  bill: EditableRecurringBill,
  editedValues: RecurringBillValues,
  scope: RecurringBillEditScope,
  referenceMonth: string,
): EditableRecurringBill => {
  const values = getValues(editedValues);
  if (scope === "all") {
    return { ...bill, ...values, scopedEdits: emptyScopedEdits() };
  }

  const scopedEdits = normalizeScopedEdits(bill.scopedEdits);
  if (scope === "this") {
    const { durationMonths: _durationMonths, ...monthlyValues } = values;
    return {
      ...bill,
      scopedEdits: {
        ...scopedEdits,
        months: { ...scopedEdits.months, [referenceMonth]: monthlyValues },
      },
    };
  }

  return {
    ...bill,
    scopedEdits: {
      months: Object.fromEntries(Object.entries(scopedEdits.months).filter(([month]) => month < referenceMonth)),
      future: [
        ...scopedEdits.future.filter((edit) => edit.from < referenceMonth),
        { from: referenceMonth, values },
      ],
    },
  };
};
