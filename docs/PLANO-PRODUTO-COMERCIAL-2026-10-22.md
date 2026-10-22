# FinanceControl — Auditoria para comercialização (22/10/2026)

## Decisão

**Não vender publicamente ainda.** Produto em uso real, mas ainda sem isolamento multiusuário exercitado por testes negativos, garantias completas de operações financeiras, cobrança recorrente, recuperação operacional atualizada e processos LGPD/suporte. Uma versão piloto controlada, sem cobrança, pode ocorrer depois dos critérios P0.

**Escopo:** auditoria do repositório `main` e verificações SELECT do Supabase de produção. Não presume que funcionalidades ausentes do repositório estejam disponíveis no Lovable ou em serviços não examinados. Todo código de correção fica em branch separada até testes, sincronização e consentimento para publicações/migrations.

### Achados confirmados

| Prioridade | Área | Evidência e risco | Critério objetivo de conclusão | Estado |
| --- | --- | --- | --- | --- |
| P0 | Operações de pagamento e faturas | Fase 2C testada fora de produção, **não implantada** integralmente; `ForecastContext` publicado ainda mantém inserção financeira em duas escritas distintas. Falha parcial pode deixar lançamento sem vínculo | Operações atômicas/idempotentes, teste de concorrência real, rollback/correção de dados e verificação em Android | Bloqueio |
| P0 | Funções privilegiadas antigas | 7 assinaturas de RPC SECURITY DEFINER ligadas a faturas estavam executáveis por `anon` no banco real; não se alegou exploração | Retirar EXECUTE de `PUBLIC`/`anon`, preservar `authenticated`, validar fluxo antigo e auditar funções restantes | Correção preparada em migration **não aplicada** |
| P0 | Separação entre clientes | Tabelas principais têm RLS `auth.uid() = user_id`; SELECT de 8 famílias de vínculos financeiros não encontrou owner mismatch na base atual. **Isso não testa tentativas de outro usuário.** | Testes de dois usuários isolados: SELECT, INSERT, UPDATE, DELETE e RPC, Storage e relacionamento estrangeiro; proteger vínculo owner nas gravações | Parcial |
| P0 | Integridade e duplicações | Trigger de previsões/categorias já aplicado em produção, mas lançamento de pagamento e operação de fatura ainda dependem da Fase 2C | 1 clique = no máximo 1 lançamento, reenvio de requisição, duas sessões e resultado consistente | Parcial |
| P0 | Backup e recuperação | Backup restaurado local em 16/10 com Vault excluído (0 segredos) e 64 anexos baixados à época; produção mudou depois disso; backup diário pode perder operações recentes | Restaurar em ambiente isolado um backup **recente**, testar novos anexos, registrar RPO/RTO real e plano contra alterações posteriores; não sobrescrever banco em uso | Bloqueio |
| P0 | Cadastro e credenciais | Login/cadastro existem, página de recuperação de senha não existia | Fluxo real de email de recuperação, configuração de Redirect URLs e rate-limit do Auth, reset em Android | Em implementação na branch |
| P0 | Conta, suporte e LGPD | Não há fluxo de requisição de acesso/exportação/apagamento nem documentos completos de finalidade, tratamento e retenção; comprovantes podem conter dados pessoais sensíveis | Identificar controlador/contato e provedores; política e termos revistos; procedimento de solicitações e exclusão segura com arquivo/Storage; incidente e retenção | Bloqueio |
| P0 | Custos de IA e proteção | Worker autentica JWT e oferece limite provisório em memória; limites locais não são necessariamente globais entre instâncias | Rate limiting e quota persistente **por usuário e por plano** no servidor, tamanho/timeout, teto de gasto, falha fechada, sem fallback pago | Bloqueio |
| P0 | Assinatura comercial | Nenhum backend de planos, entitlements, pagamento recorrente/webhook e cancelamento foi identificado no projeto `main` | Escolher provedor; webhook autenticado/idempotente; fonte da verdade servidor, ciclo de assinatura e contas inadimplentes; usuários antigos preservados | Não iniciado |
| P1 | UX/onboarding | Interface de uso pessoal tem necessidades de diagnóstico e validação em Android; instruções de primeiro uso sem fluxo dedicado | Fluxo primeiro acesso, vazio, mensalidade, limite de IA, acessibilidade/contraste, teclado Android, estados de espera/erro | Pendente |
| P1 | Qualidade OCR | Gemma e câmera devem permanecer intocados sem regressão; estabilidade deve ser medida sem expor conteúdo de comprovantes | Métricas anonimizadas por método/tamanho/tempo, testes com documentos reais e controle de custos | Pendente |
| P1 | Observabilidade e atendimento | Não identificamos incidentes/telemetria comercial, canal suporte, SLA e alarmes | Logs sem token/foto/conteúdo, alertas para falhas, incidentes, suporte e FAQ | Pendente |
| P1 | Desempenho/escala | Testes atuais cobrem funcionalidades, não carga simultânea multi-cliente | P95 no Android, concorrência 20/100 clientes, custos/limites Supabase e IA, proteção abuso | Pendente |
| P1 | Ciclo de entrega | CI de testes existe em branches, mas não há procedimento completo de rollout por plano | Build, migrações + frontend em ordem, staging, smoke tests, versão, rollback sem perda financeira | Pendente |
| P1 | Exportação e portabilidade | Relatórios CSV/XLSX/PDF existem para alguns extratos, mas não exportação completa de todos dados e recibos | Exportar conta, cartões, transferências, previsões, anexos e dados de perfil com validação de titular | Pendente |
| P2 | Marca e página comercial | README inicial ainda contém placeholder e package.json informa versão 0.0.0 | Documentação, identidade, landing page, domínio, FAQ, demonstração | Pendente |
| P2 | Precificação, impostos e posicionamento | Preço hipotético não é teste real de willingness-to-pay | Custo variável por leitura e cliente, margem, cobrança e obrigações fiscais avaliadas com contador | Pendente |
| P2 | Analytics comercial | Não há funil/conversão/churn/retention comprovados | Eventos de ativação e retenção sem dados financeiros pessoais ou conteúdo dos recibos | Pendente |

## Execução já iniciada — branch `product/commercial-readiness-foundation`

1. **Recuperação de senha** (`src/pages/PasswordRecovery.tsx`, rota pública e link no login): sem expor se a conta existe; exige token/session e confirmação. Necessário **configurar** no Supabase Auth Redirect URLs o endereço `https://tavares1989finance.lovable.app/recuperar-senha?recovery=1` e testar link real no Moto G32. Não alegar pronto antes.
2. **RPCs antigas**: `20261022130000_harden_legacy_invoice_rpc_anonymous.sql` preserva execução autenticada, retira `PUBLIC`/`anon` das sete funções antigas de faturas. **Não foi aplicado a produção**. Testar em Postgres descartável e primeiro validar momento seguro para aplicar; não confundir com Fase 2C.
3. Testes de recuperação de senha, grants, TypeScript/build no workflow `product-readiness-foundation.yml`.
4. Consulta READ ONLY ao banco de produção: oito grupos de ligações entre registros diferentes têm **zero** divergências de `user_id` na fotografia consultada. Necessário impedimento preventivo contra inserção de vínculo de outro titular.

## Arquitetura planejada de venda

- Usuário: autenticação Supabase; dados pertencem a um `user_id`; não transferir nem expor dados entre clientes.
- Pagamentos: integrações **server-side** com provedor a definir, verificando assinatura de webhook e idempotência, sem confiar em campos de assinatura no browser.
- Acesso: tabelas `plans` e `subscriptions` sob backend seguro; app consulta permissões calculadas no servidor, não pode alterá-las.
- Leitura IA: gateway autenticado, quota e limite de gasto server-side por período; fotos, tokens e informação financeira jamais entram em telemetria de marketing.
- Planos iniciais propostos: básico manual e premium com franquia de IA — preços pendentes de custo, margem e piloto.
- Não habilitar bloqueios de plano no aplicativo pessoal antes de migrar/garantir acesso do proprietário.

## Piloto sem cobrança — gates

- [ ] 2 usuários reais de testes com comprovada separação de tudo (financeiro, anexos, RPCs).
- [ ] Pagamentos/faturas sem duplicações ou ações parciais, após implantação segura da Fase 2C.
- [ ] Backup recente testado em clone, inclusive novos arquivos de storage; recuperar sem apagar transações posteriores.
- [ ] E-mail de recuperação e login Android reais funcionando.
- [ ] Sem chamada anônima às funções privilegiadas antigas.
- [ ] OCR e captura validados, sem regressão e com limite de custo.
- [ ] Política de privacidade/termos e canal de solicitação de dados e suporte definidos.

## Comercialização com cobrança — gates adicionais

- [ ] Webhook e assinatura idempotentes testados com eventos duplicados/falsos/fora de ordem.
- [ ] Controle de quota de leitura por usuário, persistente em toda a infraestrutura.
- [ ] Cancelamento, inadimplência, reembolso, notas fiscais e política de atendimento.
- [ ] Avaliação LGPD e textos legais com identificação real do responsável; custos/tributos testados.
- [ ] Conclusão de teste de carga mínimo, erros monitorados e controle de versão/rollback.

## Fontes de requisitos e recomendações (não substituem revisão jurídica)

- ANPD: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares
- Guia e checklist de segurança para agentes de pequeno porte: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte
- Supabase reset e configuração de redirect: https://supabase.com/docs/guides/auth/passwords

**Regra de segurança:** nunca executar SQL, publicar frontend ou manipular dados de produção como consequência automática deste documento; cada implantação que altere dados/infra exige autorização e gate com invariantes pré e pós.
