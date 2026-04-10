

## Plano: Aba "Previsões" — Contas Recorrentes

### O que será criado

Uma nova seção no app chamada **Previsões** onde você cadastra despesas recorrentes (aluguel, energia, água, internet, etc.) informando:
- Nome da despesa
- Valor
- Categoria
- Dia do vencimento
- Conta vinculada (opcional)
- Quantidade de meses (ou "indefinido"/recorrente)
- Data de início

O sistema gera automaticamente uma **linha do tempo** mostrando os próximos vencimentos, com status visual (pendente, vencido, pago) e um resumo do total previsto para o mês.

### Funcionalidades

1. **CRUD de previsões** — Criar, editar e excluir despesas recorrentes
2. **Visão mensal** — Calendário/lista mostrando as contas do mês com status (a vencer, vencida, paga)
3. **Resumo** — Cards no topo com total previsto, total pago e total pendente do mês
4. **Marcar como paga** — Ao marcar, cria automaticamente um registro real na aba de Registros
5. **Indicadores visuais** — Cores para status: verde (pago), amarelo (a vencer), vermelho (vencido)

### Etapas técnicas

1. **Nova tabela `recurring_bills`** no banco de dados:
   - `id`, `user_id`, `name`, `amount`, `category`, `due_day` (dia do mês), `start_date`, `duration_months` (null = indefinido), `account_id` (opcional), `description`, `created_at`, `updated_at`
   - RLS para privacidade por usuário

2. **Nova tabela `bill_payments`** para rastrear quais meses já foram pagos:
   - `id`, `user_id`, `recurring_bill_id`, `reference_month` (ex: "2026-04"), `paid_at`, `transaction_id` (link com o registro criado)
   - RLS por usuário

3. **Nova página `src/pages/Forecasts.tsx`**:
   - Seletor de mês (navegar entre meses)
   - Lista de contas do mês com status visual
   - Botão para marcar como paga (cria transação automaticamente)
   - Dialog para adicionar/editar previsão recorrente
   - Cards KPI: Total Previsto, Pago, Pendente

4. **Integração com navegação**:
   - Adicionar rota `/forecasts` no `App.tsx`
   - Adicionar item "Previsões" no `AppSidebar.tsx` e `BottomNav.tsx` (ícone CalendarClock)

5. **Contexto `ForecastContext`**:
   - CRUD de recurring_bills
   - Lógica para calcular quais contas vencem em determinado mês
   - Função para marcar como paga (insere em `bill_payments` + cria transação via `FinanceContext`)

