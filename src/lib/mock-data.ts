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
  description?: string
): Transaction => ({
  id: String(++id),
  title,
  amount,
  type,
  category,
  date: d(daysAgo),
  description,
});

export const initialTransactions: Transaction[] = [
  t("Salário Março", 8500, "income", "Salário", 1, "Pagamento mensal"),
  t("Freelance Website", 2200, "income", "Freelance", 5, "Projeto para cliente X"),
  t("Freelance Design", 1500, "income", "Freelance", 12),
  t("Salário Fevereiro", 8500, "income", "Salário", 30),
  t("Bônus trimestral", 3000, "income", "Salário", 15),

  t("Supermercado Extra", 342.5, "expense", "Alimentação", 1),
  t("iFood - Jantar", 67.9, "expense", "Alimentação", 2),
  t("Padaria da esquina", 18.5, "expense", "Alimentação", 3),
  t("Restaurante almoço", 89, "expense", "Alimentação", 4),
  t("Supermercado semanal", 275, "expense", "Alimentação", 7),
  t("iFood - Pizza", 52, "expense", "Alimentação", 9),
  t("Café especial", 32, "expense", "Alimentação", 14),
  t("Almoço trabalho", 45, "expense", "Alimentação", 18),

  t("Uber para escritório", 28.5, "expense", "Transporte", 1),
  t("Gasolina", 250, "expense", "Transporte", 6),
  t("Estacionamento shopping", 15, "expense", "Transporte", 8),
  t("Uber viagem", 42, "expense", "Transporte", 13),
  t("Manutenção carro", 480, "expense", "Transporte", 20),

  t("Aluguel apartamento", 2800, "expense", "Moradia", 2, "Aluguel mensal"),
  t("Conta de luz", 185, "expense", "Moradia", 5),
  t("Internet fibra", 129.9, "expense", "Moradia", 5),
  t("Conta de água", 95, "expense", "Moradia", 10),
  t("Condomínio", 650, "expense", "Moradia", 2),

  t("Cinema", 48, "expense", "Lazer", 3),
  t("Spotify Premium", 21.9, "expense", "Lazer", 7),
  t("Netflix", 55.9, "expense", "Lazer", 7),
  t("Jantar fora amigos", 156, "expense", "Lazer", 11),
  t("Livro novo", 62, "expense", "Lazer", 16),

  t("Consulta médica", 350, "expense", "Saúde", 4),
  t("Farmácia", 87.5, "expense", "Saúde", 8),
  t("Academia mensal", 149.9, "expense", "Saúde", 10),
  t("Plano de saúde", 520, "expense", "Saúde", 2),

  t("Curso online Udemy", 49.9, "expense", "Educação", 6),
  t("Livro técnico", 89, "expense", "Educação", 19),

  t("Presente aniversário", 180, "expense", "Outros", 12),
  t("Doação", 100, "expense", "Outros", 22),
];
