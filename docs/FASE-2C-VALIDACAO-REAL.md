# Fase 2C — validação real e plano de aplicação

Data: 2026-10-16. Base main: `26980125c7e450dc176e8eeaf47f76666f481a27`.
Branch exclusiva: `test/financial-phase2c-supabase`.
Commit de código validado: `fc67501b5895c2cb67bc94891bb78b9f9f6b0a1a`.
[CI aprovado](https://github.com/robertcrizel-bot/tavaresfinanceiro/actions/runs/38921790562).

## Evidência

GitHub Actions aplicou as 18 migrations versionadas em um projeto **não
vinculado**, criado em RUNNER_TEMP com Supabase CLI `2.121.0`. Rodaram PostgreSQL,
Auth, PostgREST e RLS reais; não foram usados bootstrap/mocks. Os arquivos antigos
`bootstrap.sql` e `compose.yaml` foram preservados, mas não participam do CI.
Não foram copiados `.env`, config do projeto real, links ou segredos de produção.
A stack foi parada com `--no-backup` no final.

**16 grupos aprovados**, cobrindo:

- Signup e sessão reais, JWT validado por Auth, RPCs HTTP e leitura/escrita com RLS.
- Recusa de anon/outro dono, conta/cartão estrangeiro e acesso à tabela privada.
- Marcação concorrente com chave igual/diferente, resposta perdida e parâmetros incompatíveis.
- Falha na criação do vínculo: transação e reserva idempotente não persistem.
- Falha na segunda exclusão: lançamento, FK e pagamento são restaurados.
- Desmarcar/remarcar/replay não remove o pagamento substituto; saldo exato.
- Falha de fechamento após restauração: compras, faturas, obrigação e reserva voltam ao snapshot anterior.
- Seleções inválidas/conflitantes; fechamento concorrente cria uma única obrigação.
- Reabertura incrementa versão; replay antigo não fecha uma nova geração.
- Proteção de compra fechada; pagamento e estorno restauram o caixa exatamente.
- Precedência base/future/this, vigência, exclusões e recusa de tipo desconhecido.
- Vínculos legados nulos/compartilhados recusados sem apagar dados financeiros.
- Fechamento HTTP autenticado, exclusão total e crédito negativo sem débito de caixa.

Falhas parciais são injetadas por triggers **somente de teste**. O executor compara
snapshots integrais de transações, pagamentos, faturas e reservas antes/depois,
além de conferir IDs, contagens e saldos. As falhas injetadas são reconhecidas
pelo erro esperado, evitando aprovar um rollback que falhou antes do ponto testado.

A primeira execução encontrou erro no executor: o driver exige OID numérico
para arrays UUID, corrigido para `2950` e cast `uuid[]`. A suíte foi repetida e
aprovada; não foi necessário alterar as três RPCs para esses casos.

## Correção do esquema

`20261016115000_reconcile_recurring_bill_type.sql` cria `recurring_bills.type`
somente se ausente e exige tipo SQL text/varchar. Não define default, não
preenche registros e não impõe NOT NULL. CHECK NOT VALID restringe novas
escritas a income/expense ou NULL sem presumir a situação dos dados legados.
RPC recusa classificação desconhecida. Se a coluna já existir, seus valores
são preservados. Nenhum esquema de produção foi consultado ou presumido igual.

As outras migrations preparam `mark_forecast_payment`,
`unmark_forecast_payment` e `close_credit_card_invoice_atomic`, com funções
privadas para reserva/resultado idempotente. EXECUTE é restrito, auth.uid() é
obrigatório, donos são conferidos e search_path é fixo. SECURITY DEFINER exige
manter essas verificações e revisão de segurança em alterações futuras.

## Limites

A atomicidade está comprovada para os cenários executados nas novas RPCs.
Isso não certifica dados ou configuração de produção, nem elimina todos os
deadlocks possíveis. Escritas diretas e RPCs antigas ainda não seguem o novo
protocolo. Nenhuma garantia global deve ser anunciada antes de migrar clientes
e restringir esses caminhos. Retries de deadlock/timeout conservam a chave e
os parâmetros; resposta perdida exige consultar/repetir a mesma intenção.

O CI não usou produção. Não houve merge em main, deploy de frontend/migrations,
nem alterações em Gemma, câmera ou Workers.

## Plano seguro — execução depende de nova autorização

1. Autorizar auditoria somente leitura de esquema e dados legados; comparar
   colunas, grants, policies, triggers e histórico de migrations. Identificar
   previsões sem tipo, vínculos nulos/compartilhados e divergências de dono.
   Propor reconciliação explícita por ID; não inferir classificação ou apagar dados.
2. Obter backup consistente/PITR e registrar ponto de recuperação. Confirmar
   restauração em ambiente isolado antes da janela de mudança; guardar também
   definições SQL, grants e contagens/saldos para comparação.
3. Validar a compatibilidade em clone autorizado e testar antecipação/atraso de
   fechamento, concorrência com clientes antigos e retries sob carga. Aprovar
   revisão de segurança e plano de retenção do registro idempotente.
4. Autorizar aplicação aditiva das migrations em janela controlada, sem limpeza
   automática. Comparar resultados da auditoria antes de qualquer constraint
   VALIDATE, NOT NULL, UNIQUE adicional ou correção de dados.
5. Migrar o frontend: uma RPC por intenção; UUID persistido até resposta
   confirmada; mesma chave após perda de resposta; versão esperada de fatura;
   tipos gerados, erros de conflito explícitos e testes. Remover as escritas
   financeiras separadas. Fazer rollout controlado e observar erros/saldos.
6. Após confirmar migração dos clientes, restringir policies/grants de escrita
   direta e RPCs antigas mediante autorização separada. Não manter caminhos
   paralelos que permitam criar transações órfãs.
7. Em falha, pausar novas intenções e o rollout. Preservar logs, chaves e dados;
   reconciliar resultado confirmado com transações antes de repetir. Não apagar
   reservas ou fazer DELETE compensatório cego. Manter esquema aditivo quando
   já houver operações confirmadas. Se recuperação de backup/PITR for necessária,
   restaurar primeiro isoladamente, comparar movimentos posteriores e aprovar
   o ponto de recuperação e a troca antes de afetar o ambiente real.

Este plano não autoriza sua própria aplicação. Produção exige autorização
específica para auditoria, backup/clone, migrations, reconciliação, frontend e rollout.
