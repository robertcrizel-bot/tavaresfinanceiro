# Asaas PRODUÇÃO — implantação controlada (NÃO ATIVADA)

**Estado desta entrega:** preparação em branch/PR; sem migração executada, sem segredo gravado, sem chamada real à API Asaas, sem cobrança nem alteração de acesso de usuário.

## Escopo implementado

- Adaptados os serviços **checkout, webhook e worker** a partir da integração já homologada no projeto isolado.
- Separação rígida dos endereços: API produção `https://api.asaas.com/v3`, chave `$aact_prod_`, backend exclusivo `onhmpgevkttysbfllhjq.supabase.co`, site `https://finvision2026.lovable.app`. Token de webhook é independente da chave API.
- Formas de pagamento: `CREDIT_CARD` para cartão recorrente; `BOLETO` para cobrança mensal com opção de Pix em cada fatura. **Não anunciar Pix Automático.**
- Contrato para piloto apenas por usuário incluído na tabela allowlist `asaas_prod_testers`. Nenhum cliente comum pode contratar antes de habilitar o servidor, configurar as credenciais e liberar o cadastro.
- Modelo de conciliação: webhook autenticado, persistência de eventos, worker com lease, consulta canônica da cobrança no Asaas, idempotência por `event_id`, manutenção de período de acesso por pagamento.
- Grants existentes `beta_entitlements` manuais e trial devem continuar intocados; somente referências `asaas-production:<contract_id>` serão alteradas pela conciliação da própria assinatura.
- Migrações **armazenadas apenas em `docs/asaas-production/review-only/`**, deliberadamente **fora** de `supabase/migrations/`. Não serão aplicadas por sincronização do Lovable.

## Bloqueios para ativação

1. Revisão humana das duas migrações SQL e comparação com o esquema real de `beta_entitlements`; realizar backup e planejar rollback. Exigir aprovação expressa do proprietário antes de executá-las.
2. Validar conta Asaas real **aprovada**, gerar chave de produção no painel do Asaas, guardar somente em **Secrets do backend**. Não enviar a chave por chat, não colocar variáveis `VITE_*`.
3. Configurar `ASAAS_PRODUCTION_API_KEY`, `ASAAS_PRODUCTION_WEBHOOK_TOKEN`, `ASAAS_PRODUCTION_WORKER_TOKEN`, `ASAAS_PRODUCTION_SUPABASE_URL` e `ASAAS_PRODUCTION_APP_ORIGIN` no backend; manter `ASAAS_PRODUCTION_ENABLED=false` enquanto não homologado.
4. Verificar eventos de assinatura, checkout e pagamento configurados no Asaas com URL de webhook real e `asaas-access-token` forte (32 a 255 caracteres); usar assinatura de webhook em vez de confiança em redirect/callback.
5. Configurar job agendado do worker com autorização separada; conferir resposta HTTP, fila de eventos, atrasos, cobranças futuras e estornos.
6. Registrar o administrador como único usuário piloto na allowlist e manter `asaas_prod_settings.enabled=false` inicialmente; nunca permitir assinaturas de terceiros nesse ponto.
7. A rota `/assinatura` já foi preparada fora do gate financeiro, mas permanece oculta até `VITE_ASAAS_PRODUCTION_PILOT_ENABLED=true` no site oficial com backend correto; a página pública `/beta` continua sem checkout.
8. Teste controlado com autorização específica: valor R$ 14,90, cobrança real, webhook RECEIVED/CONFIRMED, direito `expires_at`, bloqueio em vencimento, cancelamento, estorno, duplicados e criação incerta.
9. Publicar o fluxo somente depois de obter evidência do ensaio fim a fim, aprovação de termos e política de privacidade, e aceitação do proprietário.
10. Na liberação dos primeiros clientes, remover bloqueio **somente** para um grupo piloto; não abrir publicamente por padrão.

## Variáveis previstas (apenas nomes; não colocar valores aqui)

```text
ASAAS_PRODUCTION_ENABLED=false
ASAAS_PRODUCTION_API_KEY=(Secret)
ASAAS_PRODUCTION_WEBHOOK_TOKEN=(Secret independente)
ASAAS_PRODUCTION_WORKER_TOKEN=(Secret independente)
ASAAS_PRODUCTION_SUPABASE_URL=(URL real do backend)
ASAAS_PRODUCTION_APP_ORIGIN=https://finvision2026.lovable.app
```

## Não executar automaticamente

Nenhum `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE` ou deploy em banco de produção foi autorizado por este documento. Não há suporte a fallback Sandbox em produção. Não mudar `beta_has_access()` nem liberar assinatura pelo retorno do navegador.

Documentação oficial:
- https://docs.asaas.com/docs/chaves-de-api
- https://docs.asaas.com/docs/checkout-com-assinatura-recorrente
- https://docs.asaas.com/docs/formas-de-cobranca
- https://docs.asaas.com/docs/faq-de-webhooks
