/**
 * The forecast settlement date comes from bill_payments.paid_at, not the
 * recurring bill's scheduled due day. Treat its YYYY-MM-DD prefix as a
 * calendar date so timezone conversion cannot move it to the previous day.
 */
export function formatForecastEffectiveDate(paidAt: string | null | undefined): string | null {
  if (!paidAt) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(paidAt);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null;
  return `${day}/${month}/${year}`;
}
