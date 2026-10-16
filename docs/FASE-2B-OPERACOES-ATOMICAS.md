# Fase 2B — contenções locais e proposta de banco

Base: `db2df163dd541cb4fb2b04e9be715327c4441507`.
Nenhum SQL foi executado. Os fragmentos abaixo são uma proposta para revisão,
**não uma migration ou implementação pronta para aplicação**. A cadeia local de
migrations foi lida; não foi consultado o esquema nem qualquer dado de produção.

## O que esta alteração protege

- `markAsPaid`: bloqueio síncrono por usuário/previsão/competência enquanto a
  operação e sua atualização de dados estão em andamento, na mesma instância do
  provider; recusa pagamento já presente no último snapshot carregado, mesmo por
  um callback antigo; não cria vínculo sem ID confirmado do lançamento.
- `unmarkAsPaid`: usa o mesmo bloqueio; recusa pagamentos desconhecidos ou sem
  lançamento vinculado. Exige resposta de DELETE com exatamente um ID em cada
  etapa. Erro, exceção, resposta vazia ou exclusão filtrada por RLS não gera
  sucesso; se a primeira etapa falhar, a segunda não é enviada.
- Em operações iniciadas, os dois contextos são atualizados também após falhas.
  Falha ao atualizar é informada, e os bloqueios são liberados em `finally`.
- Fechamento: bloqueia repetição simultânea da mesma fatura nessa instância;
  captura exceções e atualiza os dados após tentativa de reatribuição, mesmo se
  o UPDATE ou a RPC falhar. Não executa UPDATE compensatório.
- Reabertura, pagamento, estorno, parâmetros da RPC de fechamento e regras de
  classificação/valores permanecem os mesmos. O UPDATE anterior à RPC permanece
  separado: **a janela de alteração parcial continua existindo**.

Limites: bloqueios não atravessam abas, dispositivos, providers ou remontagens.
Snapshots podem estar desatualizados. Nenhum retry automático foi introduzido.
Erro de rede pode significar operação confirmada no servidor com resposta perdida.
O erro do vínculo ainda pode deixar um lançamento órfão; o erro da segunda
exclusão ainda pode deixar pagamento com FK nula. Não se deve reenviar a intenção
sem conferir os registros. Não são inferidos lançamentos por nome/valor/data.
Pagamentos legados sem vínculo exigem reconciliação explícita, fora desta fase.
Atualizar a tela não desfaz gravações e não equivale a rollback.

## Restrições existentes consideradas

- `bill_payments`: UNIQUE `(recurring_bill_id, reference_month)`; FK do lançamento
  com `ON DELETE SET NULL`; FK da previsão com `ON DELETE CASCADE`.
- RLS por `auth.uid() = user_id` nas tabelas de previsões/pagamentos. Isso não
  substitui validar que previsão, lançamento, conta e cartão têm o mesmo dono.
- Trigger de reconciliação do pagamento pode atribuir compra a fatura. Triggers
  de faturas protegem lançamentos sistêmicos e compras em faturas CLOSED/PAID.
- O fechamento vigente usa `app.invoice_operation = close`, bloqueia a fatura,
  movimenta compras/exclusões e consolida obrigação. Reabrir e estornar têm seus
  próprios contratos e permissões. Eles não podem ser contornados pela nova RPC.

Referências locais: migrations `20260410025854_*`, `20261007120000_*`,
`20261007150000_*`, `20261007160000_*`, `20261007170000_*`, `20261007180000_*`.

## Contrato definitivo proposto

Três operações de servidor: `mark_forecast_payment`, `unmark_forecast_payment` e
fechamento estendido com IDs a restaurar. Cada intenção recebe UUID gerado uma
vez no cliente; retries reutilizam esse UUID e os mesmos parâmetros. Nova
marcação depois de desmarcar usa outra chave. O desfazimento referencia o ID
exato do pagamento, nunca somente a competência, para não apagar uma remarcação.

Cada chamada roda em **uma transação PostgreSQL**, com autenticação obrigatória,
validação de todos os IDs, domínio de valores e de competência/data. Não confiar
em `user_id` recebido do navegador nem usar service role no frontend. Preferir
`SECURITY INVOKER`, com RLS e `search_path` fixado. Se privilégios adicionais forem
indispensáveis, revisar separadamente uma função SECURITY DEFINER de escopo mínimo,
qualificar todos os objetos, validar `auth.uid()` explicitamente e revogar EXECUTE
de PUBLIC/anon; conceder apenas ao papel autenticado. Nunca desabilitar triggers.

### Idempotência comum — fragmentos SQL sugeridos

Tabela futura, fora das tabelas financeiras, para resultado e parâmetros:

```sql
-- APENAS PROPOSTA: não executar isoladamente.
CREATE TABLE public.financial_operation_requests (
  user_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('mark', 'unmark', 'close')),
  request jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id)
);
ALTER TABLE public.financial_operation_requests ENABLE ROW LEVEL SECURITY;
```

Definir políticas/privilégios na revisão de segurança: usuário não pode forjar
resultados ou alterar requisições já confirmadas por DML direto. Isso exige
encapsular a escrita do registro idempotente em função privilegiada restrita ou
outra política comprovada em testes; não liberar INSERT/UPDATE irrestrito só para
fazer SECURITY INVOKER funcionar. O código de resolução não pode aceitar resultado
forjado pelo cliente. A escolha final de privilégios é um requisito antes de aplicar.

Dentro da futura função, normalizar o JSON no servidor, incluindo todos os campos
que alteram o efeito financeiro, parâmetros default, IDs ordenados e sem duplicatas.
Validar UUID e `auth.uid() IS NOT NULL` antes de reservar a chave. Modelo:

```sql
-- Fragmento PL/pgSQL: variáveis/parâmetros pertencem à futura função.
INSERT INTO public.financial_operation_requests
  (user_id, operation_id, operation, request)
VALUES (auth.uid(), p_operation_id, v_operation, v_normalized_request)
ON CONFLICT (user_id, operation_id) DO NOTHING;

SELECT * INTO v_request
FROM public.financial_operation_requests
WHERE user_id = auth.uid() AND operation_id = p_operation_id
FOR UPDATE;

IF v_request.operation <> v_operation
   OR v_request.request IS DISTINCT FROM v_normalized_request THEN
  RAISE EXCEPTION 'Chave reutilizada com parametros diferentes';
END IF;
IF v_request.result IS NOT NULL THEN
  RETURN v_request.result;
END IF;
-- Validar/bloquear e executar os efeitos financeiros descritos abaixo.
-- Salvar v_result no registro da chave antes do retorno, na MESMA transação.
UPDATE public.financial_operation_requests SET result = v_result
WHERE user_id = auth.uid() AND operation_id = p_operation_id;
```

INSERT concorrente da mesma chave espera o commit/rollback anterior. Erros devem
subir como exceção para desfazer todas as escritas, inclusive a reserva; não capturar
uma violação UNIQUE e retornar sucesso após já ter criado lançamento. Retenção das
chaves precisa abranger o prazo de retries; exclusão prematura permite replay.

### Marcar pagamento

Após reservar a chave, bloquear a previsão com `FOR UPDATE` e verificar seu dono.
Todas as operações novas de marcar/desmarcar devem usar essa ordem de bloqueio.
O bloqueio da previsão também serializa competências diferentes, simplificando o
contrato. Manter UNIQUE existente como segunda defesa para chaves diferentes.

```sql
SELECT * INTO v_bill FROM public.recurring_bills
WHERE id = p_bill_id AND user_id = auth.uid() FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Previsao nao encontrada'; END IF;

SELECT * INTO v_payment FROM public.bill_payments
WHERE recurring_bill_id = p_bill_id AND reference_month = p_reference_month
  AND user_id = auth.uid() FOR UPDATE;
-- Se existe: validar vínculo, dono e compatibilidade dos parâmetros.
-- Retornar o mesmo resultado somente se compatível; senão, conflito explícito.
-- Vínculo nulo/inconsistente exige reconciliação, nunca novo lançamento silencioso.

-- Depois de TODAS as validações de competência/escopo, conta/cartão e valores:
INSERT INTO public.transactions
  (user_id, title, amount, type, category, date, description,
   payment_method, account_id, credit_card_id, is_paid)
VALUES (auth.uid(), v_title, v_amount, v_type, v_category, v_date, v_description,
        v_payment_method, v_account_id, v_card_id, true)
RETURNING id INTO v_transaction_id;
INSERT INTO public.bill_payments
  (user_id, recurring_bill_id, reference_month, transaction_id)
VALUES (auth.uid(), p_bill_id, p_reference_month, v_transaction_id)
RETURNING id INTO v_payment_id;
```

Resolver `type`/demais valores para a competência conforme edições this/future/all
e permitir somente overrides hoje aceitos. Conta nula para cartão, classificação
pelos triggers atuais e nenhum lançamento sistêmico fornecido pelo cliente.
Uma falha no vínculo ou em qualquer trigger desfaz o lançamento na mesma transação.

### Desmarcar pagamento

Reservar chave, bloquear previsão, pagamento exato e lançamento; verificar dono,
vínculo não nulo, correspondência da competência e proteção de fatura. Se o ID
original já estiver ausente, retornar resultado sem efeito, sem procurar/remover
um novo pagamento da competência. Não interpretar uma FK inválida como sucesso.

```sql
-- Após SELECT ... FOR UPDATE e validações de todos os registros:
DELETE FROM public.transactions
WHERE id = v_payment.transaction_id AND user_id = auth.uid()
RETURNING id INTO v_deleted_transaction;
IF NOT FOUND THEN RAISE EXCEPTION 'Lancamento nao removido'; END IF;
DELETE FROM public.bill_payments
WHERE id = p_payment_id AND user_id = auth.uid()
RETURNING id INTO v_deleted_payment;
IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento nao removido'; END IF;
```

Confirmar ordem de locks com os triggers de faturas e a FK SET NULL, que atualiza o
pagamento durante o DELETE. O intervalo FK nula não fica confirmado separadamente:
uma falha na segunda exclusão restaura ambos por rollback. Não liberar compra em
fatura CLOSED/PAID nem remover obrigação/pagamento sistêmico por essa operação.
Avaliar UNIQUE de `transaction_id` não nulo e integridade de dono do vínculo; antes
de qualquer restrição nova, auditar dados legados em ambiente autorizado e elaborar
reconciliação sem apagar dados. Não aplicar restrições cegamente em produção.

### Fechamento com restauração

Estender a operação atual, mantendo parâmetros/datas, exclusões, classificação e
cálculo da obrigação. Reservar chave; serializar operações do cartão e bloquear
faturas e compras em ordem determinística de IDs, incluindo origem e destino.
Revisar a ordem em conjunto com fechar/reabrir/pagar/estornar e seus triggers para
evitar inversões/deadlocks; retry de deadlock reutiliza a mesma chave.

Validar quantidade exata dos IDs selecionados, dono, cartão, tipo, origem e status
de todas as compras. Rejeitar listas conflitantes de restaurar/excluir. Validar que
faturas de origem/destino estão abertas e respeitar as regras atuais de fechamento.

```sql
-- Fragmento a incorporar ao corpo revisado do fechamento, não uma chamada do cliente:
PERFORM set_config('app.invoice_operation', 'close', true);
UPDATE public.transactions
SET credit_card_invoice_id = p_invoice_id
WHERE id = ANY(p_restore_transaction_ids)
  AND user_id = auth.uid() AND credit_card_id = v_invoice.credit_card_id;
GET DIAGNOSTICS v_restored_count = ROW_COUNT;
IF v_restored_count <> cardinality(p_restore_transaction_ids) THEN
  RAISE EXCEPTION 'Selecao de restauracao incompleta';
END IF;
-- Prosseguir aqui com as validações/exclusões/consolidação atuais, sem commit intermediário.
```

Esse fragmento pressupõe IDs deduplicados e todas as validações/locks anteriores.
Não basta envolver a RPC antiga depois de um UPDATE no navegador. Uma falha na
consolidação deve desfazer também restauração, movimentos e obrigação. Replay da
mesma chave retorna o resultado original; nova chave com estado incompatível dá
conflito. Reabrir/pagar/estornar continuam nas respectivas operações. Avaliar uma
geração/versionamento de fatura para impedir replay de um fechamento antigo após
reabertura; mesma chave nunca deve fechar uma nova geração.

## Frontend futuro e validação obrigatória

Uma chamada RPC por intenção; armazenar a chave até resposta confirmada, reutilizá-la
após resposta perdida e comparar a versão esperada da operação. Remover INSERTs,
DELETEs e restauração direta somente quando os novos contratos estiverem disponíveis.
Atualizar tipos gerados e manter bloqueios locais como auxílio de interface.
Depois da migração dos clientes, revisar permissões para impedir caminhos antigos
de escrita separada; enquanto eles existirem, não há garantia global contra órfãos.

Antes de implantação, testar em PostgreSQL local descartável com toda a cadeia de
migrations: usuário anônimo/outro dono, contas/cartões de terceiros, chaves iguais
e distintas concorrentes, parâmetros incompatíveis, falhas entre cada escrita,
resposta perdida, marcar/desmarcar/remarcar, FK nula e UNIQUE, conflitos de cartão,
triggers de fatura, deadlocks, fechamento/reabertura/pagamento/estorno e rollback
integral. Confirmar saldos e histórico antes/depois. Mocks desta fase não executam
RLS, SQL real ou triggers e não comprovam atomicidade PostgreSQL.

Próxima autorização: implementar/revisar migrations e RPCs e seus testes em banco
local descartável. Aplicação em qualquer banco real exige autorização posterior
específica, backup e plano de recuperação. Push/deploy não foram autorizados nesta fase.

## Validação desta entrega

- Testes financeiros específicos: 54 aprovados, com falhas parciais, exclusões
  não confirmadas, conflito UNIQUE, resposta perdida e concorrência local.
- Suíte completa: 1.393 testes aprovados em 77 arquivos, preservando regressões
  de previsões, centavos, datas das parcelas e leitura de comprovantes.
- TypeScript (`--noEmit` para app e node), build e `git diff --check` aprovados.
- Build com avisos de Browserslist desatualizado, módulos Node externalizados
  de OpenCV e chunks grandes; dependências não foram alteradas.
- Leitor: somente ícone Sparkles e classes do botão. Não houve alteração de
  Gemma, OCR, câmera, Workers, compartilhamento ou fluxo de confirmação.
- SQL apenas nesta documentação; sem alterações de migrations ou banco real.
