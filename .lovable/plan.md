# Diagnóstico: primeiro checkout Boleto (somente leitura)

## Observado
Contrato mais recente: `state=reconciliation_required`, `method=BOLETO`, `has_customer=true`, `has_subscription=false`, `has_checkout_url=false`, `cancelled=false`, `provider_billing_type` nulo, criado em 13/11/2026 18:05:36 UTC.
Os registros da função de checkout mostram só início e encerramento, sem o erro.

## Onde falhou
Em `ProductionBilling.start`, o cliente foi criado ou encontrado e salvo. O passo seguinte, `gateway.subscribe` (POST /subscriptions), falhou antes de salvar a assinatura. O `catch` marcou o contrato como incerto, e a tela mostrou "Não foi possível confirmar a operação". `payments` nunca foi chamado.

## Causa provável (não confirmada)
1. Mais provável: o Asaas rejeitou a criação (400). O código envia `callback` com `cancelUrl` e `expiredUrl`, campos do Checkout, não da Assinatura, que só aceita `successUrl` e `autoRedirect`. Nesse caso nenhuma assinatura existe.
2. Possível: tempo esgotado (10 s) ou falha de rede. A assinatura pode existir no Asaas sem que o app saiba.
3. Possível: o Asaas criou a assinatura, mas a conferência local `SUBSCRIPTION_MISMATCH` recusou a resposta. A assinatura existiria no Asaas.

Nos casos 2 e 3 pode haver uma assinatura órfã. Por isso, não repita o checkout.

## Reconciliação segura (próxima etapa, só com autorização)
1. No painel do Asaas, em Assinaturas, filtre pelo cliente do proprietário ou pela referência externa igual ao ID do contrato. Não é preciso chamar a API.
2. **Se não houver assinatura:** a causa foi a 1. Corrigir o `callback` de `subscribe`, com teste. Depois, por migração autorizada, marcar o contrato como cancelado ou falho para liberar uma nova tentativa única.
3. **Se houver assinatura:** gravar `subscription_id` no contrato por migração e voltar o estado para `pending`. O status passa a buscar o boleto pendente, sem criar outra assinatura. Outra opção é excluir a assinatura no Asaas e seguir como no passo 2.
4. Em seguida, registrar nos logs da função o código de erro do Asaas, sem dados pessoais, para que a causa fique visível da próxima vez.

Nada foi alterado neste diagnóstico.
