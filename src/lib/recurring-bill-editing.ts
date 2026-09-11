export type RecurringBillEditScope = "this" | "future" | "all";
export type RecurringBillDeleteScope = RecurringBillEditScope;

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
  deletedMonths: Record<string, true>;
  deletedFrom: string | null;
}

export interface EditableRecurringBill extends RecurringBillValues {
  id: string;
  startDate: string;
  scopedEdits: RecurringBillScopedEdits;
}

export const emptyScopedEdits = (): RecurringBillScopedEdits => ({
  months: {},
  future: [],
  deletedMonths: {},
  deletedFrom: null,
});

export const normalizeScopedEdits = (value: unknown): RecurringBillScopedEdits => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyScopedEdits();
  const edits = value as { months?: unknown; future?: unknown; deletedMonths?: unknown; deletedFrom?: unknown };
  const months = edits.months && typeof edits.months === "object" && !Array.isArray(edits.months)
    ? edits.months as Record<string, MonthlyBillValues>
    : {};
  const future = Array.isArray(edits.future)
    ? edits.future.filter((edit): edit is { from: string; values: RecurringBillValues } => (
        Boolean(edit) && typeof edit === "object" && typeof edit.from === "string" && Boolean(edit.values)
      ))
    : [];
  const deletedMonths = edits.deletedMonths && typeof edits.deletedMonths === "object" && !Array.isArray(edits.deletedMonths)
    ? Object.fromEntries(
        Object.entries(edits.deletedMonths)
          .filter(([, deleted]) => deleted === true)
          .map(([month]) => [month, true] as const),
      )
    : {};
  const deletedFrom = typeof edits.deletedFrom === "string" ? edits.deletedFrom : null;
  return { months, future, deletedMonths, deletedFrom };
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
  const scopedEdits = normalizeScopedEdits(bill.scopedEdits);
  if (scopedEdits.deletedMonths[referenceMonth]) return false;
  if (scopedEdits.deletedFrom && referenceMonth >= scopedEdits.deletedFrom) return false;
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
    const { deletedMonths, deletedFrom } = normalizeScopedEdits(bill.scopedEdits);
    return { ...bill, ...values, scopedEdits: { ...emptyScopedEdits(), deletedMonths, deletedFrom } };
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
      ...scopedEdits,
      months: Object.fromEntries(Object.entries(scopedEdits.months).filter(([month]) => month < referenceMonth)),
      future: [
        ...scopedEdits.future.filter((edit) => edit.from < referenceMonth),
        { from: referenceMonth, values },
      ],
    },
  };
};

export const applyRecurringBillDeletion = (
  bill: EditableRecurringBill,
  scope: RecurringBillDeleteScope,
  referenceMonth: string,
): EditableRecurringBill => {
  const scopedEdits = normalizeScopedEdits(bill.scopedEdits);

  if (scope === "this") {
    return {
      ...bill,
      scopedEdits: {
        ...scopedEdits,
        deletedMonths: { ...scopedEdits.deletedMonths, [referenceMonth]: true },
      },
    };
  }

  const deletedFrom = scope === "all"
    ? bill.startDate.slice(0, 7)
    : !scopedEdits.deletedFrom || referenceMonth < scopedEdits.deletedFrom
      ? referenceMonth
      : scopedEdits.deletedFrom;

  return {
    ...bill,
    scopedEdits: {
      ...scopedEdits,
      deletedMonths: Object.fromEntries(
        Object.entries(scopedEdits.deletedMonths).filter(([month]) => month < deletedFrom),
      ),
      deletedFrom,
    },
  };
};
