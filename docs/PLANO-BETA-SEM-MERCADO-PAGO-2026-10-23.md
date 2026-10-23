# FinanceControl — primeiro piloto pago sem Mercado Pago (23/10/2026)

## Objetivo
Vender o plano Beta com fluxo enxuto, **sem Mercado Pago** e sem exigir credenciais financeiras no navegador. Nenhuma alteração em produção está autorizada pelo simples ato de criar esta branch.

## Alternativas verificadas (links oficiais)
1. **Asaas**: https://www.asaas.com/link-pagamento — conta PF possível, sem mensalidade, link recorrente do tipo RECURRENT e ciclo MONTHLY. Cobrança no cartão pode ser automática; boleto/Pix requer pagamento pelo cliente a cada período conforme configuração. Preços, liquidação e elegibilidade devem ser confirmados na conta. Documentação: https://docs.asaas.com/docs/criando-um-link-de-pagamentos
2. **PagBank**: https://faq.pagbank.com.br/duvida/como-integrar-pagamento-recorrente-no-meu-site/119 — link recorrente para PF, somente cartão de crédito, sem integração da API em contas PF. Regras: https://developer.pagbank.com.br/docs/pagamentos-recorrentes

Não usar Mercado Pago, por restrição indicada pelo titular.

## Entrega nesta branch
- Página pública em `/beta`, independente de login, com descrição honesta das funções existentes, sem garantia de IA paga.
- `VITE_BETA_CHECKOUT_URL` opcional permite ativar link HTTPS APENAS em domínios hospedados por Asaas/PagBank, após verificação manual.
- `VITE_BETA_MONTHLY_PRICE` opcional define o texto do preço; nenhum preço é inventado na página.
- Sem URL configurada, nenhum botão de cobrança aparece; status: **assinaturas em preparação**.
- Sempre informar que, na beta inicial, acesso não é liberado automaticamente depois de pagamento.

## Como abrir primeiro cliente
1. Escolher um valor sustentável (considerar taxas, suporte, inadimplência, imposto e custo de OCR; IA não incluída nesta fase).
2. Conta aprovada no **Asaas** ou **PagBank** (a pessoa física é aceita, mas as formas/limites dependem do provedor); criar **link recorrente mensal** na plataforma escolhida e verificar que não é parcelamento de venda avulsa.
3. **Antes de aceitar qualquer pagamento**, estabelecer um fluxo verificável de cadastro privado de clientes pagantes: impedir que uma inscrição gratuita obtenha acesso pago pelo frontend e pelo backend; confirmar dois usuários não veem dados um do outro em instância real. O cadastro atualmente é aberto em `/auth` — logo, página de beta preparada NÃO é licença para cobrar.
4. Criar Termos de Uso, Política de Privacidade e canal para solicitações de dados/cancelamento; LGPD, notificações e documentação mínima.
5. Conferir o link real no domínio do provedor e preço/cancelamento. Inserir SOMENTE o link público via `VITE_BETA_CHECKOUT_URL` e valor via `VITE_BETA_MONTHLY_PRICE` (ex. `R$ 19,90`, preço de referência sujeito à decisão do titular). Nunca inserir chave privada em `VITE_*`.
6. Ao vender: conciliar status **confirmado no painel/webhook**; NUNCA ativar conta porque a pessoa retornou ao aplicativo com um parâmetro `success`. Link não identifica automaticamente o usuário no Auth; identidade do pagador deve ser reconciliada com segurança.
7. Iniciar com cinco usuários controlados; medir custo e retenção; só depois automatizar assinaturas, webhooks idempotentes e limite de IA por conta.

## Proteções importantes
- Não tocar no OCR/Gemma/câmera/trabalhadores financeiros para criar a página de oferta.
- Não fazer deploy da branch `sales/first-paying-beta-20261023` antes de unir à candidata 2C validada e aprovar as migrations.
- Não usar botão de checkout de outro serviço, links fictícios nem oferecer cobrança sem ativação definida.
- O código publicado em `main` permanece intacto; criar branch e PR não instala SQL nem publica.
