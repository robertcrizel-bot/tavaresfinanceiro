# Beta comercial — fila de solicitações (Asaas)
O cadastro do Asaas do titular está pendente de verificação por documento; não existe ainda checkout de produção validado.

## Fluxo piloto sem risco
1. O usuário faz login/cadastro; se o gate comercial estiver ativado e não houver grant, vê `Solicitar análise de acesso`.
2. O clique insere UMA solicitação `pending` na `beta_access_requests` via JWT do próprio usuário. Não envia CPF, email de cobrança, chave de API, comprovante ou qualquer informação financeira.
3. O cliente paga **somente em link oficial do Asaas verificado**; o operador confere em seu painel o estado da cobrança, valor, titular, recorrência, eventual reembolso e a conta Supabase correta. Não confiar em screenshot, navegador, querystring ou texto declarado pelo cliente.
4. O administrador, **após confirmação real**, concede `beta_entitlements` para o UUID autenticado correto com vencimento mensal compatível e status active. Opcionalmente registra o request como approved. O estado `approved` **nunca concede acesso** sem entitlement.
5. Ao estornar/cancelar/vencer, administrador revoga ou não renova; sem webhook, a conferência é manual e obrigatória. Limite a beta a poucos clientes.

## Conferência administrativa (somente SQL administrativo, não frontend)
```sql
SELECT r.user_id, r.status, r.created_at
FROM public.beta_access_requests r
WHERE r.status='pending' ORDER BY r.created_at;
```
As solicitações não dão automaticamente acesso. Não usar `paymentLink` genérico para atribuir um pagamento a qualquer UUID; confirmar o pagador e associação com conta antes do grant.

**Antes de ativar cobrança:** completar verificação KYC Asaas, escolher preço, validar termos/política, criar e revisar o link RECURRENT/MONTHLY, testar usuário pagante, cancelamento, revogação e identidade. Restringir `beta_access_switch.enabled` somente depois do grant do proprietário. Todo deploy/migration precisa autorização explícita e preflight.

Documentação oficial: https://docs.asaas.com/docs/criando-um-link-de-pagamentos ; https://docs.asaas.com/docs/webhook-para-cobrancas .
