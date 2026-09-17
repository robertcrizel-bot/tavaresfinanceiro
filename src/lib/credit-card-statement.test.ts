import { describe, expect, it } from "vitest";
import {
  buildCreditCardStatement,
  type CardStatementTransaction,
} from "@/lib/credit-card-statement";

const tx = (overrides: Partial<CardStatementTransaction> = {}): CardStatementTransaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 8)}`,
  title: "Compra",
  amount: 100,
  type: "expense",
  category: "Alimentação",
  date: "2026-09-15",
  creditCardId: "cc-1",
  ...overrides,
});

const build = (
  transactions: CardStatementTransaction[] = [],
  creditCardId = "cc-1",
) =>
  buildCreditCardStatement({
    creditCardId,
    transactions,
    referenceMonth: "2026-09",
  });

describe("buildCreditCardStatement", () => {
  // ========== BASIC PURCHASE ==========

  it("compra normal → purchase/charge", () => {
    const result = build([tx()]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sourceType).toBe("purchase");
    expect(result.entries[0].direction).toBe("charge");
    expect(result.entries[0].amount).toBe(100);
  });

  // ========== IS PAID ==========

  it("compra paga continua aparecendo", () => {
    const result = build([tx({ isPaid: true })]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].isPaid).toBe(true);
    expect(result.entries[0].sourceType).toBe("purchase");
  });

  it("compra não paga aparece", () => {
    const result = build([tx({ isPaid: false })]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].isPaid).toBe(false);
  });

  // ========== FILTERING ==========

  it("outro cartão ignorado", () => {
    const result = build([tx({ creditCardId: "cc-2" })]);

    expect(result.entries).toHaveLength(0);
  });

  it("transaction sem cartão ignorada", () => {
    const result = build([tx({ creditCardId: undefined })]);

    expect(result.entries).toHaveLength(0);
  });

  // ========== BILL PAYMENT ==========

  it("pagamento de fatura por category → payment/credit", () => {
    const result = build([
      tx({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        accountId: "acc-1",
        creditCardId: "cc-1",
      }),
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sourceType).toBe("payment");
    expect(result.entries[0].direction).toBe("credit");
    expect(result.entries[0].amount).toBe(100);
  });

  it("pagamento de fatura por title → payment/credit", () => {
    const result = build([
      tx({
        title: "Pagar fatura cartão",
        category: "Outros",
        type: "expense",
        accountId: "acc-1",
        creditCardId: "cc-1",
      }),
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sourceType).toBe("payment");
    expect(result.entries[0].direction).toBe("credit");
  });

  it("pagamento por accountId+creditCardId → payment/credit", () => {
    const result = build([
      tx({
        title: "Pagamento",
        category: "Outros",
        type: "expense",
        accountId: "acc-1",
        creditCardId: "cc-1",
      }),
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sourceType).toBe("payment");
    expect(result.entries[0].direction).toBe("credit");
  });

  it("pagamento não é contado como purchase no summary", () => {
    const result = build([
      tx({ amount: 500, category: "Alimentação" }),
      tx({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        amount: 300,
        accountId: "acc-1",
        creditCardId: "cc-1",
      }),
    ]);

    expect(result.summary.totalPurchases).toBe(500);
    expect(result.summary.totalPayments).toBe(300);
    expect(result.entries).toHaveLength(2);
  });

  // ========== REVERSAL ==========

  it("income no cartão → reversal/credit", () => {
    const result = build([
      tx({
        title: "Estorno",
        type: "income",
        amount: 50,
        category: "Outros",
      }),
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sourceType).toBe("reversal");
    expect(result.entries[0].direction).toBe("credit");
    expect(result.entries[0].amount).toBe(50);
  });

  // ========== ADJUSTMENTS ==========

  it("ajuste interno ignorado", () => {
    const result = build([
      tx({ title: "Ajuste de saldo", category: "Outros", description: "Ajuste manual" }),
    ]);

    expect(result.entries).toHaveLength(0);
  });

  it("ajuste por category ignorado", () => {
    const result = build([
      tx({ title: "Correção", category: "Ajuste" as CardStatementTransaction["category"] }),
    ]);

    expect(result.entries).toHaveLength(0);
  });

  // ========== INSTALLMENTS ==========

  it("parcela aparece uma única vez", () => {
    const result = build([
      tx({ id: "tx-installment", title: "TV 4K (2/5)", amount: 200 }),
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe("tx-installment");
  });

  it("installmentInfo extraído do título", () => {
    const result = build([tx({ title: "TV 4K (2/3)" })]);

    expect(result.entries[0].installmentInfo).toBe("2/3");
  });

  it("sem installmentInfo quando título não contém parcela", () => {
    const result = build([tx({ title: "Supermercado" })]);

    expect(result.entries[0].installmentInfo).toBeUndefined();
  });

  it("parcelas diferentes aparecem individualmente", () => {
    const result = build([
      tx({ id: "tx-p1", title: "Sofá (1/3)", amount: 300, date: "2026-09-05" }),
      tx({ id: "tx-p2", title: "Sofá (2/3)", amount: 300, date: "2026-10-05" }),
      tx({ id: "tx-p3", title: "Sofá (3/3)", amount: 300, date: "2026-11-05" }),
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe("tx-p1");
    expect(result.entries[0].installmentInfo).toBe("1/3");
  });

  // ========== MONTH FILTERING ==========

  it("filtra por referenceMonth", () => {
    const result = build([
      tx({ date: "2026-09-10" }),
      tx({ date: "2026-08-31" }),
      tx({ date: "2026-10-01" }),
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].date).toBe("2026-09-10");
  });

  // ========== SUMMARIES ==========

  it("totalPurchases está correto", () => {
    const result = build([
      tx({ amount: 100, date: "2026-09-05" }),
      tx({ amount: 200, date: "2026-09-10" }),
    ]);

    expect(result.summary.totalPurchases).toBe(300);
  });

  it("totalCredits está correto (estornos)", () => {
    const result = build([
      tx({ amount: 100, date: "2026-09-05" }),
      tx({ title: "Estorno", type: "income", amount: 30, date: "2026-09-10" }),
    ]);

    expect(result.summary.totalCredits).toBe(30);
  });

  it("totalPayments está correto", () => {
    const result = build([
      tx({ amount: 500, date: "2026-09-05" }),
      tx({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        amount: 200,
        accountId: "acc-1",
        creditCardId: "cc-1",
        date: "2026-09-10",
      }),
    ]);

    expect(result.summary.totalPayments).toBe(200);
  });

  // ========== EDGE CASES ==========

  it("valores sempre positivos mesmo para expense", () => {
    const result = build([tx({ amount: -500 })]);

    expect(result.entries[0].amount).toBe(500);
  });

  it("mês sem movimentos retorna vazio com zeros", () => {
    const result = build([tx({ date: "2026-08-15" })]);

    expect(result.entries).toHaveLength(0);
    expect(result.summary.totalPurchases).toBe(0);
    expect(result.summary.totalCredits).toBe(0);
    expect(result.summary.totalPayments).toBe(0);
  });

  // ========== SORTING ==========

  it("ordena por data decrescente", () => {
    const result = build([
      tx({ id: "tx-a", date: "2026-09-05" }),
      tx({ id: "tx-b", date: "2026-09-20" }),
      tx({ id: "tx-c", date: "2026-09-10" }),
    ]);

    expect(result.entries.map((e) => e.id)).toEqual(["tx-b", "tx-c", "tx-a"]);
  });

  it("mesma data: ordena por createdAt quando disponível", () => {
    const result = build([
      tx({ id: "tx-1", date: "2026-09-15", createdAt: "2026-09-15T08:00:00Z" }),
      tx({ id: "tx-2", date: "2026-09-15", createdAt: "2026-09-15T14:00:00Z" }),
      tx({ id: "tx-3", date: "2026-09-15", createdAt: "2026-09-15T10:00:00Z" }),
    ]);

    expect(result.entries.map((e) => e.id)).toEqual(["tx-2", "tx-3", "tx-1"]);
  });

  it("mesma data sem createdAt: ordenação determinística por id", () => {
    const result = build([
      tx({ id: "tx-c", date: "2026-09-15" }),
      tx({ id: "tx-a", date: "2026-09-15" }),
      tx({ id: "tx-b", date: "2026-09-15" }),
    ]);

    expect(result.entries.map((e) => e.id)).toEqual(["tx-a", "tx-b", "tx-c"]);
  });

  // ========== PARTIAL PAYMENT SCENARIO ==========

  it("pagamento parcial: Parcial fatura é partial_record/neutral, não purchase", () => {
    const result = build([
      tx({
        id: "tx-original",
        title: "Notebook",
        amount: 200,
        type: "expense",
        category: "Educação",
        creditCardId: "cc-1",
        isPaid: false,
        date: "2026-09-10",
      }),
      tx({
        id: "tx-parcial",
        title: "Parcial fatura",
        amount: 80,
        type: "expense",
        category: "Fatura Cartão",
        creditCardId: "cc-1",
        isPaid: true,
        date: "2026-09-10",
      }),
      tx({
        id: "tx-pagamento",
        title: "Pagamento de Fatura",
        amount: 80,
        type: "expense",
        category: "Pagamento Fatura",
        creditCardId: "cc-1",
        accountId: "acc-1",
        isPaid: true,
        date: "2026-09-15",
      }),
    ]);

    expect(result.entries).toHaveLength(3);

    const purchase = result.entries.find((e) => e.sourceType === "purchase");
    expect(purchase?.id).toBe("tx-original");
    expect(purchase?.amount).toBe(200);
    expect(purchase?.direction).toBe("charge");

    const partial = result.entries.find((e) => e.sourceType === "partial_record");
    expect(partial?.id).toBe("tx-parcial");
    expect(partial?.amount).toBe(80);
    expect(partial?.direction).toBe("neutral");

    const payment = result.entries.find((e) => e.sourceType === "payment");
    expect(payment?.id).toBe("tx-pagamento");
    expect(payment?.amount).toBe(80);
    expect(payment?.direction).toBe("credit");

    expect(result.summary.totalPurchases).toBe(200);
    expect(result.summary.totalPayments).toBe(80);
  });

  it("pagamento parcial R$280/R$80 conforme fluxo real de payCardBill", () => {
    const result = build([
      tx({
        id: "tx-sofa",
        title: "Sofá",
        amount: 200,
        type: "expense",
        category: "Moradia",
        creditCardId: "cc-1",
        isPaid: false,
        date: "2026-09-10",
      }),
      tx({
        id: "tx-parcial",
        title: "Parcial fatura",
        amount: 80,
        type: "expense",
        category: "Fatura Cartão",
        creditCardId: "cc-1",
        isPaid: true,
        date: "2026-09-10",
      }),
      tx({
        id: "tx-pagamento",
        title: "Pagamento de Fatura",
        amount: 80,
        type: "expense",
        category: "Pagamento Fatura",
        creditCardId: "cc-1",
        accountId: "acc-1",
        isPaid: true,
        date: "2026-09-15",
      }),
    ]);

    expect(result.entries).toHaveLength(3);

    expect(result.entries.find((e) => e.id === "tx-sofa")?.sourceType).toBe("purchase");
    expect(result.entries.find((e) => e.id === "tx-sofa")?.direction).toBe("charge");
    expect(result.entries.find((e) => e.id === "tx-parcial")?.sourceType).toBe("partial_record");
    expect(result.entries.find((e) => e.id === "tx-parcial")?.direction).toBe("neutral");
    expect(result.entries.find((e) => e.id === "tx-pagamento")?.sourceType).toBe("payment");
    expect(result.entries.find((e) => e.id === "tx-pagamento")?.direction).toBe("credit");

    expect(result.summary.totalPurchases).toBe(200);
    expect(result.summary.totalPayments).toBe(80);
  });

  // ========== MIXED ENTRIES ==========

  it("mistura compra + pagamento + estorno", () => {
    const result = build([
      tx({ id: "tx-buy", amount: 500, date: "2026-09-05" }),
      tx({
        id: "tx-rev",
        title: "Estorno",
        type: "income",
        amount: 50,
        date: "2026-09-08",
      }),
      tx({
        id: "tx-pay",
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        amount: 200,
        accountId: "acc-1",
        creditCardId: "cc-1",
        date: "2026-09-10",
      }),
    ]);

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].date).toBe("2026-09-10");
    expect(result.entries[0].sourceType).toBe("payment");
    expect(result.entries[1].date).toBe("2026-09-08");
    expect(result.entries[1].sourceType).toBe("reversal");
    expect(result.entries[2].date).toBe("2026-09-05");
    expect(result.entries[2].sourceType).toBe("purchase");

    expect(result.summary.totalPurchases).toBe(500);
    expect(result.summary.totalCredits).toBe(50);
    expect(result.summary.totalPayments).toBe(200);
  });

  // ========== SOURCE IDS ==========

  it("sourceId é o id original da transaction", () => {
    const result = build([tx({ id: "tx-original" })]);

    expect(result.entries[0].sourceId).toBe("tx-original");
  });

  // ========== CATEGORY ==========

  it("category está presente em entries de purchase", () => {
    const result = build([tx({ category: "Moradia" })]);

    expect(result.entries[0].category).toBe("Moradia");
  });

  it("category está presente em entries de payment", () => {
    const result = build([
      tx({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        accountId: "acc-1",
        creditCardId: "cc-1",
      }),
    ]);

    expect(result.entries[0].category).toBe("Pagamento Fatura");
  });

  // ========== DEFAULTS ==========

  it("isPaid defaulta para false quando undefined", () => {
    const result = build([tx({ isPaid: undefined })]);

    expect(result.entries[0].isPaid).toBe(false);
  });

  it("isPaid defaulta para true para pagamentos", () => {
    const result = build([
      tx({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        accountId: "acc-1",
        creditCardId: "cc-1",
        isPaid: undefined,
      }),
    ]);

    expect(result.entries[0].isPaid).toBe(true);
  });

  // ========== PARTIAL RECORD COVERAGE ==========

  it("partial_record NÃO entra em totalPurchases", () => {
    const result = build([
      tx({ amount: 100 }),
      tx({
        title: "Parcial fatura",
        amount: 50,
        category: "Fatura Cartão",
        creditCardId: "cc-1",
        isPaid: true,
      }),
    ]);

    expect(result.summary.totalPurchases).toBe(100);
    expect(result.entries.find((e) => e.sourceType === "partial_record")).toBeDefined();
  });

  it("partial_record NÃO entra em totalCredits", () => {
    const result = build([
      tx({ title: "Estorno", type: "income", amount: 30 }),
      tx({
        title: "Parcial fatura",
        amount: 50,
        category: "Fatura Cartão",
        creditCardId: "cc-1",
        isPaid: true,
      }),
    ]);

    expect(result.summary.totalCredits).toBe(30);
  });

  it("partial_record NÃO entra em totalPayments", () => {
    const result = build([
      tx({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        amount: 200,
        accountId: "acc-1",
        creditCardId: "cc-1",
      }),
      tx({
        title: "Parcial fatura",
        amount: 50,
        category: "Fatura Cartão",
        creditCardId: "cc-1",
        isPaid: true,
      }),
    ]);

    expect(result.summary.totalPayments).toBe(200);
  });

  it("partial_record NÃO altera totalPurchases, totalCredits nem totalPayments", () => {
    const result = build([
      tx({ amount: 300 }),
      tx({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        amount: 100,
        accountId: "acc-1",
        creditCardId: "cc-1",
      }),
      tx({
        title: "Parcial fatura",
        amount: 50,
        category: "Fatura Cartão",
        creditCardId: "cc-1",
        isPaid: true,
      }),
    ]);

    expect(result.summary.totalPurchases).toBe(300);
    expect(result.summary.totalCredits).toBe(0);
    expect(result.summary.totalPayments).toBe(100);
  });

  it("pagamento real continua payment/credit", () => {
    const result = build([
      tx({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        amount: 150,
        accountId: "acc-1",
        creditCardId: "cc-1",
        isPaid: true,
      }),
    ]);

    expect(result.entries[0].sourceType).toBe("payment");
    expect(result.entries[0].direction).toBe("credit");
  });

  it("compra restante continua purchase/charge após pagamento parcial", () => {
    const result = build([
      tx({
        id: "tx-rest",
        title: "Notebook",
        amount: 200,
        type: "expense",
        category: "Educação",
        creditCardId: "cc-1",
        isPaid: false,
      }),
    ]);

    expect(result.entries[0].sourceType).toBe("purchase");
    expect(result.entries[0].direction).toBe("charge");
  });

  it("pagamento TOTAL: compra intacta/is_paid + pagamento credit, sem partial_record", () => {
    const result = build([
      tx({
        id: "tx-full",
        title: "TV 4K",
        amount: 500,
        type: "expense",
        category: "Lazer",
        creditCardId: "cc-1",
        isPaid: true,
      }),
      tx({
        id: "tx-pay-full",
        title: "Pagamento de Fatura",
        amount: 500,
        type: "expense",
        category: "Pagamento Fatura",
        creditCardId: "cc-1",
        accountId: "acc-1",
        isPaid: true,
      }),
    ]);

    expect(result.entries).toHaveLength(2);
    expect(result.entries.find((e) => e.id === "tx-full")?.sourceType).toBe("purchase");
    expect(result.entries.find((e) => e.id === "tx-full")?.direction).toBe("charge");
    expect(result.entries.find((e) => e.id === "tx-pay-full")?.sourceType).toBe("payment");
    expect(result.entries.find((e) => e.id === "tx-pay-full")?.direction).toBe("credit");

    expect(result.summary.totalPurchases).toBe(500);
    expect(result.summary.totalPayments).toBe(500);

    expect(result.entries.find((e) => e.sourceType === "partial_record")).toBeUndefined();
  });

  it("compra legítima com category semelhante não vira partial_record", () => {
    const result = build([
      tx({
        title: "Taxa fatura cartão",
        amount: 15,
        type: "expense",
        category: "Fatura Cartão",
        creditCardId: "cc-1",
        isPaid: true,
      }),
    ]);

    expect(result.entries[0].sourceType).toBe("purchase");
    expect(result.entries[0].direction).toBe("charge");
  });

  it("partial_record mantém isPaid true e category originais", () => {
    const result = build([
      tx({
        title: "Parcial fatura",
        amount: 60,
        category: "Fatura Cartão",
        creditCardId: "cc-1",
        isPaid: true,
      }),
    ]);

    expect(result.entries[0].isPaid).toBe(true);
    expect(result.entries[0].category).toBe("Fatura Cartão");
    expect(result.entries[0].description).toBe("Parcial fatura");
  });
});
