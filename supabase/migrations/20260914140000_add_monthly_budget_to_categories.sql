ALTER TABLE public.categories
ADD COLUMN monthly_budget NUMERIC(14, 2)
CONSTRAINT categories_monthly_budget_expense_positive
CHECK (
  monthly_budget IS NULL
  OR (
    type = 'expense'
    AND monthly_budget > 0
    AND monthly_budget <> 'NaN'::numeric
  )
);
