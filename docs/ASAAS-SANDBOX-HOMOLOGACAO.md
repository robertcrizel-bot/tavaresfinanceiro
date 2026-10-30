# FinanceControl Mensal — infraestrutura Asaas Sandbox

Esta PR contém autenticação, banco e controle comercial sensíveis. **Não integrar, publicar, implantar funções nem executar migrations em produção nesta etapa.** Base: `9b02b06` (main com PRs #50, #51 e #52). Stashes e worktrees anteriores foram preservados.

## Diagnóstico reaproveitado

A auditoria anterior identificou beta comercial com grants manuais, `beta_entitlements`, `beta_has_access()` e proteção RLS já existentes. A produção tinha o gate ativado, mas não checkout automático ou webhooks. A página `/conhecer` anunciava R$ 14,90 e `/beta` R$ 24,90. Esta fase não muda essa oferta publicada, o gate, acessos ou módulos financeiros. A migração anterior não é recriada nem reaplicada.

O novo plano de homologação é centralizado em `asaas_sandbox_plans`: **FinanceControl Mensal, 1490 centavos, BRL, MONTHLY**. O navegador não envia preço, plano, usuário, customer ou subscription ID; campos extras são recusados. Os endpoints usam `Auth.getUser(token)` e uma lista administrativa de usuários fictícios permitidos.

## Compatibilidade de Pix e cartão

- **Cartão:** checkout hospedado `/v3/checkouts` com `CREDIT_CARD` + `RECURRENT`, cliente existente e assinatura mensal. Não há coleta de cartão no FinanceControl.
- **Pix convencional:** assinatura `/v3/subscriptions` com `PIX` + `MONTHLY`; a primeira cobrança e cada renovação são pagas pelo usuário na `invoiceUrl` hospedada no Sandbox. A tela permite abrir a próxima fatura pendente ao atualizar o estado. **Não é Pix Automático nem débito mensal automático.**
- O checkout recorrente documentado é o de cartão. Não se presumiu que um checkout avulso Pix crie uma assinatura. São duas jornadas hospedadas para o mesmo plano.
- Sucesso/cancelamento/expiração no navegador são mensagens de navegação. Recusa/falha da API é apresentada sem sucesso fictício. Nenhum callback concede acesso.

Fontes primárias consultadas em 30/10/2026:

- [Checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente)
- [Cliente do checkout](https://docs.asaas.com/docs/como-informar-os-dados-do-cliente)
- [Recorrência e Pix](https://docs.asaas.com/docs/faq-assinaturas)
- [Criar assinatura](https://docs.asaas.com/reference/criar-nova-assinatura)
- [Listar pagamentos por subscription/checkoutSession](https://docs.asaas.com/reference/listar-cobrancas)
- [Remover assinatura](https://docs.asaas.com/reference/remover-assinatura)
- [Autenticação de webhooks](https://docs.asaas.com/docs/faq-de-webhooks)
- [Idempotência](https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks)
- [Confirmação simulada](https://docs.asaas.com/reference/confirmar-pagamento)

## Componentes

- Migração `20261030120000_asaas_sandbox_subscriptions.sql`: settings desativados, plano, testers, contratos, pagamentos e inbox de eventos; todas as tabelas com RLS, sem grants ao navegador. RPCs somente para service_role.
- `asaas-sandbox-checkout`: ações autenticadas `status`, `start`, `cancel`, restritas ao usuário derivado do JWT.
- `asaas-sandbox-webhook`: valida `asaas-access-token` em comparação de hashes; persiste somente ID/tipo/ID do recurso antes de retornar **HTTP 200**. Não armazena payload bruto, CPF ou dados de cartão.
- `asaas-sandbox-worker`: token separado; processa a inbox, consulta o estado canônico na API Sandbox e aplica o snapshot em uma transação. Lease com token impede commit por worker antigo. Eventos que falham ficam pendentes para até dez tentativas; depois exigem conferência administrativa.
- `/assinatura-sandbox`: rota nova acessível somente em build com `VITE_ASAAS_SANDBOX_ENABLED=true`. Usa login existente, plano do servidor e dados fictícios. A rota fica fora do gate financeiro para um tester ainda não pagante conseguir contratar. As rotas e o gate normais não mudam.

## Segurança, ciclo e limites deliberados

1. API fixada em `https://api-sandbox.asaas.com/v3`; redirecionamentos HTTP não são seguidos. URLs de pagamento fora de `sandbox.asaas.com` são recusadas. Sem fallback para produção.
2. O backend exige flag habilitada, URL exata do Supabase de teste e chave com prefixo Sandbox `$aact_hmlg_`. O projeto publicado `onhmpgevkttysbfllhjq` é explicitamente bloqueado. Prefixo/URLs/formatos de retorno precisam ser confirmados com credenciais reais de Sandbox; formatos antigos não são aceitos silenciosamente.
3. Um contrato por usuário de teste, criado sob lock no banco. Repetições reutilizam o resultado; concorrência enquanto cria é recusada. POST com timeout/resultado ambíguo não é repetido: os IDs já conhecidos permanecem registrados e o contrato fica em reconciliação. Isto prioriza não duplicar contratos.
4. Para cartão, o worker vincula uma assinatura nova somente após confirmar que o pagamento faz parte do checkout ID previamente armazenado, consultando `payments?checkoutSession=...`; valida também customer, valor bruto, billingType e ciclo. Não presume propagação de `externalReference` do checkout para a assinatura.
5. Confirmação/recebimento canônico gera período pago. A renovação é um pagamento distinto; períodos pré-pagos só estendem acesso quando contíguos. Um intervalo não pago não é coberto por uma cobrança futura. O worker periódico também recalcula acesso quando o calendário muda.
6. Recusa, atraso e cobrança criada não concedem acesso. O gate existente considera `expires_at`; nenhum lançamento financeiro é excluído ao terminar a assinatura.
7. Cancelamento autenticado usa DELETE da assinatura (ou cancelamento do checkout ainda sem assinatura). Conforme o Asaas, DELETE encerra a recorrência e remove cobranças pendentes/vencidas, preservando pagas. Mantém-se o tempo já pago; isso ainda requer homologação real.
8. Estorno/chargeback/estorno parcial são conservadores: a cobertura daquele pagamento é retirada. Pagamento revertido é terminal para impedir reativação por evento antigo. Reversão posterior de disputa requer reconciliação administrativa nesta fase.
9. Eventos duplicados não reaplicam regras; ID repetido com recurso diferente é recusado. Eventos antigos consultam o estado atual do gateway. CHECKOUT_CANCELED/EXPIRED não revogam uma assinatura paga: são registrados como eventos da jornada; o callback informa a jornada e o cancelamento comercial usa a ação autenticada.
10. A projeção usa `beta_entitlements` **somente para testers permitidos no projeto isolado**. Não altera `beta_has_access`, o switch comercial ou políticas financeiras. Grants manuais/trial/legados nunca são sobrescritos, nem quando o pagamento de teste é estornado. Somente grants com referência exata `asaas-sandbox:<contract_uuid>` são atualizados/revogados.
11. Após cancelamento ou erro ambíguo, a criação de outro contrato para o mesmo tester não é liberada automaticamente. Para repetir o cenário, use outra conta fictícia ou reconciliação/reset administrativo exclusivamente no banco descartável, após cancelar recursos remotos. Não há reset disponível ao navegador.
12. Tokens, CPF, cartão, emails e corpo de erro do provedor não são enviados para logs nem respostas de erro. Só há códigos genéricos e metadados mínimos de conciliação no banco.

## Homologação manual necessária

Não havia chave Asaas Sandbox disponível no ambiente nem nos secrets do repositório consultados. **Nenhuma criação de cliente, assinatura ou pagamento foi executada no Asaas Sandbox real.** Não existem credenciais de produção como alternativa.

1. Criar/selecionar um **Supabase de teste separado**; nunca usar o projeto atualmente publicado. Preparar as migrations existentes nesse ambiente e executar somente a migração nova ainda ausente. Não repetir migrations já instaladas.
2. Cadastrar contas Auth fictícias. Conferir documentos fictícios aceitos pelo Sandbox e usar somente contatos próprios/autorizados; notificações são desativadas na criação do customer, mas devem ser conferidas na conta Asaas.
3. Configurar os secrets de `.env.asaas-sandbox.example` somente nas funções do projeto de teste. A chave deve vir da conta Sandbox. Webhook e worker precisam de dois tokens aleatórios distintos, com no mínimo 32 caracteres, fornecidos pelo administrador. Não colocar secrets em `VITE_*`, no Git ou em comandos com logs públicos.
4. Implantar somente as três funções no projeto de teste. O `verify_jwt=false` é intencional: o checkout valida o usuário em Auth; webhook e worker têm autenticação própria. Não adicionar uma exceção anônima aos dados.
5. Somente no banco de teste, inserir os UUIDs fictícios em `asaas_sandbox_testers` e habilitar `asaas_sandbox_settings.enabled`. Nenhuma dessas ações foi executada em produção.
6. Gerar preview isolado com Supabase URL/key **de teste**, `VITE_ASAAS_SANDBOX_ENABLED=true` e origin igual ao secret. Acessar `/assinatura-sandbox`. O build padrão mantém a rota desligada.
7. No painel Sandbox, cadastrar webhook HTTPS final `/functions/v1/asaas-sandbox-webhook`, token dedicado e eventos PAYMENT_CREATED/CONFIRMED/RECEIVED/OVERDUE/REFUNDED/PARTIALLY_REFUNDED, recusas e chargebacks aplicáveis, SUBSCRIPTION_CREATED/UPDATED/DELETED e CHECKOUT_CREATED/PAID/CANCELED/EXPIRED. Conferir nomes disponíveis no painel e logs de entrega; não usar a API key como authToken.
8. Agendar chamada **POST** ao worker com `Authorization: Bearer <worker-secret>` a cada minuto no ambiente isolado. Pode ser acionado manualmente para os primeiros testes. Nenhum agendamento externo foi criado nesta PR. Sem worker, o evento fica registrado, mas o acesso não é projetado.
9. Efetuar a matriz abaixo com usuários fictícios. Pix: usar a confirmação simulada do Sandbox. Cartão: usar cartões de teste oficiais, incluindo recusa, exclusivamente na página hospedada. Confirmar callbacks e entregas reais de webhook.
10. Validar empiricamente: URL hospedada de Sandbox, campo customer no checkout, formato de nextDueDate, criação da primeira invoice Pix, vínculo checkoutSession→payment→subscription, cancelamento remoto e projeção pelo gate/RLS completos. Estes são pontos ainda não homologados por chamadas reais.

## Matriz e evidências de testes

| Cenário | Evidência preparada |
|---|---|
| Usuário correto e isolamento | HTTP mocks + privilégios/associação SQL |
| R$ 14,90 e MONTHLY; manipulação pelo browser | Payload HTTP mock + constraints e rejeição SQL |
| Pix confirmado; cartão aprovado/recusado | Estado canônico mock + projeção SQL |
| Renovação e pré-pagamento | Mock + períodos contíguos SQL |
| Vencimento sem pagamento | Mock OVERDUE + SQL sem entitlement |
| Cancelamento e estorno | Mock + SQL preservando tempo pago e grants antigos |
| Webhooks repetidos e fora de ordem | Mock + unicidade/transições terminais SQL |
| Contratação repetida/ambígua | Mock concorrente + lock/unique/reuso SQL |
| Acessos existentes | SQL garante grant manual intacto após confirmação e estorno |
| Interface e callbacks | React Testing Library com backend mockado |

Comandos de validação: Vitest dos dois arquivos novos, TypeScript app/node, Deno check das três funções, lint dos arquivos alterados, build padrão e `supabase/tests/asaas-sandbox.sql` em **PostgreSQL descartável chamado `asaas_sandbox_test`**, por workflow dedicado. O SQL recusa outro nome de banco. A fixture SQL reproduz o contrato de `beta_entitlements`; não substitui ensaio com Auth/PostgREST/RLS completos no Supabase de homologação.

**Mocks e SQL descartável não são homologação real no Asaas.** Cobrança pública, preço das páginas publicadas, KYC, termos, privacidade, políticas de acesso final, suporte, migração/ativação em produção e deploy público permanecem sujeitos a uma etapa posterior expressamente autorizada.
