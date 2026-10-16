# Fase 2C — implementação local, ainda sem validação PostgreSQL

Base: `26980125c7e450dc176e8eeaf47f76666f481a27`.
Worktree: `.worktrees/financial-phase2c`, branch `dev/financial-phase2c`.
Nenhum push, deploy, conexão ou SQL em Supabase de produção nesta etapa.

## Entrega

- `20261016120000_atomic_forecast_payments.sql`: `mark_forecast_payment` e
  `unmark_forecast_payment`; reserva/resultado idempotente em schema privado.
- `20261016121000_atomic_invoice_close.sql`: `close_credit_card_invoice_atomic`,
  restauração e fechamento na mesma função, com controle de versão da fatura.
- `scripts/prepare-phase2c-close.cjs`: derivação reproduzível da última RPC de
  fechamento versionada (`20261007150000`), mantendo datas, exclusões, crédito
  transportado, classificação e consolidação. Escreve somente o arquivo SQL local.
- `supabase/tests/phase2c`: container PostgreSQL descartável e executor de testes
  reais preparados, **não executados por ausência do servidor**.

## Contratos e segurança

Cada intenção recebe um UUID persistido pelo cliente; retries usam os mesmos
parâmetros e UUID, inclusive após resposta perdida. A reserva, os efeitos e o
resultado são uma única transação. Exceções não são convertidas em sucesso.
Chave reutilizada com parâmetros diferentes é conflito. Outra chave para uma
competência já paga é conflito, sem criar transação adicional. Não expirar as
chaves enquanto houver possibilidade de replay.

As três RPCs exigem `auth.uid()`, não aceitam user_id do navegador, fixam
`search_path = ''`, qualificam tabelas e verificam propriedade dos objetos.
EXECUTE de PUBLIC/anon é revogado e concedido somente a authenticated.
SECURITY DEFINER é necessário para manter o registro idempotente inacessível
por DML direto e atualizar faturas, cuja RLS não permite escrita pelo cliente.
Isso **contorna a RLS internamente**: as verificações explícitas de dono e os
testes de segurança precisam de revisão antes de implantação. As tabelas
existentes mantêm suas políticas; a tabela privada tem RLS sem política/grant
para clientes. Helpers privados não são executáveis por clientes.

Marcar resolve base → última edição future → edição this no servidor, valida
vigência, exclusão, tipo, valor em centavos, conta/cartão e método. Mantém a
semântica atual de overflow do dia de vencimento. INSERT da transação e do
vínculo estão na mesma função. Triggers financeiros continuam ativos.

Desmarcar exige ID exato do pagamento, previsão e competência. Pagamento já
ausente retorna removed=false; nunca procura um substituto. FK nula,
compartilhamento de transação, dono divergente e fatura protegida são recusados.
Falha após DELETE da transação desfaz também o SET NULL da FK e a reserva.

Fechar exige `p_expected_version` da fatura. Um trigger incrementa
`operation_version` em cada UPDATE, inclusive reabertura/pagamento/estorno.
Replay da chave antiga só devolve o resultado original; outra chave com versão
antiga é recusada. Seleções são ordenadas/deduplicadas; IDs nulos, conflitantes,
estrangeiros, de outro cartão ou de fatura protegida são recusados. Restauração
aceita compras/estornos/ajustes da próxima fatura OPEN, conforme o fluxo atual.
Contagens de UPDATE são conferidas. O contexto `app.invoice_operation` é
restaurado ao retornar. Falha desfaz restauração, movimentos e obrigação.

O cleanup de fatura vazia passa a preservar faturas durante `close`: mover a
última compra não pode apagar a fatura no meio do fechamento. Isso também afeta
a RPC antiga e requer regressão local para total zero/negativo e todas as
exclusões. Faturas de origem vazias podem permanecer OPEN, sem impacto de saldo.

Novas operações serializam por usuário via advisory lock; depois bloqueiam
previsão, cartão, faturas e transações em ordem definida. Escritores antigos
não seguem esse protocolo: deadlocks ainda podem ocorrer e devem abortar por
inteiro; retry conserva a chave. Não há promessa de ausência de deadlocks.

## Validação e bloqueios

Botão publicado separadamente: commit `2698012`; 35 testes do leitor,
TypeScript app/node, build e revisão de diff aprovados. Bundle público
`/assets/index-GevjpHdU.js`, CSS `/assets/index-Bsffg2A4.css` confirmados em
`https://tavares1989finance.lovable.app` após deploy direto do Lovable, sem agente.

Nesta fase: sintaxe JavaScript dos executores verificada; revisão estática e
diff verificados. Não confundir isso com validação de SQL, RLS ou atomicidade.
Docker, psql, pg_ctl e Supabase CLI não encontrados no PATH; nenhuma instalação
PostgreSQL/Docker encontrada nos diretórios de programas/serviços verificados.
Tentativa do executor: `ECONNREFUSED 127.0.0.1:55432` antes de qualquer SQL.
**Zero testes PostgreSQL executados. Implementação ainda não liberada.**

Há divergência de baseline: os tipos gerados e o frontend usam
`recurring_bills.type`, mas a cadeia de migrations não cria a coluna. A RPC
recusa tipo ausente em vez de inferir despesa. O executor adiciona uma coluna
nullable somente como fixture local e insere tipos explícitos nos dados
sintéticos. Isso não resolve nem comprova a situação de produção. Recuperar a
migration original ou propor reconciliação explícita antes da liberação.

## Como validar quando houver Docker local

Na raiz deste worktree:

```sh
docker compose -f supabase/tests/phase2c/compose.yaml up -d
node supabase/tests/phase2c/run.mjs
```

O servidor usa tmpfs, porta vinculada só a 127.0.0.1 e banco chamado
`financecontrol_phase2c_disposable`. O executor não aceita URL/env de produção,
recusa banco não vazio e não limpa dados existentes. Após uma execução, usar
outro container descartável vazio para repetir. Não reutilizar banco real.

O bootstrap emula somente auth.uid()/roles e objetos mínimos de storage para
aplicar a cadeia completa em PostgreSQL real. RLS, funções, locks e triggers
são os do PostgreSQL; autenticação JWT/API/storage completos não são emulados.
Repetir depois em Supabase local completo, corrigindo a lacuna de baseline.

A suíte preparada cobre autenticação, outro dono, RLS de leitura, tabela
privada, conta estrangeira, valor inválido, falha no vínculo, mesma chave
concorrente/resposta perdida, chaves distintas concorrentes, parâmetros
incompatíveis, falha após exclusão, desmarcar/remarcar/replay, saldo da conta,
falha no fechamento após restauração, IDs inválidos/conflitantes, fechamento
concorrente, obrigação única, reabertura/versionamento, proteção de compra
fechada, pagamento e estorno com restauração exata de caixa.

Ainda exigir testes de stress e matriz ampliada: cartão estrangeiro,
escopos this/future/all, dados legados com FK nula/vínculos compartilhados,
zero/negativo, exclusões totais, fechamento antecipado/tardio, falhas em cada
trigger, concorrência com RPCs antigas/escrita direta e detecção/retry de
deadlock. Nenhum desses resultados é presumido aprovado.

## Antes de qualquer banco real

1. Concluir testes reais e revisão de segurança; reconciliar a cadeia SQL.
2. Autorizar separadamente auditoria de dados legados, somente leitura.
   Preparar correções por ID sem apagar dados nem impor UNIQUE às cegas.
3. Integrar cliente: uma RPC por intenção, chave persistente, versão esperada,
   tipos gerados e testes. Os INSERTs/DELETEs/UPDATEs atuais permanecem intactos
   neste worktree; enquanto existirem, a garantia não abrange todos os clientes.
4. Planejar desativação dos caminhos antigos, inclusive grants/policies e
   sobrecargas antigas de RPC, após migração dos clientes. Definir retenção das
   chaves e recuperação de intenções com resposta perdida.
5. Obter autorização específica para migrations, eventual reconciliação de
   dados, rollout do cliente e publicação, com backup e plano de recuperação.

Esta entrega não concede nem utiliza autorização para aplicar SQL em produção.
