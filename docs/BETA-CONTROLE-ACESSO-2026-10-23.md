# Controle de acesso da beta fechada — FinanceControl

## Segurança e implantação
- Migration `20261023110000_beta_entitlements_closed_access.sql` cria tabelas privadas de controle de acesso e status, políticas RLS **restritivas** nas dez tabelas de dados e no bucket de comprovantes e triggers de escrita para RPCs SECURITY DEFINER.
- **DESATIVADO POR PADRÃO**: inserir a migration não bloqueia o proprietário ou outros usuários existentes. `enabled=false` significa acesso normal para autenticados com RLS de proprietário; **não cobrar clientes nesse estado**.
- `beta_has_access()` usa `auth.uid()`, status ativo/piloto e validade no banco; navegador não pode atribuir planos nem escolher privilégios.
- `beta_entitlements` e `beta_access_switch`: nenhuma permissão de leitura ou escrita para `anon`/`authenticated`; somente operação administrativa ou service_role do servidor.
- O guard de interface não libera nem valida pagamento. A fonte de verdade é o banco. Não colocar `service_role` em frontend, JS ou `VITE_*`.
- O signup público pode continuar criando contas, mas, quando a restrição estiver ativada, elas não podem acessar dados financeiros sem grant. Fechar signup para o público é uma decisão separada de lançamento.
- Mesmo com grant, o acesso ainda está sujeito às políticas RLS do proprietário; cada usuário só deve poder acessar seus registros.
- Mudanças de status durante uma sessão são aplicadas no servidor na próxima consulta/escrita; a UI só reconsulta ao abrir/recarregar ou apertar "Verificar novamente".
- A lógica tem suporte ao plano manual/beta e futura confirmação dos pagamentos do Asaas ou PagBank **server-side**. Não há webhook/reativação/cancelamento automático nesta etapa.
- **NÃO lançar cobranças** até haver contrato/termos, privacidade, confirmação confiável de pagamento, expiração e cancelamento, autenticação real testada e restauração segura.

## Ordem de ativação após autorização expressa para produção
1. Implantar migrations da Fase 2C/comercial em ordem, depois esta migration. Conferir RLS, Auth real, origens e todos os SQLs necessários; backup/export já disponível, mas proteger novas alterações.
2. Com `enabled=false`, confirmar que cadastro/login/proprietário funcionam e executar ensaio de acesso negativo no ambiente real de testes.
3. Inserir grant ativo para o **usuário proprietário correto** via **admin backend**, com prazo futuro. Evitar inserir email/CPF manualmente no script público. Confirmar `beta_has_access()=true` na sessão do proprietário.
4. Conceder acesso a apenas usuários convidados e, só depois, mudar `public.beta_access_switch.enabled=true` via canal administrativo. O banco recusa ativação se não houver nenhum grant válido.
5. Testar: usuário novo sem grant não lê/grava tabela financeira e não consegue usar RPCs; usuário habilitado opera normalmente; comprovantes continuam privados; logout/expiração/revogação funcionam.
6. Revogação manual por backend ao cancelar/estornar. Configurar processamento Asaas depois com webhook autenticado, validação de valor/plano e idempotência antes de cobrar publicamente.

## Comandos SQL administrativos — somente após identificação correta e autorização
Exemplo, executado por administrador **sem expor UUIDs reais em logs públicos**:
```sql
INSERT INTO public.beta_entitlements(user_id,status,expires_at,payment_provider,reference)
VALUES ('<user_uuid>', 'active', now() + interval '1 year','manual','owner')
ON CONFLICT(user_id) DO UPDATE SET status='active', expires_at=excluded.expires_at,
 payment_provider='manual',reference='owner',updated_at=now();

UPDATE public.beta_access_switch SET enabled=true WHERE singleton=true;
```
Desativar o controle, se necessário, não requer restauração:
```sql
UPDATE public.beta_access_switch SET enabled=false WHERE singleton=true;
```
**Não executar as instruções de exemplo automaticamente.**
