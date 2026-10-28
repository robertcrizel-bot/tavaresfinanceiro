/** Optional CPF is stored as 11 digits. Never log or expose it outside the owner's edit form. */
export const onlyDigits = (value: string) => value.replace(/\D/g, "");

export function isValidCpf(input: string): boolean {
  const value = onlyDigits(input);
  if (!value) return true; // optional for bank/card registration
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const checkDigit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(value[i]) * (len + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return checkDigit(9) === Number(value[9]) && checkDigit(10) === Number(value[10]);
}

export const normalizeOptionalCpf = (input: string) => onlyDigits(input).slice(0, 11);
