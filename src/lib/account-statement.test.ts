import { describe, expect, it } from "vitest";
import {
  buildAccountStatement,
  type StatementTransaction,
  type StatementTransfer,
  type StatementAccount,
} from "@/lib/account-statement";
import { calculateAccountBalances } from "@/lib/financial-calculations";

const account: StatementAccount = { id: "acc-1", name: "Inter Robert", initialBalance: 1000 };
const otherAccount: StatementAccount = { id: "acc-2", name: "Caixa", initialBalance: 500 };
const allAccounts: StatementAccount[] = [account, otherAccount];

const tx = (overrides: Partial<StatementTransaction> = {}): StatementTransaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 8)}`,
  title: "Compra",
  amount: 100,
  type: "expense",
  category: "Alimentação",
  date: "2026-09-15",
  accountId: "acc-1",
  ...overrides,
});

const tr = (overrides: Partial<StatementTransfer> = {}): StatementTransfer => ({
  id: `tr-${Math.random().toString(36).slice(2, 8)}`,
  fromAccountId: "acc-1",
  toAccountId: "acc-2",
  amount: 200,
  date: "2026-09-14",
  createdAt: "2026-09-14T10:00:00Z",
  ...overrides,
});

const build = (
  transactions: StatementTransaction[] = [],
  transfers: StatementTransfer[] = [],
  accountId = "acc-1",
) =>
  buildAccountStatement({
    accountId,
    transactions,
    transfers,
    accounts: allAccounts,
    referenceMonth: "2026-09",
  });

describe("buildAccountStatement", () => {
  // ========== BASIC IN/OUT ==========

  it("income da conta → in", () => {
    const result = build([tx({ type: "income", title: "Salário", amount: 2000 })]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].direction).toBe("in");
    expect(result.entries[0].amount).toBe(2000);
    expect(result.entries[0].description).toBe("Salário");
  });

  it("expense da conta → out", () => {
    const result = build([tx({ type: "expense", title: "Mercado", amount: 150 })]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].direction).toBe("out");
    expect(result.entries[0].amount).toBe(150);
  });

  it("transaction de outra conta é ignorada", () => {
    const result = build([tx({ accountId: "acc-2" })]);

    expect(result.entries).toHaveLength(0);
  });

  it("compra somente no cartão (sem accountId) é ignorada", () => {
    const result = build([tx({ accountId: undefined, creditCardId: "cc-1" })]);

    expect(result.entries).toHaveLength(0);
  });

  // ========== BILL PAYMENT ==========

  it("pagamento de fatura da conta aparece como out", () => {
    const result = build([
      tx({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        amount: 500,
        accountId: "acc-1",
        creditCardId: "cc-1",
      }),
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].direction).toBe("out");
    expect(result.entries[0].amount).toBe(500);
    expect(result.entries[0].description).toBe("Pagamento de Fatura");
    expect(result.entries[0].category).toBe("Pagamento Fatura");
  });

  // ========== ADJUSTMENTS ==========

  it("ajuste interno é ignorado", () => {
    const result = build([
      tx({ title: "Ajuste de saldo", category: "Outros", description: "Ajuste manual" }),
    ]);

    expect(result.entries).toHaveLength(0);
  });

  it("ajuste por category é ignorado", () => {
    const result = build([
      tx({ title: "Correção", category: "Ajuste" as StatementTransaction["category"] }),
    ]);

    expect(result.entries).toHaveLength(0);
  });

  // ========== TRANSFERS ==========

  it("transfer enviada → out", () => {
    const result = build([], [tr()]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].direction).toBe("out");
    expect(result.entries[0].sourceType).toBe("transfer");
    expect(result.entries[0].amount).toBe(200);
  });

  it("transfer recebida → in", () => {
    const result = build(
      [],
      [tr({ fromAccountId: "acc-2", toAccountId: "acc-1" })],
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].direction).toBe("in");
    expect(result.entries[0].sourceType).toBe("transfer");
  });

  it("transfer entre outras contas é ignorada", () => {
    const result = build(
      [],
      [tr({ fromAccountId: "acc-2", toAccountId: "acc-3" })],
    );

    expect(result.entries).toHaveLength(0);
  });

  it("descrição da transfer inclui nome da conta relacionada", () => {
    const result = build(
      [],
      [tr({ fromAccountId: "acc-1", toAccountId: "acc-2" })],
    );

    expect(result.entries[0].description).toBe("Transferência para Caixa");
    expect(result.entries[0].linkedAccountName).toBe("Caixa");
  });

  it("descrição de transfer recebida inclui nome da origem", () => {
    const result = build(
      [],
      [tr({ fromAccountId: "acc-2", toAccountId: "acc-1" })],
    );

    expect(result.entries[0].description).toBe("Transferência de Caixa");
    expect(result.entries[0].linkedAccountName).toBe("Caixa");
  });

  it("transfer sem conta correspondente usa description ou fallback", () => {
    const result = build(
      [],
      [
        {
          id: "tr-orphan",
          fromAccountId: "acc-1",
          toAccountId: "nonexistent",
          amount: 50,
          date: "2026-09-10",
          description: "Pagamento aluguel",
          createdAt: "2026-09-10T08:00:00Z",
        },
      ],
    );

    expect(result.entries[0].description).toBe("Pagamento aluguel");
    expect(result.entries[0].linkedAccountName).toBeUndefined();
  });

  // ========== MONTH FILTERING ==========

  it("filtra por referenceMonth corretamente", () => {
    const result = build([
      tx({ date: "2026-09-10" }),
      tx({ date: "2026-08-31" }),
      tx({ date: "2026-10-01" }),
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].date).toBe("2026-09-10");
  });

  it("filtra transfers por referenceMonth", () => {
    const result = build(
      [],
      [
        tr({ date: "2026-09-10" }),
        tr({ date: "2026-08-20" }),
        tr({ date: "2026-10-05" }),
      ],
    );

    expect(result.entries).toHaveLength(1);
  });

  // ========== SUMMARIES ==========

  it("totalIn está correto", () => {
    const result = build([
      tx({ type: "income", amount: 1000 }),
      tx({ type: "income", amount: 500 }),
      tx({ type: "expense", amount: 200 }),
    ]);

    expect(result.summary.totalIn).toBe(1500);
  });

  it("totalOut está correto", () => {
    const result = build([
      tx({ type: "expense", amount: 300 }),
      tx({ type: "expense", amount: 150 }),
      tx({ type: "income", amount: 1000 }),
    ]);

    expect(result.summary.totalOut).toBe(450);
  });

  it("netMovement está correto", () => {
    const result = build([
      tx({ type: "income", amount: 2000 }),
      tx({ type: "expense", amount: 800 }),
    ]);

    expect(result.summary.netMovement).toBe(1200);
  });

  // ========== EDGE CASES ==========

  it("mês sem movimentos retorna vazio com zeros", () => {
    const result = build(
      [tx({ date: "2026-08-15" })],
      [tr({ date: "2026-08-10" })],
    );

    expect(result.entries).toHaveLength(0);
    expect(result.summary.totalIn).toBe(0);
    expect(result.summary.totalOut).toBe(0);
    expect(result.summary.netMovement).toBe(0);
  });

  it("valores sempre positivos mesmo para expense", () => {
    const result = build([tx({ type: "expense", amount: 500 })]);

    expect(result.entries[0].amount).toBe(500);
  });

  it("valores sempre positivos para transfer enviada", () => {
    const result = build([], [tr({ amount: 300 })]);

    expect(result.entries[0].amount).toBe(300);
  });

  // ========== SORTING ==========

  it("ordena por data decrescente (mais recente primeiro)", () => {
    const result = build([
      tx({ date: "2026-09-05" }),
      tx({ date: "2026-09-20" }),
      tx({ date: "2026-09-10" }),
    ]);

    expect(result.entries.map((e) => e.date)).toEqual([
      "2026-09-20",
      "2026-09-10",
      "2026-09-05",
    ]);
  });

  it("mesma data: ordena por createdAt quando disponível (transfers)", () => {
    const result = build(
      [],
      [
        tr({ id: "tr-1", date: "2026-09-15", createdAt: "2026-09-15T08:00:00Z" }),
        tr({ id: "tr-2", date: "2026-09-15", createdAt: "2026-09-15T14:00:00Z" }),
        tr({ id: "tr-3", date: "2026-09-15", createdAt: "2026-09-15T10:00:00Z" }),
      ],
    );

    expect(result.entries.map((e) => e.id)).toEqual(["tr-2", "tr-3", "tr-1"]);
  });

  it("mesma data sem createdAt: ordenação determinística por id", () => {
    const result = build([
      tx({ id: "tx-c", date: "2026-09-15" }),
      tx({ id: "tx-a", date: "2026-09-15" }),
      tx({ id: "tx-b", date: "2026-09-15" }),
    ]);

    expect(result.entries.map((e) => e.id)).toEqual(["tx-a", "tx-b", "tx-c"]);
  });

  it("mesma data: transactions sem createdAt vêm depois de transfers com createdAt", () => {
    const result = build(
      [tx({ id: "tx-1", date: "2026-09-15" })],
      [{ id: "tr-1", fromAccountId: "acc-2", toAccountId: "acc-1", amount: 100, date: "2026-09-15", createdAt: "2026-09-15T10:00:00Z" }],
    );

    expect(result.entries[0].sourceType).toBe("transfer");
    expect(result.entries[1].sourceType).toBe("transaction");
  });

  it("mesma data: transactions com createdAt são ordenadas cronologicamente", () => {
    const result = build([
      tx({ id: "tx-early", date: "2026-09-15", createdAt: "2026-09-15T08:00:00Z" }),
      tx({ id: "tx-late", date: "2026-09-15", createdAt: "2026-09-15T16:00:00Z" }),
      tx({ id: "tx-mid", date: "2026-09-15", createdAt: "2026-09-15T12:00:00Z" }),
    ]);

    expect(result.entries.map((e) => e.id)).toEqual(["tx-late", "tx-mid", "tx-early"]);
  });

  it("mesma data: transactions e transfers misturados usam createdAt para ordenação", () => {
    const result = build(
      [
        tx({ id: "tx-1", date: "2026-09-15", createdAt: "2026-09-15T14:00:00Z" }),
        tx({ id: "tx-2", date: "2026-09-15", createdAt: "2026-09-15T08:00:00Z" }),
      ],
      [
        { id: "tr-1", fromAccountId: "acc-2", toAccountId: "acc-1", amount: 100, date: "2026-09-15", createdAt: "2026-09-15T10:00:00Z" },
      ],
    );

    expect(result.entries.map((e) => e.id)).toEqual(["tx-1", "tr-1", "tx-2"]);
  });

  it("transactions com createdAt propagam createdAt para entries", () => {
    const result = build([
      tx({ id: "tx-1", date: "2026-09-15", createdAt: "2026-09-15T10:00:00Z" }),
    ]);

    expect(result.entries[0].createdAt).toBe("2026-09-15T10:00:00Z");
  });

  it("transactions sem createdAt resultam em entries sem createdAt", () => {
    const result = build([
      tx({ id: "tx-1", date: "2026-09-15" }),
    ]);

    expect(result.entries[0].createdAt).toBeUndefined();
  });

  // ========== INSTALLMENT INFO ==========

  it("extrai installmentInfo do título (2/3)", () => {
    const result = build([tx({ title: "TV 4K (2/3)" })]);

    expect(result.entries[0].installmentInfo).toBe("2/3");
  });

  it("sem installmentInfo quando título não contém parcela", () => {
    const result = build([tx({ title: "Supermercado" })]);

    expect(result.entries[0].installmentInfo).toBeUndefined();
  });

  // ========== MIXED ENTRIES ==========

  it("mistura transactions e transfers corretamente", () => {
    const result = build(
      [
        tx({ id: "tx-1", type: "income", amount: 1000, date: "2026-09-10" }),
        tx({ id: "tx-2", type: "expense", amount: 200, date: "2026-09-12" }),
      ],
      [
        { id: "tr-1", fromAccountId: "acc-2", toAccountId: "acc-1", amount: 500, date: "2026-09-11", createdAt: "2026-09-11T10:00:00Z" },
      ],
    );

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].date).toBe("2026-09-12");
    expect(result.entries[0].sourceType).toBe("transaction");
    expect(result.entries[1].date).toBe("2026-09-11");
    expect(result.entries[1].sourceType).toBe("transfer");
    expect(result.entries[2].date).toBe("2026-09-10");
    expect(result.entries[2].sourceType).toBe("transaction");

    expect(result.summary.totalIn).toBe(1500);
    expect(result.summary.totalOut).toBe(200);
    expect(result.summary.netMovement).toBe(1300);
  });

  // ========== SOURCE IDS ==========

  it("sourceId é o id original da transaction", () => {
    const result = build([tx({ id: "tx-original" })]);

    expect(result.entries[0].sourceId).toBe("tx-original");
  });

  it("sourceId é o id original do transfer", () => {
    const result = build([], [tr({ id: "tr-original" })]);

    expect(result.entries[0].sourceId).toBe("tr-original");
  });

  // ========== NO DUPLICATION ==========

  it("não gera entries duplicadas para mesma movimentação", () => {
    const statementTx = tx({ id: "tx-dup", type: "expense", amount: 100 });
    const result = build([statementTx], []);

    expect(result.entries).toHaveLength(1);
  });

  // ========== CATEGORY ==========

  it("category está presente em entries de transaction", () => {
    const result = build([tx({ category: "Moradia" })]);

    expect(result.entries[0].category).toBe("Moradia");
  });

  it("category não está presente em entries de transfer", () => {
    const result = build([], [tr()]);

    expect(result.entries[0].category).toBeUndefined();
  });
});

describe("running balance (balanceAfter)", () => {
  it("balanceAfter em income", () => {
    const result = build([tx({ type: "income", title: "Salário", amount: 2000, date: "2026-09-05" })]);

    expect(result.entries[0].balanceAfter).toBe(3000);
  });

  it("balanceAfter em expense", () => {
    const result = build([tx({ type: "expense", title: "Mercado", amount: 200, date: "2026-09-10" })]);

    expect(result.entries[0].balanceAfter).toBe(800);
  });

  it("transfer recebida aumenta saldo", () => {
    const result = build(
      [],
      [tr({ fromAccountId: "acc-2", toAccountId: "acc-1", amount: 300, date: "2026-09-12" })],
    );

    expect(result.entries[0].balanceAfter).toBe(1300);
  });

  it("transfer enviada diminui saldo", () => {
    const result = build([], [tr({ amount: 150, date: "2026-09-14" })]);

    expect(result.entries[0].balanceAfter).toBe(850);
  });

  it("pagamento de fatura diminui saldo", () => {
    const result = build([
      tx({
        title: "Pagamento de Fatura",
        category: "Pagamento Fatura",
        type: "expense",
        amount: 500,
        accountId: "acc-1",
        creditCardId: "cc-1",
        date: "2026-09-15",
      }),
    ]);

    expect(result.entries[0].balanceAfter).toBe(500);
  });

  it("compra só no cartão (sem accountId) é ignorada no saldo", () => {
    const result = build([
      tx({ accountId: undefined, creditCardId: "cc-1", amount: 100, date: "2026-09-10" }),
      tx({ type: "income", amount: 200, date: "2026-09-15" }),
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].balanceAfter).toBe(1200);
  });

  it("adjustment afeta saldo posterior mas fica oculto visualmente", () => {
    const result = build([
      tx({ type: "expense", amount: 200, date: "2026-09-05" }),
      tx({ title: "Ajuste de saldo", category: "Outros", description: "Ajuste manual", type: "income", amount: 700, date: "2026-09-10" }),
      tx({ type: "expense", amount: 100, date: "2026-09-15" }),
    ]);

    expect(result.entries).toHaveLength(2);
    const descs = result.entries.map((e) => e.description);
    expect(descs).not.toContain("Ajuste de saldo");

    const balanceAfters = result.entries.map((e) => e.balanceAfter);
    expect(balanceAfters).toEqual([1400, 800]);
  });

  it("histórico de mês anterior influencia mês atual", () => {
    const result = build(
      [
        tx({ type: "income", amount: 500, date: "2026-08-20" }),
        tx({ type: "expense", amount: 100, date: "2026-09-10" }),
      ],
      [],
      "acc-1",
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].date).toBe("2026-09-10");
    expect(result.entries[0].balanceAfter).toBe(1400);
  });

  it("referenceMonth não reinicia saldo", () => {
    const result = build(
      [
        tx({ type: "income", amount: 500, date: "2026-08-15" }),
        tx({ type: "expense", amount: 200, date: "2026-08-25" }),
        tx({ type: "expense", amount: 300, date: "2026-09-10" }),
      ],
      [],
      "acc-1",
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].balanceAfter).toBe(1000);
  });

  it("duas transactions mesmo dia usam createdAt", () => {
    const result = build([
      tx({ id: "tx-early", type: "income", amount: 100, date: "2026-09-15", createdAt: "2026-09-15T08:00:00Z" }),
      tx({ id: "tx-late", type: "expense", amount: 50, date: "2026-09-15", createdAt: "2026-09-15T16:00:00Z" }),
    ]);

    const balanceAfters = result.entries.map((e) => ({ id: e.id, ba: e.balanceAfter }));
    expect(balanceAfters).toEqual([
      { id: "tx-late", ba: 1050 },
      { id: "tx-early", ba: 1100 },
    ]);
  });

  it("transaction + transfer mesmo dia", () => {
    const result = build(
      [
        tx({ id: "tx-1", type: "income", amount: 100, date: "2026-09-15", createdAt: "2026-09-15T08:00:00Z" }),
      ],
      [
        { id: "tr-1", fromAccountId: "acc-2", toAccountId: "acc-1", amount: 200, date: "2026-09-15", createdAt: "2026-09-15T14:00:00Z" },
      ],
    );

    const balanceAfters = result.entries.map((e) => ({ id: e.id, ba: e.balanceAfter }));
    expect(balanceAfters).toEqual([
      { id: "tr-1", ba: 1300 },
      { id: "tx-1", ba: 1100 },
    ]);
  });

  it("entries retornadas continuam desc", () => {
    const result = build([
      tx({ date: "2026-09-05" }),
      tx({ date: "2026-09-20" }),
      tx({ date: "2026-09-10" }),
    ]);

    expect(result.entries.map((e) => e.date)).toEqual([
      "2026-09-20",
      "2026-09-10",
      "2026-09-05",
    ]);
  });

  it("cálculo interno é asc", () => {
    const result = build([
      tx({ id: "tx-3", date: "2026-09-20", amount: 100, type: "expense" }),
      tx({ id: "tx-1", date: "2026-09-05", amount: 200, type: "income" }),
      tx({ id: "tx-2", date: "2026-09-10", amount: 50, type: "expense" }),
    ]);

    const balanceAfters = result.entries.map((e) => e.balanceAfter);
    expect(balanceAfters).toEqual([1050, 1150, 1200]);
  });

  it("último saldo converge com calculateAccountBalances", () => {
    const transactions: StatementTransaction[] = [
      { id: "tx-1", title: "Salário", amount: 3000, type: "income", category: "Salário", date: "2026-09-05", accountId: "acc-1", createdAt: "2026-09-05T08:00:00Z" },
      { id: "tx-2", title: "Mercado", amount: 400, type: "expense", category: "Alimentação", date: "2026-09-10", accountId: "acc-1" },
      { id: "tx-3", title: "Pagamento de Fatura", amount: 500, type: "expense", category: "Pagamento Fatura", date: "2026-09-15", accountId: "acc-1", creditCardId: "cc-1" },
      { id: "tx-4", title: "Ajuste de saldo", amount: 150, type: "income", category: "Outros", date: "2026-08-20", accountId: "acc-1", description: "Ajuste manual" },
    ];
    const transfers: StatementTransfer[] = [
      { id: "tr-1", fromAccountId: "acc-2", toAccountId: "acc-1", amount: 300, date: "2026-09-12", createdAt: "2026-09-12T10:00:00Z" },
      { id: "tr-2", fromAccountId: "acc-1", toAccountId: "acc-2", amount: 200, date: "2026-09-18", createdAt: "2026-09-18T14:00:00Z" },
    ];

    const result = buildAccountStatement({
      accountId: "acc-1",
      transactions,
      transfers,
      accounts: allAccounts,
      referenceMonth: "2026-09",
    });

    const balances = calculateAccountBalances(
      [{ id: "acc-1", initialBalance: 1000 }, { id: "acc-2", initialBalance: 500 }],
      transactions.map((t) => ({ ...t, accountId: t.accountId, creditCardId: t.creditCardId })) as any,
      transfers.map((t) => ({ fromAccountId: t.fromAccountId, toAccountId: t.toAccountId, amount: t.amount })),
    );

    const mostRecentEntry = result.entries[0];
    expect(mostRecentEntry.balanceAfter).toBe(balances["acc-1"]);
  });

  it("saldo atual do topo continua independente do mês", () => {
    const result = build(
      [tx({ type: "income", amount: 500, date: "2026-08-15" })],
      [],
      "acc-1",
    );

    expect(result.entries).toHaveLength(0);
    expect(result.summary.totalIn).toBe(0);
  });
});
