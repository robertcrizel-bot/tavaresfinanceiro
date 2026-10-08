import { describe, expect, it } from "vitest";
import {
  buildStatementExportRows,
  filterStatementTransactions,
  originFromKey,
  originKey,
  statementExportFilename,
  summarizeAccount,
  summarizeByCategory,
  summarizeCard,
  topMovements,
  type StatementFilters,
  type Transaction,
} from "@/lib/statements";

const baseFilters: StatementFilters = {
  origin: { kind: "all" },
  start: "2026-09-01",
  end: "2026-09-30",
  type: "all",
  category: "all",
  paymentMethod: "all",
  search: "",
  minAmount: null,
  maxAmount: null,
  sort: "date-desc",
};

function tx(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    title: "Lançamento",
    amount: 0,
    type: "expense",
    category: "Outros",
    date: "2026-09-10",
    ...overrides,
  } as Transaction;
}

const purchaseA = tx({ id: "p1", title: "Supermercado", amount: 100, category: "Alimentação", creditCardId: "card-1", financialKind: "card_purchase", date: "2026-09-29" });
const purchaseB = tx({ id: "p2", title: "Farmácia", amount: 50, category: "Saúde", creditCardId: "card-1", financialKind: "card_purchase", date: "2026-09-05" });
const obligation = tx({
  id: "ob1", title: "Fatura Cartão", amount: 150, category: "Fatura Cartão",
  creditCardId: "card-1", creditCardInvoiceId: "inv-1", financialKind: "card_invoice_obligation", date: "2026-09-30",
});
const payment = tx({
  id: "pay1", title: "Pagamento de Fatura", amount: 150, category: "Fatura Cartão",
  accountId: "acc-1", creditCardId: "card-1", creditCardInvoiceId: "inv-1",
  financialKind: "card_invoice_payment", paymentMethod: "Transferência", date: "2026-09-30",
});
const salary = tx({ id: "s1", title: "Salário", amount: 1000, type: "income", category: "Salário", accountId: "acc-1", date: "2026-09-01" });
const rent = tx({ id: "r1", title: "Aluguel", amount: 300, category: "Moradia", accountId: "acc-1", paymentMethod: "Pix", date: "2026-09-03" });

describe("statements financial semantics", () => {
  it("1. conta: entradas 1000, saídas 300, saldo 700", () => {
    const rows = filterStatementTransactions([salary, rent], { ...baseFilters, origin: { kind: "account", accountId: "acc-1" } });
    expect(summarizeAccount(rows)).toEqual({ income: 1000, expense: 300, balance: 700, count: 2 });
  });

  it("2. cartão: compras 100 + 50 e pagamento 150 mostra 150 em compras, não 300", () => {
    const rows = filterStatementTransactions([purchaseA, purchaseB, obligation, payment], {
      ...baseFilters,
      origin: { kind: "card", cardId: "card-1" },
    });
    expect(rows.map((row) => row.id).sort()).toEqual(["p1", "p2"]);
    expect(summarizeCard(rows)).toEqual({ purchases: 150, refunds: 0, net: 150, count: 2 });
  });

  it("3. pagamento de fatura aparece uma única vez no extrato da conta", () => {
    const rows = filterStatementTransactions([payment, payment], {
      ...baseFilters,
      origin: { kind: "account", accountId: "acc-1" },
    });
    expect(rows).toHaveLength(2);
    const all = filterStatementTransactions([salary, rent, payment, obligation], {
      ...baseFilters,
      origin: { kind: "account", accountId: "acc-1" },
    });
    expect(all.filter((row) => row.financialKind === "card_invoice_payment")).toHaveLength(1);
    expect(summarizeAccount(all).expense).toBe(450);
  });

  it("4. obrigação de fatura nunca aparece como compra", () => {
    const rows = filterStatementTransactions([obligation], { ...baseFilters, origin: { kind: "card", cardId: "card-1" } });
    expect(rows).toEqual([]);
    const all = filterStatementTransactions([obligation], baseFilters);
    expect(all).toEqual([]);
  });

  it("5. filtro por cartão isola as compras do cartão", () => {
    const other = tx({ id: "p3", title: "Outro cartão", amount: 999, creditCardId: "card-2", financialKind: "card_purchase" });
    const rows = filterStatementTransactions([purchaseA, other], { ...baseFilters, origin: { kind: "card", cardId: "card-1" } });
    expect(rows.map((row) => row.id)).toEqual(["p1"]);
  });

  it("6. filtro por categoria e clique em categoria equivalem", () => {
    const rows = filterStatementTransactions([purchaseA, purchaseB, rent], { ...baseFilters, category: "Alimentação" });
    expect(rows.map((row) => row.id)).toEqual(["p1"]);
    const slices = summarizeByCategory([purchaseA, purchaseB, rent]);
    expect(slices[0]).toMatchObject({ category: "Moradia", total: 300 });
    expect(slices.find((slice) => slice.category === "Alimentação")).toMatchObject({ total: 100 });
  });

  it("7. filtro por período usa transaction.date da compra, não o ciclo da fatura", () => {
    const rows = filterStatementTransactions([purchaseA], { ...baseFilters, start: "2026-09-29", end: "2026-09-29" });
    expect(rows.map((row) => row.id)).toEqual(["p1"]);
    const out = filterStatementTransactions([purchaseA], { ...baseFilters, start: "2026-09-30", end: "2026-09-30" });
    expect(out).toEqual([]);
  });

  it("8. busca textual encontra título, descrição e estabelecimento", () => {
    const withMerchant = tx({ id: "m1", title: "Compra", receiptDetails: { merchantName: "Padaria Pão Dourado" } });
    const rows = filterStatementTransactions(
      [purchaseA, withMerchant],
      { ...baseFilters, search: "pão dourado" },
    );
    expect(rows.map((row) => row.id)).toEqual(["m1"]);
    const byTitle = filterStatementTransactions([purchaseA, purchaseB], { ...baseFilters, search: "farmácia" });
    expect(byTitle.map((row) => row.id)).toEqual(["p2"]);
  });

  it("9. maiores movimentações ordenam por valor", () => {
    expect(topMovements([purchaseB, salary, purchaseA], 2).map((row) => row.id)).toEqual(["s1", "p1"]);
  });

  it("10. exportação contém somente os dados filtrados", () => {
    const rows = filterStatementTransactions([purchaseA, purchaseB], { ...baseFilters, category: "Saúde" });
    const exported = buildStatementExportRows(rows, { accounts: [], creditCards: [], invoices: [] });
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({
      Descrição: "Farmácia",
      Categoria: "Saúde",
      Origem: "Cartão",
      Tipo: "Saída",
      Valor: -50,
    });
    expect(statementExportFilename("2026-09-01", "2026-09-30")).toBe(
      "FinanceControl_Extrato_2026-09-01_2026-09-30.xlsx",
    );
  });

  it("origin keys round-trip sem expor id técnico", () => {
    expect(originFromKey(originKey({ kind: "account", accountId: "a1" }))).toEqual({ kind: "account", accountId: "a1" });
    expect(originFromKey(originKey({ kind: "card", cardId: "c1" }))).toEqual({ kind: "card", cardId: "c1" });
    expect(originFromKey("tudo")).toEqual({ kind: "all" });
  });
});
