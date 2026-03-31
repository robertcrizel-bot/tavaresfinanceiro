import { Transaction } from "./types";

function d(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split("T")[0];
}

let id = 0;
const t = (
  title: string,
  amount: number,
  type: "income" | "expense",
  category: Transaction["category"],
  daysAgo: number,
  description?: string,
  paymentMethod?: Transaction["paymentMethod"]
): Transaction => ({
  id: String(++id),
  title,
  amount,
  type,
  category,
  date: d(daysAgo),
  description,
  paymentMethod,
});

export const initialTransactions: Transaction[] = [
  t("Salário Março", 8500, "income", "Salário", 1, "Pagamento mensal", "Transferência"),
  t("Freelance Website", 2200, "income", "Freelance", 5, "Projeto para cliente X", "Pix"),
  t("Freelance Design", 1500, "income", "Freelance", 12, undefined, "Pix"),
  t("Salário Fevereiro", 8500, "income", "Salário", 30, undefined, "Transferência"),
  t("Bônus trimestral", 3000, "income", "Salário", 15),

  t("Supermercado Extra", 342.5, "expense", "Alimentação", 1, undefined, "Cartão de Débito"),
  t("iFood - Jantar", 67.9, "expense", "Alimentação", 2, undefined, "Cartão de Crédito"),
  t("Padaria da esquina", 18.5, "expense", "Alimentação", 3, undefined, "Dinheiro"),
  t("Restaurante almoço", 89, "expense", "Alimentação", 4, undefined, "Pix"),
  t("Supermercado semanal", 275, "expense", "Alimentação", 7, undefined, "Cartão de Débito"),
  t("iFood - Pizza", 52, "expense", "Alimentação", 9, undefined, "Cartão de Crédito"),
  t("Café especial", 32, "expense", "Alimentação", 14, undefined, "Dinheiro"),
  t("Almoço trabalho", 45, "expense", "Alimentação", 18, undefined, "Pix"),

  t("Uber para escritório", 28.5, "expense", "Transporte", 1, undefined, "Pix"),
  t("Gasolina", 250, "expense", "Transporte", 6, undefined, "Cartão de Débito"),
  t("Estacionamento shopping", 15, "expense", "Transporte", 8, undefined, "Dinheiro"),
  t("Uber viagem", 42, "expense", "Transporte", 13, undefined, "Cartão de Crédito"),
  t("Manutenção carro", 480, "expense", "Transporte", 20, undefined, "Cartão de Crédito"),

  t("Aluguel apartamento", 2800, "expense", "Moradia", 2, "Aluguel mensal", "Transferência"),
  t("Conta de luz", 185, "expense", "Moradia", 5, undefined, "Boleto"),
  t("Internet fibra", 129.9, "expense", "Moradia", 5, undefined, "Boleto"),
  t("Conta de água", 95, "expense", "Moradia", 10, undefined, "Boleto"),
  t("Condomínio", 650, "expense", "Moradia", 2, undefined, "Boleto"),

  t("Cinema", 48, "expense", "Lazer", 3, undefined, "Cartão de Crédito"),
  t("Spotify Premium", 21.9, "expense", "Lazer", 7, undefined, "Cartão de Crédito"),
  t("Netflix", 55.9, "expense", "Lazer", 7, undefined, "Cartão de Crédito"),
  t("Jantar fora amigos", 156, "expense", "Lazer", 11, undefined, "Pix"),
  t("Livro novo", 62, "expense", "Lazer", 16, undefined, "Pix"),

  t("Consulta médica", 350, "expense", "Saúde", 4, undefined, "Pix"),
  t("Farmácia", 87.5, "expense", "Saúde", 8, undefined, "Cartão de Débito"),
  t("Academia mensal", 149.9, "expense", "Saúde", 10, undefined, "Cartão de Crédito"),
  t("Plano de saúde", 520, "expense", "Saúde", 2, undefined, "Boleto"),

  t("Curso online Udemy", 49.9, "expense", "Educação", 6, undefined, "Cartão de Crédito"),
  t("Livro técnico", 89, "expense", "Educação", 19, undefined, "Pix"),

  t("Presente aniversário", 180, "expense", "Outros", 12, undefined, "Pix"),
  t("Doação", 100, "expense", "Outros", 22, undefined, "Transferência"),
];
