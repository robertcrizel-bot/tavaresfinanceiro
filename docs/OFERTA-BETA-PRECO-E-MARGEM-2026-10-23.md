# FinanceControl — oferta Beta de entrada (proposta interna, não publicada)
**Data-base: 23/10/2026. Não constitui aprovação de preço ou abertura da cobrança.**

## Objetivo
Vender as primeiras 5 a 10 assinaturas com operação manual controlada, SEM IA ilimitada, SEM Mercado Pago, sem checkout próprio. Público: pessoas com dificuldades para registrar gastos e controlar cartões/previsões.

## Oferta recomendada
- **Proposta de teste de mercado:** R$ 24,90 por mês por usuário.
- Cobrança mensal e sem compromisso anual; formalizar renovação, cancelamento e canais antes de vender.
- Inclui: contas, lançamentos, cartões/faturas, previsões, comprovantes, exportação JSON de dados financeiros (sem binários das imagens).
- A leitura de IA, OCR e captura automática não são benefícios garantidos pela oferta; antes de expandir, exigir franquia e limites de custo por usuário no servidor.
- Não prometer app nativo, integração automática com bancos, automação fiscal ou aconselhamento financeiro.
- **Não anunciar preço nem habilitar checkout na página /beta** até o titular aprovar o valor e confirmar sua conta Asaas.

## Tarifas públicas Asaas, sujeitas à proposta do titular
Fonte: https://www.asaas.com/precos-e-taxas (consultada em 23/10/2026)
- Pix/boleto: tarifa padrão exibida R$ 1,99 por cobrança recebida; promoção da página R$ 0,99 por três meses, se aplicável.
- Cartão (crédito à vista/assinatura): R$ 0,49 + 2,99%; promoção R$ 0,49 + 1,99% por três meses, se aplicável.
- Cobranças gratuitas para emissão; não há mensalidade de uso; o Asaas desconta tarifa quando recebe. Cuidado: transferências e serviços opcionais podem ter outras tarifas.
- As taxas reais são as do painel do titular: não assumir acesso à promoção.
- Para R$ 24,90: Pix normal líquido **R$ 22,91**; cartão normal (2,99% + R$0,49) líquido aproximado **R$ 23,67**. Estes valores não incluem impostos, infraestrutura, suporte ou falhas de pagamento.
- 5 assinantes: faturamento bruto R$ 124,50/mês; 10 assinantes: R$ 249,00/mês. Receita efetiva depende de pagamentos recebidos, taxas e custos.

## Como funciona a beta fechada
1. Visita à página `/beta` e apresentação transparente das condições.
2. Conta é criada com email autenticado; o cadastro **não concede plano**.
3. Cliente usa link **Asaas RECURRENT/MONTHLY** hospedado e válido, após aprovação KYC.
4. Cliente pode solicitar análise de acesso dentro do FinanceControl.
5. Proprietário confere cobrança real no painel do Asaas e associa com o usuário Auth correto. Nunca confiar em screenshot, querystring, retorno do checkout ou lista de pedidos.
6. Admin autorizado concede `beta_entitlements` por período coberto; sem esse grant a política RLS e os triggers bloqueiam operações financeiras.
7. Renovação/atraso/cancelamento precisam ser conciliados manualmente (na beta), e revogação deve ser exercitada.

## Pendências mínimas antes da primeira cobrança
- [ ] Verificação de documentos no Asaas concluída.
- [ ] Preço e condições do plano aceitos, conferidas as taxas efetivas.
- [ ] Conta proprietária identificada; controle de acesso ativado depois de grant prévio.
- [ ] Versão PR #12 + #13 + #14 + #15 implantada e testada em dois usuários distintos.
- [ ] Link oficial **recorrente mensal**, não parcelamento, testado com identidade do pagador.
- [ ] Política de privacidade, termos, identidade do fornecedor e contato de suporte publicados e revisados.
- [ ] Procedimento de cancelamento, dados e estorno validado; testar inadimplência e revogação.
- [ ] Controle de custos da IA/limitação do uso comercial e ausência de fallback pago automático confirmados.
- [ ] Um fluxo de suporte sem atendimento síncrono (email/FAQ) definido.
- [ ] Publicação final em produção somente com autorização e preflight de integridade.
