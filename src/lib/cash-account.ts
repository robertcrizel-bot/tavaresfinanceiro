import type { Account } from "@/lib/types";

export const CASH_PAYMENT_METHOD = "Dinheiro";

export const isCashPaymentMethod = (method?: string | null) => method === CASH_PAYMENT_METHOD;

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/**
 * Finds the cash box account used for "Dinheiro" payments.
 * 1) an account with structural type "cash" (forward compatible);
 * 2) fallback: an account named exactly "Dinheiro" (case/accent-insensitive).
 * Returns undefined when nothing matches — never guesses another account.
 */
export const findCashAccount = (accounts: Pick<Account, "id" | "name" | "type">[]) =>
  accounts.find((a) => (a.type as string) === "cash")
  ?? accounts.find((a) => normalize(a.name) === "dinheiro");
