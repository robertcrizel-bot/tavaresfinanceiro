import { supabase } from "@/integrations/supabase/client";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export async function seedUserData(userId: string) {
  // Check if user already has data
  const { count } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (count && count > 0) return;

  // Create accounts
  const { data: accs } = await supabase.from("accounts").insert([
    { user_id: userId, name: "Conta Principal", bank: "Nubank", type: "checking", initial_balance: 5200, color: "purple" },
    { user_id: userId, name: "Reserva", bank: "Inter", type: "savings", initial_balance: 12000, color: "orange" },
  ]).select("id");

  // Create credit cards
  const { data: ccs } = await supabase.from("credit_cards").insert([
    { user_id: userId, name: "Nubank Platinum", bank: "Nubank", credit_limit: 8000, closing_day: 20, due_day: 27, color: "purple" },
    { user_id: userId, name: "Inter Gold", bank: "Inter", credit_limit: 5000, closing_day: 15, due_day: 22, color: "orange" },
  ]).select("id");

  const acc1 = accs?.[0]?.id;
  const cc1 = ccs?.[0]?.id;
  const cc2 = ccs?.[1]?.id;

  // Create transactions
  const txs = [
    { title: "Salário Março", amount: 8500, type: "income", category: "Salário", date: daysAgo(1), payment_method: "Transferência", account_id: acc1 },
    { title: "Freelance Website", amount: 2200, type: "income", category: "Freelance", date: daysAgo(5), payment_method: "Pix", account_id: acc1 },
    { title: "Freelance Design", amount: 1500, type: "income", category: "Freelance", date: daysAgo(12), payment_method: "Pix" },
    { title: "Salário Fevereiro", amount: 8500, type: "income", category: "Salário", date: daysAgo(30), payment_method: "Transferência" },
    { title: "Bônus trimestral", amount: 3000, type: "income", category: "Salário", date: daysAgo(15) },

    { title: "Supermercado Extra", amount: 342.5, type: "expense", category: "Alimentação", date: daysAgo(1), payment_method: "Cartão de Débito", account_id: acc1 },
    { title: "iFood - Jantar", amount: 67.9, type: "expense", category: "Alimentação", date: daysAgo(2), payment_method: "Cartão de Crédito", credit_card_id: cc1 },
    { title: "Padaria da esquina", amount: 18.5, type: "expense", category: "Alimentação", date: daysAgo(3), payment_method: "Dinheiro" },
    { title: "Restaurante almoço", amount: 89, type: "expense", category: "Alimentação", date: daysAgo(4), payment_method: "Pix" },
    { title: "Supermercado semanal", amount: 275, type: "expense", category: "Alimentação", date: daysAgo(7), payment_method: "Cartão de Débito" },
    { title: "iFood - Pizza", amount: 52, type: "expense", category: "Alimentação", date: daysAgo(9), payment_method: "Cartão de Crédito", credit_card_id: cc1 },
    { title: "Café especial", amount: 32, type: "expense", category: "Alimentação", date: daysAgo(14), payment_method: "Dinheiro" },

    { title: "Uber para escritório", amount: 28.5, type: "expense", category: "Transporte", date: daysAgo(1), payment_method: "Pix" },
    { title: "Gasolina", amount: 250, type: "expense", category: "Transporte", date: daysAgo(6), payment_method: "Cartão de Débito" },
    { title: "Manutenção carro", amount: 480, type: "expense", category: "Transporte", date: daysAgo(20), payment_method: "Cartão de Crédito", credit_card_id: cc2 },

    { title: "Aluguel apartamento", amount: 2800, type: "expense", category: "Moradia", date: daysAgo(2), payment_method: "Transferência", account_id: acc1 },
    { title: "Conta de luz", amount: 185, type: "expense", category: "Moradia", date: daysAgo(5), payment_method: "Boleto" },
    { title: "Internet fibra", amount: 129.9, type: "expense", category: "Moradia", date: daysAgo(5), payment_method: "Boleto" },
    { title: "Condomínio", amount: 650, type: "expense", category: "Moradia", date: daysAgo(2), payment_method: "Boleto" },

    { title: "Cinema", amount: 48, type: "expense", category: "Lazer", date: daysAgo(3), payment_method: "Cartão de Crédito", credit_card_id: cc1 },
    { title: "Spotify Premium", amount: 21.9, type: "expense", category: "Lazer", date: daysAgo(7), payment_method: "Cartão de Crédito", credit_card_id: cc1 },
    { title: "Netflix", amount: 55.9, type: "expense", category: "Lazer", date: daysAgo(7), payment_method: "Cartão de Crédito", credit_card_id: cc1 },

    { title: "Consulta médica", amount: 350, type: "expense", category: "Saúde", date: daysAgo(4), payment_method: "Pix" },
    { title: "Academia mensal", amount: 149.9, type: "expense", category: "Saúde", date: daysAgo(10), payment_method: "Cartão de Crédito", credit_card_id: cc2 },
    { title: "Plano de saúde", amount: 520, type: "expense", category: "Saúde", date: daysAgo(2), payment_method: "Boleto" },

    { title: "Curso online Udemy", amount: 49.9, type: "expense", category: "Educação", date: daysAgo(6), payment_method: "Cartão de Crédito", credit_card_id: cc1 },
    { title: "Presente aniversário", amount: 180, type: "expense", category: "Outros", date: daysAgo(12), payment_method: "Pix" },
  ].map((t) => ({ ...t, user_id: userId }));

  await supabase.from("transactions").insert(txs);
}
