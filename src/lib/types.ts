export type TransactionType = "income" | "expense";

export type Category =
  | "Alimentação"
  | "Transporte"
  | "Moradia"
  | "Lazer"
  | "Saúde"
  | "Educação"
  | "Salário"
  | "Freelance"
  | "Fatura Cartão"
  | "Outros";

export type PaymentMethod =
  | "Dinheiro"
  | "Cartão de Crédito"
  | "Cartão de Débito"
  | "Pix"
  | "Transferência"
  | "Boleto"
  | "Outro";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "Dinheiro",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Pix",
  "Transferência",
  "Boleto",
  "Outro",
];

export interface Account {
  id: string;
  name: string;
  bank: string;
  type: "checking" | "savings";
  initialBalance: number;
  color: string; // tailwind color key
}

export interface CreditCard {
  id: string;
  name: string;
  bank: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  color: string;
}

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: Category;
  date: string; // ISO string
  description?: string;
  paymentMethod?: PaymentMethod;
  accountId?: string;
  creditCardId?: string;
}

export const EXPENSE_CATEGORIES: Category[] = [
  "Alimentação",
  "Transporte",
  "Moradia",
  "Lazer",
  "Saúde",
  "Educação",
  "Fatura Cartão",
  "Outros",
];

export const INCOME_CATEGORIES: Category[] = ["Salário", "Freelance", "Outros"];

export const ALL_CATEGORIES: Category[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
];
