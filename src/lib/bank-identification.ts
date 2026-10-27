/** Normalize optional CPF identifiers before sending to the owner-only database. */
export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

export function formatCpfInput(value: string): string {
  const digits = normalizeCpf(value);
  return [
    digits.slice(0, 3),
    digits.length > 3 ? digits.slice(3, 6) : "",
    digits.length > 6 ? digits.slice(6, 9) : "",
  ].filter(Boolean).join(".") + (digits.length > 9 ? "-" + digits.slice(9) : "");
}

export function isValidCpf(value: string): boolean {
  const digits = normalizeCpf(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calculateDigit = (length: number) => {
    const sum = Array.from({ length }, (_, index) => Number(digits[index]) * (length + 1 - index))
      .reduce((total, number) => total + number, 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculateDigit(9) === Number(digits[9]) && calculateDigit(10) === Number(digits[10]);
}

/** Never show an account number in full outside its authenticated edit form. */
export function maskAccountNumber(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  return "••••" + normalized.replace(/\s/g, "").slice(-4);
}

export function normalizeCardLastFour(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}
