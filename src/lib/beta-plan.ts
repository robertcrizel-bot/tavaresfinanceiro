/** Preço público decidido para a oferta Beta. Não autentica pagamentos. */
export const BETA_MONTHLY_PRICE_CENTS = 2490 as const;
export const BETA_MONTHLY_PRICE_LABEL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(BETA_MONTHLY_PRICE_CENTS / 100);
