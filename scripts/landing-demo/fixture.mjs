// Fictional marketing dataset. Never imported by the application or persisted.
export const referenceDate = '2026-10-24T15:00:00.000Z';
export const accounts = [
  { id: 'demo-main', name: 'Conta principal', bank: 'Banco Demo', type: 'checking', initialBalance: 1800, color: 'emerald' },
  { id: 'demo-savings', name: 'Reserva', bank: 'Banco Demo', type: 'savings', initialBalance: 4200, color: 'blue' },
  { id: 'demo-cash', name: 'Carteira', bank: '', type: 'checking', initialBalance: 240, color: 'amber' },
];
export const creditCards = [
  { id: 'demo-card', name: 'Cartão do dia a dia', bank: 'Banco Demo', limit: 6000, closingDay: 3, dueDay: 10, color: 'purple', cardBrand: 'Demo', cardLastFour: '0000' },
  { id: 'demo-virtual', name: 'Cartão virtual', bank: 'Banco Demo', limit: 2000, closingDay: 3, dueDay: 10, color: 'blue', cardBrand: 'Demo', cardLastFour: '0001' },
  { id: 'demo-family', name: 'Cartão da família', bank: 'Banco Demo', limit: 3500, closingDay: 3, dueDay: 10, color: 'emerald', cardBrand: 'Demo', cardLastFour: '0002' },
];
export const creditCardInvoices = [
  { id: 'demo-invoice', creditCardId: 'demo-card', competence: '2026-11', cycleStart: '2026-10-04', cycleEnd: '2026-11-03', dueDate: '2026-11-10', status: 'OPEN' },
  { id: 'demo-invoice-virtual', creditCardId: 'demo-virtual', competence: '2026-11', cycleStart: '2026-10-04', cycleEnd: '2026-11-03', dueDate: '2026-11-10', status: 'OPEN' },
  { id: 'demo-invoice-family', creditCardId: 'demo-family', competence: '2026-11', cycleStart: '2026-10-04', cycleEnd: '2026-11-03', dueDate: '2026-11-10', status: 'OPEN' },
];
const notes = {
  Estacionamento: 'Estacionamento no centro da cidade',
  Delivery: 'Pedido de hambúrguer e batata frita',
  'Presente de aniversário': 'Presente comprado para aniversário',
  Academia: 'Mensalidade da academia — outubro',
  Restaurante: 'Almoço de domingo em família',
  Streaming: 'Assinatura mensal de streaming',
  'Transporte por aplicativo': 'Corrida até o centro da cidade',
  'Consulta médica': 'Consulta médica particular',
};
const rows = [
  // day, description, category, amount, origin, installment number, installments
  [1, 'Salário de outubro', 'Salário', 6800, 'income'],
  [2, 'Aluguel', 'Moradia', 1650, 'pix'],
  [3, 'Internet residencial', 'Moradia', 119, 'pix'],
  [4, 'Supermercado da semana', 'Alimentação', 312.80, 'debit'],
  [5, 'Notebook · parcela 3/10', 'Educação', 289.90, 'card', 3, 10],
  [6, 'Combustível', 'Transporte', 180, 'debit'],
  [7, 'Farmácia', 'Saúde', 78.60, 'debit'],
  [8, 'Café e almoço', 'Alimentação', 38.50, 'cash'],
  [9, 'Energia elétrica', 'Moradia', 186.40, 'pix'],
  [10, 'Feira da semana', 'Alimentação', 86.40, 'pix'],
  [11, 'Cinema', 'Lazer', 64, 'card-family'],
  [12, 'Curso de idiomas', 'Educação', 259.90, 'pix'],
  [13, 'Água', 'Moradia', 72.35, 'pix'],
  [14, 'Viagem · parcela 2/6', 'Lazer', 175, 'card', 2, 6],
  [15, 'Projeto freelance', 'Freelance', 1740, 'income'],
  [16, 'Supermercado', 'Alimentação', 248.70, 'card'],
  [17, 'Consulta médica', 'Saúde', 220, 'pix'],
  [18, 'Transporte por aplicativo', 'Transporte', 32.90, 'pix'],
  [19, 'Streaming', 'Lazer', 39.90, 'card-virtual'],
  [20, 'Restaurante', 'Alimentação', 89.90, 'card-family'],
  [21, 'Academia', 'Saúde', 149.90, 'pix'],
  [22, 'Presente de aniversário', 'Outros', 149.90, 'card'],
  [23, 'Delivery', 'Alimentação', 54.90, 'card-virtual'],
  [24, 'Estacionamento', 'Transporte', 18, 'cash'],
];
export const transactions = rows.map(([day, title, category, amount, origin, installmentNumber, installments], index) => ({
  id: `demo-tx-${index + 1}`, title, category, amount,
  date: `2026-10-${String(day).padStart(2, '0')}`,
  createdAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`,
  type: origin === 'income' ? 'income' : 'expense',
  paymentMethod: origin.startsWith('card') ? 'Cartão de Crédito' : origin === 'debit' ? 'Cartão de Débito' : origin === 'cash' ? 'Dinheiro' : 'Pix',
  accountId: origin.startsWith('card') ? undefined : origin === 'cash' ? 'demo-cash' : 'demo-main',
  creditCardId: origin.startsWith('card') ? origin === 'card' ? 'demo-card' : origin.replace('card-', 'demo-') : undefined,
  creditCardInvoiceId: origin.startsWith('card') ? origin === 'card' ? 'demo-invoice' : origin.replace('card-', 'demo-invoice-') : undefined,
  financialKind: origin.startsWith('card') ? 'card_purchase' : 'regular',
  installmentNumber, installments,
  isPaid: !origin.startsWith('card'),
  description: notes[title] ?? '',
}));
// A comparison month makes the actual analytics evolution and deltas meaningful.
export const previousTransactions = transactions.map((transaction, index) => ({
  ...transaction, id: `demo-previous-${index + 1}`,
  date: transaction.date.replace('2026-10', '2026-09'),
  createdAt: transaction.createdAt.replace('2026-10', '2026-09'),
  amount: transaction.type === 'income' ? transaction.amount : Math.round(transaction.amount * (index % 2 ? 1.12 : .92) * 100) / 100,
  creditCardId: undefined, creditCardInvoiceId: undefined,
  financialKind: 'regular', paymentMethod: 'Pix', accountId: 'demo-main', isPaid: true,
}));
const budgets = { Moradia: 2300, Alimentação: 1100, Transporte: 450, Saúde: 550, Lazer: 400, Educação: 650, Outros: 400 };
export const categories = Object.entries(budgets).map(([name, monthlyBudget], index) => ({ id: `demo-cat-${index}`, name, monthlyBudget, type: 'expense' }));
categories.push({ id: 'demo-salary', name: 'Salário', monthlyBudget: null, type: 'income' }, { id: 'demo-freelance', name: 'Freelance', monthlyBudget: null, type: 'income' });
export const bills = [
  ['Aluguel', 1650, 'Moradia', 2], ['Internet residencial', 119, 'Moradia', 3],
  ['Energia elétrica', 186.40, 'Moradia', 9], ['Curso de idiomas', 259.90, 'Educação', 12],
  ['Academia', 149.90, 'Saúde', 21], ['Seguro residencial', 84.90, 'Moradia', 27],
  ['Salário de outubro', 6800, 'Salário', 1, 'income'], ['Projeto freelance', 1740, 'Freelance', 15, 'income'],
].map(([name, amount, category, dueDay, type = 'expense'], index) => ({
  id: `demo-bill-${index}`, name, amount, category, dueDay, type, startDate: '2026-09-01',
  durationMonths: null, accountId: 'demo-main', description: 'Previsão fictícia',
  scopedEdits: { months: {}, future: [], deletedMonths: {}, deletedFrom: null },
}));
export const payments = bills.slice(0, 5).map((bill, index) => ({
  id: `demo-payment-${index}`, recurringBillId: bill.id, referenceMonth: '2026-10',
  paidAt: `2026-10-${String(bill.dueDay).padStart(2, '0')}`, transactionId: transactions.find(t => t.title === bill.name)?.id ?? null,
}));
export const transfers = [];

export const summary = {
  label: 'DEMO — dados fictícios', period: 'Outubro de 2026',
  transactions: transactions.length,
  income: transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
  expense: Math.round(transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0) * 100) / 100,
};
summary.balance = Math.round((summary.income - summary.expense) * 100) / 100;
