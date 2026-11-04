# FinVision — avisos Beta por e-mail e Android

## Escopo implementado (não confundir com serviço ativado)
- Menu **Administração** exibe total de pedidos pendentes com consulta autenticada a beta-admin a cada 60 segundos.
- Com o FinVision aberto e permissão de notificações, o navegador pode mostrar alerta para pedido novo.
- Tela Admin tem botão de inscrição Web Push e tratamento explícito de servidor não configurado.
- O service worker pode mostrar notificações com o app fechado.
- Função `beta-notify` pode inscrever administrador (JWT + user_roles), enviar e-mails via Resend e Web Push VAPID para admins inscritos; job GitHub preparado para despacho a cada 5 minutos, ainda desativado até configurar os segredos e validar entrega.
- Tabelas privadas e registro de entrega por pedido/canal previnem reenvios após sucesso. **Não há aprovação automática**.

## Necessário para ativação real
1. Publicar a migration `supabase/migrations/20261104150000_beta_admin_notifications.sql` via **Lovable Cloud do projeto existente**. Não provisionar outro banco. Conferir RLS.
2. Implantar a função `supabase/functions/beta-notify/index.ts` no **mesmo Lovable Cloud** com `verify_jwt=false`, porque a função valida explicitamente JWT do administrador e segredo da rotina. Nunca inserir service_role em código frontend.
3. Configurar segredos da função (somente no servidor):
   - `RESEND_API_KEY`: credencial do Resend; domínio/remetente verificado.
   - `RESEND_FROM_EMAIL`: e-mail remetente verificado, por exemplo `FinVision <avisos@SEU_DOMINIO>`.
   - `BETA_ALERT_EMAIL`: caixa do administrador destinatário.
   - `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`: par de chaves Web Push gerado em ambiente seguro; **não** gravar a chave privada no repositório.
   - `VAPID_SUBJECT`: `mailto:contato@SEU_DOMINIO` para Web Push.
   - `BETA_NOTIFY_CRON_SECRET`: segredo aleatório de pelo menos 32 caracteres, exclusivo da rotina.
4. Configurar no GitHub Actions (Settings → Secrets and variables → Actions) os secrets:
   - `BETA_NOTIFY_CRON_SECRET`: exatamente o mesmo segredo do servidor.
   - `BETA_NOTIFY_FUNCTION_URL`: `https://onhmpgevkttysbfllhjq.supabase.co/functions/v1/beta-notify` (confirmar endpoint implantado).
5. Habilitar o agendamento de 5 minutos em `.github/workflows/notify-beta-requests.yml` **somente depois** da implantação e configuração. Isso evita gastar minutos do GitHub Actions enquanto o envio ainda não funciona.
6. Entrar como administrador no FinVision instalado no Android, abrir **Administração** e tocar **Ativar avisos no celular**. Permitir notificações. Não use dados pessoais de clientes em payloads push.
7. Criar solicitação teste com outra conta, verificar entrega de e-mail e push no celular com app fechado, conferir que recebeu **uma** notificação por canal e que um não-administrador recebe 403 no endpoint. Não conceder acesso sem revisão.

## Estado de entrega
A existência de código, compilação ou testes não comprova que a migration, função, segredos ou rotina estejam ativos. Sem eles, o contador do menu pode funcionar, mas o envio em segundo plano NÃO funciona. Não afirmar conclusão antes de teste real.

## Condições de falha
- Job GitHub não configurado registra aviso e pula o disparo.
- Ausência de segredos do servidor impede o envio daquele canal, sem conceder acesso ou mexer em finanças.
- A função envia apenas solicitações pendentes, em lotes de 100 por execução, e registra entrega por canal.
- Notificação push só chega em dispositivos que concederam permissão e concluíram a inscrição no servidor.
